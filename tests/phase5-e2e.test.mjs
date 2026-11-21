import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { policyFor } from '../assets/page-safety.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

test('Phase 5.1 — refresh.mjs --install-hook & --uninstall-hook safely manage Git hooks without overwriting user hooks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p5-hook-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
    const hooksDir = path.join(tmpDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const postCommit = path.join(hooksDir, 'post-commit');
    const postMerge = path.join(hooksDir, 'post-merge');

    fs.writeFileSync(postCommit, '#!/bin/sh\necho "existing user hook"\n');

    const installOut = JSON.parse(execFileSync(
      process.execPath,
      [path.join(skillRoot, 'scripts', 'refresh.mjs'), tmpDir, '--install-hook', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
    assert.equal(installOut.ok, true);
    assert.deepEqual(installOut.hooks, ['post-commit', 'post-merge']);

    const pcAfterInstall = fs.readFileSync(postCommit, 'utf8');
    const pmAfterInstall = fs.readFileSync(postMerge, 'utf8');
    assert.ok(pcAfterInstall.includes('echo "existing user hook"'), 'Must preserve pre-existing user hook commands');
    assert.ok(pcAfterInstall.includes('# >>> floorplan-auto-refresh >>>'), 'Must inject marked floorplan auto-refresh block');
    assert.ok(pmAfterInstall.includes('# >>> floorplan-auto-refresh >>>'), 'Must create post-merge hook');

    // Idempotency: running --install-hook twice does not duplicate the block
    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'refresh.mjs'), tmpDir, '--install-hook', '--json'], { stdio: 'pipe' });
    const pcSecond = fs.readFileSync(postCommit, 'utf8');
    assert.equal(pcSecond.match(/# >>> floorplan-auto-refresh >>>/g)?.length, 1);

    // Uninstall removes only the Floorplan block
    const uninstOut = JSON.parse(execFileSync(
      process.execPath,
      [path.join(skillRoot, 'scripts', 'refresh.mjs'), tmpDir, '--uninstall-hook', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
    assert.equal(uninstOut.ok, true);
    const pcAfterUninstall = fs.readFileSync(postCommit, 'utf8');
    assert.ok(pcAfterUninstall.includes('echo "existing user hook"'), 'User hook remains intact after uninstall');
    assert.equal(pcAfterUninstall.includes('floorplan-auto-refresh'), false, 'Floorplan block removed cleanly');
    assert.equal(fs.existsSync(postMerge), false, 'Empty post-merge hook created solely by Floorplan is cleaned up');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 5.2 — serve.mjs --auto-refresh detects live source edits, runs refresh.mjs automatically, and broadcasts SSE reload', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'floorplan-p5-watch-'));
  let child = null;
  try {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'floorplan'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'src', 'orders.ts'), `
import express from 'express';
const router = express.Router();
router.post('/api/orders', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ created: true });
});
export default router;
`);

    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'scan.mjs'), tmpDir], { stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'floorplan', 'architecture.json'), JSON.stringify({
      project: { name: 'AutoRefresh E2E', summary: 'Live zero-drift map test.' },
      nodes: [{ id: 'backend', label: 'Backend API', kind: 'service', summary: 'Handles orders and payments.', paths: ['src/**'] }],
    }, null, 2));
    execFileSync(process.execPath, [path.join(skillRoot, 'scripts', 'build.mjs'), tmpDir], { stdio: 'pipe' });

    const servePath = path.join(tmpDir, 'floorplan', 'serve.mjs');
    child = spawn(process.execPath, [servePath, '--port', '4825', '--auto-refresh', '--auto-refresh-ms', '800', '--engine', 'local'], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const baseUrl = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`Server start timeout: ${out}`)), 8000);
      child.stdout.on('data', (d) => {
        out += d.toString();
        const m = /Floorplan:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(out);
        if (m) { clearTimeout(timer); resolve(m[1]); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited early (${code})`)); });
    });

    const servedHtml = await fetch(baseUrl + '/').then((r) => r.text());
    const serverCfg = JSON.parse(/window\.FLOORPLAN_SERVER=(\{[\s\S]*?\});?<\/script>/.exec(servedHtml)[1]);
    assert.equal(serverCfg.autoRefresh, true);

    // Subscribe to /api/events SSE stream and wait for automatic 'reload' event after creating a new file
    const reloadPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for auto-refresh SSE reload event')), 12000);
      const req = http.get(`${baseUrl}/api/events?token=${encodeURIComponent(serverCfg.token)}`, (res) => {
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          if (buf.includes('event: reload')) {
            clearTimeout(timer);
            req.destroy();
            resolve(true);
          }
        });
      });
      req.on('error', (err) => {
        if (!err.message.includes('aborted') && !err.message.includes('socket hang up')) {
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    // Give SSE connection 200ms to establish, then write a brand-new file + endpoint
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(tmpDir, 'src', 'refunds.ts'), `
import express from 'express';
const router = express.Router();
router.post('/api/refunds', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ refunded: true });
});
export default router;
`);

    await reloadPromise;

    const updatedGraph = JSON.parse(fs.readFileSync(path.join(tmpDir, 'floorplan', 'graph.json'), 'utf8'));
    assert.ok(updatedGraph.files.some((f) => f.p === 'src/refunds.ts'), 'Auto-refresh must include newly added src/refunds.ts in graph.json');
    assert.ok(updatedGraph.routes.some((r) => r.p === '/api/refunds' && r.m === 'POST'), 'Auto-refresh must include newly added POST /api/refunds route');

    // Verify CLI --export on the updated map + zero external dependencies audit
    const exportPath = path.join(tmpDir, 'exported-map.html');
    execFileSync(process.execPath, [servePath, '--export', exportPath, '--include', 'flows,notes,health'], { cwd: tmpDir, stdio: 'pipe' });
    assert.equal(fs.existsSync(exportPath), true);
    const exportedHtml = fs.readFileSync(exportPath, 'utf8');
    const cspMatch = /<meta\s+http-equiv="Content-Security-Policy"\s+data-floorplan-policy="export"\s+content="([^"]+)"/i.exec(exportedHtml);
    assert.ok(cspMatch);
    assert.equal(cspMatch[1], policyFor(exportedHtml, 'export'));

    // Zero npm dependencies invariant check on the skill directory
    assert.equal(fs.existsSync(path.join(skillRoot, 'node_modules')), false, 'Skill must have zero node_modules');
    const pkgFile = path.join(skillRoot, 'package.json');
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      assert.equal(Object.keys(pkg.dependencies || {}).length, 0, 'Skill must have zero external npm dependencies');
    }
  } finally {
    if (child) child.kill();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
