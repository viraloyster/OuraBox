# Contributing

Thank you for wanting to help. OuraBox is small and in [beta](docs/08-plan.md#what-beta-means), so the best help right now is using it and saying what got in the way.

## Before you start

- **Read the idea first:** [Vision](docs/01-vision.md), [Philosophy](docs/02-philosophy.md) and [Design](docs/10-design.md). OuraBox is calm on purpose: no streaks, no notifications to bring people back, no tricks to keep them inside. A change that makes it louder won't be merged, however clever it is.
- **For anything bigger than a fix, open an issue first** and say what you'd like to do. That way no one spends a weekend on something that doesn't fit.
- **Security problems are never reported in a public issue:** see [SECURITY.md](SECURITY.md).

## Getting it running

You need Node.js 22, Rust (stable) and, on Linux, the libraries Tauri asks for ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
cd app
npm ci
npm run tauri dev      # the real app
npm run dev            # only the interface, in the browser, with an in-memory copy of the core
```

## Before opening a pull request

The same checks run on every push (`.github/workflows/checks.yml`):

```bash
cd app
npx tsc --noEmit                              # types
npm run lint                                  # ESLint
npm test                                      # interface tests
npm run e2e                                   # end-to-end, in a browser
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## How the code is written

- **Everything in English:** code, comments, docs and commit messages.
- **Comments say why**, not what: why it is done this way, what it avoids, what was measured.
- **Every interface text goes in the three languages** (`app/src/locales/en`, `es`, `pt`). English is the reference; a test checks that all three have the same keys. Spanish uses *tú*, Portuguese is Brazilian (*você*). The tone is in [Voice](docs/03-voice.md).
- **The core keeps the secrets:** the interface never touches the disk or the keys ([Architecture](docs/12-architecture.md)).
- **It has to work on modest computers:** measure before and after when something could get slower.
- **Tests:** a fix comes with a test that would have caught it.

## License of contributions

OuraBox is under the [GNU AGPL 3.0](LICENSE) (`AGPL-3.0-only`). By sending a contribution you agree that it is published under that same license. The OuraBox name and logo are not covered by the license.
