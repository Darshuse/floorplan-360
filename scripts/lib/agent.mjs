// Universal Agent & Engine Registry for Floorplan v2.0.
// Supports any coding agent or LLM provider: Antigravity, Claude Code, Codex, Kimi (CLI or Moonshot API),
// Gemini (CLI or API), OpenAI/OpenRouter-compatible HTTP endpoints, Ollama, Custom CLI, and the built-in
// 100% offline Local Graph + Code Snippet engine. Zero external npm dependencies.

import { isUnattended } from './common.mjs';

export const AGENT_REGISTRY = {
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity',
    app: 'Google Antigravity',
    cli: 'the Antigravity CLI (agy)',
    protocol: 'cli',
    structured: true,
    docs: 'https://antigravity.google/docs',
    signIn: 'Sign in inside Google Antigravity or run <code>agy auth login</code>, then ask again.',
    aliases: ['agy', 'google-antigravity'],
    detectEnv: (env) => !!(
      env.ANTIGRAVITY_SESSION_ID ||
      env.ANTIGRAVITY_AGENT ||
      env.ANTIGRAVITY_CLI ||
      env.AGY_SESSION_ID ||
      env.AGY_ACCOUNT ||
      /antigravity/i.test(String(env.AGENT_NAME || env.TERM_PROGRAM || ''))
    ),
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    app: 'Claude Code',
    cli: 'the Claude Code CLI',
    protocol: 'cli',
    structured: true,
    docs: 'https://docs.claude.com/en/docs/claude-code',
    signIn: 'Run <code>claude</code> in a terminal once to sign in, then ask again.',
    aliases: ['claude-code', 'anthropic'],
    detectEnv: (env) => !!(
      env.CLAUDECODE ||
      env.CLAUDE_CODE_ENTRYPOINT ||
      env.CLAUDE_CODE_SESSION ||
      env.CLAUDE_SESSION_ID
    ),
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    app: 'Codex',
    cli: 'Codex',
    protocol: 'cli',
    structured: true,
    docs: 'https://developers.openai.com/codex',
    signIn: 'Open the Codex app (or run <code>codex login</code> in a terminal) to sign in, then ask again.',
    aliases: ['openai-codex'],
    detectEnv: (env) => !!(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || env.CODEX_SANDBOX),
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    app: 'Kimi (Moonshot AI)',
    cli: 'Kimi CLI or Moonshot API',
    protocol: 'hybrid', // CLI if installed, HTTP API if MOONSHOT_API_KEY / KIMI_API_KEY is set
    structured: true,
    docs: 'https://platform.moonshot.ai/docs',
    signIn: 'Set <code>MOONSHOT_API_KEY</code> (or sign in with <code>kimi</code> CLI), then ask again.',
    aliases: ['moonshot', 'kimi-cli', 'kimi-http'],
    detectEnv: (env) => !!(env.KIMI_SESSION_ID || env.KIMI_CLI || env.MOONSHOT_API_KEY || env.KIMI_API_KEY),
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    app: 'Gemini CLI / API',
    cli: 'Gemini CLI or GEMINI_API_KEY',
    protocol: 'hybrid',
    structured: true,
    docs: 'https://ai.google.dev/gemini-api/docs',
    signIn: 'Set <code>GEMINI_API_KEY</code> or sign in to the <code>gemini</code> CLI, then ask again.',
    aliases: ['gemini-cli', 'gemini-http', 'google-gemini'],
    detectEnv: (env) => !!(env.GEMINI_CLI || env.GEMINI_SESSION_ID || env.GEMINI_API_KEY),
  },
  'openai-http': {
    id: 'openai-http',
    label: 'OpenAI / API',
    app: 'OpenAI-Compatible API',
    cli: 'OpenAI / OpenRouter / DeepSeek HTTP API',
    protocol: 'http',
    structured: true,
    docs: 'https://openrouter.ai/docs',
    signIn: 'Set <code>FLOORPLAN_API_KEY</code> (or <code>OPENAI_API_KEY</code> / <code>OPENROUTER_API_KEY</code>), then ask again.',
    aliases: ['openai', 'openrouter', 'deepseek', 'vllm', 'http-api'],
    detectEnv: (env) => !!(
      env.FLOORPLAN_API_BASE_URL ||
      env.FLOORPLAN_API_KEY ||
      env.OPENROUTER_API_KEY ||
      env.DEEPSEEK_API_KEY ||
      env.OPENAI_API_KEY
    ),
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    app: 'Ollama (Local LLM)',
    cli: 'Ollama local server',
    protocol: 'http',
    structured: true,
    docs: 'https://ollama.com',
    signIn: 'Start Ollama locally (<code>ollama serve</code>) and pull a model, then ask again.',
    aliases: ['ollama-local'],
    detectEnv: (env) => !!(env.OLLAMA_HOST || env.OLLAMA_MODEL),
  },
  'custom-cli': {
    id: 'custom-cli',
    label: 'Custom CLI',
    app: 'Custom AI CLI',
    cli: 'your configured FLOORPLAN_CLI_CMD',
    protocol: 'cli',
    structured: false,
    docs: '',
    signIn: 'Check your <code>FLOORPLAN_CLI_CMD</code> or <code>~/.floorplan/engines.json</code> command.',
    aliases: ['custom', 'aider', 'opencode'],
    detectEnv: (env) => !!env.FLOORPLAN_CLI_CMD,
  },
  local: {
    id: 'local',
    label: 'Local Engine',
    app: 'your AI coding assistant',
    cli: 'Floorplan Local Graph & Code Engine',
    protocol: 'local',
    structured: false,
    docs: '',
    signIn: 'Works 100% offline with zero setup.',
    aliases: ['offline', 'builtin', 'graph'],
    detectEnv: () => false,
  },
  none: {
    id: 'none',
    label: 'AI',
    app: 'your AI coding assistant',
    cli: 'an AI CLI or Floorplan Local Engine',
    protocol: 'none',
    structured: false,
    docs: '',
    signIn: 'Start <code>node floorplan/serve.mjs</code> to ask questions.',
    aliases: ['auto'],
    detectEnv: () => false,
  },
};

