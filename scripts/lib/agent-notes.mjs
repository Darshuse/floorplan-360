// Universal uncommitted local project notes pointer for Floorplan v2.0.
// Replaces vendor-locked claudemd.mjs while keeping 100% backward compatibility with --claude-md.
// When requested (--agent-notes or legacy --claude-md), writes a marked Floorplan lookup block into an
// uncommitted local rule/notes file appropriate for the active agent and adds it to .git/info/exclude.

import fs from 'node:fs';
import path from 'node:path';
import { git, toPosix } from './common.mjs';

const START = '<!-- floorplan:start -->';
const END = '<!-- floorplan:end -->';

const TARGET_BY_AGENT = {
  claude: 'CLAUDE.local.md',
  antigravity: '.agents/rules/floorplan-local.md',
  gemini: '.agents/rules/floorplan-local.md',
};

function targetFileFor(agent, forceClaude = false) {
  if (forceClaude) return 'CLAUDE.local.md';
  return TARGET_BY_AGENT[agent] || 'AGENTS.local.md';
}

function block(rel) {
  return `${START}
## Floorplan: interactive map of this codebase

\`${rel}/\` holds a map of this codebase: every module, file and endpoint with a plain-language name and one-line description, plus import and HTTP connections. For questions like "where is X", "how does Y work" or "what uses Z", query it before searching from scratch:

- \`node ${rel}/query.mjs find "<words>"\`: matching modules, files and endpoints
- \`node ${rel}/query.mjs show <file path | module id | "GET /path">\`: details, dependencies and callers
- \`node ${rel}/query.mjs path <from> <to>\`: shortest connection chain
- \`node ${rel}/query.mjs overview\`: high-level system overview

Confirm in source files before editing code. Open the live map with \`node ${rel}/serve.mjs\`.
${END}`;
}

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

const stripBlock = (text) => {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) return null;
  return [text.slice(0, a).trimEnd(), text.slice(b + END.length).trimStart()].filter(Boolean).join('\n\n').replace(/\r\n/g, '\n');
};

function excludeLocally(root, relTarget) {
  const posixTarget = toPosix(relTarget);
  if (git(root, ['rev-parse', '--is-inside-work-tree']) !== 'true') return 'not in a git repo';
  if (git(root, ['ls-files', '--', posixTarget])) return `${posixTarget} is tracked in git; the Floorplan section will show up in it`;
  if (git(root, ['check-ignore', '-q', posixTarget]) !== null) return 'already ignored';
  const prefix = git(root, ['rev-parse', '--show-prefix']) || '';
  const excl = git(root, ['rev-parse', '--git-path', 'info/exclude']);
  if (!excl) return 'could not find .git/info/exclude';
  const file = path.resolve(root, excl);
  const line = '/' + prefix + posixTarget;
  const cur = read(file) || '';
  if (!cur.split(/\r?\n/).includes(line)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, cur.replace(/\s*$/, cur.trim() ? '\n' : '') + `# local AI agent notes (added by Floorplan)\n${line}\n`);
  }
  return 'ignored locally via .git/info/exclude';
}

export function writeAgentNotes(root, outDir, { agent = 'none', add = false, forceClaude = false } = {}) {
  const rel = toPosix(path.relative(root, outDir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return 'skipped (map is outside the codebase)';

  const targetRel = targetFileFor(agent, forceClaude);
  const knownFiles = [...new Set([targetRel, 'CLAUDE.local.md', '.agents/rules/floorplan-local.md', 'AGENTS.local.md', 'CLAUDE.md', toPosix(path.join('.claude', 'CLAUDE.md'))])];
  const existingWithBlock = knownFiles.find((f) => stripBlock(read(path.join(root, f)) ?? '') != null);
  if (!add && !existingWithBlock) return 'not added (optional: pass --agent-notes)';

  const activeTarget = add ? targetRel : (existingWithBlock && !['CLAUDE.md', '.claude/CLAUDE.md'].includes(existingWithBlock) ? existingWithBlock : targetRel);
  const notes = [];

  // Clean up legacy blocks placed inside tracked CLAUDE.md files by older versions
  for (const legacy of ['CLAUDE.md', toPosix(path.join('.claude', 'CLAUDE.md'))]) {
    const f = path.join(root, legacy);
    const t = read(f);
    const rest = t == null ? null : stripBlock(t);
    if (rest == null) continue;
    const eol = t.includes('\r\n') ? '\r\n' : '\n';
    const tracked = !!git(path.dirname(f), ['ls-files', '--', path.basename(f)]);
    if (!rest.trim() && !tracked) fs.unlinkSync(f);
    else fs.writeFileSync(f, rest.replace(/\n/g, eol) + (rest.trim() ? eol : ''));
    notes.push(`moved Floorplan section out of ${legacy}`);
  }

  const file = path.join(root, activeTarget);
  const old = read(file);
  if (old?.includes('<!-- floorplan:off -->')) return 'skipped (opted out)';
  const eol = old?.includes('\r\n') ? '\r\n' : '\n';
  const text = block(rel).replace(/\n/g, eol);
  let next;
  if (old == null) next = text + eol;
  else {
    const a = old.indexOf(START), b = old.indexOf(END);
    next = a >= 0 && b > a ? old.slice(0, a) + text + old.slice(b + END.length) : old.replace(/\s*$/, '') + eol + eol + text + eol;
  }
  if (next !== old) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
    notes.unshift(`${old == null ? 'created' : 'updated'} ${activeTarget}`);
  } else {
    notes.unshift(`${activeTarget} unchanged`);
  }
  notes.push(excludeLocally(root, activeTarget));
  return notes.join('; ');
}

/** Backward-compatible entry point for callers expecting writeClaudeMd. */
export function writeClaudeMd(root, outDir, { add = false } = {}) {
  return writeAgentNotes(root, outDir, { agent: 'claude', add, forceClaude: true });
}
