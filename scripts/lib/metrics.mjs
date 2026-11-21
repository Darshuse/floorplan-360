// Clean Code Metrics (Uncle Bob / SonarQube), Tarjan SCC Circular Dependency Detector,
// and Architectural Layer Rules Validator for Floorplan v2.0. Zero external dependencies.

const DECISION_RE = /\b(?:if|elif|else\s+if|for|foreach|while|case|catch|except)\b|&&|\|\||\?(?![?.:])/g;
const BUILTIN_IGNORE = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'sizeof', 'typeof', 'new']);

function countParams(rawParams, lang) {
  const cleaned = String(rawParams || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/#[^\n]*/g, '')
    .trim();
  if (!cleaned) return 0;
  // Split top-level commas respecting nested (), [], {}, <> and quotes
  let depth = 0, quote = '', count = 0, cur = '';
  const parts = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
    if ('([{<'.includes(ch)) { depth++; cur += ch; continue; }
    if (')]}>'.includes(ch)) { if (depth > 0) depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const real = parts.filter((p) => {
    if (!p || p === '/' || p === '*') return false;
    if (lang === 'python' && /^(self|cls)\b/.test(p)) return false;
    if (lang === 'rust' && /^&?(?:mut\s+)?self\b/.test(p)) return false;
    if ((lang === 'typescript' || lang === 'javascript') && /^this\s*:/.test(p)) return false;
    return true;
  });
  return real.length;
}

function complexityOf(text) {
  let c = 1;
  for (const _ of String(text || '').matchAll(DECISION_RE)) c++;
  return c;
}

/**
 * Single-pass Uncle Bob / SonarQube file quality metrics:
 * { fnCount, maxFnLoc, maxFnName, maxParams, complexity, maxFnComplexity }
 */
export function computeCodeMetrics(src, lang) {
  if (!src || !lang || ['css', 'html', 'sql', 'graphql', 'protobuf', 'terraform', 'liquid'].includes(lang)) return null;
  const lines = src.split('\n');
  const fns = [];

  if (lang === 'python') {
    for (let i = 0; i < lines.length; i++) {
      const m = /^([ \t]*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      const name = m[2];
      // Collect signature up to closing ):
      let sigLines = lines[i].slice(m[0].length), sigEnd = i;
      let pDepth = 1;
      for (let k = m[0].length; k < lines[i].length && pDepth > 0; k++) {
        if (lines[i][k] === '(') pDepth++;
        else if (lines[i][k] === ')') pDepth--;
      }
      while (pDepth > 0 && sigEnd + 1 < Math.min(lines.length, i + 20)) {
        sigEnd++;
        for (const ch of lines[sigEnd]) {
          if (ch === '(') pDepth++;
          else if (ch === ')') pDepth--;
          if (pDepth === 0) break;
        }
        sigLines += ' ' + lines[sigEnd];
      }
      const paramsText = sigLines.slice(0, sigLines.lastIndexOf(')'));
      let end = sigEnd + 1, nonBlank = 1;
      while (end < lines.length) {
        const l = lines[end];
        const trimmed = l.trim();
        if (!trimmed || trimmed.startsWith('#')) { end++; continue; }
        const ind = /^[ \t]*/.exec(l)[0].length;
        if (ind <= indent) break;
        nonBlank++;
        end++;
      }
      const body = lines.slice(i, end).join('\n');
      fns.push({ name, loc: nonBlank, params: countParams(paramsText, lang), complexity: complexityOf(body) });
    }
  } else {
    // Brace-delimited languages (JS, TS, Vue, Svelte, Go, Rust, Java, Kotlin, C#, PHP)
    const FN_HEAD = /(?:export\s+)?(?:default\s+)?(?:public|private|protected|internal|static|final|override|virtual|async|\s)*\b(?:function\s+([A-Za-z_$][\w$]*)|fn\s+([A-Za-z_]\w*)|func\s+(?:\([^)]+\)\s*)?([A-Za-z_]\w*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b)?|([A-Za-z_$][\w$]*)\s*(?:<[^>{;]*>)?)\s*\(/g;
    for (const m of src.matchAll(FN_HEAD)) {
      const name = m[1] || m[2] || m[3] || m[4] || m[5];
      if (!name || BUILTIN_IGNORE.has(name)) continue;
      // Extract parameter list from opening '('
      const openParen = m.index + m[0].length - 1;
      let pDepth = 1, pEnd = openParen + 1;
      while (pEnd < src.length && pEnd - openParen < 1500 && pDepth > 0) {
        const ch = src[pEnd];
        if (ch === '(') pDepth++;
        else if (ch === ')') pDepth--;
        pEnd++;
      }
      if (pDepth !== 0) continue;
      const paramsText = src.slice(openParen + 1, pEnd - 1);
      // Must be followed shortly by '{' or '=>'
      const after = src.slice(pEnd, pEnd + 180);
      const braceMatch = /^(?:\s*(?::[^{;=]+|->[^{;=]+|throws\s+[^{;]+|where\s+[^{;]+)?\s*)(\{|=>)/.exec(after);
      if (!braceMatch) continue;
      let bodyStart = pEnd + braceMatch.index + braceMatch[0].length - braceMatch[1].length;
      let bodyText = '';
      if (braceMatch[1] === '=>') {
        const restAfterArrow = src.slice(bodyStart + 2).trimStart();
        if (restAfterArrow.startsWith('{')) {
          bodyStart = src.indexOf('{', bodyStart + 2);
        } else {
          const lineEnd = src.indexOf('\n', bodyStart + 2);
          bodyText = src.slice(m.index, lineEnd < 0 ? src.length : lineEnd);
        }
      }
      if (!bodyText && src[bodyStart] === '{') {
        let bDepth = 1, k = bodyStart + 1, quote = '';
        const cap = Math.min(src.length, bodyStart + 40000);
        while (k < cap && bDepth > 0) {
          const ch = src[k];
          if (quote) { if (ch === '\\') k++; else if (ch === quote) quote = ''; k++; continue; }
          if (ch === '"' || ch === "'" || ch === '`') { quote = ch; k++; continue; }
          if (ch === '{') bDepth++;
          else if (ch === '}') bDepth--;
          k++;
        }
        bodyText = src.slice(m.index, k);
      }
      if (!bodyText) continue;
      const loc = bodyText.split('\n').filter((l) => l.trim()).length;
      fns.push({ name, loc, params: countParams(paramsText, lang), complexity: complexityOf(bodyText) });
    }
  }

  const fileComplexity = complexityOf(src);
  let maxFnLoc = 0, maxFnName = '', maxParams = 0, maxFnComplexity = 1;
  for (const fn of fns) {
    if (fn.loc > maxFnLoc) { maxFnLoc = fn.loc; maxFnName = fn.name; }
    if (fn.params > maxParams) maxParams = fn.params;
    if (fn.complexity > maxFnComplexity) maxFnComplexity = fn.complexity;
  }
  return {
    fnCount: fns.length,
    maxFnLoc,
    ...(maxFnName ? { maxFnName } : {}),
    maxParams,
    complexity: fileComplexity,
    maxFnComplexity,
  };
}

/**
 * Compute Clean Code / SonarQube quality grade ('good' | 'warn' | 'bad') and 0-100 health score.
 */
export function gradeQuality({ loc = 0, maxFnLoc = 0, maxFnName = '', maxParams = 0, complexity = 1, maxFnComplexity = 1, fanOut = 0 } = {}) {
  let penalty = 0;
  if (maxFnLoc > 100) penalty += 40;
  else if (maxFnLoc > 50) penalty += 18;

  if (maxParams >= 8) penalty += 25;
  else if (maxParams > 5) penalty += 12;

  if (maxFnComplexity > 25) penalty += 35;
  else if (maxFnComplexity > 12) penalty += 16;

  if (fanOut > 22) penalty += 25;
  else if (fanOut > 12) penalty += 12;

  if (loc > 1000) penalty += 35;
  else if (loc > 500) penalty += 15;

  const score = Math.max(0, 100 - penalty);
  const grade = (maxFnLoc > 100 || maxParams >= 8 || maxFnComplexity > 25 || fanOut > 22 || loc > 1000 || score < 50)
    ? 'bad'
    : (maxFnLoc > 50 || maxParams > 5 || maxFnComplexity > 12 || fanOut > 12 || loc > 500 || score < 80)
    ? 'warn'
    : 'good';

  return {
    grade,
    score,
    maxFnLoc,
    ...(maxFnName ? { maxFnName } : {}),
    maxParams,
    complexity,
    maxFnComplexity,
    fanOut,
  };
}

/**
 * Iterative Tarjan Strongly Connected Components (SCC) algorithm (O(V + E))
 * to detect circular import dependencies without recursion stack limits.
 * Returns [{ nodes: string[], cycle: string[] }] where cycle is a minimal closed loop [a, b, ..., a].
 */
export function findImportCycles(links) {
  const adj = new Map();
  const vertices = new Set();
  for (const l of links || []) {
    if (l.k !== 'import' || !l.a?.startsWith('f:') || !l.b?.startsWith('f:') || l.a === l.b) continue;
    vertices.add(l.a);
    vertices.add(l.b);
    if (!adj.has(l.a)) adj.set(l.a, []);
    adj.get(l.a).push(l.b);
  }

  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  for (const rootV of vertices) {
    if (indices.has(rootV)) continue;
    const callStack = [{ v: rootV, iter: (adj.get(rootV) || [])[Symbol.iterator](), initialized: false }];
    while (callStack.length) {
      const frame = callStack[callStack.length - 1];
      const { v } = frame;
      if (!frame.initialized) {
        indices.set(v, index);
        lowlink.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        frame.initialized = true;
      }
      if (frame.child !== undefined) {
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(frame.child)));
        frame.child = undefined;
      }
      const next = frame.iter.next();
      if (!next.done) {
        const w = next.value;
        if (!indices.has(w)) {
          frame.child = w;
          callStack.push({ v: w, iter: (adj.get(w) || [])[Symbol.iterator](), initialized: false });
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
        }
        continue;
      }
      if (lowlink.get(v) === indices.get(v)) {
        const comp = [];
        let w;
        do {
          w = stack.pop();
          onStack.delete(w);
          comp.push(w);
        } while (w !== v);
        if (comp.length >= 2) sccs.push(comp);
      }
      callStack.pop();
    }
  }

  // Reconstruct a minimal witness cycle inside each SCC via BFS
  return sccs.map((comp) => {
    const member = new Set(comp);
    const start = comp.slice().sort()[0];
    const prev = new Map();
    const queue = [];
    for (const nxt of adj.get(start) || []) {
      if (!member.has(nxt)) continue;
      if (nxt === start) return { nodes: comp, cycle: [start, start] };
      prev.set(nxt, start);
      queue.push(nxt);
    }
    let backToStart = null;
    while (queue.length && !backToStart) {
      const cur = queue.shift();
      for (const nxt of adj.get(cur) || []) {
        if (!member.has(nxt)) continue;
        if (nxt === start) { backToStart = cur; break; }
        if (!prev.has(nxt)) { prev.set(nxt, cur); queue.push(nxt); }
      }
    }
    if (!backToStart) return { nodes: comp, cycle: [...comp.slice(0, 4), comp[0]] };
    const ring = [start];
    for (let x = backToStart; x && x !== start; x = prev.get(x)) ring.unshift(x);
    ring.unshift(start);
    return { nodes: comp, cycle: ring };
  });
}

/**
 * Check optional `layerRules` from architecture.json against graph.links.
 * Each rule: { from: "<nodeId or glob>", forbid: ["<nodeId or glob>", ...], reason?: string, severity?: "high"|"medium"|"low" }
 */
export function checkLayerRules(graph, layerRules, compileGlob) {
  if (!Array.isArray(layerRules) || !layerRules.length) return [];
  const nodeById = new Map((graph.nodes || []).map((n) => [n.id, n]));
  const fileByPath = new Map((graph.files || []).map((f) => [f.p, f]));

  const ancestorsOfNode = (nid) => {
    const out = new Set();
    let cur = nodeById.get(nid);
    while (cur) { out.add(cur.id); cur = cur.parent ? nodeById.get(cur.parent) : null; }
    return out;
  };

  const makeMatcher = (pattern) => {
    const s = String(pattern || '').trim();
    if (!s) return () => false;
    if (nodeById.has(s)) {
      return (itemId) => {
        if (itemId.startsWith('n:')) return ancestorsOfNode(itemId.slice(2)).has(s);
        if (itemId.startsWith('f:')) {
          const f = fileByPath.get(itemId.slice(2));
          return f ? ancestorsOfNode(f.n).has(s) : false;
        }
        return false;
      };
    }
    try {
      const g = compileGlob(s);
      return (itemId) => itemId.startsWith('f:') && g.test(itemId.slice(2));
    } catch {
      return () => false;
    }
  };

  const violations = [];
  layerRules.forEach((rule, idx) => {
    if (!rule || typeof rule.from !== 'string' || !Array.isArray(rule.forbid) || !rule.forbid.length) return;
    const matchFrom = makeMatcher(rule.from);
    const forbidMatchers = rule.forbid.map((f) => ({ target: String(f), test: makeMatcher(f) }));
    const hits = [];
    for (const l of graph.links || []) {
      if (!matchFrom(l.a)) continue;
      const broken = forbidMatchers.find((fm) => fm.test(l.b));
      if (!broken) continue;
      // Ignore links inside the exact same target if rule.from is nested inside forbid
      if (l.a === l.b) continue;
      hits.push({ from: l.a, to: l.b, kind: l.k, target: broken.target, names: l.names || [], labels: l.labels || [] });
    }
    if (hits.length) {
      violations.push({
        index: idx,
        from: rule.from,
        forbid: rule.forbid,
        reason: typeof rule.reason === 'string' ? rule.reason : '',
        severity: ['high', 'medium', 'low'].includes(rule.severity) ? rule.severity : 'medium',
        hits,
      });
    }
  });
  return violations;
}
