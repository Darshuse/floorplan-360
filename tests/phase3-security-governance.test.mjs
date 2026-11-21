import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { computeCodeMetrics, gradeQuality, findImportCycles, checkLayerRules } from '../scripts/lib/metrics.mjs';
import { compileGlob } from '../scripts/lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');

test('Phase 3.1: Clean Code metrics (Uncle Bob / SonarQube) & Quality grading', () => {
  const cleanPy = [
    'def add_tax(amount: float, rate: float) -> float:',
    '    if amount <= 0:',
    '        return 0.0',
    '    return amount * (1 + rate)',
  ].join('\n');
  const mClean = computeCodeMetrics(cleanPy, 'python');
  assert.equal(mClean.fnCount, 1);
  assert.equal(mClean.maxParams, 2);
  assert.equal(gradeQuality({ loc: 4, ...mClean, fanOut: 1 }).grade, 'good');

  const messyTs = [
    'export function processEverything(a, b, c, d, e, f, g, h, i) {',
    '  if (a && b || c) { if (d) { for (const x of e) { if (f || g && h) return x; } } }',
    '  return i;',
    '}',
  ].join('\n');
  const mMessy = computeCodeMetrics(messyTs, 'typescript');
  assert.equal(mMessy.maxParams, 9);
  assert.ok(mMessy.maxFnComplexity >= 8);
  assert.equal(gradeQuality({ loc: 20, ...mMessy, fanOut: 3 }).grade, 'bad');
});

test('Phase 3.2: Tarjan SCC Circular Dependency Detector & Layer Rules Validator', () => {
  const links = [
    { a: 'f:src/a.ts', b: 'f:src/b.ts', k: 'import', w: 1 },
    { a: 'f:src/b.ts', b: 'f:src/c.ts', k: 'import', w: 1 },
    { a: 'f:src/c.ts', b: 'f:src/a.ts', k: 'import', w: 1 },
    { a: 'f:src/clean.ts', b: 'f:src/a.ts', k: 'import', w: 1 },
  ];
  const cycles = findImportCycles(links);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].nodes.length, 3);
  assert.equal(cycles[0].cycle[0], cycles[0].cycle[cycles[0].cycle.length - 1]);

  const mockGraph = {
    nodes: [
      { id: 'server', parent: null, label: 'Server' },
      { id: 'server.domain', parent: 'server', label: 'Domain' },
      { id: 'server.routes', parent: 'server', label: 'Routes' },
    ],
    files: [
      { p: 'backend/domain/order.py', n: 'server.domain' },
      { p: 'backend/routes/orders_api.py', n: 'server.routes' },
    ],
    links: [
      { a: 'f:backend/domain/order.py', b: 'f:backend/routes/orders_api.py', k: 'import', w: 1 },
    ],
  };
  const violations = checkLayerRules(
    mockGraph,
    [{ from: 'server.domain', forbid: ['server.routes'], reason: 'Domain must not import HTTP routes', severity: 'high' }],
    compileGlob,
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].hits.length, 1);
});

