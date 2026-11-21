// floorplan graph queries, shared by the viewer (search + page tools), floorplan/query.mjs (CLI),
// and floorplan/serve.mjs (HTTP tool loop + offline Local Engine). Plain script: no imports, no exports.
// Item ids: n:<node id>  f:<file path>  r:<route index>  s:<file path>#<export index>

const EN_STOPWORDS = new Set([
  'how', 'does', 'do', 'did', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'where', 'what', 'which', 'who',
  'when', 'why', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'from', 'and', 'or', 'we', 'i', 'my', 'our',
  'it', 'its', 'this', 'that', 'these', 'those', 'work', 'works', 'working', 'happen', 'happens', 'get',
  'gets', 'with', 'into', 'through', 'about', 'show', 'explain', 'trace', 'find', 'tell', 'me', 'can',
]);

const AR_STOPWORDS = new Set([
  'كيف', 'اين', 'ما', 'ماذا', 'متي', 'لماذا', 'من', 'في', 'علي', 'عن', 'الي', 'مع', 'هذا', 'هذه', 'ذلك',
  'تلك', 'التي', 'الذي', 'الذين', 'اللذان', 'اللتان', 'هل', 'كل', 'بعض', 'عند', 'عندما', 'او', 'ام', 'ثم',
  'بل', 'لا', 'لم', 'لن', 'قد', 'لقد', 'كان', 'كانت', 'يكون', 'تكون', 'هو', 'هي', 'هم', 'نحن', 'انا',
  'انت', 'انتم', 'يعمل', 'تعمل', 'عمل', 'يتم', 'تتم', 'تم', 'يقوم', 'تقوم', 'داخل', 'خلال', 'بين', 'فوق',
  'تحت', 'حول', 'اشرح', 'اعرض', 'وضح', 'وريني', 'ارني', 'تتبع', 'ابحث', 'ملف', 'ملفات', 'جزء', 'نظام',
  'مشروع', 'طريقه', 'مسار', 'خطوات', 'لي', 'لنا', 'به', 'بها', 'منه', 'منها', 'فيه', 'فيها',
]);

