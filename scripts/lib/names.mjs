// Fallback human-readable names (English & Arabic), and bilingual plain-language linter.
import path from 'node:path';

const P = path.posix;
const ACRONYMS = /\b(api|ui|ux|id|ids|sku|skus|csv|url|urls|http|db|sql|bc|mcp|pos|gcs|s3|aws|gcp|jwt|pdf|ai|llm|cli|css|html|json|xml|oauth|sso|cdn|dns|ip|io|qa|ci|cd|crud|rpc|grpc|sdk|ttl|uuid|mtg)\b/g;
const GENERIC = /^(index|page|layout|route|routes|__init__|__main__|main|mod|lib|app|server|loading|error|not-found|template|default|handler|handlers|views?|urls|models?|schemas?|types?|constants?|utils?|helpers?|config|settings)$/i;

export function humanize(id) {
  let s = String(id)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .trim()
    .toLowerCase();
  s = s.replace(ACRONYMS, (m) => m.toUpperCase());
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(id);
}

const cleanSeg = (seg) => seg.replace(/^\((.*)\)$/, '$1').replace(/^\[\.{0,3}(.*)\]$/, '$1 detail');

export function fallbackFileName(p, language = 'en') {
  const base = P.basename(p);
  const stem = base.replace(/\.(test|spec)(?=\.)/, '').replace(/\.[^.]+$/, '');
  const isTest = /\.(test|spec)\.[a-z]+$/i.test(base) || /^test_/.test(base) || /_test\.(py|go)$/.test(base);
  const core = stem.replace(/^test_/, '').replace(/_test$/, '');
  let name;
  if (GENERIC.test(core)) {
    const dirs = P.dirname(p).split('/').filter((d) => d && !/^(src|app|lib|pkg|internal)$/.test(d)).map(cleanSeg);
    const parent = dirs.slice(-1)[0] || '';
    const roleEn = { page: 'page', layout: 'layout', route: 'route handler', __init__: 'package', index: '', loading: 'loading state', error: 'error state' }[core.toLowerCase()];
    const roleAr = { page: 'صفحة', layout: 'تخطيط', route: 'معالج المسار', __init__: 'حزمة', index: '', loading: 'حالة التحميل', error: 'حالة الخطأ' }[core.toLowerCase()];
    if (language === 'ar' && parent) {
      name = roleAr ? `${roleAr} ${humanize(parent)}` : humanize(parent);
    } else {
      name = parent ? `${humanize(parent)}${roleEn ? ' ' + roleEn : roleEn === '' ? '' : ' ' + humanize(core).toLowerCase()}` : humanize(core);
    }
  } else name = humanize(core);
  if (!isTest) return name;
  return language === 'ar' ? `اختبارات ${name}` : `${name} tests`;
}

