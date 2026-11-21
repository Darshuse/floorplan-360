---
name: floorplan
description: "Draw a floorplan of an app's codebase (one repo or several side by side), an interactive node-graph map where every subsystem, module, file and HTTP route has a human-readable name and a one-line description, connected by the imports and HTTP calls between them, at several zoom levels. It is saved as a self-contained floorplan/index.html in the codebase. Use whenever the user wants to visualize, map, diagram, document or get an architectural overview of a codebase, repo or monorepo, understand how their app works or is connected under the hood, onboard onto unfamiliar code, see how the frontend talks to the backend, or update an existing floorplan, even if they don't say \"visualize\". Also use it before any code exists: when the user shares a PRD, a spec or a description of something they want to build and asks what pieces it needs or how they'd fit together, it draws a blueprint, the same map planned from the document."
license: MIT
metadata:
  author: Darshuse (built on haydenschmitty/floorplan)
  version: "2.0.0"
  repository: https://github.com/Darshuse/floorplan-360
  upstream: https://github.com/haydenschmitty/floorplan
---

# Floorplan 360 (Universal v2.0)

You produce `floorplan/` at the codebase root: an interactive architecture floorplan of the app that anyone can read like a living system diagram, in English (`LTR`) or Arabic (`RTL`). Every card shows a human name and a one-line description, with the real path in small type underneath.

- **You write:** `architecture.json` (subsystems, modules, optional `layerRules`, `language`, flows, tour) and `descriptions/*.json` (a name and description for every file and route).
- **Generated:** `graph.json`, `index.html`, `query.mjs`, and `serve.mjs` (zero external npm dependencies; runs on Node 18+).

The scripts do the mechanical work: finding repos, parsing imports and routes, matching HTTP calls to endpoints, tracing 2-hop authentication guards, detecting circular dependencies and Clean Code hotspots, layout and rendering. Your job is the part only a reader of the code can do: deciding what things *are* and saying so plainly.

> **Skill Directory (`<SKILL_DIR>`):** In every command below, replace `<SKILL_DIR>` with the directory containing this `SKILL.md` file. Floorplan is **100% agent-agnostic** and works identically in Google Antigravity, Claude Code, OpenAI Codex, Kimi, Gemini CLI, Cursor, Windsurf, Aider, OpenCode, or any custom agent.

First, check whether a map already exists:
```bash
node "<SKILL_DIR>/scripts/status.mjs" "<root>"
```

## Nothing built yet? Draw a blueprint

If the user wants to plan something they haven't built ("here's my PRD", "I want to build an app that…", a long description of a system), make a **blueprint**: the same map, planned from their document instead of scanned from code. Use this path when there's no code for the system yet, even if the folder holds other things. If the code exists, make a normal map.

