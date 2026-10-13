# Plan

The order in which OuraBox is built. Each stage has a **goal** and an **exit criterion**: you don't move to the next one without meeting it. Only stages 0 and 1 are under way; stages 2 to 5 are ideas, and may never be built.

| Stage | What | Platform | Status |
|---|---|---|---|
| 0 | Foundations | Documents | In progress |
| 1 | Safe space: validation | PC | In progress: app in beta |
| 2 | Safe space: mobile | Android, then iOS | [Idea, not started](stages/stage-2-mobile.md) |
| 3 | Community | Web | [Idea, not started](stages/stage-3-community.md) |
| 4 | Companies | Web | [Idea, not started](stages/stage-4-companies.md) |
| 5 | Remote worldwide events | Web | [Idea, not started](stages/stage-5-events.md) |

---

## Stage 0: Foundations

**Goal:** before writing code, be clear about what OuraBox is, what it believes in and how it's built.

- [x] Vision
- [x] Philosophy
- [x] Voice
- [x] The three spaces
- [x] Lessons from others
- [x] Technology (first version)
- [x] Plan
- [x] The safe space (first version)
- [x] Design (first version)
- [x] Economic model (first version)
- [ ] Confirm the decisions marked "Proposed" in [Technology](07-technology.md), [The safe space](09-safe-space.md) and [Design](10-design.md)
- [ ] Choose which safe space features go into stage 1
- [ ] Define the validation criterion for stage 1
- [ ] Redo the landing page (`index.html`) based on the docs

**Exit criterion:** the stage 1 decisions are confirmed.

---

## Stage 1: Safe space on PC

**Goal:** check that the safe space works for real people, on modest computers.

### What beta means

The desktop app has been in **beta** since version 0.1.0. That means:

- **It can be used every day.** What's marked as done in this plan works and has tests.
- **It may have bugs** and may change shape without notice. Save an encrypted backup (in Security, inside Settings) every now and then, somewhere else.
- **Security has not had an external review yet** (see 1.3). The encryption follows what's described in [Technology](07-technology.md), but no one from outside has checked it yet.
- **It doesn't update itself** and the installer isn't signed: Windows may warn that it's from an unknown publisher. Each new version is installed by hand.
- **Some features are missing** that are already planned, like exporting the whole space to readable formats and deleting everything (see 1.1).

It leaves beta when this stage's exit criterion and the external security review are met.

**Priorities:** first, what the person does on their PC with OuraBox ([The safe space](09-safe-space.md)) and how it feels ([Design](10-design.md)), with the focus on **the everyday experience**: the page, the list and everything the person uses for hundreds or thousands of hours. AI comes almost last.

### 1.0 Technical prototype

The smallest possible proof that the architecture works.

- [x] Tauri project with a Rust core (in [`app/`](../app/))
- [x] First document editor: write, draw and add images on the same page
- [x] Create a password and derive the key (Argon2id)
- [x] Save encrypted documents and read them back (XChaCha20-Poly1305)
- [ ] Measure on the minimum PC: size, memory and opening time. The first measurement, without graphics acceleration, doesn't meet the memory target (see [`app/README.md`](../app/README.md)).

**Exit criterion:** it meets the performance budget in [Technology](07-technology.md). If it doesn't, the architecture is reviewed before going on.

### 1.1 Minimum safe space (first priority)