function normalizeAr(str) {
  return String(str || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[؟،؛«»"]/g, ' ');
}

function lightStemAr(word) {
  let w = normalizeAr(word).trim();
  if (!/[\u0600-\u06FF]/.test(w) || w.length <= 3) return w;
  for (const pre of ['وال', 'بال', 'كال', 'فال', 'لل', 'ال', 'و']) {
    if (w.startsWith(pre) && w.length - pre.length >= 3) {
      w = w.slice(pre.length);
      break;
    }
  }
  for (const suf of ['ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'كم', 'يه', 'ه', 'ي']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

function lightStemEn(word) {
  const w = String(word || '').toLowerCase();
  if (w.length <= 4 || /[^a-z]/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4) return w.slice(0, -1);
  return w;
}

// Bidirectional universal software concepts (Arabic stems <-> English architecture terms)
const BILINGUAL_BRIDGES = [
  [['دخول', 'لوجن', 'مصادق', 'توثيق', 'توكن', 'نفاذ'], ['login', 'signin', 'auth', 'authenticate', 'token', 'jwt', 'oauth', 'oidc', 'keycloak', 'sso', 'callback']],
  [['خروج'], ['logout', 'signout', 'revoke', 'clear']],
  [['جلس', 'خمول', 'انتهاء', 'تمديد'], ['session', 'idle', 'timeout', 'keepalive', 'refresh', 'cookie']],
  [['صلاحي', 'دور', 'ادوار', 'حارس', 'حماي'], ['permission', 'role', 'rbac', 'authorize', 'guard', 'middleware', 'policy']],
  [['دفع', 'مدفوع', 'فاتور', 'فواتير', 'اشتراك', 'استرداد'], ['payment', 'billing', 'invoice', 'checkout', 'charge', 'refund', 'stripe']],
  [['مستخدم', 'حساب', 'شخص', 'بروفايل'], ['user', 'account', 'profile', 'member', 'customer']],
  [['بريد', 'ايميل', 'اشعار', 'رسال', 'تنبيه'], ['email', 'mail', 'notification', 'message', 'sms', 'webhook']],
  [['رمز', 'تحقق', 'باسورد', 'مرور', 'سري'], ['otp', 'verify', 'password', 'secret', 'reset']],
  [['قاعد', 'بيان', 'جدول', 'جداول', 'تخزين', 'كاش'], ['database', 'db', 'model', 'schema', 'migration', 'table', 'store', 'cache', 'redis']],
  [['واجه', 'شاش', 'صفح', 'مكون', 'عرض'], ['ui', 'screen', 'page', 'view', 'component', 'frontend', 'layout']],
  [['خادم', 'سيرفر', 'نقط', 'نهاي', 'راوتر'], ['server', 'backend', 'api', 'route', 'router', 'endpoint', 'controller', 'handler']],
  [['خلف', 'مهام', 'طابور', 'مجدول', 'كرون'], ['worker', 'queue', 'job', 'task', 'cron', 'schedule', 'event']],
  [['خطا', 'اخطاء', 'استثناء', 'سجل'], ['error', 'exception', 'logger', 'log', 'fallback', 'retry']],
  [['اختبار', 'فحص'], ['test', 'spec', 'e2e', 'health', 'check']],
  [['اعداد', 'تهيئ', 'بيئ', 'نشر'], ['config', 'settings', 'env', 'deploy', 'docker', 'build']],
];

function tokenizeForSearch(text) {
  const norm = normalizeAr(String(text || '').toLowerCase())
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-./:\\#?&=()[\]{}'"`]+/g, ' ');
  return norm.split(/\s+/).filter(Boolean);
}

function createGraphQuery(G) {
  const nodes = new Map(G.nodes.map((n) => [n.id, n]));
  const files = new Map(G.files.map((f) => [f.p, f]));
  const routes = G.routes || [];
  const routesByFile = new Map();
  routes.forEach((r, i) => { if (!routesByFile.has(r.f)) routesByFile.set(r.f, []); routesByFile.get(r.f).push(i); });
  const kidsOf = new Map();
  for (const n of G.nodes) if (n.parent) { if (!kidsOf.has(n.parent)) kidsOf.set(n.parent, []); kidsOf.get(n.parent).push(n.id); }

  const nodeChain = (id) => { const out = []; let n = nodes.get(id); while (n) { out.push(n.id); n = n.parent ? nodes.get(n.parent) : null; } return out; };
  /** The node ids an item lives under, deepest first. */
  function owners(id) {
    if (id.startsWith('n:')) return nodeChain(id.slice(2));
    if (id.startsWith('f:')) { const f = files.get(id.slice(2)); return f ? nodeChain(f.n) : []; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r ? owners('f:' + r.f) : []; }
    if (id.startsWith('s:')) return owners('f:' + id.slice(2).replace(/#\d+$/, ''));
    return [];
  }
  function brief(id) {
    if (id.startsWith('n:')) { const n = nodes.get(id.slice(2)); return n && { id, type: n.kind === 'external' ? 'external' : 'module', name: n.label, description: n.summary || '' }; }
    if (id.startsWith('f:')) { const f = files.get(id.slice(2)); return f && { id, type: 'file', name: f.name, description: f.d || '', path: f.p }; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r && { id, type: 'endpoint', name: r.name, description: r.d || '', path: `${r.m} ${r.p}` }; }
    if (id.startsWith('s:')) {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = m && files.get(m[1]); const s = f?.s?.[+m[2]];
      return s && { id, type: s[1], name: s[0], description: s[4] || '', path: `${f.p}:${s[2]}` };
    }
    return null;
  }
  const exists = (id) => !!brief(id);
  const inside = (x, container) => x === container || (container.startsWith('n:') && owners(x).includes(container.slice(2))) || (container.startsWith('f:') && (x.startsWith('r:') ? 'f:' + routes[+x.slice(2)].f === container : x.startsWith('s:') ? 'f:' + x.slice(2).replace(/#\d+$/, '') === container : false));
  const ownerItem = (endpoint) => endpoint.startsWith('f:') ? 'n:' + (files.get(endpoint.slice(2))?.n || '') : endpoint;

  /** Accepts an id, or what people naturally pass: a file path, a module id, or "GET /path". */
  function normId(id) {
    id = String(id || '').trim().replace(/^\.\//, '').replace(/\\/g, '/');
    if (brief(id)) return id;
    if (files.has(id)) return 'f:' + id;
    if (nodes.has(id)) return 'n:' + id;
    const m = /^([A-Z]+)\s+(\/\S*)$/i.exec(id);
    if (m) { const ri = routes.findIndex((r) => r.m === m[1].toUpperCase() && r.p === m[2]); if (ri >= 0) return 'r:' + ri; }
    return id;
  }

  // Pre-build BM25-lite search index once per graph
  const docs = [];
  const df = new Map();
  let totalLen = 0;
  const isTestItem = (id) => owners(id).some((nid) => nodes.get(nid)?.kind === 'test') || /(^|\/)(__tests__|tests?|specs?|e2e|cypress|playwright)\/|\.(test|spec)\.[a-z0-9]+$/i.test(id);
  const addDoc = (id, kindKey, name, desc, p, w) => {
    const nameNorm = normalizeAr(String(name || '').toLowerCase());
    const descNorm = normalizeAr(String(desc || '').toLowerCase());
    const pathNorm = String(p || '').toLowerCase();
    const toks = tokenizeForSearch(`${name} ${p} ${desc}`);
    const stems = new Set();
    const tf = new Map();
    for (const t of toks) {
      const st = /[\u0600-\u06FF]/.test(t) ? lightStemAr(t) : lightStemEn(t);
      if (!st) continue;
      stems.add(st);
      tf.set(st, (tf.get(st) || 0) + 1);
      if (st !== t) { stems.add(t); tf.set(t, (tf.get(t) || 0) + 1); }
    }
    for (const st of stems) df.set(st, (df.get(st) || 0) + 1);
    totalLen += toks.length || 1;
    docs.push({ id, kindKey, nameNorm, descNorm, pathNorm, tf, len: toks.length || 1, w, isTest: isTestItem(id) });
  };
  for (const n of G.nodes) addDoc('n:' + n.id, 'module', n.label, n.summary || '', n.id, 4);
  for (const f of G.files) addDoc('f:' + f.p, 'file', f.name, f.d || '', f.p, 3);
  routes.forEach((r, i) => addDoc('r:' + i, 'endpoint', r.name, r.d || '', `${r.m} ${r.p}`, 3));
  for (const f of G.files) (f.s || []).forEach((s, i) => addDoc(`s:${f.p}#${i}`, 'symbol', s[0], s[4] || '', f.p, 1));
  const avgLen = docs.length ? totalLen / docs.length : 10;

  function buildQueryGroups(rawQuery) {
    const rawWords = tokenizeForSearch(rawQuery);
    const filtered = rawWords.filter((w) => !EN_STOPWORDS.has(w) && !AR_STOPWORDS.has(w) && w.length >= 2);
    const activeWords = filtered.length ? filtered : rawWords;
    return activeWords.map((w) => {
      const isAr = /[\u0600-\u06FF]/.test(w);
      const stem = isAr ? lightStemAr(w) : lightStemEn(w);
      const variants = new Set([w, stem].filter(Boolean));
      for (const [arList, enList] of BILINGUAL_BRIDGES) {
        if (isAr && arList.some((a) => stem.includes(a) || a.includes(stem))) {
          for (const en of enList) { variants.add(en); variants.add(lightStemEn(en)); }
        } else if (!isAr && enList.some((e) => e === w || lightStemEn(e) === stem)) {
          for (const ar of arList) variants.add(ar);
        }
      }
      return { raw: w, stem, variants: [...variants] };
    });
  }

  function find(query, kind, limit = 15) {
    const groups = buildQueryGroups(query);
    if (!groups.length) return [];
    const wantsTests = /\b(tests?|specs?|e2e|pytest|vitest|jest|cypress|playwright|mock)\b|اختبار|اختبارات|فحص/i.test(String(query || ''));
    const N = Math.max(1, docs.length);
    const k1 = 1.2, b = 0.5;
    const scoredProd = [];
    const scoredTest = [];

    for (const doc of docs) {
      if (kind && doc.kindKey !== kind) continue;
      let groupHits = 0;
      let score = 0;
      for (const g of groups) {
        let bestVariantScore = 0;
        for (const v of g.variants) {
          const isPrimary = v === g.raw || v === g.stem;
          const weight = isPrimary ? 1.0 : 0.72;
          // Exact / substring boosts on structured fields
          let fieldBoost = 0;
          if (doc.nameNorm === v) fieldBoost = 28;
          else if (doc.nameNorm.startsWith(v)) fieldBoost = 18;
          else if (doc.nameNorm.includes(v)) fieldBoost = 11;
          else if (doc.pathNorm.includes(v)) fieldBoost = 8;
          else if (doc.descNorm.includes(v)) fieldBoost = 5;

          const freq = doc.tf.get(v) || 0;
          let bm25 = 0;
          if (freq > 0) {
            const docFreq = df.get(v) || 1;
            const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
            bm25 = idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (doc.len / avgLen)))) * 4.5;
          }
          const cand = (fieldBoost + bm25) * weight;
          if (cand > bestVariantScore) bestVariantScore = cand;
        }
        if (bestVariantScore > 0) {
          groupHits++;
          score += bestVariantScore;
        }
      }
      if (groupHits > 0) {
        const entry = [groupHits, score + doc.w * 2.2 - doc.nameNorm.length * 0.015, doc.id];
        if (!wantsTests && doc.isTest) scoredTest.push(entry);
        else scoredProd.push(entry);
      }
    }

    const pool = scoredProd.length ? scoredProd : scoredTest;
    const bestHits = Math.max(0, ...pool.map((x) => x[0]));
    const floor = bestHits === groups.length ? bestHits : Math.max(1, Math.ceil(groups.length * 0.5));
    return pool
      .filter((x) => x[0] >= floor)
      .sort((a, z) => z[0] - a[0] || z[1] - a[1])
      .slice(0, Math.min(Number(limit) || 15, 40))
      .map(([, , id]) => brief(id))
      .filter(Boolean);
  }

  function connections(id, max = 15) {
    const out = new Map(), inn = new Map();
    for (const l of G.links) {
      const ia = inside(l.a, id), ib = inside(l.b, id);
      if (ia === ib) continue;
      const other = ia ? l.b : l.a;
      const key = (id.startsWith('n:') ? ownerItem(other) : other) + '|' + l.k;
      const m = ia ? out : inn;
      const cur = m.get(key) || { id: key.split('|')[0], via: l.k, weight: 0, endpoints: new Set() };
      cur.weight += l.w;
      for (const [ri] of l.calls || []) if (ri != null) cur.endpoints.add(ri);
      m.set(key, cur);
    }
    const fmt = (m) => [...m.values()].sort((a, b) => b.weight - a.weight).slice(0, max).map((c) => ({
      ...brief(c.id), via: c.via, weight: c.weight,
      ...(c.endpoints.size ? { endpoints: [...c.endpoints].slice(0, 6).map((ri) => `r:${ri} ${routes[ri].m} ${routes[ri].p}`) } : {}),
    })).filter((x) => x.id);
    return { dependsOn: fmt(out), usedBy: fmt(inn) };
  }

  function show(id) {
    id = normId(id);
    const b = brief(id);
    if (!b) throw new Error(`Unknown id "${id}". Use find first; ids look like n:api, f:src/app.ts, r:12, s:src/app.ts#3.`);
    const parent = owners(id)[id.startsWith('n:') ? 1 : 0];
    const res = { ...b, ...(parent ? { partOf: brief('n:' + parent) && { id: 'n:' + parent, name: nodes.get(parent).label } } : {}) };
    const recent = (G.recent?.items || []).filter((x) => x.id === id);
    if (recent.length) res.recentWork = recent.map((x) => `${G.recent.tasks[x.task]?.title}: ${x.note}`);
    if (id.startsWith('n:')) {
      const n = nodes.get(id.slice(2));
      if (n.details) res.details = n.details;
      res.size = { files: n.stats.files, loc: n.stats.loc };
      res.children = (kidsOf.get(n.id) || []).map((k) => ({ id: 'n:' + k, name: nodes.get(k).label, description: nodes.get(k).summary || '' }));
      const fl = G.files.filter((f) => owners('f:' + f.p).includes(n.id)).sort((a, z) => z.loc - a.loc);
      res.files = fl.slice(0, 12).map((f) => ({ id: 'f:' + f.p, name: f.name, description: f.d || '' }));
      if (fl.length > 12) res.moreFiles = fl.length - 12;
      res.endpoints = routes.filter((r) => owners('f:' + r.f).includes(n.id)).length;
      Object.assign(res, connections(id));
    } else if (id.startsWith('f:')) {
      const f = files.get(id.slice(2));
      Object.assign(res, { loc: f.loc, ...(f.q ? { quality: f.q } : {}), module: { id: 'n:' + f.n, name: nodes.get(f.n)?.label }, ...(f.note ? { note: f.note } : {}) });
      const rs = routesByFile.get(f.p) || [];
      if (rs.length) res.endpoints = rs.slice(0, 40).map((ri) => ({ id: 'r:' + ri, method: routes[ri].m, path: routes[ri].p, name: routes[ri].name }));
      const handlers = new Set(rs.map((ri) => routes[ri].h));
      const ex = (f.s || []).map((s, i) => [s, i]).filter(([s]) => !handlers.has(s[0]));
      if (ex.length) res.exports = ex.slice(0, 30).map(([s, i]) => `s:${f.p}#${i} ${s[0]} (${s[1]})`);
      Object.assign(res, connections(id, 20));
    } else if (id.startsWith('r:')) {
      const ri = +id.slice(2), r = routes[ri];
      Object.assign(res, { method: r.m, routePath: r.p, handler: r.h, line: r.l, file: { id: 'f:' + r.f, name: files.get(r.f)?.name } });
      const callers = new Map();
      for (const l of G.links) { const n = (l.calls || []).filter(([x]) => x === ri).length; if (n) callers.set(l.a, (callers.get(l.a) || 0) + n); }
      res.calledFrom = [...callers.entries()].map(([a, n]) => ({ ...brief(a), calls: n }));
    } else {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = files.get(m[1]); const s = f.s[+m[2]];
      res.file = { id: 'f:' + f.p, name: f.name };
      res.importedBy = G.links.filter((l) => l.b === 'f:' + f.p && (l.names || []).some((nm) => nm === s[0] || (nm === 'default' && s[3]))).slice(0, 25).map((l) => brief(l.a));
    }
    return res;
  }

  /** Shortest dependency chain from anything inside `from` to anything inside `to`. */
  function path(from, to) {
    from = normId(from); to = normId(to);
    if (!exists(from) || !exists(to)) throw new Error('Unknown id; use find first.');
    const adj = new Map();
    const add = (a, b, l) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, l]); };
    for (const l of G.links) add(l.a, l.b, l);
    const starts = [...new Set([...G.links.map((l) => l.a), ...G.links.map((l) => l.b)])].filter((x) => inside(x, from));
    const isGoal = (x) => inside(x, to);
    const prev = new Map(starts.map((s) => [s, null]));
    const queue = [...starts];
    let goal = null;
    while (queue.length && !goal) {
      const x = queue.shift();
      for (const [y, l] of adj.get(x) || []) {
        if (prev.has(y)) continue;
        prev.set(y, [x, l]);
        if (isGoal(y)) { goal = y; break; }
        queue.push(y);
      }
    }
    if (!goal) return { found: false, note: `No chain of imports/calls leads from ${from} to ${to}. Try the reverse direction, or the two may only meet through a shared dependency.` };
    const hops = [];
    for (let x = goal; prev.get(x); x = prev.get(x)[0]) {
      const [p, l] = prev.get(x);
      hops.unshift({ from: brief(p), to: brief(x), via: l.k, ...(l.calls?.length ? { endpoints: l.calls.slice(0, 3).map(([ri]) => ri != null ? `r:${ri} ${routes[ri].m} ${routes[ri].p}` : '').filter(Boolean) } : {}) });
    }
    return { found: true, hops: hops.slice(0, 15) };
  }

  function overview() {
    return {
      project: G.project.name, summary: G.project.summary || '',
      systems: G.nodes.filter((n) => !n.parent).map((n) => ({ id: 'n:' + n.id, name: n.label, kind: n.kind, description: n.summary || '', modules: (kidsOf.get(n.id) || []).map((k) => `n:${k} ${nodes.get(k).label}`) })),
      flows: (G.flows || []).map((f) => ({ title: f.title, steps: f.steps.map((s) => `${s.ref} ${s.note}`) })),
      counts: { files: G.files.length, endpoints: routes.length },
      ...(G.recent ? { recentWork: (G.recent.tasks || []).map((t, ti) => ({ title: t.title, request: t.request, summary: t.summary, changed: G.recent.items.filter((x) => x.task === ti).map((x) => `${x.id} ${x.note}`) })) } : {}),
    };
  }

  return { find, show, path, overview, exists, brief };
}

// What an answer looks like, for all engines (JSON Schema).
const FLOORPLAN_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for the answer view, at most 6 words, in the language of the question.' },
    answer: { type: 'string', description: 'The answer in Markdown, at most ~180 words, in the language of the question. Mention map items inline as [[id]].' },
    items: { type: 'array', description: '3-14 map items most relevant to the answer, most important first.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'Why this item matters here, at most 15 words.' } }, required: ['id', 'note'] } },
    steps: { type: 'array', description: 'Optional ordered walkthrough when the answer is a sequence (a request path, a data flow). Empty otherwise.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'note'] } },
    followups: { type: 'array', description: '2-3 short follow-up questions the person might ask next, in the same language.', items: { type: 'string' } },
  },
  required: ['title', 'answer', 'items'],
};

const FLOORPLAN_FLOW_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short flow title, at most 6 words, in the language of the request.' },
    description: { type: 'string', description: 'One sentence on what the flow shows.' },
    steps: { type: 'array', description: '3-9 steps in the order things happen, each a map item and what happens there.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'What happens at this step, at most 18 words.' } }, required: ['id', 'note'] } },
  },
  required: ['title', 'steps'],
};

const FLOORPLAN_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'What changed, 2-6 words.' },
    summary: { type: 'string', description: 'Markdown, at most ~150 words, plain words: what you added, changed or removed and why, plus any new assumptions or open questions.' },
    plan: { type: 'string', description: 'The complete updated floorplan/plan.json, as JSON text.' },
    architecture: { type: 'string', description: 'The complete updated floorplan/architecture.json, as JSON text.' },
    changes: { type: 'array', description: 'Every new or changed card: a file path, node id or "METHOD /path".', items: { type: 'object', properties: { ref: { type: 'string' }, change: { type: 'string', enum: ['new', 'changed'] }, note: { type: 'string', description: 'How this card serves the request, one plain sentence.' } }, required: ['ref', 'change', 'note'] } },
    followups: { type: 'array', description: '2-3 short changes the person might ask for next.', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'plan', 'architecture', 'changes'],
};

function floorplanChangeInstructions(G) {
  const src = G.meta?.blueprint?.source;
  return [
    `You change a blueprint: an interactive map of "${G.project.name}", a system that is planned but not built yet. The person looking at it asks for a change, addition or removal, and you update the plan.`,
    `Read floorplan/plan.json and floorplan/architecture.json first${src ? `, and ${src} (the PRD it was planned from) when the request touches what the PRD says` : ''}. You can look things up on the map with \`node floorplan/query.mjs find "<words>"\` and \`show <id>\` (or read_file_snippet / find_items if using HTTP tools).`,
    'plan.json format: { source, stack[], assumptions[], questions[{question, about[]}], files[{path, name, description, screen?, uses[], calls["METHOD /path"], services[node ids], data[node ids]}], endpoints[{method, path, file, name, description, access: public|signed-in|team|webhook|internal, who?, publicBecause?}] }. Every endpoint\'s file is a planned file, every call matches a planned endpoint exactly, and services/data name nodes in architecture.json.',
    'architecture.json: { project, nodes[{id, label, kind, parent?, summary, paths[globs]}], edges[], flows[{id, title, steps[{node, note}]}], tour[] }. Kinds: ui service worker library feature data config test script infra external. External nodes own no files. Every planned file must fall under some node\'s paths.',
    'Change only what the request needs, keeping every other file, endpoint, id and description intact. Reply in the language of the user\'s request.',
    'Reply with JSON only: {"title", "summary", "plan", "architecture", "changes", "followups"}. plan and architecture are the complete updated files as JSON text.',
    'Do not edit any files yourself: the map server checks your JSON, saves it and redraws the map.',
  ].join('\n');
}

function floorplanLanguageRule(lang) {
  if (lang === 'ar') {
    return 'CRITICAL LANGUAGE RULE: You MUST write ALL text fields in your JSON response ("title", "answer", "description", every "note" in "items" and "steps", and "followups") in 100% fluent, natural Arabic (العربية), EVEN IF the user question, file paths, or map card descriptions are in English.';
  }
  if (lang === 'en') {
    return 'CRITICAL LANGUAGE RULE: Write ALL text fields in your JSON response in clear English.';
  }
  return 'Reply in the SAME language as the user\'s question (if asked in Arabic, write title, answer, item notes, step notes, and followups in 100% fluent Arabic; if asked in English, write in English).';
}

function floorplanAudienceRule(audience) {
  if (audience === 'business') {
    return 'AUDIENCE MODE — SIMPLIFIED BUSINESS / EXECUTIVE VIEW: The reader is a non-technical business stakeholder, executive, or product manager. Explain business capabilities, user journeys, business rules, permissions, and external partner roles in plain everyday business language. NEVER mention raw file paths, line numbers, function/class names, HTTP status codes, database table names, or framework jargon. Exclude test/build/config files.';
  }
  return 'AUDIENCE MODE — TECHNICAL VIEW: Provide accurate architectural & code-level details, authentication/validation checks, and component interactions.';
}

function floorplanFlowInstructions(G, engine, opts = {}) {
  const toolDesc = engine === 'cli'
    ? 'Find the items with `node floorplan/query.mjs find "<words>"`, `show <id>` and `path <fromId> <toId>`; read source files when you need to confirm the order of events.'
    : engine === 'http'
    ? 'Find the items with the tools find_items, show_item, trace_path, and read_file_snippet.'
    : 'Find the items with the tools find_items, get_item and dependency_path.';
  return [
    `You build guided flows for an interactive architecture map of the codebase "${G.project.name}". A flow is an ordered walkthrough: each step is one map item (module n:..., file f:..., endpoint r:..., or export s:...) and a note on what happens there.`,
    toolDesc,
    'Trace what the person asks for from its trigger (a user action, webhook, cron job) to its final effect (database write, external call, response). Never include test files unless explicitly asked about tests.',
    floorplanAudienceRule(opts.audience),
    floorplanLanguageRule(opts.lang),
    'Use 3-9 steps. Prefer the most specific item that tells the story.',
    'Reply with JSON only: {"title", "description", "steps": [{"id", "note"}]}. Only use ids the map gave you.',
  ].join('\n');
}

function floorplanAskInstructions(G, engine, opts = {}) {
  const tools = engine === 'cli'
    ? `Query the map from the shell: \`node floorplan/query.mjs overview\`, \`node floorplan/query.mjs find "<words>" [--kind module|file|endpoint|symbol]\`, \`node floorplan/query.mjs show <id>\`, \`node floorplan/query.mjs path <fromId> <toId>\`. Start with the map; read or grep source files when you need specifics.`
    : engine === 'http'
    ? `Use the read-only tools find_items, show_item, trace_path, and read_file_snippet to explore the map and inspect source lines.`
    : `Use the tools find_items, get_item and dependency_path to explore the map. You cannot read source files, so answer from the map's names, descriptions, endpoints and connections.`;
  const bp = G.meta?.blueprint;
  return [
    `You answer questions about the codebase "${G.project.name}" for someone exploring an interactive architecture map of it.`,
    `The map has cards for modules (ids n:...), files (f:<path>), HTTP endpoints (r:<number>) and exported symbols (s:<path>#<number>), each with a human-readable name and description, connected by imports and HTTP calls.`,
    tools,
    bp ? `This map is a blueprint: a plan of a system that hasn't been built yet, so its files don't exist.${engine === 'cli' ? ` Read floorplan/plan.json${bp.source ? ` and ${bp.source}` : ''} when you need more than the map.` : ''} Answer about what would be built and why.` : '',
    'Never include test files in items or steps unless the user explicitly asks about testing.',
    floorplanAudienceRule(opts.audience),
    floorplanLanguageRule(opts.lang),
    'Use a few lookups, not dozens. Then reply with JSON only: {"title", "answer", "items", "steps", "followups"}.',
    '- answer: Markdown, at most ~180 words, plain and specific. Refer to map items inline as [[id]] (they become clickable).',
    '- items: the 3-14 cards that best show the answer, most important first, each with a note (at most 15 words) on its role.',
    '- steps: an ordered walkthrough when the answer is a sequence (a request path, a data flow); otherwise [].',
    '- followups: 2-3 short follow-up questions.',
    'Only use ids that the map gave you.',
  ].filter(Boolean).join('\n');
}
