import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { policyFor } from '../assets/page-safety.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const gqSrc = fs.readFileSync(path.join(skillRoot, 'assets', 'graph-query.js'), 'utf8');
const { createGraphQuery, floorplanAskInstructions } = new Function(`${gqSrc}\nreturn { createGraphQuery, floorplanAskInstructions };`)();

function extractScripts(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ attrs: m[1] || '', body: m[2] || '' });
  return out;
}

function getMetaCsp(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+data-floorplan-policy="[a-z]+"\s+content="([^"]+)"/i.exec(html);
  return m ? m[1] : null;
}

test('Phase 6.1 — Health static analyzer eliminates dev-proxy localhost, public cached feed, and 3-hop usecase auth false positives while catching real risks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p6-health-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'frontend', 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'routers'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'usecases'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'services'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'gateways'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'floorplan'), { recursive: true });

    // 1. Vite dev proxy config (must NOT trigger hardcoded-url localhost warning)
    fs.writeFileSync(path.join(tmpDir, 'frontend', 'vite.config.ts'), `
import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    proxy: {
      '/account/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
`);

    // 2. Genuine runtime frontend hardcoded localhost (MUST still be caught!)
    fs.writeFileSync(path.join(tmpDir, 'frontend', 'src', 'badClient.ts'), `
export async function fetchLegacy() {
  return fetch('http://localhost:8000/legacy/profile');
}
`);

    // 3. 3-hop auth chain: router -> usecase -> service -> UnauthorizedAppError
    fs.writeFileSync(path.join(tmpDir, 'backend', 'services', 'session_guard.py'), `
class UnauthorizedAppError(Exception):
    pass

def ensure_active_actor(token: str):
    if not token:
        raise UnauthorizedAppError("Session missing")
    return {"sub": "u-1"}
`);
    fs.writeFileSync(path.join(tmpDir, 'backend', 'usecases', 'profile_usecase.py'), `
from backend.services.session_guard import ensure_active_actor

def execute_profile_update(token: str, payload: dict):
    actor = ensure_active_actor(token)
    return {"updated": actor["sub"], **payload}
`);
    fs.writeFileSync(path.join(tmpDir, 'backend', 'gateways', 'azwah_gateway.py'), `
_CACHE = [{"title": "Riyadh Tech Expo"}]

async def fetch_public_events():
    return _CACHE
`);
    fs.writeFileSync(path.join(tmpDir, 'backend', 'routers', 'profile.py'), `
from fastapi import APIRouter
from backend.usecases.profile_usecase import execute_profile_update
from backend.gateways.azwah_gateway import fetch_public_events

router = APIRouter(prefix="/account/api")

@router.post("/profile/update")
async def update_profile(token: str, payload: dict):
    return execute_profile_update(token, payload)

@router.get("/azwah/events")
async def get_azwah_events():
    events = await fetch_public_events()
    return {"events": events}

@router.delete("/admin/wipe/{user_id}")
async def wipe_user_unprotected(user_id: str):
    db.execute("DELETE FROM users WHERE id = :id", {"id": user_id})
    return {"deleted": user_id}
`);

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'scan.mjs'), tmpDir], { stdio: 'pipe' });
    fs.mkdirSync(path.join(tmpDir, 'floorplan', 'descriptions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'architecture.json'), JSON.stringify({
      project: { name: 'منصة الحساب الموحد', summary: 'إدارة الهوية والملف الشخصي.' },
      language: 'ar',
      nodes: [
        { id: 'web', label: 'واجهة الويب', kind: 'ui', summary: 'واجهة المستخدم.', paths: ['frontend/**'] },
        { id: 'api', label: 'خادم الحساب', kind: 'service', summary: 'خدمات الهوية والملف الشخصي.', paths: ['backend/**'] },
      ],
    }, null, 2));
    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'build.mjs'), tmpDir], { stdio: 'pipe' });

    const graph = JSON.parse(fs.readFileSync(path.join(tmpDir, 'floorplan', 'graph.json'), 'utf8'));
    const issues = graph.health.issues || [];

    // Vite config must NOT appear in hardcoded-url locations
    const urlIssue = issues.find((i) => i.kind === 'hardcoded-url');
    assert.ok(urlIssue, 'Expected runtime badClient.ts localhost to still be flagged');
    const urlFiles = (urlIssue.locations || []).map((l) => l.file);
    assert.equal(urlFiles.includes('frontend/vite.config.ts'), false, 'vite.config.ts dev proxy must NOT be flagged as hardcoded localhost');
    assert.equal(urlFiles.includes('frontend/src/badClient.ts'), true, 'Genuine runtime localhost in src/badClient.ts must be flagged');

    // 3-hop auth endpoint (/profile/update) and parameterless public feed (/azwah/events) must NOT be flagged as unprotected-endpoint
    const openIssues = issues.filter((i) => i.kind === 'unprotected-endpoint');
    const openText = JSON.stringify(openIssues);
    assert.equal(openText.includes('/profile/update'), false, '3-hop usecase auth endpoint must NOT be flagged as open');
    assert.equal(openText.includes('/azwah/events'), false, 'Parameterless public cached GET feed must NOT be flagged as open');
    assert.equal(openText.includes('/admin/wipe'), true, 'Genuine unprotected DELETE route must still be flagged');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 6.2 — Arabic replies (100% Arabic even over English map descriptions), test-file exclusion, and Simplified Business Mode answers', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p6-ask-'));
  let child = null;
  try {
    fs.mkdirSync(path.join(tmpDir, 'backend', 'routers'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'usecases'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'backend', 'tests'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'backend', 'routers', 'auth.py'), `
from fastapi import APIRouter
from backend.usecases.login_usecase import login_with_credentials
router = APIRouter(prefix="/account/api/auth")

@router.post("/login")
async def login(username: str, password: str):
    return await login_with_credentials(username, password)
`);
    fs.writeFileSync(path.join(tmpDir, 'backend', 'usecases', 'login_usecase.py'), `
async def login_with_credentials(username: str, password: str):
    if not username or not password:
        raise ValueError("Missing credentials")
    return {"session": "ok"}
`);
    fs.writeFileSync(path.join(tmpDir, 'backend', 'tests', 'test_login_usecases.py'), `
from unittest.mock import MagicMock
from backend.usecases.login_usecase import login_with_credentials

def test_login_happy_path():
    gw = MagicMock()
    assert login_with_credentials is not None
`);

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'scan.mjs'), tmpDir], { stdio: 'pipe' });
    fs.mkdirSync(path.join(tmpDir, 'floorplan', 'descriptions'), { recursive: true });

    // Deliberately author English descriptions & labels (reproducing the user's exact scenario!)
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'architecture.json'), JSON.stringify({
      project: { name: 'Keycloak Account Portal', summary: 'Self-service account and login portal.' },
      language: 'ar',
      nodes: [
        { id: 'auth', label: 'Authentication Service', kind: 'service', summary: 'Handles user login and session cookies in FastAPI.', paths: ['backend/routers/**', 'backend/usecases/**'] },
        { id: 'tests', label: 'Unit Tests', kind: 'test', summary: 'Pytest unit tests with MagicMock.', paths: ['backend/tests/**'] },
      ],
    }, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'descriptions', 'auth.json'), JSON.stringify({
      'backend/routers/auth.py': 'FastAPI router handling POST /login credentials and setting session cookies.',
      'backend/usecases/login_usecase.py': 'Validates user credentials against Keycloak and creates an active session.',
      'POST /account/api/auth/login': 'Authenticates username and password and starts a session.',
    }, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'descriptions', 'tests.json'), JSON.stringify({
      'backend/tests/test_login_usecases.py': 'Unit test suite verifying login_with_credentials using MagicMock.',
    }, null, 2));

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'build.mjs'), tmpDir], { stdio: 'pipe' });

    const graph = JSON.parse(fs.readFileSync(path.join(tmpDir, 'floorplan', 'graph.json'), 'utf8'));
    const Q = createGraphQuery(graph);

    // 1. Q.find excludes test files on normal login queries, but includes them when explicitly asking for tests
    const normalHits = Q.find('كيف يعمل تسجيل الدخول login');
    assert.equal(normalHits.some((h) => h.id.includes('test_login_usecases')), false, 'Q.find must exclude test files when user did not ask about tests');
    const testHits = Q.find('أين اختبارات تسجيل الدخول test login');
    assert.equal(testHits.some((h) => h.id.includes('test_login_usecases')), true, 'Q.find must return test files when user explicitly asks about tests');

    // 2. Prompt instructions for external CLI/HTTP agents enforce Arabic + Business rules
    const arBizInstr = floorplanAskInstructions(graph, 'cli', { lang: 'ar', audience: 'business' });
    assert.ok(arBizInstr.includes('100% fluent, natural Arabic'), 'External AI prompt must enforce 100% Arabic');
    assert.ok(arBizInstr.includes('SIMPLIFIED BUSINESS'), 'External AI prompt must enforce Simplified Business Mode');

    // 3. Spawn serve.mjs and verify /api/ask in Arabic Business Mode & Arabic Technical Mode
    const servePath = path.join(tmpDir, 'floorplan', 'serve.mjs');
    child = spawn(process.execPath, [servePath, '--port', '4822', '--engine', 'local'], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const baseUrl = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`Server timeout: ${out}`)), 8000);
      child.stdout.on('data', (d) => {
        out += d.toString();
        const m = /Floorplan:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Exited (${code})`)); });
    });

    const servedHtml = await fetch(baseUrl + '/').then((r) => r.text());
    assert.ok(servedHtml.includes('id="mode-toggle"'), 'Built viewer must include #mode-toggle for Simplified Business Mode');
    assert.ok(servedHtml.includes('setBusiness'), 'Built viewer must expose setBusiness');
    assert.equal(getMetaCsp(servedHtml), policyFor(servedHtml, 'local'), 'Served HTML CSP must remain 100% valid');
    for (const { attrs, body } of extractScripts(servedHtml)) {
      if (!/type=["']application\/json["']/i.test(attrs)) {
        assert.doesNotThrow(() => new Function(body));
      }
    }

    const serverCfg = JSON.parse(/window\.FLOORPLAN_SERVER=(\{[\s\S]*?\});?<\/script>/.exec(servedHtml)[1]);

    // Ask in Arabic + Business Mode (SSE stream)
    const rawSse = await fetch(baseUrl + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': serverCfg.token },
      body: JSON.stringify({
        question: 'كيف يعمل تسجيل الدخول؟',
        engine: 'local',
        lang: 'ar',
        audience: 'business',
      }),
    }).then((r) => r.text());

    const doneMatch = /event:\s*(?:answer|done|result)\r?\ndata:\s*(\{[^\r\n]+\})/.exec(rawSse);
    assert.ok(doneMatch, `Expected SSE done/result event, got: ${rawSse.slice(0, 300)}`);
    const payload = JSON.parse(doneMatch[1]);
    const ans = typeof payload.answer === 'object' && payload.answer ? payload.answer : payload;
    assert.ok(/[\u0600-\u06FF]/.test(ans.title), 'Answer title must be in Arabic');
    assert.ok(/[\u0600-\u06FF]/.test(ans.answer), 'Answer body must be in Arabic');
    // Must NOT leak raw English description sentences or test files or line numbers in Business Mode
    assert.equal(ans.answer.includes('FastAPI router handling'), false, 'Arabic answer must not dump raw English description text');
    assert.equal(ans.answer.includes('MagicMock'), false, 'Arabic answer must never include test mocks');
    assert.equal(/:L\d+/.test(ans.answer), false, 'Business mode answer must not include file line numbers (:L12)');
    assert.equal((ans.items || []).some((it) => String(it.id).includes('test_login')), false, 'Answer items must exclude test files');
    for (const it of ans.items || []) {
      assert.ok(/[\u0600-\u06FF]/.test(it.note), `Item note must be in Arabic, got: ${it.note}`);
    }
    for (const f of ans.followups || []) {
      assert.ok(/[\u0600-\u06FF]/.test(f), `Followup must be in Arabic, got: ${f}`);
    }
  } finally {
    if (child) child.kill();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