- [x] **Projects:** folders with their files and their notes, kept apart
- [ ] **Quick notes:** capture an idea in under a second, without judgment and without questions. Notes already exist inside the app (Ctrl+Shift+N); capturing from anywhere on the PC is still missing (secondary).
- [x] **Deep ideas:** write, organize and come back to an idea, with its history
- [x] **Draw:** to organize ideas or to relax
- [ ] **Connections** between notes, ideas and drawings, without overwhelming
- [x] **The box:** a place in each idea to write down its assumptions
- [x] **Next step, attempts and ideas that come back** (see [The safe space](09-safe-space.md))
- [ ] **Design:** minimalist, calm and fluid, following [Design](10-design.md)
- [x] **Recovery key**
- [ ] **Export and truly delete everything.** The encrypted backup of the whole space already exists (it's saved wherever you want and opens on another computer); exporting the whole space to readable formats and deleting everything are still missing (each document can already be exported on its own).

### 1.2 Everyday experience (current priority)

What's used for hundreds or thousands of hours has to feel flawless before any new feature. Specific items are proposed and confirmed before they're built. No new keyboard shortcuts: they come last (see [Design](10-design.md)).

- [x] **Roots:** go deeper into a phrase to create a root beneath it, as deep as you want, with its assumptions and a map of the tree. For research and for building universes
- [x] **Search** everything or within a project, by name or content, tolerating typos
- [x] **Back exactly where you were:** when OuraBox opens, the documents that were open come back, along with the split view, and in each document the place you were reading, the cursor and the zoom
- [x] **Sidebar like a code editor's:** a strip of icons that's always there and a tree explorer
- [x] **The basics of Word, Excel and Canva, without recreating them:** formatting (alignment, font size and color), numbered and task lists, line, tables with calculations and series, shapes for drawing
- [x] **Export:** PDF or print, a PNG image of the drawing and text in Markdown
- [x] **Find in the open page** and **reading comfort** (book or modern typeface)
- [x] **Usability tweaks:** paragraph styles in one button, drawing behind the text and only inside the page, custom color picker, trash, everything inside a project ("Start a project") and renaming files
- [x] **More usability tweaks:** thick, transparent strokes without gaps, each stroke on its own layer (behind or in front of the text), eraser with its own size and strength, center guides for symmetrical work, stronger bold, bold/italic/underline/strikethrough and letter outline in one button, font size in points as in Word, page size (letter, A4, legal, square, 16:9 or custom), add/duplicate/remove pages, no pages added automatically by default, and all settings under the gear
- [x] **More complete and fluid drawing:** pen, blend (watercolor, blur, smudge) and eraser, each with its settings; redo; basic colors and palettes that can be pinned; the color you see when painting over something is the one that stays; no lag when scrolling with zoom and no flicker when opening the bar; the page doesn't grow when drawing at the edge; white outline and hollow letters that look right; the write/draw mode applies to all open files; search in the window or in a file; the light bulb outside the page and without the roots path above it
- [x] **Several users on one computer:** each one signs in with a username and password to their own encrypted space; the earlier space becomes a user without losing anything
- [x] **Testing on Windows, first round:** switching between documents with drawings without freezing; shapes like objects (move, resize, fill and outline, their own thickness and transparency, no arrow); notes that look like notes; eyedropper and drawing colors for text; blending at the page edge without white; bold or italics that wait for the next letter; book typeface by default, chosen from the top bar (Settings no longer has Reading); clearer hollow letters
- [x] **Three languages:** English, Spanish and Portuguese (Brazil), chosen in Settings or on the sign-in screen; the whole repository in English
- [ ] **More languages.** Each one is a folder of texts (see [Architecture](12-architecture.md)); to be decided which ones and who reviews each translation.
- [ ] **Proposed: micro-rewards that are worth it.** Small acknowledgments for valuable things, never for being online. See the proposal in [Design](10-design.md). It still has to be confirmed before it's built.
- [ ] **Empty the trash automatically** after a while (for example, 30 days), with a notice. Today it's emptied by hand.
- [ ] **Connections with Word, Excel and other tools** to go further without leaving OuraBox: export to `.docx` and `.xlsx` (a table), and open the result in the person's program. Using OuraBox shouldn't require being a professional; the connections are for whoever wants more.
- [ ] **A home screen that welcomes you each day:** where you were, the next step of the main idea and the idea that comes back. Calm, without pressure.
- [ ] **On hold: animated backgrounds.** A slight movement of the sky was tried and removed: it was barely noticeable and made the screen stutter when drawing a lot. It would only come back if it costs nothing on the minimum PC.

### 1.3 Security and validation

- [ ] External review of the security core
- [ ] First real users, starting with whoever created OuraBox
- [ ] Listen: do they come back? do they feel safe? does the space give them hope or overwhelm them?

### 1.4 OuraBox's voice (almost last)

- [ ] Invite the AI to a specific idea, with a clear notice of what is sent
- [ ] The AI answers in [OuraBox's voice](03-voice.md): cold but warm, showing the box and handing the question back
- [ ] A set of test ideas to check that the voice doesn't inflate, doesn't crush and doesn't put anyone in the box

**Exit criterion:** to be defined in stage 0. For example: a small group of people uses the safe space for several weeks, comes back on their own and says they feel safe.

---

## Stages 2 to 5

They are ideas, not commitments: nothing in them is built, and they may never be. Each one has a short document in [`stages/`](stages/), with what is thought so far and what would need answering before starting it. One would only be planned in detail if the previous stage is close to finished.
