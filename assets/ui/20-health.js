// Health check panel: plain-language warnings from graph.health (lib/health.mjs) — leaked keys,
// endpoints anyone can call (with 2-hop auth tracing), circular dependencies, layer rule violations,
// and unused / oversized files — each with "Show on map" and a ready prompt for your AI coding assistant.
// Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  // an exported copy without Health leaves the button out: an empty list would read as "all clear"
  if (!SC || (SC.exported && !SC.graph.health)) return;
  const { h } = SC;
  const A = () => SC.agent || { id: 'none', name: 'AI', app: 'your AI coding assistant' };
  const issues = (SC.graph.health && SC.graph.health.issues) || [];
  // a blueprint (planned, not built) gets a design review of the plan instead of a code check
  const PLAN = !!SC.graph.meta.blueprint;
  const isAr = () => !!(SC.lang && SC.lang() === 'ar');
  const isBiz = () => !!(SC.business && SC.business());
  const fixLabel = () => {
    const a = A();
    if (isAr()) {
      const verb = PLAN ? 'معالجة' : 'إصلاح';
      return a.id === 'local' || a.id === 'none' || a.name === 'AI' ? `${verb} بالذكاء الاصطناعي` : `${verb} عبر ${a.name}`;
    }
    const FIX = PLAN ? 'Resolve' : 'Fix';
    return a.id === 'local' || a.id === 'none' || a.name === 'AI' ? `${FIX} with AI` : `${FIX} with ${a.name}`;
  };
  const checkName = () => isAr() ? (PLAN ? 'مراجعة التصميم' : 'فحص الصحة') : (PLAN ? 'design review' : 'health check');
  const ISSUES_URL = 'https://github.com/haydenschmitty/floorplan/issues/new';

  // ---------- "not a problem" ----------
  // Saved by serve.mjs to floorplan/health-dismissed.json (build folds it into graph.health.dismissed);
  // a map opened without the server keeps them in this browser. A dismissal covers the issue as it was: it
  // shows again if it gets more or less serious or finds something new in a file (counted per file, so an
  // edit higher up doesn't bring it back; the same rule as dismissalFor in lib/health.mjs).
  const SERVER = window.FLOORPLAN_SERVER;
  const STORE_KEY = 'health-dismissed:' + (SC.graph.meta.rootName || '');
  const built = (SC.graph.health && SC.graph.health.dismissed) || [];
  let dismissed = SC.exported || SERVER ? built : SC.store.get(STORE_KEY, built);
  const locsOf = (issue) => (issue.locations || []).map((l) => `${l.file}:${l.line}`);
  const dismissalOf = (issue) => {
    const d = dismissed.find((x) => x.id === issue.id);
    if (!d || (d.severity && d.severity !== issue.severity)) return null;
    const left = new Map();
    for (const loc of d.locations || []) { const f = String(loc).replace(/:[^:]*$/, ''); left.set(f, (left.get(f) || 0) + 1); }
    for (const l of issue.locations || []) { const n = left.get(l.file) || 0; if (!n) return null; left.set(l.file, n - 1); }
    return d;
  };
  const canDismiss = !SC.exported;
  async function saveDismissal(issue, reason) {
    const rec = { id: issue.id, severity: issue.severity, locations: locsOf(issue), ...(reason ? { reason } : {}) };
    if (SERVER) {
      const r = await fetch('/api/health/dismissed', { method: 'POST', headers: { 'content-type': 'application/json', 'x-floorplan-token': SERVER.token }, body: JSON.stringify(rec) }).then((x) => x.json()).catch(() => null);
      if (!r) { SC.toast('Couldn’t reach the map server, so this wasn’t saved.'); return false; }
      dismissed = r.dismissed;
    } else {
      dismissed = [...dismissed.filter((x) => x.id !== issue.id), { ...rec, at: new Date().toISOString() }];
      SC.store.set(STORE_KEY, dismissed);
    }
    return true;
  }
  async function undoDismissal(issue) {
    if (SERVER) {
      const r = await fetch('/api/health/dismissed', { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-floorplan-token': SERVER.token }, body: JSON.stringify({ id: issue.id }) }).then((x) => x.json()).catch(() => null);
      if (!r) { SC.toast('Couldn’t reach the map server.'); return; }
      dismissed = r.dismissed;
    } else {
      dismissed = dismissed.filter((x) => x.id !== issue.id);
      SC.store.set(STORE_KEY, dismissed);
    }
    refresh();
  }

  const DEV_ISSUE_KINDS = new Set(['circular-dependency', 'large-file', 'unused-file', 'layer-violation', 'hardcoded-url']);
  const visibleForMode = (issue) => !isBiz() || issue.severity === 'high' || !DEV_ISSUE_KINDS.has(issue.kind);

  const SEV = {
    high: { color: 'var(--sev-high)', group: 'Fix these first', groupAr: 'عاجل — يُعالج أولاً', word: 'important', wordAr: 'حرج' },
    medium: { color: 'var(--sev-medium)', group: 'Worth fixing soon', groupAr: 'يُنصح بمعالجته قريباً', word: 'worth fixing', wordAr: 'مهم' },
    low: { color: 'var(--sev-low)', group: 'Good to tidy up', groupAr: 'تحسينات تنظيمية بسيطة', word: 'minor', wordAr: 'بسيط' },
  };
  const ORDER = ['high', 'medium', 'low'];
  const active = () => issues.filter((i) => !dismissalOf(i) && visibleForMode(i));
  const hiddenDevCount = () => isBiz() ? issues.filter((i) => !dismissalOf(i) && !visibleForMode(i)).length : 0;
  const count = (sev) => active().filter((i) => i.severity === sev).length;
  const urgent = () => count('high') + count('medium');

  function localizeIssue(issue) {
    if (!isAr()) return { title: issue.title, detail: issue.detail };
    const locs = issue.locations || [];
    const firstFile = locs[0] && locs[0].file ? locs[0].file.split('/').pop() : '';
    switch (issue.kind) {
      case 'secret':
      case 'public-secret':
      case 'public-env-secret':
        return {
          title: issue.kind === 'secret'
            ? `احتمال وجود مفتاح سري مكتوب مباشرة في الكود${firstFile ? ` (${firstFile})` : ''}`
            : 'مفتاح سري قد يصل إلى متصفح المستخدم',
          detail: isBiz()
            ? 'يوجد مفتاح وصول حساس مخزّن داخل ملفات المشروع بدلاً من خزنة الإعدادات الآمنة، ما قد يعرّض الربط الخارجي للخطر.'
            : 'تم رصد قيمة تبدو كمفتاح API أو سر مصادقة داخل الكود المصدري. يُنصح بنقلها إلى متغيرات البيئة وتدوير المفتاح.',
        };
      case 'env-file':
        return {
          title: 'ملف إعدادات بيئية حساس متتبّع داخل المستودع',
          detail: 'تجنّب حفظ ملفات .env التي تحتوي على بيانات سرية داخل سجل Git؛ أضفها إلى .gitignore واستخدم متغيرات البيئة الآمنة.',
        };
      case 'unprotected-endpoint':
      case 'open-endpoint': {
        return {
          title: isBiz()
            ? 'خدمة قد تكون متاحة بدون التحقق من هوية المستخدم'
            : `نقطة اتصال قد لا تتحقق من الجلسة أو الصلاحية${firstFile ? ` (${firstFile})` : ''}`,
          detail: isBiz()
            ? 'تأكد من أن هذه العملية مسموح بها للزوار العموميين، أو أنها تتطلب تسجيل دخول قبل التنفيذ.'
            : 'لم يرصد الفاحص الثابت حارس مصادقة مباشر أو وسيط جلسة على هذا المسار. إن كان المسار عاماً بالتصميم فيمكنك استبعاده عبر «ليس مشكلة».',
        };
      }
      case 'cors':
        return {
          title: 'إعدادات النطاقات المسموحة (CORS) تسمح لأي موقع خارجي بالاتصال',
          detail: 'يُنصح بحصر النطاقات المسموح لها بالاتصال بالخادم على عنوان تطبيقك الرسمي فقط، خصوصاً عند استخدام جلسات الدخول.',
        };
      case 'database-rules':
        return {
          title: 'جدول قاعدة بيانات قد يفتقر إلى قواعد عزل صلاحيات المستخدمين',
          detail: 'تأكد من تفعيل صلاحيات الوصول على مستوى الصفوف حتى لا يتمكن مستخدم من قراءة أو تعديل بيانات مستخدم آخر.',
        };
      case 'stripe-webhook':
        return {
          title: 'استقبال إشعارات دفع دون التحقق من التوقيع الرقمي',
          detail: 'يجب التحقق من توقيع مزوّد الدفع قبل اعتماد أي عملية مالية لمنع الإشعارات المزوّرة.',
        };
      case 'circular-dependency':
        return {
          title: `اعتماد دائري بين ملفات داخلية (${locs.length || 2} ملفات)`,
          detail: 'تستورد هذه الملفات بعضها البعض في حلقة مغلقة، ما يصعّب الصيانة والاختبار المستقل مستقبلاً.',
        };
      case 'layer-violation':
        return {
          title: 'تجاوز لحدود الطبقات المعمارية المحددة',
          detail: 'تعتمد طبقة داخلية على طبقة خارجية خلافاً لقواعد العزل المعماري المعرّفة في المشروع.',
        };
      case 'hardcoded-url':
        return {
          title: 'عنوان خادم محلي مكتوب بشكل ثابت داخل الكود',
          detail: 'يشير الكود مباشرة إلى localhost بدلاً من متغير بيئة، ما قد يسبب فشل الاتصال عند النشر في بيئة الإنتاج.',
        };
      case 'large-file':
        return {
          title: `ملف كبير الحجم قد يحتاج إلى تقسيم${firstFile ? ` (${firstFile})` : ''}`,
          detail: 'يجمع هذا الملف مسؤوليات متعددة في مكان واحد؛ تقسيمه يسهّل الفهم والمراجعة.',
        };
      case 'unused-file':
        return {
          title: `ملف غير مستخدم في أي مسار حالي${firstFile ? ` (${firstFile})` : ''}`,
          detail: 'لا يوجد أي استيراد أو استدعاء لهذا الملف داخل الخريطة؛ يمكن حذفه إن لم يعد مطلوباً.',
        };
      default:
        return { title: issue.title, detail: issue.detail };
    }
  }

  function localizeChecked(c) {
    if (!isAr()) return { label: c.label, text: c.text };
    const labelMap = {
      'Endpoint sign-in': 'حماية المسارات وتسجيل الدخول',
      'Secrets in code': 'المفاتيح السرية في الكود',
      'Circular dependencies': 'الاعتماد الدائري بين الملفات',
      'Layer boundary rules': 'قواعد عزل الطبقات المعمارية',
      'Supabase table rules': 'قواعد جداول Supabase',
      'Firebase rules': 'قواعد حماية Firebase',
      'Stripe webhooks': 'إشعارات الدفع (Stripe)',
      'Secrets': 'الأسرار والمفاتيح',
      'Endpoints': 'نقاط الاتصال والصلاحيات',
      'Cycles & layers': 'الحلقات الدائرية والطبقات',
      'Code hygiene': 'نظافة الكود والملفات',
      'Hardcoded URLs': 'عناوين الاتصال الثابتة',
      'Open endpoints': 'حماية المسارات',
    };
    const label = labelMap[c.label] || c.label;
    const text = c.text
      .replace(/read (\d+) files?;\s*(\d+) files? too big to read weren[’']t checked/i, 'تم فحص $1 ملفاً ($2 ملفات كبيرة الحجم لم تُفحص)')
      .replace(/read (\d+) files?/i, 'تم فحص $1 ملفاً')
      .replace(/checked (\d+) endpoints?(?:\s*\([^)]*\))?/i, 'تم فحص $1 نقطة اتصال (شاملاً تتبّع المصادقة عبر الطبقات)')
      .replace(/checked (\d+) layer rules? from architecture\.json/i, 'تم التحقق من $1 قواعد معمارية في architecture.json')
      .replace(/found (\d+) import cycles? via Tarjan SCC/i, 'تم رصد $1 حلقة استيراد دائري')
      .replace(/no import cycles found/i, 'لا توجد حلقات استيراد دائري')
      .replace(/no (.+) found/i, 'غير مستخدم في المشروع')
      .replace(/none found/i, 'لم يتم العثور على مشاكل')
      .replace(/all clear/i, 'سليم بالكامل');
    return { label, text };
  }

  SC.icons.health = '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>';
  SC.icons.check = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

  const style = document.createElement('style');
  style.textContent = `
    .hc-issue { padding: 12px 14px; border-radius: 16px; background: rgba(var(--ink), .04); margin-bottom: 8px; }
    .hc-issue:last-child { margin-bottom: 0; }
    .hc-issue.off { background: none; box-shadow: inset 0 0 0 1px rgba(var(--ink), .08); }
    .hc-issue.off .hc-t { color: var(--text-2); }
    .hc-t { display: flex; gap: 9px; align-items: flex-start; font-weight: 500; line-height: 1.4; }
    .hc-t .dot { margin-top: 6px; }
    .hc-d { color: var(--text-2); font-size: 12.5px; line-height: 1.55; margin-top: 6px; margin-inline-start: 17px; }
    .hc-n { color: var(--text-3); font-size: 12.5px; line-height: 1.45; margin-top: 4px; margin-inline-start: 17px; }
    .hc-w { font-family: var(--mono); font-size: 11px; color: var(--text-3); margin-top: 6px; margin-inline-start: 17px; word-break: break-all; line-height: 1.5; direction: ltr; text-align: left; }
    .hc-a { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; margin-inline-start: 17px; }
    .hc-a .btn { height: 30px; padding: 0 12px; font-size: 12.5px; gap: 6px; }
    .hc-a .btn svg.i { width: 14px; height: 14px; }
    .hc-calm { margin-top: 14px; padding: 11px 13px; border-radius: 14px; background: var(--ok-bg); color: var(--ok-text); font-size: 13px; line-height: 1.55; }
    .hc-biz-note { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(var(--ink), .045); color: var(--text-2); font-size: 12.5px; line-height: 1.55; }
    .hc-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 12px; font-size: 12px; color: var(--text-2); }
    .hc-sub span { display: inline-flex; align-items: center; gap: 6px; }
    .hc-chk { display: grid; gap: 6px; font-size: 12.5px; line-height: 1.5; color: var(--text-2); }
    .hc-chk .k { display: flex; gap: 9px; align-items: flex-start; overflow-wrap: anywhere; }
    .hc-chk .k .dot { margin-top: 6px; flex: none; }
    .hc-chk .k b { color: var(--text); font-weight: 500; }
    .hc-chk .k.loud { padding: 10px 12px; border-radius: 14px; background: rgba(var(--ink), .05); color: var(--text); }
    #btn-health .badge { background: var(--hc-badge, var(--on)); color: var(--hc-badge-text, var(--on-text)); }
    #btn-health.calm svg.i { color: var(--ok); }
    #modal .hc-hint { margin: 0; }
    #modal .hc-hint b { color: var(--text); font-weight: 500; }
    #modal .hc-why { width: 100%; min-height: 72px; resize: vertical; margin-top: 12px; background: rgba(var(--ink), .05); border: 0; border-radius: 14px; padding: 11px 13px; color: var(--text); outline: none; font: inherit; font-size: 13px; line-height: 1.5; box-sizing: border-box; }
    #modal .hc-why:focus { background: rgba(var(--ink), .07); box-shadow: 0 0 0 1px rgba(var(--ink), .14); }
    #modal .hc-rep { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 13px; line-height: 1.5; color: var(--text-2); cursor: pointer; }
    #modal .hc-rep input { margin-top: 3px; }
    #modal .hc-prev { margin-top: 8px; display: none; }
    #modal .hc-prev.on { display: block; }
  `;
  document.head.appendChild(style);

  // ---------- actions ----------
  let isOpen = false, openedAt = null;
  const where = () => JSON.stringify([SC.state.selected, SC.state.container]);
  function closeList() { isOpen = false; SC.closePanel(); }
  function showOnMap(issue) {
    const items = (issue.items || []).filter((id) => SC.exists(id)).map((id) => ({ id, note: (issue.notes && issue.notes[id]) || '' }));
    if (!items.length) { SC.toast(isAr() ? `هذا العنصر غير ظاهر على الخريطة. استخدم «${fixLabel()}».` : `This one isn’t on the map. Use “${fixLabel()}” instead.`); return; }
    if (isOpen) closeList();
    const loc = localizeIssue(issue);
    SC.showBoard({ title: loc.title, question: loc.detail, items });
  }
  // a served blueprint settles review items on the map: the request goes into the Ask bar's Change mode,
  // for the person to finish (an open question needs their answer) or edit, then send
  const here = (issue) => PLAN && !!issue.change && !!SC.canChange?.();
  function resolveHere(issue) {
    if (isOpen) closeList();
    if (!SC.draftChange(issue.change)) { fixWith(issue); return; }
    SC.toast(isAr() ? 'عدّل الطلب إن رغبت ثم اضغط Enter' : (issue.kind === 'question' ? 'Type your answer, then press Enter' : 'Edit the request if you like, then press Enter'));
  }
  function fixWith(issue) {
    const curA = A();
    const ar = isAr();
    SC.modal({
      title: fixLabel(),
      html: ar
        ? `<p class="hc-hint">انسخ هذا الطلب والصقه في <b>${h(curA.app)}</b> داخل مجلد المشروع. يشرح التعديل المطلوب بدقة ويستأذنك قبل أي تغيير حساس.</p><pre>${h(issue.fix)}</pre>`
        : `<p class="hc-hint">Copy this request and paste it into <b>${h(curA.app)}</b>, opened in your project folder. It explains what to change and asks before anything risky.</p><pre>${h(issue.fix)}</pre>`,
      actions: [{ label: ar ? 'نسخ الطلب' : 'Copy prompt', primary: true, icon: 'copy', onClick: () => { SC.copy(issue.fix).then((ok) => { if (ok) SC.toast(ar ? `تم النسخ. الصقه في ${curA.app}.` : `Copied. Paste it into ${curA.app}.`); }); } }],
    });
  }
  // The report is a GitHub issue the person reads and sends themselves: which check fired, its title (which
  // can name a file or endpoint), the kinds of files involved and their note. Never code, values or the fix prompt.
  const reportText = (issue, reason) => [
    `**Check:** ${issue.kind} (${issue.severity})`,
    `**What Floorplan said:** ${issue.title}`,
    `**File types:** ${[...new Set((issue.locations || []).map((l) => (/\.[^./]+$/.exec(l.file) || [l.file.split('/').pop()])[0]))].slice(0, 6).join(', ') || 'none'}`,
    ``,
    `**Why it's not a problem:**`,
    reason.slice(0, 1500) || '_(no note)_',
  ].join('\n');
  function notAProblem(issue) {
    const ar = isAr();
    const loc = localizeIssue(issue);
    const m = SC.modal({
      title: ar ? 'ليس مشكلة فعلية؟' : 'Not a problem?',
      html: ar
        ? `<p class="hc-hint">علّم «${h(loc.title)}» كإنذار غير مقصود لينتقل إلى أسفل ${checkName()} خارج العدّاد. سيعود تلقائياً إذا ظهر تغيير جديد في نفس الموضع.</p>
          <textarea class="hc-why" placeholder="السبب (اختياري) — مثال: هذا المسار عام بالتصميم أو القيمة مجزأة وليست سراً" spellcheck="true"></textarea>
          <label class="hc-rep"><input type="checkbox" class="hc-rep-on"><span>إرسال ملاحظة لمطوري Floorplan لتحسين الفاحص (يفتح صفحة GitHub لتراجعها قبل الإرسال دون أي كود أو قيم سرية).</span></label>
          <pre class="hc-prev"></pre>`
        : `<p class="hc-hint">Mark “${h(issue.title)}” as a false alarm and it moves to the bottom of the ${checkName()}, out of the count. It comes back if this check finds something new there.</p>
          <textarea class="hc-why" placeholder="Why not? (optional) e.g. that value is a bcrypt hash, not the password" spellcheck="true"></textarea>
          <label class="hc-rep"><input type="checkbox" class="hc-rep-on"><span>Also tell the Floorplan developer, so the check gets better. This opens a GitHub issue you can read and edit before sending. It includes only what’s shown below, never your code or any values.</span></label>
          <pre class="hc-prev"></pre>`,
      actions: [{ label: ar ? 'تأكيد أنه ليس مشكلة' : 'Mark as not a problem', primary: true, icon: 'check', keepOpen: true, onClick: async (close) => {
        const reason = m.el.querySelector('.hc-why').value.trim();
        const report = m.el.querySelector('.hc-rep-on').checked;
        const url = `${ISSUES_URL}?title=${encodeURIComponent(`False positive: ${issue.kind}`)}&body=${encodeURIComponent(reportText(issue, reason))}`;
        let opened = false;
        if (report) { if (SC.store.persistent === false && SC.openWindow) opened = SC.openWindow(url, { quiet: true }); else { window.open(url, '_blank', 'noopener'); opened = true; } }
        if (!(await saveDismissal(issue, reason))) return;
        close();
        refresh();
        SC.toast(ar ? 'تم استبعاد التنبيه.' : (report && opened ? 'Marked as not a problem. Thanks for the report.' : 'Marked as not a problem.'));
        if (report && !opened) SC.showAddress(url);
      } }],
    });
    const why = m.el.querySelector('.hc-why'), on = m.el.querySelector('.hc-rep-on'), prev = m.el.querySelector('.hc-prev');
    const sync = () => { prev.classList.toggle('on', on.checked); prev.textContent = reportText(issue, why.value.trim()); };
    why.addEventListener('input', sync); on.addEventListener('change', sync);
    why.focus();
  }
  const onMap = (issue) => (issue.items || []).some((id) => SC.exists(id));

  // ---------- html ----------
  const locText = (issue) => {
    const locs = issue.locations || [];
    if (!SC.technical() || isBiz() || !locs.length) return '';
    const shown = locs.slice(0, 3).map((l) => `${l.file}${l.line > 1 ? ':' + l.line : ''}`);
    return `<div class="hc-w">${shown.map(h).join('<br>')}${locs.length > 3 ? `<br>+${locs.length - 3} ${isAr() ? 'مواضع أخرى' : 'more'}` : ''}</div>`;
  };
  const issueHtml = (issue, idx, note) => {
    const ar = isAr();
    const loc = localizeIssue(issue);
    const d = dismissalOf(issue);
    if (d) return `<div class="hc-issue off">
        <div class="hc-t"><span class="dot" style="background:rgba(var(--ink),.2)"></span><span>${h(loc.title)}</span></div>
        <div class="hc-n">${ar ? 'مُستبعد (ليس مشكلة)' : 'Marked as not a problem'}${d.reason ? `: ${h(d.reason)}` : ''}</div>
        ${canDismiss ? `<div class="hc-a"><button class="btn soft" data-hc-undo="${idx}">${ar ? 'إظهار مجدداً' : 'Show again'}</button></div>` : ''}
      </div>`;
    return `<div class="hc-issue">
      <div class="hc-t"><span class="dot" style="background:${SEV[issue.severity].color}"></span><span>${h(loc.title)}</span></div>
      ${note ? `<div class="hc-n">${h(note)}</div>` : `<div class="hc-d">${h(loc.detail)}</div>`}
      ${locText(issue)}
      <div class="hc-a">
        ${onMap(issue) ? `<button class="btn soft" data-hc-show="${idx}">${SC.iconI('search')}${ar ? 'عرض على الخريطة' : 'Show on map'}</button>` : ''}
        ${SC.exported || isBiz() ? '' : here(issue) ? `<button class="btn soft" data-hc-here="${idx}">${SC.iconI('spark')}${ar ? 'معالجة على الخريطة' : 'Resolve on the map'}</button>` : `<button class="btn soft" data-hc-fix="${idx}">${SC.iconI('spark')}${h(fixLabel())}</button>`}
        ${canDismiss ? `<button class="btn soft" data-hc-dismiss="${idx}">${SC.iconI('check')}${ar ? 'ليس مشكلة' : 'Not a problem'}</button>` : ''}
      </div>
    </div>`;
  };
  const bindIssues = (el) => {
    const on = (attr, fn) => el.querySelectorAll(`[data-hc-${attr}]`).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(issues[+b.getAttribute(`data-hc-${attr}`)]); }));
    on('show', showOnMap); on('fix', fixWith); on('here', resolveHere); on('dismiss', notAProblem); on('undo', undoDismissal);
  };
  const headline = () => {
    if (isAr()) {
      const u = urgent();
      if (u) return u === 1 ? 'تنبيه واحد يحتاج للمراجعة' : `${u} تنبيهات تحتاج للمراجعة`;
      return active().length ? 'لا توجد مخاطر عاجلة' : 'النظام سليم — لا توجد مخاطر مرصودة';
    }
    return urgent() ? `${SC.plural(urgent(), 'thing')} need${urgent() === 1 ? 's' : ''} attention` : active().length ? 'Nothing urgent' : 'No problems found';
  };
  const breakdown = () => `<div class="hc-sub">${ORDER.filter(count).map((s) => `<span><i class="dot" style="background:${SEV[s].color}"></i>${count(s)} ${isAr() ? SEV[s].wordAr : SEV[s].word}</span>`).join('')}</div>`;
  const headColor = () => urgent() ? SEV[count('high') ? 'high' : 'medium'].color : 'var(--ok)';

  // ---------- what was checked ----------
  const checked = Array.isArray(SC.graph.health && SC.graph.health.checked) ? SC.graph.health.checked.filter((c) => c && typeof c.label === 'string' && typeof c.text === 'string') : [];
  const gaps = checked.filter((c) => c.loud);
  const checkedHtml = () => {
    if (!checked.length || isBiz()) return '';
    return `<div class="sec"><h3>${isAr() ? 'نطاق الفحص التلقائي الثابت' : 'What was checked'}</h3><div class="hc-chk">${checked.map((c) => {
      const lc = localizeChecked(c);
      return `<div class="k${c.loud ? ' loud' : ''}"><span class="dot" style="background:${c.loud ? 'var(--sev-medium)' : c.checked ? 'var(--ok)' : 'rgba(var(--ink),.22)'}"></span><span><b>${h(lc.label)}:</b> ${h(lc.text)}</span></div>`;
    }).join('')}</div></div>`;
  };
  const appWide = (!PLAN && SC.graph.health && SC.graph.health.appWide) || [];
  const appWideHtml = () => {
    if (!appWide.length || isBiz()) return '';
    if (isAr()) {
      return `<p class="pd">${appWide.map((g) => `يُعدّ ${g.endpoints} مساراً محمياً بفضل الحارس العام <b>${h(g.name)}</b> في ${h(g.file)} (سطر ${h(String(g.line))}) الذي يعمل قبل كل طلب.`).join(' ')}</p>`;
    }
    return `<p class="pd">${appWide.map((g) => `${SC.plural(g.endpoints, 'endpoint')} ${g.endpoints === 1 ? 'counts' : 'count'} as protected only because of <b>${h(g.name)}</b>, a check in ${h(g.file)} (line ${h(String(g.line))}) that runs before every request.`).join(' ')} If it lets some requests through, those endpoints are open to anyone.</p>`;
  };

  const hasQuality = !PLAN && Array.isArray(SC.graph.files) && SC.graph.files.some((f) => f.q) && typeof SC.setHeatmap === 'function';
  function listHtml() {
    const ar = isAr();
    const biz = isBiz();
    const live = active(), off = issues.filter(dismissalOf);
    const hiddenDev = hiddenDevCount();
    const curA = A();
    const hmOn = !!(SC.heatmap && SC.heatmap());
    const hmLabel = SC.ui ? SC.ui('qualityHeatmap') : (ar ? 'خريطة الجودة' : 'Quality heatmap');
    const introText = PLAN
      ? (ar ? 'فحصنا المخطط للتحقق من الخدمات المكشوفة للعامة والقرارات المفتوحة والأجزاء غير المتصلة.' : 'We checked the plan for parts anyone on the internet could use, decisions the PRD leaves open, and pieces nothing connects to. Settling these now is cheaper than after it’s built.')
      : biz
        ? (ar ? 'فحص تلقائي للجاهزية الأمنية والتشغيلية (حماية بيانات الدخول، صلاحيات الخدمات، وعدم كشف مفاتيح سرية) من الكود المصدري مباشرة دون الحاجة لتشغيل المشروع.' : 'Automatic static readiness check of security & access controls directly from the source code — without needing the project to be running.')
        : (ar ? 'فحص ثابت للكود المصدري (دون الحاجة لتشغيل المشروع): يتحقق من المفاتيح السرية، حماية المسارات وتتبع المصادقة عبر الطبقات، الاعتماد الدائري، وحدود الطبقات.' : 'We checked source files statically (without needing the app running) for leaked keys, open endpoints (tracing auth up to 3 hops deep), circular import cycles, layer boundary violations, and oversized files.');
    const calmText = ar
      ? `${off.length ? `لا توجد عناصر متبقية: تم استبعاد ${off.length} عنصر كغير مؤثر.` : 'جميع مؤشرات الأمان والصلاحيات الأساسية تبدو سليمة.'} هذا فحص ثابت للكود المصدري يعمل حتى عندما يكون المشروع متوقفاً.`
      : `${off.length ? `Nothing left to look at: you marked ${SC.plural(off.length, 'item')} as not a problem.` : `Nothing stood out${gaps.length ? `, but ${gaps.length === 1 ? 'one check' : `${gaps.length} checks`} had nothing to look at (below)` : ''}.`} This is a quick automatic static check, not a full ${PLAN ? 'design' : 'security'} review.`;
    const bizNote = hiddenDev > 0
      ? `<div class="hc-biz-note">${ar ? `تم إخفاء ${hiddenDev} ملاحظة هيكلية داخلية للمطورين في وضع البيزنس المبسط (تظهر في الوضع التقني).` : `${hiddenDev} internal code-structure hint${hiddenDev === 1 ? ' is' : 's are'} hidden in Simplified Business view (switch to Tech view to inspect).`}</div>`
      : '';
    const top = `<div class="sec">
        <div class="ph"><span class="ico" style="--c:${headColor()}">${SC.icon('health')}</span><span class="kindlabel">${PLAN ? (ar ? 'مراجعة التصميم' : 'Design review') : (ar ? 'فحص الجاهزية والصحة' : 'Health check')}</span></div>
        <h2 class="pt">${h(headline())}</h2>
        <p class="pd">${introText}</p>
        ${appWideHtml()}
        ${live.length ? breakdown() : `<div class="hc-calm">${calmText}</div>`}
        ${bizNote}
        <div class="actions">
          <button class="btn soft" data-hc-back>${SC.iconI(ar ? 'right' : 'left')}${ar ? 'رجوع' : 'Back'}</button>
          ${hasQuality && !biz ? `<button class="btn ${hmOn ? 'primary' : 'soft'}" data-hc-heatmap>${SC.iconI('spark')}${h(hmLabel)}</button>` : ''}
        </div>
      </div>` + checkedHtml();
    const groups = ORDER.map((sev) => {
      const list = issues.map((i, idx) => [i, idx]).filter(([i]) => i.severity === sev && !dismissalOf(i) && visibleForMode(i));
      return list.length ? `<div class="sec"><h3>${h(ar ? SEV[sev].groupAr : SEV[sev].group)} <span class="c">${list.length}</span></h3>${list.map(([i, idx]) => issueHtml(i, idx)).join('')}</div>` : '';
    }).join('');
    const offHtml = off.length ? `<div class="sec"><h3>${ar ? 'مُستبعدة (ليست مشكلة)' : 'Marked as not a problem'} <span class="c">${off.length}</span></h3>${issues.map((i, idx) => [i, idx]).filter(([i]) => dismissalOf(i)).map(([i, idx]) => issueHtml(i, idx)).join('')}</div>` : '';
    const foot = !live.length ? '' : SC.exported
      ? `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">${ar ? 'ملاحظات فحص تلقائي وقت تصدير هذه النسخة.' : 'These are automatic hints from when this copy was exported.'}</div>`
      : `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">${ar
          ? `هذه إشارات فحص ثابت للكود (لا يتطلب تشغيل التطبيق). يمكنك الضغط على «ليس مشكلة» لاستبعاد أي تنبيه غير مقصود.`
          : `These are automatic static hints. “${h(fixLabel())}” gives you a request to paste into ${h(curA.app)}. If one is wrong, “Not a problem” sets it aside.`}</div>`;
    return top + groups + offHtml + foot;
  }
  function openList() {
    isOpen = true;
    openedAt = where();
    SC.showPanel(listHtml(), (panel) => {
      panel.querySelector('[data-hc-back]')?.addEventListener('click', closeList);
      panel.querySelector('[data-hc-heatmap]')?.addEventListener('click', () => {
        SC.setHeatmap(!SC.heatmap());
        if (isOpen) openList();
      });
      bindIssues(panel);
    });
  }

  // ---------- chrome ----------
  const btnLabelText = () => {
    const ar = isAr();
    return PLAN ? (ar ? 'مراجعة' : 'Review') : (ar ? 'الصحة' : 'Health');
  };
  const btn = SC.addHeaderButton({
    id: 'btn-health', label: btnLabelText(), icon: 'health',
    onClick: () => (isOpen ? closeList() : openList()),
  });
  const badge = document.createElement('span');
  badge.className = 'badge';
  function updateButton() {
    const n = urgent();
    const bl = btn.querySelector('.bl');
    if (bl) bl.textContent = btnLabelText();
    btn.title = `${checkName()}: ${n ? headline() : (isAr() ? 'لا توجد مخاطر عاجلة' : 'nothing urgent')}`;
    btn.querySelector('svg.i').innerHTML = SC.icons[n ? 'health' : 'check'];
    if (n) {
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.style.setProperty('--hc-badge', count('high') ? SEV.high.color : SEV.medium.color);
      btn.style.setProperty('--hc-badge-text', 'var(--on-sev-text)');
      btn.appendChild(badge);
    } else badge.remove();
    btn.classList.toggle('calm', !n);
    btn.setAttribute('aria-label', btn.title);
  }
  function refresh() {
    updateButton();
    if (isOpen) openList(); else SC.refreshPanel();
  }
  updateButton();
  SC.on('engine', () => { if (isOpen) openList(); });
  SC.on('lang', () => { updateButton(); if (isOpen) openList(); else SC.refreshPanel(); });
  SC.on('business', () => { updateButton(); if (isOpen) openList(); else SC.refreshPanel(); });
  if (SERVER && canDismiss) fetch('/api/health/dismissed', { headers: { 'x-floorplan-token': SERVER.token } }).then((r) => r.json()).then((r) => { if (Array.isArray(r.dismissed)) { dismissed = r.dismissed; refresh(); } }).catch(() => {});

  SC.on('panel', () => { if (isOpen && openedAt && where() !== openedAt) { isOpen = false; SC.closePanel(); } });

  SC.addPanelSection('overview', () => {
    const ar = isAr();
    const biz = isBiz();
    const sub = active().length
      ? ORDER.filter(count).map((s) => `${count(s)} ${ar ? SEV[s].wordAr : SEV[s].word}`).join(' · ')
      : ar
        ? (biz ? 'جاهزية الأمان والصلاحيات سليمة (فحص ثابت بدون تشغيل التطبيق)' : 'فحص تلقائي ثابت للأسرار وصلاحيات المسارات وبنية الكود')
        : (PLAN ? 'Quick automatic check of the plan' : gaps.length ? `${h(gaps.map((c) => c.label).join(' and '))}: nothing found to check` : 'Quick automatic check of secrets, open endpoints and leftover files');
    return {
      html: `<div class="sec"><h3>${PLAN ? (ar ? 'مراجعة التصميم' : 'Design review') : (ar ? 'الجاهزية والصحة' : 'Health')}</h3><div class="list"><a class="row" data-hc-open>
          <span class="dot" style="background:${headColor()}"></span>
          <span class="rt"><div class="rn">${h(headline())}</div><div class="rd">${sub}</div></span>
          <span class="rc">${SC.iconI(ar ? 'left' : 'right')}</span></a></div></div>`,
      bind: (el) => el.querySelector('[data-hc-open]')?.addEventListener('click', (ev) => { ev.preventDefault(); openList(); }),
    };
  });

  SC.addPanelSection('item', (itemId) => {
    if (!itemId || typeof itemId !== 'string' || !issues.length) return '';
    const ar = isAr();
    const hits = [];
    issues.forEach((issue, idx) => {
      if (dismissalOf(issue) || !visibleForMode(issue)) return;
      const inside = (issue.items || []).filter((id) => id === itemId || (SC.exists(id) && SC.chain(id).includes(itemId)));
      if (!inside.length) return;
      const exact = issue.notes && inside.includes(itemId) ? issue.notes[itemId] : '';
      const fallbackNote = inside.length > 1 || inside[0] !== itemId
        ? (ar ? `يؤثر على ${inside.length} مواضع داخل هذا الجزء` : `Affects ${SC.plural(inside.length, 'place')} in here`)
        : '';
      hits.push(issueHtml(issue, idx, exact ? (ar ? '' : exact) : fallbackNote));
    });
    if (!hits.length) return '';
    return {
      html: `<div class="sec"><h3>${PLAN ? (ar ? 'مراجعة التصميم' : 'Design review') : (ar ? 'الصحة' : 'Health')} <span class="c">${hits.length}</span></h3>${hits.slice(0, 6).join('')}${hits.length > 6 ? `<div class="more" data-hc-open style="cursor:pointer">+${hits.length - 6} ${ar ? `أخرى في ${checkName()}` : `more in the ${checkName()}`}</div>` : ''}</div>`,
      bind: (el) => { bindIssues(el); el.querySelector('[data-hc-open]')?.addEventListener('click', openList); },
    };
  });
})();
