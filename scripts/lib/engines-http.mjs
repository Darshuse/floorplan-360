// Zero-dependency HTTP LLM Adapter & Universal Answer Parser for Floorplan v2.0.
// Supports Kimi (Moonshot AI), Google Gemini API, OpenAI / OpenRouter / DeepSeek / vLLM, and local Ollama,
// with a strictly read-only 4-tool loop (find_items, show_item, trace_path, read_file_snippet).

import fs from 'node:fs';
import path from 'node:path';

const MAX_TOOL_ROUNDS = 4;
const BLOCKED_READ = /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx|jks|keystore)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)|service[-_]?account.*\.json$|credentials?\.json$|(^|\/)floorplan\/(index\.html|artifact\.html|serve\.mjs|page-safety\.mjs|\.cache(\/|$))/i;
const INLINE_SECRET_MASK = /\b(?:AKIA[0-9A-Z]{16}|(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{24,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})\b/g;

export function loadUserEnginesConfig(env = process.env) {
  const home = env.HOME || env.USERPROFILE || '';
  const file = env.FLOORPLAN_ENGINES_FILE || (home ? path.join(home, '.floorplan', 'engines.json') : '');
  if (!file || !fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Mask obvious secrets before sending any code snippet to an external HTTP LLM. */
export function maskSnippetSecrets(text) {
  return String(text || '')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '«hidden private key»')
    .replace(INLINE_SECRET_MASK, '«hidden»')
    .replace(/((?:password|passwd|pwd|secret|api_?key|client_?secret|access_?token)\s*[:=]\s*["'`])([^"'`\n]{4,200})(["'`])/gi, '$1«hidden»$3');
}

/** Strictly read-only, path-jailed file snippet reader (max 120 lines). */
export function safeReadSnippet(rootDir, relFile, startLine = 1, endLine = 80) {
  const cleanRel = String(relFile || '').trim().replace(/^f:/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleanRel || cleanRel.includes('\0') || BLOCKED_READ.test(cleanRel)) {
    return { error: `Reading "${cleanRel || relFile}" is restricted for security or context safety.` };
  }
  const rootResolved = path.resolve(rootDir);
  const abs = path.resolve(rootResolved, cleanRel);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    return { error: 'Path outside codebase root is not allowed.' };
  }
  let realAbs;
  try {
    realAbs = fs.realpathSync(abs);
    const realRoot = fs.realpathSync(rootResolved);
    if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) {
      return { error: 'Symlink outside codebase root is not allowed.' };
    }
    const st = fs.statSync(realAbs);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return { error: 'File not found or exceeds 2 MB limit.' };
  } catch {
    return { error: `File "${cleanRel}" does not exist.` };
  }
  const src = fs.readFileSync(realAbs, 'utf8');
  if (src.includes('\u0000')) return { error: 'Binary file cannot be read.' };
  const allLines = src.split(/\r?\n/);
  const s = Math.max(1, Math.floor(Number(startLine) || 1));
  const e = Math.min(allLines.length, Math.max(s, Math.min(s + 119, Math.floor(Number(endLine) || s + 79))));
  const slice = allLines.slice(s - 1, e).map((l, idx) => `L${s + idx}: ${l.slice(0, 300)}`).join('\n');
  return {
    path: cleanRel,
    totalLines: allLines.length,
    range: [s, e],
    snippet: maskSnippetSecrets(slice),
  };
}

/** Extract balanced JSON objects from arbitrary LLM output text. */
function extractJsonCandidates(text) {
  const cands = [];
  const t = String(text || '').trim();
  if (!t) return cands;
  cands.push(t);
  for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1]?.trim()) cands.push(m[1].trim());
  }
  // Scan balanced { ... } blocks outside quotes
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) { cands.push(t.slice(start, i + 1)); start = -1; }
    }
  }
  return cands;
}

/**
 * Universal parser: accepts structured output objects, JSON strings, fenced blocks,
 * or free-form Markdown (converting [[id]] and path mentions into map items).
 */
export function parseUniversalAnswer(input, graphQuery = null, fallbackQuestion = '') {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (input.structured_output && typeof input.structured_output === 'object') return input.structured_output;
    if (typeof input.answer === 'string' || Array.isArray(input.steps) || typeof input.plan === 'string') return input;
    if (typeof input.result === 'string') return parseUniversalAnswer(input.result, graphQuery, fallbackQuestion);
  }
  const text = String(input ?? '').trim();
  for (const cand of extractJsonCandidates(text)) {
    try {
      const v = JSON.parse(cand);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {}
  }
  // Free-form Markdown fallback: harvest [[id]] references and file/node mentions
  const items = [];
  const seen = new Set();
  const pushId = (rawId, note = '') => {
    if (!graphQuery) return;
    let id = String(rawId || '').trim();
    if (!graphQuery.exists(id)) {
      if (graphQuery.exists('f:' + id)) id = 'f:' + id;
      else if (graphQuery.exists('n:' + id)) id = 'n:' + id;
      else return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    const b = graphQuery.brief(id);
    items.push({ id, note: note || (b?.description || b?.name || '').slice(0, 80) });
  };
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) pushId(m[1]);
  for (const m of text.matchAll(/`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+|[A-Za-z0-9_.-]+)`/g)) pushId(m[1]);
  if (!items.length && graphQuery && fallbackQuestion) {
    for (const hit of graphQuery.find(fallbackQuestion, undefined, 6)) pushId(hit.id, hit.description);
  }
  const heading = /^#+\s+(.+)$/m.exec(text)?.[1]?.trim();
  return {
    title: (heading || fallbackQuestion || 'Answer').slice(0, 60),
    answer: text || 'No answer text returned.',
    items: items.slice(0, 12),
    steps: [],
    followups: [],
  };
}

/** Resolve HTTP configuration for Kimi (Moonshot), Gemini, OpenAI/OpenRouter, or Ollama. */
export function resolveHttpProvider(engineId, { env = process.env, modelOverride = '' } = {}) {
  const cfgAll = loadUserEnginesConfig(env);
  const cfg = cfgAll[engineId] || {};

  if (engineId === 'kimi' || engineId === 'kimi-http') {
    const apiKey = cfg.apiKey || env.MOONSHOT_API_KEY || env.KIMI_API_KEY || '';
    const baseUrl = (cfg.baseUrl || env.MOONSHOT_API_BASE || env.KIMI_API_BASE || 'https://api.moonshot.ai/v1').replace(/\/+$/, '');
    const model = modelOverride || cfg.model || env.MOONSHOT_MODEL || env.KIMI_MODEL || 'kimi-k2-0711-preview';
    return {
      id: 'kimi',
      label: cfg.label || 'Kimi (Moonshot API)',
      protocol: 'http',
      apiFormat: 'openai',
      available: !!apiKey,
      baseUrl,
      apiKey,
      model,
      detail: apiKey ? `${model} via ${new URL(baseUrl).host}` : 'MOONSHOT_API_KEY / KIMI_API_KEY not set',
    };
  }

  if (engineId === 'gemini' || engineId === 'gemini-http') {
    const apiKey = cfg.apiKey || env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '';
    const baseUrl = (cfg.baseUrl || env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const model = modelOverride || cfg.model || env.GEMINI_MODEL || 'gemini-2.5-flash';
    const isOpenAiCompat = /\/openai$|\/v1$/i.test(baseUrl);
    return {
      id: 'gemini',
      label: cfg.label || 'Gemini API',
      protocol: 'http',
      apiFormat: isOpenAiCompat ? 'openai' : 'gemini',
      available: !!apiKey,
      baseUrl,
      apiKey,
      model,
      detail: apiKey ? `${model}` : 'GEMINI_API_KEY not set',
    };
  }

  if (engineId === 'ollama') {
    const rawHost = cfg.baseUrl || env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    const hostUrl = (/^https?:\/\//i.test(rawHost) ? rawHost : `http://${rawHost}`).replace(/\/+$/, '').replace(/\/v1$/, '');
    const model = modelOverride || cfg.model || env.OLLAMA_MODEL || '';
    return {
      id: 'ollama',
      label: cfg.label || 'Ollama (Local)',
      protocol: 'http',
      apiFormat: 'openai',
      available: !!(cfg.baseUrl || env.OLLAMA_HOST || env.OLLAMA_MODEL),
      hostUrl,
      baseUrl: `${hostUrl}/v1`,
      apiKey: cfg.apiKey || 'ollama',
      model: model || 'qwen2.5-coder:7b',
      detail: hostUrl,
    };
  }

  // Generic OpenAI / OpenRouter / DeepSeek / vLLM
  const openRouterKey = env.OPENROUTER_API_KEY || '';
  const deepSeekKey = env.DEEPSEEK_API_KEY || '';
  const openAiKey = env.OPENAI_API_KEY || '';
  const apiKey = cfg.apiKey || env.FLOORPLAN_API_KEY || openRouterKey || deepSeekKey || openAiKey || '';
  const defaultBase = cfg.baseUrl || env.FLOORPLAN_API_BASE_URL
    || (openRouterKey && !env.FLOORPLAN_API_KEY ? 'https://openrouter.ai/api/v1'
      : deepSeekKey && !env.FLOORPLAN_API_KEY ? 'https://api.deepseek.com/v1'
      : env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const baseUrl = defaultBase.replace(/\/+$/, '');
  const defaultModel = openRouterKey && !env.FLOORPLAN_API_KEY ? 'openai/gpt-4o-mini'
    : deepSeekKey && !env.FLOORPLAN_API_KEY ? 'deepseek-chat'
    : 'gpt-4o-mini';
  const model = modelOverride || cfg.model || env.FLOORPLAN_MODEL || defaultModel;
  const hasLocalCustomBase = Boolean(cfg.baseUrl || env.FLOORPLAN_API_BASE_URL) && /^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(baseUrl);
  return {
    id: engineId || 'openai-http',
    label: cfg.label || (openRouterKey ? 'OpenRouter' : deepSeekKey ? 'DeepSeek' : 'OpenAI API'),
    protocol: 'http',
    apiFormat: 'openai',
    available: Boolean(apiKey || hasLocalCustomBase),
    baseUrl,
    apiKey: apiKey || 'local-key',
    model,
    detail: apiKey || hasLocalCustomBase ? `${model} @ ${new URL(baseUrl).host}` : 'API key not set',
  };
}

/** Fast probe for local Ollama server and available models. */
export async function probeOllama(hostUrl = 'http://127.0.0.1:11434', timeoutMs = 650) {
  try {
    const clean = hostUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    const r = await fetch(`${clean}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { ok: false, models: [] };
    const data = await r.json().catch(() => ({}));
    const models = (Array.isArray(data.models) ? data.models : []).map((m) => m.name).filter(Boolean);
    return { ok: models.length > 0, models, detail: models[0] ? `model: ${models[0]}` : 'no models pulled' };
  } catch {
    return { ok: false, models: [] };
  }
}

export function createReadOnlyTools({ root, q, onProgress = () => {} }) {
  const clip = (v) => {
    const s = JSON.stringify(v);
    return s.length > 18000 ? s.slice(0, 18000) + '...(truncated)' : s;
  };
  const specs = [
    {
      name: 'find_items',
      description: 'Search the architecture map by keywords. Returns up to 15 items {id, type, name, description, path}.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search words (English or Arabic)' },
          kind: { type: 'string', enum: ['module', 'file', 'endpoint', 'symbol'] },
        },
        required: ['query'],
      },
      run: ({ query, kind }) => {
        onProgress(`Searching the map for "${String(query || '').slice(0, 48)}"`);
        return clip(q.find(String(query || ''), kind ? String(kind) : undefined, 15));
      },
    },
    {
      name: 'show_item',
      description: 'Inspect one map item by id (e.g. n:api, f:src/app.ts, r:3): its summary, endpoints, exports, dependsOn, and usedBy.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      run: ({ id }) => {
        const b = q.brief(String(id || ''));
        onProgress(`Looking at ${b ? b.name : id}`);
        try { return clip(q.show(String(id || ''))); } catch (e) { return JSON.stringify({ error: e.message }); }
      },
    },
    {
      name: 'trace_path',
      description: 'Find the shortest import/HTTP call chain from one map item to another.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to'],
      },
      run: ({ from, to }) => {
        onProgress(`Tracing path ${from} → ${to}`);
        try { return clip(q.path(String(from || ''), String(to || ''))); } catch (e) { return JSON.stringify({ error: e.message }); }
      },
    },
    {
      name: 'read_file_snippet',
      description: 'Read a line range (up to 120 lines) of a source file in the codebase to verify logic, guards, or conditions.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path, e.g. src/auth/login.ts' },
          start_line: { type: 'integer', description: '1-based start line' },
          end_line: { type: 'integer', description: '1-based end line' },
        },
        required: ['path'],
      },
      run: ({ path: p, start_line, end_line }) => {
        const clean = String(p || '').replace(/^f:/, '');
        onProgress(`Reading ${clean}${start_line ? `:${start_line}` : ''}`);
        return clip(safeReadSnippet(root, clean, start_line, end_line));
      },
    },
  ];
  const byName = new Map(specs.map((s) => [s.name, s]));
  return {
    specs,
    openAiTools: specs.map((s) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.parameters } })),
    geminiTools: [{ functionDeclarations: specs.map((s) => ({ name: s.name, description: s.description, parameters: s.parameters })) }],
    execute(name, rawArgs) {
      const tool = byName.get(name);
      if (!tool) return JSON.stringify({ error: `Unknown tool "${name}"` });
      let args = rawArgs;
      if (typeof rawArgs === 'string') { try { args = JSON.parse(rawArgs || '{}'); } catch { args = {}; } }
      return tool.run(args || {});
    },
  };
}

async function runGeminiNative({ provider, systemPrompt, userPrompt, tools, onProgress, signal }) {
  const endpoint = `${provider.baseUrl}/models/${encodeURIComponent(provider.model)}:generateContent`;
  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      ...(allowTools ? { tools: tools.geminiTools } : { generationConfig: { responseMimeType: 'application/json' } }),
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini API HTTP ${res.status}`);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length || !allowTools) {
      const text = parts.map((p) => p.text || '').join('\n').trim();
      onProgress('Composing architecture view');
      return text;
    }
    contents.push({ role: 'model', parts });
    const responses = calls.map((p) => {
      const result = tools.execute(p.functionCall.name, p.functionCall.args || {});
      let parsed;
      try { parsed = JSON.parse(result); } catch { parsed = { output: result }; }
      return { functionResponse: { name: p.functionCall.name, response: { result: parsed } } };
    });
    contents.push({ role: 'user', parts: responses });
  }
  return '';
}

async function runOpenAiCompatible({ provider, systemPrompt, userPrompt, tools, q, question, onProgress, signal }) {
  const endpoint = `${provider.baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  };
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS;
    const body = {
      model: provider.model,
      messages,
      temperature: 0.2,
      ...(allowTools ? { tools: tools.openAiTools, tool_choice: 'auto' } : {}),
    };
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = String(data?.error?.message || data?.error || `HTTP ${res.status}`);
      // Graceful fallback for models (e.g. smaller Ollama models) that do not support tool calling
      if (round === 0 && /tool|function/i.test(errMsg) && res.status >= 400 && res.status < 500) {
        onProgress('Model does not support tools; injecting map context directly');
        const hits = q.find(question, undefined, 10);
        const fallbackRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Matching map items:\n${JSON.stringify(hits)}\n\n${userPrompt}` },
            ],
          }),
          signal,
        });
        const fbData = await fallbackRes.json().catch(() => ({}));
        if (!fallbackRes.ok) throw new Error(String(fbData?.error?.message || `HTTP ${fallbackRes.status}`));
        return fbData?.choices?.[0]?.message?.content || '';
      }
      throw new Error(errMsg);
    }

    const msg = data?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!toolCalls.length || !allowTools) {
      onProgress('Composing architecture view');
      return String(msg.content || '');
    }

    messages.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: toolCalls,
    });
    for (const tc of toolCalls.slice(0, 6)) {
      const fnName = tc.function?.name || '';
      const out = tools.execute(fnName, tc.function?.arguments || '{}');
      messages.push({
        role: 'tool',
        tool_call_id: tc.id || fnName,
        content: out,
      });
    }
  }
  return '';
}

