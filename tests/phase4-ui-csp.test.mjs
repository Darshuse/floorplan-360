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

function extractScripts(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ attrs: m[1] || '', body: m[2] || '' });
  }
  return out;
}

function getMetaCsp(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+data-floorplan-policy="[a-z]+"\s+content="([^"]+)"/i.exec(html);
  return m ? m[1] : null;
}

test('Phase 4.1 — Zero exclusive "Claude or Codex" lock-in across SKILL.md, viewer.html, serve.mjs, and UI extensions', () => {
  const targets = [
    path.join(skillRoot, 'SKILL.md'),
    path.join(skillRoot, 'assets', 'viewer.html'),
    path.join(skillRoot, 'assets', 'serve.mjs'),
    ...fs.readdirSync(path.join(skillRoot, 'assets', 'ui')).filter((f) => f.endsWith('.js')).map((f) => path.join(skillRoot, 'assets', 'ui', f)),
  ];
  const forbidden = [
    /Claude or Codex/i,
    /Claude Code or Codex/i,
    /without Claude/i,
  ];
  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf8');
    for (const re of forbidden) {
      assert.equal(re.test(content), false, `Found forbidden exclusive phrasing ${re} in ${path.relative(skillRoot, file)}`);
    }
  }
});

test('Phase 4.2 — Built index.html (Arabic RTL + Clean Code + Spotlight) has valid JS syntax, no inline event attributes, and exact CSP hashes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p4-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src', 'ui'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'api'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'floorplan'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'src', 'ui', 'Dashboard.tsx'), `
import { createOrder } from '../api/orders';
export function Dashboard() {
  return createOrder({ amount: 150 });
}
`);
    fs.writeFileSync(path.join(tmpDir, 'src', 'api', 'orders.ts'), `
import express from 'express';
const router = express.Router();
export function createOrder(payload: any) {
  if (!payload) return null;
  return { ok: true };
}
router.post('/api/orders', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  return res.json(createOrder(req.body));
});
export default router;
`);

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'scan.mjs'), tmpDir], { stdio: 'pipe' });

    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'architecture.json'), JSON.stringify({
      project: { name: 'منصة الطلبات الموحدة', summary: 'منصة لإدارة الطلبات والمدفوعات بواجهة عربية وإنجليزية.' },
      language: 'ar',
      layerRules: [{ from: 'api', forbid: ['ui'], reason: 'API must not depend on UI' }],
      nodes: [
        { id: 'ui', label: 'واجهة المستخدم', kind: 'ui', summary: 'تعرض لوحة التحكم للمستخدمين.', paths: ['src/ui/**'] },
        { id: 'api', label: 'خدمة الطلبات', kind: 'service', summary: 'تستقبل الطلبات وتتحقق من الهوية.', paths: ['src/api/**'] },
      ],
      flows: [
        {
          id: 'order-flow',
          title: 'إنشاء طلب جديد',
          description: 'تتبّع إنشاء الطلب من الشاشة حتى الخادم',
          steps: [
            { node: 'src/ui/Dashboard.tsx', note: 'يرسل المستخدم الطلب' },
            { node: 'src/api/orders.ts', note: 'يتحقق الخادم من الجلسة ويحفظ الطلب' },
          ],
        },
      ],
    }, null, 2));

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'build.mjs'), tmpDir], { stdio: 'pipe' });

    const htmlPath = path.join(tmpDir, 'floorplan', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const graph = JSON.parse(fs.readFileSync(path.join(tmpDir, 'floorplan', 'graph.json'), 'utf8'));

    assert.equal(graph.meta.language, 'ar');

    // Required UI v2 features present
    for (const marker of [
      'id="engine-wrap"',
      'id="engine-menu"',
      'id="lang-toggle"',
      'id="btn-present"',
      'UI_STRINGS',
      'spot-in',
      'spot-out',
      'quality-heatmap',
      'data-hc-heatmap',
      'togglePresentation',
      'setLang',
      'setHeatmap',
      'dir="auto"',
    ]) {
      assert.ok(html.includes(marker), `Expected index.html to include ${marker}`);
    }

    // Verify zero inline HTML event attributes in template markup (outside <script> blocks)
    const htmlWithoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    assert.equal(/\son(?:click|change|input|submit|keydown|keyup|load|error)\s*=/i.test(htmlWithoutScripts), false, 'HTML must not contain inline event attributes violating strict CSP');

    // Compile every inline JS block to guarantee zero syntax errors
    const scripts = extractScripts(html);
    assert.ok(scripts.length >= 5, 'Expected multiple inline script blocks (ELK, data, query, viewer, UI extensions)');
    for (let i = 0; i < scripts.length; i++) {
      const { attrs, body } = scripts[i];
      if (/type=["']application\/json["']/i.test(attrs)) {
        assert.doesNotThrow(() => JSON.parse(body), `JSON script block #${i} must be valid JSON`);
      } else {
        assert.doesNotThrow(() => new Function(body), `JS script block #${i} must have zero syntax errors`);
      }
    }

    // Verify exact SHA-256 CSP policy match
    const metaCsp = getMetaCsp(html);
    assert.ok(metaCsp, 'Expected Content-Security-Policy meta tag');
    assert.equal(metaCsp, policyFor(html, 'local'), 'index.html CSP meta tag must match policyFor(html, "local")');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 4.3 — Live serve.mjs serves valid CSP on / and exports valid standalone HTML via POST /api/export', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p4-srv-'));
  let child = null;
  try {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'floorplan'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export function main() { return 42; }\n');
    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'scan.mjs'), tmpDir], { stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'architecture.json'), JSON.stringify({
      project: { name: 'CSP Verify App', summary: 'Verifies live server & export CSP.' },
      nodes: [{ id: 'core', label: 'Core', kind: 'service', summary: 'Main service.', paths: ['src/**'] }],
    }, null, 2));
    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'build.mjs'), tmpDir], { stdio: 'pipe' });

    const servePath = path.join(tmpDir, 'floorplan', 'serve.mjs');
    child = spawn(process.execPath, [servePath, '--port', '4810', '--engine', 'local'], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const baseUrl = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`Server start timeout. Output: ${out}`)), 8000);
      child.stdout.on('data', (d) => {
        out += d.toString();
        const m = /Floorplan:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited early (${code})`)); });
    });

    const servedHtml = await fetch(baseUrl + '/').then((r) => r.text());
    assert.ok(servedHtml.includes('window.FLOORPLAN_SERVER='), 'Served HTML must inject window.FLOORPLAN_SERVER');
    assert.equal(getMetaCsp(servedHtml), policyFor(servedHtml, 'local'), 'Served HTML CSP must match policyFor(servedHtml, "local")');

    for (const { attrs, body } of extractScripts(servedHtml)) {
      if (!/type=["']application\/json["']/i.test(attrs)) {
        assert.doesNotThrow(() => new Function(body));
      }
    }

    const serverCfg = JSON.parse(/window\.FLOORPLAN_SERVER=(\{[\s\S]*?\});?<\/script>/.exec(servedHtml)[1]);
    const expRes = await fetch(baseUrl + '/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': serverCfg.token },
      body: JSON.stringify({ include: ['flows', 'notes'] }),
    });
    assert.equal(expRes.status, 200);
    const exportedHtml = await expRes.text();
    assert.equal(getMetaCsp(exportedHtml), policyFor(exportedHtml, 'export'), 'Exported HTML CSP must match policyFor(exportedHtml, "export")');
    assert.equal(exportedHtml.includes('window.FLOORPLAN_SERVER='), false, 'Exported HTML must strip server token');
  } finally {
    if (child) child.kill();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