1. **Read the input.** A PRD file, a pasted message, or a document they point you at. Ask 2–3 questions only if something fundamental is open (who uses it, web or mobile, does anyone sign in, does money change hands); otherwise decide and record it as an assumption.
2. **Read [references/blueprint.md](references/blueprint.md)**, then [references/schema.md](references/schema.md) for `architecture.json`.
3. **Write `floorplan/plan.json`**: every planned file and endpoint, what each screen calls, which outside services and data each part uses, who may use each endpoint, your assumptions and the open questions. If the PRD is only in the chat, save it as `docs/prd.md` and use that as `source`, so the map and later questions can refer back to it.
4. **Write `floorplan/architecture.json`** as for a code map (parts, external nodes for the services and data `plan.json` names, 1–3 flows for the PRD's main user stories, a tour), with globs covering the planned paths. Set `"language": "ar"` when the user asks for an Arabic map (otherwise `"en"`).
5. **Run `node "<SKILL_DIR>/scripts/plan.mjs" "<root>"`, then `build.mjs`** (step 5 below). Fix what they report until both are clean. Skip `describe.mjs` and `recent.mjs`: names and descriptions come from `plan.json`.
6. **Show it** with `open.mjs` (step 8).
7. **Report**: the URL; the shape of the system in 3–5 lines; the stack you chose; your main assumptions; and the design review's questions and warnings. Tell them each part has a ready **Build this** prompt for their AI coding assistant; that they can switch the map's Ask bar to **Change** (with any structured engine) to request additions or changes, and that the map stays out of git.

To change a blueprint, edit `plan.json` and `architecture.json` and run `refresh.mjs`, which redraws it from `plan.json`. Once the code exists and the user wants a map of it, run `refresh.mjs "<root>" --from-code`, then carry on as for a refresh.

## A map already exists? Refresh it instead

If `status.mjs` shows an existing map, don't start over. Run:

```bash
node "<SKILL_DIR>/scripts/refresh.mjs" "<root>"
```

It re-scans, compares content fingerprints against the last build, and does the bookkeeping without spending tokens:
- carries descriptions over to moved or renamed files and endpoints;
- drops entries for deleted files;
- flags entries whose exports or routes changed with a `review` note (edits inside function bodies don't count);
- rebuilds and prints what changed plus a short `NEXT` list.

Do only what `NEXT` asks:
- add globs for new directories that landed in `"unassigned"`;
- run `describe.mjs` (step 6), which only produces worksheets for the new and flagged items;
- check module summaries and flows if the change was large.

Then mark recent work (step 7), and show it and report (step 8). Always show it, even when nothing changed.

## Workflow (first run)

The codebase root is the path argument if one was given, otherwise the current directory. It may be a single repo, or a folder holding several repos (frontend + backend + infra).

1. **Scan.**
   ```bash
   node "<SKILL_DIR>/scripts/scan.mjs" "<root>"
   ```
   It writes `floorplan/.cache/scan.json` and prints a summary: repos, a code tree with LOC, entrypoints, heaviest directory→directory import edges, HTTP call→route matches across repos, external packages and hosts, and largest/complex files. Work from the summary; don't read `scan.json` directly.

2. **Read the contract.** Read [references/schema.md](references/schema.md) and [references/choosing-boundaries.md](references/choosing-boundaries.md).

3. **Explore just enough.** Read READMEs, manifests (`package.json`, `pyproject.toml`, `go.mod`, `docker-compose`, deploy configs) and entrypoints, then skim 1–2 files per candidate subsystem until you can write a one-sentence summary for each.

4. **Write `floorplan/architecture.json`.** Aim for:
   - 3–9 top-level nodes;
   - 3–12 children under each big one;
   - globs covering more than 90% of code files;
   - external nodes for the databases and third-party services the code talks to;
   - edges only for what static analysis can't see (queues, cron, webhooks, env-configured service URLs);
   - optional `"language": "ar"` whenever the user requested the floorplan in Arabic or spoke in Arabic (defaults to `"en"`; the UI also lets users switch `عربي / EN` live);
   - optional `"layerRules": [{ "from": "server.domain", "forbid": ["server.routes"], "reason": "Domain logic must not depend on HTTP routes" }]` when enforcing clean architectural boundaries;
   - 1–3 flows that explain the system's main jobs;
   - a `tour`: 3–8 narrated stops for the "Start here" tour.

   **Mandatory Language Rule (`"language": "ar"`).** When `"language": "ar"` (or when the user asks in Arabic), **100% of human-facing authored text** — `project.name`, `project.summary`, every `nodes[].label` & `nodes[].summary`, every `flows[].label` & step `note`, every `tour[].title` & `body`, `recent-work.json`, and **every single entry in `floorplan/descriptions/*.json`** — **MUST be written in fluent, natural Arabic** (keeping only literal HTTP methods/paths and code identifiers in Latin script where appropriate). When refreshing an older map that had English labels/descriptions for an Arabic user request, translate `architecture.json` labels/summaries/flows into Arabic as well.

   **Audience & Simplified Business Mode.** Unless the user asks for a developer-facing map (`"audience": "developers"`), leave `"audience"` unset or `"everyone"` (or set `"audience": "business"` to start directly in Simplified Business Mode), and write every `project.summary`, node `label`/`summary`, and file/route description in plain language (see [references/writing-descriptions.md](references/writing-descriptions.md)). Inside the viewer, the header also provides a live **Business view / وضع البيزنس** toggle (`B` shortcut) that hides test/script/config plumbing, strips file paths and Clean Code metrics, and switches the Ask bar and Health panel into executive business language.

5. **Build and fix.**
   ```bash
   node "<SKILL_DIR>/scripts/build.mjs" "<root>"
   ```
   Fix errors and rebuild until clean and unassigned is under ~10%.
   - **Nothing Floorplan makes is committed.** `floorplan/` holds its own `.gitignore` (`*`).
   - **Optional local agent notes (`--agent-notes`).** The build never modifies project files unless asked. If the user wants future AI sessions in this repo to automatically know about `floorplan/query.mjs`, run `build.mjs "<root>" --agent-notes`, which writes an uncommitted local rule/note file (`.agents/rules/floorplan-local.md`, `CLAUDE.local.md`, or `AGENTS.local.md`) and ignores it via `.git/info/exclude`.

6. **Describe every file and route.**
   ```bash
   node "<SKILL_DIR>/scripts/describe.mjs" "<root>"
   ```
   This writes one worksheet per module (`floorplan/.cache/worksheets/<key>.md`) and a skeleton (`floorplan/descriptions/<key>.json`).
   - Read [references/writing-descriptions.md](references/writing-descriptions.md) first: describe what the code does today, plainly. Match the map's `"language"` (`"ar"` or `"en"`).
   - **More than ~150 files:** split the worksheets across parallel subagents if available (~80–150 files per subagent, grouped by subsystem). Give each subagent its assigned worksheet keys, the codebase root, and the writing guide, instructing it to edit **only** its assigned `descriptions/<key>.json` files and keep all keys unchanged.
   - **Smaller codebases:** fill them in yourself.
   Then re-run `build.mjs` until `DESCRIPTIONS` reaches 100%.

7. **Mark recent work.**
   ```bash
   node "<SKILL_DIR>/scripts/recent.mjs" "<root>"
   ```
   Write `floorplan/recent-work.json` (`{ "tasks": [] }` if nothing recent was worked on, or 1 task per user request with `title`, `request`, `summary`, and `items`), then run `build.mjs`.

8. **Show it, then report.**
   ```bash
   node "<SKILL_DIR>/scripts/open.mjs" "<root>"
   ```
   - Starts or reuses `floorplan/serve.mjs` in the background and opens the browser (pass `--no-open` if opening in an IDE webview/browser subagent; pass `--auto-refresh` if the user wants live background code watching).
   - If running in a restricted sandbox that kills background processes, give the user `node floorplan/serve.mjs` to run in their terminal.
   - **Report** in the user's language: the URL, a 3–5 line architectural summary (highlighting any circular dependencies, layer violations, or god-files), and any **high-severity Health items** (never repeating secret values). Mention that `architecture.json` and `descriptions/` are theirs to edit, that the map stays out of git, and that they can switch AI engines or `عربي / EN` live inside the viewer.

## 9. Multi-Engine Ask Bar, Auto-Refresh & Sharing

The floating **Ask** bar includes a live **Engine Picker** powered by `floorplan/serve.mjs` (`/api/engines`):
- **Local Engine (100% Offline, always ready):** Built-in bilingual (Arabic/English) graph + function snippet engine requiring zero API keys or CLIs; also acts as automatic fallback if an external provider is offline or signed out.
- **CLI Agents:** `Claude Code` (`claude`), `OpenAI Codex` (`codex`), `Google Antigravity` (`agy`), `Kimi CLI` (`kimi`), `Gemini CLI` (`gemini`), or any custom CLI via `FLOORPLAN_CLI_CMD` / `~/.floorplan/engines.json`.
- **HTTP LLM Providers (Zero npm deps):**
  - **Kimi (Moonshot AI):** set `MOONSHOT_API_KEY` or `KIMI_API_KEY`.
  - **Google Gemini API:** set `GEMINI_API_KEY`.
  - **OpenAI / OpenRouter / DeepSeek / vLLM:** set `FLOORPLAN_API_BASE_URL` + `FLOORPLAN_API_KEY` (or `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`).
  - **Ollama (Local LLM):** auto-detected at `http://127.0.0.1:11434` (or `OLLAMA_HOST`).
  All HTTP providers get a safe 4-tool read-only loop (`find_items`, `show_item`, `trace_path`, `read_file_snippet` with secrets masked).

### Zero-Drift Auto-Refresh & Git Hook
- Run `node floorplan/serve.mjs --auto-refresh` (or `open.mjs --auto-refresh`) to watch source file fingerprints and automatically run `refresh.mjs` in the background whenever code changes.
- Run `node "<SKILL_DIR>/scripts/refresh.mjs" "<root>" --install-hook` to install a lightweight local `post-merge` / `post-commit` Git hook that keeps the map fresh automatically.

### Sharing an Exported Copy
```bash
node floorplan/serve.mjs --export [<file>] [--include flows,notes,recent,health]
```
Produces a single self-contained offline HTML file stripped of the Ask bar, AI prompts, editor links, local paths, and git remotes.

## Notes
- Paths are relative to the codebase root and use forward slashes.
- Route keys in descriptions are `"METHOD /full/path"` exactly as printed in the worksheets.
- Never hand-edit `graph.json` or `index.html`; they are regenerated on every build.
