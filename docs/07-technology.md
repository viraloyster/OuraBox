# Technology

OuraBox's technology is not chosen by taste: it follows from the [philosophy](02-philosophy.md). Every decision in this document has to be justifiable by a principle.

Legend: **Decided** means agreed; **Proposed** means recommended but still to be confirmed or measured.

## The two pillars

1. **Security.** The safe space holds a person's most valuable thing: their ideas. If someone suspects the platform can read them or keep them, they won't write them there. Trust is OuraBox's main asset.
2. **Optimization.** OuraBox is for "those who play better than Bayern and can't afford to eat". It has to work **in full** on modest computers. There is no "lite" version for some and a full one for others.

> **Rule:** OuraBox is developed and tested on the most modest computer, not the best. If a feature doesn't fit, it gets redesigned, not cut.

## Decisions

| # | Decision | Status | Why |
|---|---|---|---|
| T1 | **PC first to validate; Android and iOS later** | Decided | On PC it's easier to build and measure, and deep ideas are worked on with a keyboard. Mobile is the explicit stage 2, because many people with few resources only have a phone. |
| T2 | **The safe space is an installable app, not a web page** | Decided | Ideas live on the person's device, not on a server. |
| T3 | **Core in Rust** with all the important logic: encryption, storage and rules | Decided | Rust eliminates memory vulnerabilities by design and is very efficient: little memory, no garbage collector pauses. |
| T4 | **The core is designed for mobile from the start** | Decided | Nothing in the core can assume plenty of memory, a stable connection or a large screen. Moving to mobile should mean changing the interface, not rewriting what matters. |
| T5 | **Tauri for the PC app** | Proposed | Mature on desktop, lightweight compared to Electron and with a smaller attack surface. It connects directly to the Rust core. |
| T6 | **Thin interface in TypeScript, no framework** | In use, to be measured | The interface only displays and captures; it holds no sensitive logic. Without a framework it weighs 22 KB. If it grows too much, a lightweight framework (Svelte or SolidJS) will be evaluated. |
| T7 | **Local-first:** ideas live first on the device, encrypted | Decided | The technical expression of "ideas are private by default". |
| T8 | **No server in stage 1** | Proposed | On PC with a single device there's no need to sync. Fewer pieces, fewer risks. Sync arrives with mobile. |
| T9 | **End-to-end encrypted sync** (stage 2) | Proposed | The server only stores encrypted blocks it cannot read, like Signal or 1Password. |
| T10 | **AI on the server, only by explicit invitation.** It comes almost last | Proposed | A modest computer can't run a decent local AI; making it local would leave those who have least without AI. Only the chosen idea is sent, with a clear notice. |
| T11 | **Community and companies, on the web** | Decided | What is shared is, by definition, meant to be seen. |
| T12 | **Free software under the GNU AGPL-3.0** (that version only) | Decided | Trust is the main asset: anyone can check that the encryption does what it says. Every copy that is distributed or offered over the internet has to stay open, so no one can close OuraBox to charge for it or read ideas. The name and logo are outside the license; protecting them means registering the trademark (pending). The repository stays private until the external security review. |

## Security

### What "private" means in OuraBox (Proposed)

- No other person sees your ideas, not even the OuraBox team.
- Ideas are **never** used to train AI models.
- The AI only reads an idea when **you invite it**, and only that idea.
- You can export everything and truly delete it whenever you want.
- Your ideas are yours, legally and in writing.

### How it's protected (implemented in [`app/src-tauri/src/crypto.rs`](../app/src-tauri/src/crypto.rs))