export function fallbackRouteName(r, language = 'en') {
  if (r.handler && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)$/.test(r.handler)) return humanize(r.handler);
  const segs = r.path.split('/').filter((s) => s && !/[<{:[*]/.test(s));
  if (language === 'ar') {
    const cleanArSegs = segs.filter((s, idx, arr) => !(idx < arr.length - 1 && /^(api|v\d+)$/i.test(s)));
    const verbAr = { GET: 'جلب', POST: 'إنشاء', PUT: 'استبدال', PATCH: 'تحديث', DELETE: 'حذف' }[r.method] || r.method;
    return `${verbAr} ${humanize(cleanArSegs.slice(-2).join(' ') || 'root')}`;
  }
  const verb = { GET: 'Get', POST: 'Create', PUT: 'Replace', PATCH: 'Update', DELETE: 'Delete' }[r.method] || r.method;
  return `${verb} ${humanize(segs.slice(-2).join(' ') || 'root').toLowerCase()}`;
}

export const routeKey = (r) => `${r.method} ${r.path}`;

// ---------- plain language (English & Arabic) ----------
export const JARGON = [
  { re: /\bAPI clients?\b|\bclient librar(?:y|ies)\b|\bSDKs?\b/g, row: 'SDK, client library, API client', say: 'ready-made code for talking to a service ("talks to Stripe", "server connection")' },
  { re: /\bAPI keys?\b|\baccess tokens?\b|\bJWTs?\b/g, row: 'secret, API key, token', say: 'a password for a service, or a sign-in pass' },
  { re: /\bAPIs?\b/g, row: 'API', say: '"the main server", or what it asks another service for' },
  { re: /\bUI (?:kit|components?|primitives)\b|\b(?:React|Vue|Svelte|Angular) components?\b/gi, row: 'component, UI kit, primitives', say: 'building blocks of the screens (buttons, tables, dialogs)' },
  { re: /\bprimitives\b|\bcomponents?\b/gi, screens: true, row: 'component, UI kit, primitives', say: 'building blocks of the screens (buttons, tables, dialogs)' },
  { re: /\b(?:app|UI) shell\b/gi, row: 'shell, app shell', say: 'the frame around the screens (menu, header)' },
  { re: /\btoast (?:messages?|notifications?)\b|\btoasts\b|\bmodals?\b|\bpopovers?\b/gi, row: 'toast, modal, popover', say: 'a pop-up message, or a pop-up window' },
  { re: /\bendpoints?\b|\broute handlers?\b|\bAPI routes?\b/gi, row: 'endpoint, route (backend)', say: 'a request the app can receive' },
  { re: /\brouters?\b/gi, row: 'blueprint, router, controller', say: 'a group of related requests ("order requests")' },
  { re: /\bwebhooks?\b/gi, row: 'webhook', say: 'a message another service sends when something happens' },
  { re: /\bREST\b|\bHTTPS?\b/g, row: 'REST, HTTP, GET/POST', say: 'leave it out: the method and address are already on the card' },
  { re: /\bfront[- ]?ends?\b/gi, row: 'frontend / client', say: 'the app people use, or the screens' },
  { re: /\bback[- ]?ends?\b/gi, row: 'backend / server / service', say: 'the main server' },
  { re: /\bmonoliths?\b/gi, row: 'monolith', say: 'one main server that does everything' },
  { re: /\bmiddlewares?\b/gi, row: 'middleware', say: 'a check every request passes through ("makes sure you\'re signed in")' },
  { re: /\bORMs?\b/g, row: 'ORM model, schema, entity', say: 'how a kind of record is stored' },
  { re: /\bschemas?\b/gi, row: 'ORM model, schema, entity', say: 'how a kind of record is stored' },
  { re: /\bmigrations?\b/gi, row: 'migration', say: 'changes to how records are stored' },
  { re: /\bseed (?:data|scripts?)\b/gi, row: 'seed, fixture', say: 'sample data for testing' },
  { re: /\bPub\/?Sub\b|\bmessage bus\b/gi, row: 'queue, outbox, Pub/Sub, message bus', say: 'a way to hand work to background tasks' },
  { re: /\bcron(?: jobs?)?\b/gi, row: 'cron, scheduler, scheduled job', say: 'runs automatically on a timetable' },
  { re: /\bcach(?:e|es|ed|ing)\b/gi, row: 'cache, snapshot', say: 'a saved copy kept so things load faster' },
  { re: /\benv(?:ironment)? var(?:iable)?s?\b|\bconfigs?\b/gi, row: 'env var, config', say: 'settings' },
  { re: /\bauth\b|\bauthentication\b/gi, row: 'auth, authentication', say: 'sign-in' },
  { re: /\bauthorization\b|\bRBAC\b/gi, row: 'authorization, roles, permissions, RBAC', say: 'who is allowed to do what' },
  { re: /\b(?:React|[Cc]ustom|[Ss]hared) [Hh]ooks?\b|\buse[A-Z][A-Za-z0-9]* [Hh]ooks?\b|\b[Cc]ontext [Pp]roviders?\b|\bReact [Cc]ontext\b/g, row: 'hook, context, provider (React)', say: 'shared screen logic' },
  { re: /\bstate management\b/gi, row: 'state', say: 'what the screen currently remembers' },
  { re: /\bCI(?:\/CD)?\b/g, row: 'deploy, CI/CD', say: 'automatic checks, or putting a new version live' },
  { re: /\bdeploy(?:s|ed|ing|ments?)?\b/gi, row: 'deploy, CI/CD', say: 'putting a new version live' },
  { re: /\bDocker(?: Compose|file)?\b|\bcompose files?\b|\bKubernetes\b|\bk8s\b|\bserverless\b/gi, row: 'container, Docker, Docker Compose, Cloud Run, serverless', say: 'where the server runs, or how it\'s started' },
  { re: /\bCDNs?\b/g, row: 'CDN', say: 'a fast delivery network for images and files' },
  { re: /\bidempoten(?:t|cy)\b/gi, row: 'idempotent', say: 'safe to run twice' },
  { re: /\brate[- ]limit(?:s|ed|ing|er)?\b/gi, row: 'rate limit', say: 'a cap on how often something can be asked' },
  { re: /\brefactor(?:s|ed|ing)?\b|\btech(?:nical)? debt\b/gi, row: 'refactor, tech debt', say: 'leave it out' },
  { re: /\bMCP\b/g, row: 'MCP server', say: 'a connection that lets AI assistants look things up in your app' },
  { re: /\bunit tests?\b|\btest suites?\b|\be2e\b|\bend-to-end tests?\b/gi, row: 'unit tests, test suite', say: 'automatic checks that the code still works' },
];

// Transliterated developer jargon in Arabic maps aimed at non-technical readers ("audience": "everyone", "language": "ar")
export const AR_JARGON = [
  { re: /(?:^|\s)(?:ال)?(?:فرونت[\s-]*[إا]ند)(?=\s|$|[،.])/g, say: 'استخدم "شاشات التطبيق" أو "الواجهة التي يستخدمها الناس"' },
  { re: /(?:^|\s)(?:ال)?(?:باك[\s-]*[إا]ند)(?=\s|$|[،.])/g, say: 'استخدم "الخادم الرئيسي"' },
  { re: /(?:^|\s)(?:ال)?(?:[إا]ندبوينت|اندبوينتس)(?=\s|$|[،.])/g, say: 'استخدم "طلب يستقبله الخادم"' },
  { re: /(?:^|\s)(?:ال)?(?:ميدل[\s-]*وير)(?=\s|$|[،.])/g, say: 'استخدم "فحص يمر به كل طلب"' },
  { re: /(?:^|\s)(?:ال)?(?:ويب[\s-]*هوك)(?=\s|$|[،.])/g, say: 'استخدم "إشعار تلقائي من خدمة خارجية"' },
];

export const FRAMEWORKS = /\bReact(?: Native| Query| Router)?\b|\bNext\.?js\b|\bVue(?:\.js)?\b|\bNuxt\b|\bSvelte(?:Kit)?\b|\bAngular\b|\bExpress(?:\.js|JS)\b|\bExpress (?:server|app|API|backend|router)\b|\bFastify\b|\bNestJS\b|\bFlask\b|\bFastAPI\b|\bDjango\b|\bRuby on Rails\b|\bLaravel\b|\bSpring Boot\b|\bSQLAlchemy\b|\bPydantic\b|\bPrisma\b|\bSequelize\b|\bTypeORM\b|\bAlembic\b|\bRedux\b|\bZustand\b|\bTailwind(?: CSS)?\b|\bRadix\b|\bshadcn(?:\/ui)?\b|\bMaterial UI\b|\bVite\b|\bWebpack\b|\bjQuery\b|\bVitest\b|\bpytest\b|\bPlaywright\b|\bCypress\b|\btRPC\b|\bAxios\b|\bTanStack\b|\bGraphQL\b|\bFlutter\b/g;
export const FRAMEWORK_SAY = "a framework or library's name: say what the part does instead (it may appear once, in project.summary)";
export const FRAMEWORK_SAY_AR = 'اسم إطار برمجي أو مكتبة تقنية: صف ما يفعله هذا الجزء بلغة واضحة بدلاً من ذكر الأداة';

/**
 * Developer words in a label or summary: [{ term, say }], each word once.
 * Supports both English ("en") and Arabic ("ar") maps cleanly without false alarms on Arabic prose.
 */
export function jargonIn(text, { frameworks = true, screens = true, language = 'en' } = {}) {
  if (typeof text !== 'string' || !text) return [];
  const isArText = language === 'ar' || /[\u0600-\u06FF]/.test(text);
  let rest = text;
  const out = [];
  const take = (re, say) => {
    for (const m of rest.matchAll(re)) {
      const cleaned = m[0].trim();
      if (cleaned && !out.some((o) => o.term.toLowerCase() === cleaned.toLowerCase())) {
        out.push({ term: cleaned, say, at: m.index });
      }
    }
    rest = rest.replace(re, (m) => ' '.repeat(m.length));
  };
  if (frameworks) take(FRAMEWORKS, isArText ? FRAMEWORK_SAY_AR : FRAMEWORK_SAY);
  if (isArText) {
    for (const j of AR_JARGON) take(j.re, j.say);
    // Still catch raw uppercase English acronyms like JWT / ORM / RBAC / REST dropped into Arabic text
    for (const j of JARGON) {
      if (/\b(?:JWTs?|ORMs?|RBAC|REST|HTTPS?|SDKs?|CI(?:\/CD)?)\b/.test(j.re.source)) take(j.re, j.say);
    }
  } else {
    for (const j of JARGON) if (screens || !j.screens) take(j.re, j.say);
  }
  return out.sort((a, b) => a.at - b.at).map(({ term, say }) => ({ term, say }));
}
