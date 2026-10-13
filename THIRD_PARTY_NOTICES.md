# Third-party notices

OuraBox is under the [GNU AGPL 3.0](LICENSE). It includes or builds on the work of other people, under these licenses:

## Shipped inside the app

| What | Used for | License | Copyright |
|---|---|---|---|
| [Inter](https://github.com/rsms/inter) (via `@fontsource-variable/inter`) | The interface's typeface | [SIL Open Font License 1.1](https://openfontlicense.org/) | Copyright 2016 The Inter Project Authors |
| [Dancing Script](https://github.com/googlefonts/DancingScript) (via `@fontsource-variable/dancing-script`) | Italics, as handwriting | [SIL Open Font License 1.1](https://openfontlicense.org/), with Reserved Font Name "Dancing Script" | Copyright 2016 The Dancing Script Project Authors |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | The shape of freehand strokes | MIT | Copyright (c) 2021 Stephen Ruiz Ltd |
| [Tauri](https://tauri.app) (`tauri`, `@tauri-apps/api`, `tauri-plugin-dialog`, `tauri-plugin-opener`) | The desktop window and its bridge to the core | MIT or Apache-2.0 | The Tauri Programme within The Commons Conservancy |
| [RustCrypto](https://github.com/RustCrypto) (`argon2`, `chacha20poly1305`, `sha2`) | Deriving the key from the password, encrypting, fingerprints | MIT or Apache-2.0 | The RustCrypto Project Developers |
| `serde`, `serde_json`, `uuid`, `zeroize`, `base64` | Reading and writing data, ids, wiping secrets from memory | MIT or Apache-2.0 | Their authors |

The fonts are used unmodified. The full text of each license comes with each package (`app/node_modules/<package>/LICENSE`, and for Rust crates, the crate's source).

## Only for building and testing

TypeScript, Vite, Vitest, Playwright, ESLint and typescript-eslint, jsdom: none of them are shipped inside the app. Their licenses (MIT and Apache-2.0) come with each package.

The full list of dependencies, with their exact versions, is in `app/package-lock.json` and `app/src-tauri/Cargo.lock`.
