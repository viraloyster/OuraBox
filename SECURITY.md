# Security

OuraBox keeps people's ideas encrypted on their own computer. A flaw that could expose them is the most serious kind of bug this project can have, so it gets handled first and privately.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub: on this repository, go to **Security → Report a vulnerability**. Only the maintainer sees it.

Useful to include:

- What an attacker could do (read a space, get the password or the recovery key, tamper with a document or a backup…).
- The steps to reproduce it, and the version or commit.
- What they would need first (the computer unlocked, a copy of the data folder, a backup file…).

You'll get an answer within a week. Once it's fixed, the report is made public with credit to you, unless you'd rather stay anonymous.

## What is in scope

- The encryption and the vault (`app/src-tauri/src/crypto.rs`, `documents.rs`, `users.rs`).
- Encrypted backups, and opening them.
- Anything that lets content in a document run code in the app (HTML sanitizing, the content security policy).
- Anything that leaves decrypted ideas on disk or on screen after locking.

How it is designed, and what it does and doesn't protect against, is in [The safe space](docs/09-safe-space.md) and [Architecture](docs/12-architecture.md).

## Versions

OuraBox is in [beta](docs/08-plan.md#what-beta-means): only the latest version gets fixes. Its encryption **has not had an external security review yet**; that review is required before calling it ready for production.
