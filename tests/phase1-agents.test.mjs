import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AGENT_REGISTRY, detectAgent, normalizeAgentId, cliLabel } from '../scripts/lib/agent.mjs';
import {
  parseUniversalAnswer,
  safeReadSnippet,
  resolveHttpProvider,
  runHttpEngineQuery,
} from '../scripts/lib/engines-http.mjs';
import { writeAgentNotes, writeClaudeMd } from '../scripts/lib/agent-notes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');

test('Phase 1.1: Universal AGENT_REGISTRY & environment auto-detection', () => {
  assert.ok(AGENT_REGISTRY.antigravity);
  assert.ok(AGENT_REGISTRY.kimi);
  assert.ok(AGENT_REGISTRY.claude);
  assert.ok(AGENT_REGISTRY.codex);
  assert.ok(AGENT_REGISTRY.gemini);
  assert.ok(AGENT_REGISTRY['openai-http']);
  assert.ok(AGENT_REGISTRY.ollama);
  assert.ok(AGENT_REGISTRY['custom-cli']);
  assert.ok(AGENT_REGISTRY.local);

  assert.equal(normalizeAgentId('agy'), 'antigravity');
  assert.equal(normalizeAgentId('moonshot'), 'kimi');
  assert.equal(normalizeAgentId('openrouter'), 'openai-http');
  assert.equal(normalizeAgentId('offline'), 'local');

  assert.equal(detectAgent({}, { AGY_ACCOUNT: 'work' }), 'antigravity');
  assert.equal(detectAgent({}, { CLAUDECODE: '1' }), 'claude');
  assert.equal(detectAgent({}, { CODEX_THREAD_ID: 't-123' }), 'codex');
  assert.equal(detectAgent({}, { MOONSHOT_API_KEY: 'sk-moon' }), 'kimi');
  assert.equal(detectAgent({}, { GEMINI_API_KEY: 'AIzaTest' }), 'gemini');
  assert.equal(detectAgent({}, { OPENROUTER_API_KEY: 'sk-or-123' }), 'openai-http');
  assert.equal(detectAgent({}, { OLLAMA_HOST: 'http://127.0.0.1:11434' }), 'ollama');
  assert.equal(detectAgent({}, { FLOORPLAN_CLI_CMD: 'my-agent -p' }), 'custom-cli');
  assert.equal(detectAgent({}, { FLOORPLAN_UNATTENDED: '1', CLAUDECODE: '1' }), 'none');
  // Zero vendor assumption when no specific agent env is set
  assert.equal(detectAgent({}, {}), 'none');
  assert.equal(detectAgent({ agent: 'kimi' }, {}), 'kimi');

  assert.match(cliLabel('claude', 'claude 1.0.5'), /Claude Code/);
  assert.match(cliLabel('claude', 'devin 3000.1.0'), /devin/);
});

test('Phase 1.2: parseUniversalAnswer handles JSON, code fences, balanced blocks, and Markdown', () => {
  const mockQ = {
    exists: (id) => ['n:api', 'f:src/auth.ts'].includes(id),
    brief: (id) => ({ id, name: id === 'n:api' ? 'Main API' : 'Auth handler', description: 'Handles auth' }),
    find: () => [{ id: 'n:api', name: 'Main API', description: 'Handles auth' }],
  };

  const fromFence = parseUniversalAnswer('Here is the result:\n```json\n{"title":"Auth Flow","answer":"Uses [[n:api]]","items":[{"id":"n:api","note":"Core"}]}\n```', mockQ);
  assert.equal(fromFence.title, 'Auth Flow');
  assert.equal(fromFence.items.length, 1);

  const fromMarkdown = parseUniversalAnswer('## Login Architecture\nThe request enters [[n:api]] and runs `src/auth.ts` to validate tokens.', mockQ, 'How does login work?');
  assert.equal(fromMarkdown.title, 'Login Architecture');
  assert.deepEqual(fromMarkdown.items.map((x) => x.id), ['n:api', 'f:src/auth.ts']);
});