export const AGENTS = Object.keys(AGENT_REGISTRY);

const ALIAS_MAP = new Map();
for (const [id, meta] of Object.entries(AGENT_REGISTRY)) {
  ALIAS_MAP.set(id, id);
  for (const a of meta.aliases || []) ALIAS_MAP.set(a.toLowerCase(), id);
}

export function normalizeAgentId(value) {
  const v = String(value || '').trim().toLowerCase();
  return ALIAS_MAP.get(v) || null;
}

export function getAgentMeta(id) {
  const norm = normalizeAgentId(id);
  return AGENT_REGISTRY[norm] || AGENT_REGISTRY.none;
}

const DETECT_PRIORITY = [
  'antigravity',
  'codex',
  'claude',
  'kimi',
  'gemini',
  'custom-cli',
  'openai-http',
  'ollama',
];

export function detectAgent(args = {}, env = process.env) {
  const explicit = normalizeAgentId(args.agent || env.FLOORPLAN_AGENT || '');
  if (explicit) return explicit;
  if (isUnattended(env)) return 'none';
  for (const id of DETECT_PRIORITY) {
    if (AGENT_REGISTRY[id].detectEnv(env)) return id;
  }
  return 'none';
}

/**
 * Human-readable description of the active engine answering questions in open.mjs / serve.mjs.
 * Detects wrapper binaries when `--version` prints a different tool name.
 */
export function cliLabel(engine, version = '') {
  const meta = getAgentMeta(engine);
  const usual = meta.cli || meta.app || meta.label;
  const v = String(version || '').trim();
  if (!v || meta.protocol !== 'cli') return usual;
  const named = /^([A-Za-z][\w.-]{0,40})\s+v?\d/.exec(v)?.[1];
  if (!named) return usual;
  const checkTokens = [meta.id, ...(meta.aliases || [])].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (new RegExp(checkTokens.join('|'), 'i').test(v)) return usual;
  return `${named} (via ${meta.id})`;
}
