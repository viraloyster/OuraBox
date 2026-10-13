# AGENTS.md

Guidance for AI coding agents (and a quick map for people) working on OuraBox. The longer versions are in [CONTRIBUTING.md](CONTRIBUTING.md), [app/README.md](app/README.md) and [docs/](docs/README.md).

## What this is

OuraBox is a calm, private place to develop ideas: a **Tauri 2 desktop app** in beta (0.1.0), Windows first. Everything is encrypted on the person's own computer; there is no server, no account, no sync.

- `app/src-tauri/src/`: the **Rust core**. It owns the disk, the keys and the encryption (`crypto.rs`, `documents.rs`, `documents/copy.rs`, `users.rs`, `error.rs`); `lib.rs` lists the commands the interface may call.
- `app/src/`: the **interface**, TypeScript with **no framework**, one folder per area:
  - `core/`: the bridge to Rust (`storage.ts`), i18n, HTML sanitizing, shared pieces
  - `workspace/`: sidebar, projects, panes, search, trash, shortcuts (`state.ts` holds shared state)
  - `page/`: the page and what is written on it (`pane.ts`, `history.ts`, tables, boxes, export)
  - `drawing/`: ink, tools, colors (`ink.ts`)
  - `ideas/`: about this idea, roots, roots map
  - `space/`: sign-in, lock, security, settings, skies
  - `locales/{en,es,pt}/`: every interface text; `styles/`: one CSS file per area, imported by `styles.css`
- `app/e2e/`: Playwright tests. `docs/`: vision, plan, design, architecture. `index.html` at the root is the landing page, not the app.

## Commands

All from `app/` (Node 22, Rust stable):

```bash
npm ci
npm run dev            # interface only, in the browser, with an in-memory copy of the core
npm run tauri dev      # the real app
npx tsc --noEmit       # types
npm run lint           # ESLint (typescript-eslint, type-checked)
npm test               # Vitest unit tests (next to each file, *.test.ts)
npm run e2e            # Playwright, against the browser preview
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI (`.github/workflows/checks.yml`) runs exactly these. Run them all before calling a change done.

## Rules that are not negotiable

- **The core keeps the secrets.** The interface never touches the disk, keys or plaintext files; it asks the core. Never weaken the CSP in `tauri.conf.json`, add Tauri permissions, or load anything from the network.
- **Document content is untrusted.** HTML goes through `core/sanitize.ts`; never insert it with `innerHTML` unsanitized.
- **The browser preview mimics the core.** `npm run dev` and the e2e tests use `browserPreviewStorage()` in `core/storage.ts`; when a core rule changes, change the preview too (a test checks they match).
- **Errors are decided by code**, not by message (`locked`, `conflict`, `invalid_input`…; see `docs/12-architecture.md`).
- **Stored values never depend on the language** (color names, sky ids, formula names).

## How the code is written

- **Everything in English:** code, comments, docs, commits.
- **Every interface text in three languages:** add the key to `locales/en/` (the reference), `es/` (Spanish, *tú*) and `pt/` (Brazilian Portuguese, *você*). TypeScript and a test reject missing keys or placeholders. Tone: [docs/03-voice.md](docs/03-voice.md).
- **Comments say why**, not what.
- **A fix comes with a test** that would have caught it. Tests sit next to the file they test.
- **Match the surrounding code**; no new dependencies or frameworks without a strong reason. Look in `core/` before writing a helper.
- **Modest computers:** measure before and after anything that could get slower (drawing, saving, long documents). Repaint only what changed.
- **Docs follow the code:** when behavior changes, update `app/README.md` and, if it touches a guarantee, `docs/12-architecture.md`.

## Design (read [docs/10-design.md](docs/10-design.md))

- **Calm and minimal on purpose:** no streaks, badges, notifications or tricks to bring people back. A change that makes the app louder is not accepted.
- **No new keyboard shortcuts** unless asked; the existing ones are in `workspace/shortcuts.ts`.
- **Be honest in docs:** say what exists today and what is only an idea. Stages 2 to 5 (`docs/stages/`) are ideas, not plans.

## Commits and releases

- Small commits with a sentence that says what changed for the person using the app.
- Never force-push or rewrite the history of `main`.
- A release: raise the version in `app/package.json`, `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml`, add its section to `CHANGELOG.md`, then run the **Release** workflow (or push a `vX.Y.Z` tag).
