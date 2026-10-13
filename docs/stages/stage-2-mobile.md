# Stage 2: Safe space on mobile

> **Status: TODO.** It will be planned in detail when stage 1 is about to finish.

## Goal

Bring the safe space to the phone, to reach people who don't have a PC. For many people with few resources, the phone is their only device with internet.

## What we already know

- The **same Rust core** from stage 1 is reused.
- **Android** first, which covers most low-end devices; then **iOS**.
- The mobile performance budget from [Technology](../07-technology.md) applies: Android 8 or later, 2 GB of RAM and under 15 MB.
- **End-to-end encrypted sync** between PC and phone arrives: the server only stores encrypted blocks.
- The same features as on PC: no "lite" version.

## Questions to answer before starting

- UI with Tauri mobile or native Kotlin? Decided by measuring a prototype on a cheap Android phone.
- How is sync designed so it uses little data and works with an unstable connection?
- How are conflicts resolved if the same idea was edited on two devices while offline?
- What happens on a phone shared by several people?
- How much does it cost to maintain the sync server, and who pays for it?