test('Phase 3.3: 2-Hop Inter-Procedural Auth Tracer eliminates false positives while catching real open routes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-p3-'));
  try {
    execFileSync('git', ['init'], { cwd: tmp, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmp, 'backend', 'routers'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'usecases'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'core'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'domain'), { recursive: true });

    // Hop 2 internal guard helper
    fs.writeFileSync(path.join(tmp, 'backend', 'core', 'auth_guard.py'), [
      'from fastapi import HTTPException',
      'def _require_username(request):',
      '    sid = request.cookies.get("session_id")',
      '    if not sid:',
      '        raise HTTPException(status_code=401, detail="Not signed in")',
      '    return sid',
    ].join('\n'));

    // Hop 1 usecase calling Hop 2 guard (plus a non-guarding helper for the open route)
    fs.writeFileSync(path.join(tmp, 'backend', 'usecases', 'session_uc.py'), [
      'from ..core.auth_guard import _require_username',
      'async def execute_keepalive_session(request):',
      '    username = _require_username(request)',
      '    return {"ok": True, "user": username}',
      '',
      'async def unsafe_wipe_records():',
      '    return {"deleted": 99}',
    ].join('\n'));

    // Protected router (protected via 2-hop call chain: keepalive_route -> execute_keepalive_session -> _require_username)
    fs.writeFileSync(path.join(tmp, 'backend', 'routers', 'session_router.py'), [
      'from fastapi import APIRouter, Request',
      'from ..usecases.session_uc import execute_keepalive_session',
      'router = APIRouter()',
      '@router.post("/api/session/keepalive")',
      'async def keepalive_route(request: Request):',
      '    return await execute_keepalive_session(request)',
    ].join('\n'));

    // Truly unprotected router (calls unsafe_wipe_records which has NO auth check!)
    fs.writeFileSync(path.join(tmp, 'backend', 'routers', 'admin_wipe.py'), [
      'from fastapi import APIRouter',
      'from ..usecases.session_uc import unsafe_wipe_records',
      'router = APIRouter()',
      '@router.delete("/api/admin/wipe")',
      'async def wipe_all():',
      '    return await unsafe_wipe_records()',
    ].join('\n'));

    // Domain file violating layer rule (importing router)
    fs.writeFileSync(path.join(tmp, 'backend', 'domain', 'entity.py'), [
      'from ..routers.session_router import router',
      'def get_entity():',
      '    return str(router)',
    ].join('\n'));

    const outDir = path.join(tmp, 'floorplan');
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'scan.mjs'), tmp], { stdio: 'ignore' });
    fs.writeFileSync(path.join(outDir, 'architecture.json'), JSON.stringify({
      project: { name: 'Auth & Governance Test', summary: 'Tests 2-hop auth and layer governance.' },
      layerRules: [
        { from: 'server.domain', forbid: ['server.routers'], severity: 'high', reason: 'Domain must never import routers' },
      ],
      nodes: [
        { id: 'server', label: 'Backend', kind: 'service', summary: 'Main server', paths: ['backend/**'] },
        { id: 'server.routers', parent: 'server', label: 'Routers', kind: 'feature', summary: 'HTTP routes', paths: ['backend/routers/**'] },
        { id: 'server.usecases', parent: 'server', label: 'Usecases', kind: 'library', summary: 'Business flows', paths: ['backend/usecases/**'] },
        { id: 'server.core', parent: 'server', label: 'Core Security', kind: 'library', summary: 'Session helpers', paths: ['backend/core/**'] },
        { id: 'server.domain', parent: 'server', label: 'Domain', kind: 'library', summary: 'Entities', paths: ['backend/domain/**'] },
      ],
    }, null, 2));
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'build.mjs'), tmp], { stdio: 'ignore' });

    const graph = JSON.parse(fs.readFileSync(path.join(outDir, 'graph.json'), 'utf8'));
    const issues = graph.health.issues;

    // 1. Zero false positive on session_router.py (protected via 2-hop _require_username!)
    assert.ok(
      !issues.some((i) => i.id === 'open-endpoints:backend/routers/session_router.py'),
      'session_router.py must be recognized as protected via 2-hop internal guard',
    );

    // 2. True positive preserved on admin_wipe.py!
    assert.ok(
      issues.some((i) => i.id === 'open-endpoints:backend/routers/admin_wipe.py' && i.severity === 'high'),
      'admin_wipe.py must still be flagged as an open write endpoint',
    );

    // 3. Layer rule violation caught!
    assert.ok(
      issues.some((i) => i.kind === 'layer-violation' && i.severity === 'high'),
      'Domain -> Routers layer violation must be flagged',
    );

    // 4. Clean code quality metrics attached to files and rolled up on nodes
    assert.ok(graph.files.every((f) => f.q && typeof f.q.score === 'number'));
    assert.ok(graph.nodes.find((n) => n.id === 'server')?.quality);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