/**
 * Execute an architecture question / flow / blueprint change over HTTP LLM adapter.
 */
export async function runHttpEngineQuery({ provider, root, q, modeObj, question, history = [], onProgress = () => {}, signal }) {
  let activeProvider = provider;
  if (provider.id === 'ollama' && !process.env.OLLAMA_MODEL && provider.model === 'qwen2.5-coder:7b') {
    const probe = await probeOllama(provider.hostUrl, 800);
    if (probe.ok && probe.models.length && !probe.models.includes(provider.model)) {
      activeProvider = { ...provider, model: probe.models[0] };
    }
  }
  onProgress(`Asking ${activeProvider.label} (${activeProvider.model})`);
  const tools = createReadOnlyTools({ root, q, onProgress });
  const overviewText = JSON.stringify(q.overview()).slice(0, 14000);
  const systemPrompt = [
    modeObj.httpInstructions || modeObj.instructions,
    `Required output JSON Schema:\n${JSON.stringify(modeObj.schema)}`,
    'CRITICAL: Return ONLY a valid JSON object matching the schema above (no prose outside JSON). Only reference item ids that exist on the map.',
  ].join('\n\n');
  const earlier = history.length
    ? `Earlier in this session:\n${history.map((t) => `Q: ${t.q}\nA: ${t.a}`).join('\n\n')}\n\n`
    : '';
  const userPrompt = `Map overview:\n${overviewText}\n\n${earlier}Request:\n${question}`;

  const rawText = activeProvider.apiFormat === 'gemini'
    ? await runGeminiNative({ provider: activeProvider, systemPrompt, userPrompt, tools, onProgress, signal })
    : await runOpenAiCompatible({ provider: activeProvider, systemPrompt, userPrompt, tools, q, question, onProgress, signal });

  return parseUniversalAnswer(rawText, q, question);
}