test('Phase 1.3: safeReadSnippet enforces root jail, blocks .env, and masks secrets', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-snip-'));
  try {
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=topsecret123456\n');
    const fakeKey = ['sk', 'live', '1234567890abcdefghijklmnop'].join('_');
    fs.writeFileSync(
      path.join(tmp, 'src', 'service.ts'),
      `export function login() {\n  const apiKey = "${fakeKey}";\n  return true;\n}\n`,
    );

    const blockedEnv = safeReadSnippet(tmp, '.env', 1, 10);
    assert.ok(blockedEnv.error);

    const blockedEscape = safeReadSnippet(tmp, '../outside.txt', 1, 10);
    assert.ok(blockedEscape.error);

    const ok = safeReadSnippet(tmp, 'src/service.ts', 1, 4);
    assert.equal(ok.error, undefined);
    assert.match(ok.snippet, /L1: export function login/);
    assert.equal(ok.snippet.includes(fakeKey), false);
    assert.match(ok.snippet, /«hidden»/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Phase 1.4: HTTP LLM Adapter 4-tool read-only loop (Moonshot/OpenAI & Gemini protocols)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-http-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'orders.py'), 'def create_order(user):\n    return {"ok": True}\n');

  const mockQ = {
    overview: () => ({ project: 'Shop', counts: { files: 1, endpoints: 1 } }),
    find: (query) => [{ id: 'f:src/orders.py', type: 'file', name: 'Orders', description: `Matched ${query}`, path: 'src/orders.py' }],
    show: (id) => ({ id, name: 'Orders', loc: 2 }),
    path: () => ({ found: true, hops: [] }),
    brief: (id) => ({ id, name: 'Orders', description: 'Order logic' }),
    exists: (id) => id === 'f:src/orders.py',
  };

  let openAiRound = 0;
  let geminiRound = 0;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      if (req.url === '/v1/chat/completions') {
        openAiRound++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (openAiRound === 1) {
          res.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  { id: 'tc1', type: 'function', function: { name: 'find_items', arguments: '{"query":"orders"}' } },
                  { id: 'tc2', type: 'function', function: { name: 'read_file_snippet', arguments: '{"path":"src/orders.py","start_line":1,"end_line":5}' } },
                ],
              },
            }],
          }));
        } else {
          // Verify tool results arrived in messages
          const toolMsgs = parsed.messages.filter((m) => m.role === 'tool');
          assert.equal(toolMsgs.length, 2);
          assert.match(toolMsgs[1].content, /def create_order/);
          res.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  title: 'Order Creation',
                  answer: 'Orders are handled in [[f:src/orders.py]].',
                  items: [{ id: 'f:src/orders.py', note: 'Creates the order' }],
                  steps: [],
                  followups: ['How are payments captured?'],
                }),
              },
            }],
          }));
        }
        return;
      }
      if (req.url.includes(':generateContent')) {
        geminiRound++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (geminiRound === 1) {
          res.end(JSON.stringify({
            candidates: [{ content: { parts: [{ functionCall: { name: 'find_items', args: { query: 'orders' } } }] } }],
          }));
        } else {
          res.end(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"title":"Gemini Orders","answer":"Handled by [[f:src/orders.py]].","items":[{"id":"f:src/orders.py","note":"Order handler"}]}' }] } }],
          }));
        }
        return;
      }
      res.writeHead(404); res.end();
    });
  });

  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  try {
    const kimiProv = resolveHttpProvider('kimi', {
      env: { MOONSHOT_API_KEY: 'test-kimi-key', MOONSHOT_API_BASE: `http://127.0.0.1:${port}/v1` },
    });
    assert.equal(kimiProv.available, true);
    const progressEvents = [];
    const ans = await runHttpEngineQuery({
      provider: kimiProv,
      root: tmp,
      q: mockQ,
      modeObj: { httpInstructions: 'Answer JSON', schema: { type: 'object' } },
      question: 'How do orders work?',
      onProgress: (t) => progressEvents.push(t),
    });
    assert.equal(ans.title, 'Order Creation');
    assert.equal(ans.items[0].id, 'f:src/orders.py');
    assert.ok(progressEvents.some((p) => /Searching the map/.test(p)));
    assert.ok(progressEvents.some((p) => /Reading src\/orders\.py/.test(p)));

    const geminiProv = resolveHttpProvider('gemini', {
      env: { GEMINI_API_KEY: 'test-gem-key', GEMINI_API_BASE: `http://127.0.0.1:${port}/v1beta` },
    });
    const gemAns = await runHttpEngineQuery({
      provider: geminiProv,
      root: tmp,
      q: mockQ,
      modeObj: { httpInstructions: 'Answer JSON', schema: { type: 'object' } },
      question: 'How do orders work?',
    });
    assert.equal(gemAns.title, 'Gemini Orders');
  } finally {
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Phase 1.5: Universal agent-notes.mjs + standalone serve.mjs /api/engines & /api/ask', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-e2e-p1-'));
  let child = null;
  try {
    execFileSync('git', ['init'], { cwd: tmp, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src', 'app.js'), 'export function loginUser() { return true; }\n');
    const outDir = path.join(tmp, 'floorplan');

    // Test Antigravity local notes
    const agyNote = writeAgentNotes(tmp, outDir, { agent: 'antigravity', add: true });
    assert.match(agyNote, /created \.agents\/rules\/floorplan-local\.md/);
    assert.ok(fs.existsSync(path.join(tmp, '.agents', 'rules', 'floorplan-local.md')));

    // Test backward-compatible writeClaudeMd
    const claudeNote = writeClaudeMd(tmp, outDir, { add: true });
    assert.match(claudeNote, /created CLAUDE\.local\.md/);

    // Scan + Build map
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'scan.mjs'), tmp], { stdio: 'ignore' });
    fs.writeFileSync(path.join(outDir, 'architecture.json'), JSON.stringify({
      project: { name: 'Demo App', summary: 'Simple login app.' },
      nodes: [{ id: 'core', label: 'Core Service', kind: 'service', summary: 'Handles user sign-in.', paths: ['src/**'] }],
    }, null, 2));
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'build.mjs'), tmp], { stdio: 'ignore' });

    // Verify bundled serve.mjs has valid syntax with zero external imports
    execFileSync(process.execPath, ['--check', path.join(outDir, 'serve.mjs')]);

    // Boot serve.mjs forced to local engine on dynamic port
    const stateFile = path.join(outDir, '.cache', 'server.json');
    child = spawn(process.execPath, [path.join(outDir, 'serve.mjs'), '--port', '4591', '--engine', 'local'], {
      cwd: tmp,
      env: { ...process.env, MOONSHOT_API_KEY: 'dummy-kimi-key' },
      stdio: 'ignore',
      windowsHide: true,
    });

    let srvState = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.existsSync(stateFile)) {
        srvState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        break;
      }
    }
    assert.ok(srvState?.url, 'serve.mjs started and wrote server.json');

    // GET /api/engines
    const engRes = await fetch(`${srvState.url}/api/engines`, {
      headers: { 'x-floorplan-token': srvState.token },
    }).then((r) => r.json());
    assert.equal(engRes.active, 'local');
    assert.ok(engRes.engines.some((e) => e.id === 'local' && e.available));
    assert.ok(engRes.engines.some((e) => e.id === 'kimi' && e.available));

    // POST /api/engines hot-switch to kimi and back to local
    const sw1 = await fetch(`${srvState.url}/api/engines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': srvState.token },
      body: JSON.stringify({ engine: 'kimi' }),
    }).then((r) => r.json());
    assert.equal(sw1.ok, true);
    assert.equal(sw1.active, 'kimi');

    const sw2 = await fetch(`${srvState.url}/api/engines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': srvState.token },
      body: JSON.stringify({ engine: 'local' }),
    }).then((r) => r.json());
    assert.equal(sw2.active, 'local');

    // POST /api/ask in Arabic via Local Engine
    const askText = await fetch(`${srvState.url}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': srvState.token },
      body: JSON.stringify({ question: 'كيف يعمل تسجيل الدخول؟', mode: 'ask' }),
    }).then((r) => r.text());
    assert.match(askText, /event: answer/);
    assert.match(askText, /f:src\/app\.js|n:core/);
  } finally {
    if (child) child.kill();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