- **Password → key:** the password is never stored. **Argon2id** turns it into a key, with 64 MiB of memory, 3 passes and a single thread (RFC 9106's recommendation for low-memory machines). It takes about 0.24 s on the development machine; on the minimum machine it still has to be measured. The parameters are stored next to the vault so they can be adjusted without losing access.
- **Master key:** documents are encrypted with a random 256-bit key. On disk it only exists "wrapped" (encrypted) twice: with the password and with the recovery key. Decrypted, it only lives in memory while the space is open, and it's erased on lock.
- **Encryption:** **XChaCha20-Poly1305**, secure and fast on any processor, even without hardware acceleration. It detects any tampering.
- **Each file bound to its name:** each document is encrypted with its identifier as associated data. If someone swaps or modifies files, they won't open.
- **Everything encrypted:** the documents, with their images and drawings, and the index with the titles. Nothing readable is left on disk; the tests verify it.
- **Audited cryptography:** only libraries from the RustCrypto project (`argon2`, `chacha20poly1305`). No home-made cryptography.
- **Memory:** passwords and keys are wiped from memory as soon as they're used (`zeroize`).
- **Changing the password** always asks for the current one, even if the space is open. Documents are not re-encrypted: only the master key's wrapping changes, and the recovery key stays valid.
- **Auto-lock:** after 5, 15, 30 or 60 minutes of inactivity, or never. By default, 15 minutes. Locking (by hand, with Ctrl+L or on its own) forgets the key like signing out; the door only remembers, in memory, who locked, to ask just for their password.
- **Deleting a user** asks for their password and a confirmation, and removes their whole space from the computer. Encrypted backups already made are not touched.
- **External review:** before real people store ideas, someone with security experience reviews the core. **Pending.**

### If you lose your password

It's the price of no one else being able to read your ideas, OuraBox included. That's why, when the space is created, OuraBox shows **only once** a 32-character **recovery key** (160 random bits). With it you can get in and choose a new password. If both are lost, the ideas cannot be recovered.

In Security you can create a new recovery key (it asks for the current password); the old one stops opening the space, although encrypted backups already made still open with the key they had.

**Recovering with email (optional, decided):** there's no "email recovery" that doesn't break privacy. If an email were enough to recover access, whoever controls that email (or an OuraBox server) could read the ideas. That's why OuraBox has no recovery server: it offers, only if the person asks, to open their email program with a message to themselves containing the key. OuraBox doesn't send or store anything; the key stays in the person's email, with the clear warning that whoever gets into that email and has their computer or a backup could open their space.

### What encryption doesn't cover yet

- **While the space is open**, the document on screen is decrypted in the computer's memory. That's unavoidable in order to display it.
- **Exporting takes the content out unencrypted** (PDF, image, text). It only happens when the person asks, through the system dialog and wherever they choose; OuraBox exports nothing on its own.
- **Auto-lock depends on the app being open:** it locks after the inactivity time the person chooses (15 minutes by default), also counting the time the computer was suspended. If "Never" is chosen, the space stays open until it's locked by hand or the app is closed.
- **Documents from the first version** are encrypted and deleted when the password is created, but deleting a file doesn't guarantee its data disappears from the physical disk. The same goes for deleting a user, although what stays there was encrypted.
- **Preferences** (chosen sky and stroke smoothing) are stored unencrypted. They contain nothing from the ideas.

## Optimization

### Performance budget: stage 1, PC (Proposed)

| Measure | Initial target |
|---|---|
| Minimum machine | Windows 10, 4 GB of RAM, mechanical disk (HDD), dual-core processor |
| Installer size | Under 15 MB |
| Memory in use | Under 150 MB |
| Opening the app | Under 3 seconds, on a mechanical disk |
| Capturing a quick idea | Under 1 second, with a global keyboard shortcut |
| Offline | The whole safe space works offline |
| Background | Nothing running without need |

### Performance budget: stage 2, mobile (Proposed)

| Measure | Initial target |
|---|---|
| Minimum device | Android 8 or later, 2 GB of RAM |
| Download size | Under 15 MB |
| Opening the app | Under 2 seconds |
| Capturing a quick idea | Under 1 second from opening the app |
| Mobile data | Sync sends only what changed, compressed |

### How it's met

- **Real modest test machines** are bought or obtained (an old PC and, in stage 2, a low-end Android phone).
- Performance is **measured**, not assumed. If a version makes the budget worse, it isn't released.

## Technical open items

- **Storage format:** today each document is a file encrypted with XChaCha20. If a database is needed in the future (search, connections), keeping the same per-record encryption will be evaluated.
- **Mobile interface:** Tauri mobile or native Kotlin. Decided in stage 2, measuring on a cheap Android phone.
- **AI provider:** which one, with what no-retention and no-training policy, and how it's funded without charging users (see [Economic model](11-economic-model.md)).
- **Visual effects:** which ones fit the performance budget (see [Design](10-design.md)).
- **Rust experience of whoever builds it:** sets the pace and how much external review will be needed.
