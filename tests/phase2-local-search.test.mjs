import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { jargonIn, fallbackRouteName, fallbackFileName } from '../scripts/lib/names.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');

// Load plain-script graph-query.js helpers
const gqSrc = fs.readFileSync(path.join(SKILL_DIR, 'assets', 'graph-query.js'), 'utf8');
const { createGraphQuery, normalizeAr, lightStemAr } = new Function(
  `${gqSrc}; return { createGraphQuery, normalizeAr, lightStemAr };`,
)();

test('Phase 2.1: Arabic normalization, light stemming, and bidirectional BM25-lite search', () => {
  assert.equal(normalizeAr('الإِشْعَارَاتُ وَالتَّنْبِيهَات'), 'الاشعارات والتنبيهات');
  assert.equal(lightStemAr('الفواتير'), 'فواتير');
  assert.equal(lightStemAr('المستخدمين'), 'مستخدم');
  assert.equal(lightStemAr('والصلاحيات'), 'صلاحي');

  const G = {
    project: { name: 'Store', summary: 'Online store' },
    nodes: [
      { id: 'web', label: 'Storefront Screens', kind: 'ui', parent: null, summary: 'Pages customers browse', stats: { files: 1, loc: 50 } },
      { id: 'auth_ar', label: 'خدمة الهوية والمصادقة', kind: 'service', parent: null, summary: 'التحقق من تسجيل الدخول والجلسات', stats: { files: 1, loc: 80 } },
    ],
    files: [
      { p: 'src/billing/invoices.ts', n: 'web', loc: 120, name: 'Invoice Billing', d: 'Generates PDF invoices and handles refunds', s: [['chargeCard', 'function', 15, 0, 'Charges card']] },
      { p: 'src/common/helpers.ts', n: 'web', loc: 40, name: 'Common Helpers', d: 'Date formatting utilities', s: [] },
    ],
    routes: [
      { f: 'src/billing/invoices.ts', m: 'POST', p: '/api/checkout', l: 30, h: 'checkoutHandler', name: 'Checkout Payment', d: 'Processes customer payment' },
    ],
    links: [],
    flows: [],
  };

  const q = createGraphQuery(G);

  // Arabic query finds English billing/payment files & endpoints via bilingual bridges + stemming
  const arHits = q.find('كيف تعمل الفواتير والمدفوعات؟');
  assert.ok(arHits.length >= 2);
  assert.ok(arHits.some((h) => h.id === 'f:src/billing/invoices.ts'));
  assert.ok(arHits.some((h) => h.id === 'r:0'));

  // English query finds Arabic-described auth subsystem
  const enHits = q.find('how does login authentication work?');
  assert.ok(enHits.some((h) => h.id === 'n:auth_ar'));
});

test('Phase 2.2: Bilingual Plain Language Linter (Arabic & English)', () => {
  // Clean Arabic description for everyone -> 0 warnings
  assert.deepEqual(
    jargonIn('شاشات العملاء التي تعرض الطلبات وتسمح بتعديل الحساب الشخصي', { language: 'ar' }),
    [],
  );

  // Transliterated Arabic developer jargon -> flagged with Arabic plain suggestions
  const arFlagged = jargonIn('الفرونت إند يتصل مع الباك إند عبر إندبوينت', { language: 'ar' });
  assert.equal(arFlagged.length, 3);
  assert.match(arFlagged[0].say, /شاشات التطبيق/);

  // Arabic fallback names
  assert.equal(fallbackRouteName({ method: 'POST', path: '/api/orders', handler: '' }, 'ar'), 'إنشاء Orders');
  assert.equal(fallbackFileName('src/checkout/page.tsx', 'ar'), 'صفحة Checkout');
});

test('Phase 2.3: Smart Offline Local Engine extracts real function guards, HTTP codes, calls, and connected trace', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-p2-'));
  let child = null;
  try {
    execFileSync('git', ['init'], { cwd: tmp, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmp, 'web'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'server'), { recursive: true });

    fs.writeFileSync(path.join(tmp, 'web', 'CheckoutPage.tsx'), [
      'import { sendPayment } from "./payClient";',
      'export function CheckoutPage() {',
      '  return sendPayment({ amount: 100 });',
      '}',
    ].join('\n'));

    fs.writeFileSync(path.join(tmp, 'web', 'payClient.ts'), [
      'export async function sendPayment(body: any) {',
      '  return fetch("/api/payments/charge", { method: "POST", body: JSON.stringify(body) });',
      '}',
    ].join('\n'));

    fs.writeFileSync(path.join(tmp, 'server', 'payments.py'), [
      'from fastapi import APIRouter, Depends, HTTPException',
      'from .ledger import record_invoice',
      'router = APIRouter()',
      '@router.post("/api/payments/charge")',
      'async def charge_endpoint(user = Depends(require_active_session)):',
      '    if not user:',
      '        raise HTTPException(status_code=403, detail="Forbidden")',
      '    return await record_invoice(user)',
    ].join('\n'));

    fs.writeFileSync(path.join(tmp, 'server', 'ledger.py'), [
      'async def record_invoice(user):',
      '    return {"paid": True}',
    ].join('\n'));

    const outDir = path.join(tmp, 'floorplan');
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'scan.mjs'), tmp], { stdio: 'ignore' });
    fs.writeFileSync(path.join(outDir, 'architecture.json'), JSON.stringify({
      language: 'ar',
      project: { name: 'متجر الدفع', summary: 'منصة تجارة إلكترونية لمعالجة الفواتير والمدفوعات' },
      nodes: [
        { id: 'web', label: 'واجهة المتجر', kind: 'ui', summary: 'شاشات الدفع للعملاء', paths: ['web/**'] },
        { id: 'server', label: 'خادم المدفوعات', kind: 'service', summary: 'يستقبل طلبات الدفع ويسجل الفواتير', paths: ['server/**'] },
      ],
    }, null, 2));
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'build.mjs'), tmp], { stdio: 'ignore' });

    const stateFile = path.join(outDir, '.cache', 'server.json');
    child = spawn(process.execPath, [path.join(outDir, 'serve.mjs'), '--port', '4595', '--engine', 'local'], {
      cwd: tmp,
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
    assert.ok(srvState?.url);

    const sse = await fetch(`${srvState.url}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-floorplan-token': srvState.token },
      body: JSON.stringify({ question: 'كيف يعمل الدفع وتسجيل الفاتورة؟', mode: 'ask' }),
    }).then((r) => r.text());

    const dataLine = sse.split('\n\n').find((b) => b.includes('event: answer'))?.split('\ndata: ')[1];
    assert.ok(dataLine, 'received SSE answer payload');
    const ans = JSON.parse(dataLine);

    // Verify real code snippet facts (line range, Depends(require_active_session), HTTP 403, record_invoice)
    assert.match(ans.answer, /server\/payments\.py:L5/);
    assert.match(ans.answer, /Depends\(require_active_session\)/);
    assert.match(ans.answer, /HTTP 403/);
    assert.ok(ans.steps.length >= 2, 'built ordered walkthrough steps');
  } finally {
    if (child) child.kill();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
