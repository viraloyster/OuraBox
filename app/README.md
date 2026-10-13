# OuraBox: desktop app

OuraBox's safe space for PC (stage 1 of the [plan](../docs/08-plan.md)).

**In beta** (version 0.1.0): you can use it every day, but it may have bugs, its security hasn't had an external review yet and it doesn't update itself. Save an encrypted backup now and then. [What beta means](../docs/08-plan.md#what-beta-means).

## What it does today

- **Users:** one computer can have several users. Each one signs in with a **username and password** to their own encrypted space; nobody sees anyone else's space, or the users' names (names aren't written to disk). Another user is added from the sign-in screen ("Add another user") or from Settings. In Security, "Delete this user…" deletes the signed-in user and everything in their space on this computer, after their password and a confirmation; encrypted backups already made are not touched. Someone who already used OuraBox gives their space a username the first time, with their usual password, and everything stays as it was.
- **Everything encrypted:** the first time the app opens, a user is created with their password. Documents, their drawings, their images and the list of titles are saved encrypted; without the password nothing can be read. You can **lock** at any time (the padlock above the gear, "Lock" in Settings, or Ctrl+L): like a computer's lock screen, the door then shows your name and asks only for your password, with "Sign in as someone else" next to it. The name is kept only in the window's memory. **Sign out** (in Settings) forgets it and shows the usual door.
- **Recovery key:** shown only once, when the password is created. It lets you get in and choose a new password if you forget the old one. It can be copied and, **optionally**, saved in your own email: OuraBox opens the email program with a message to yourself, without sending or storing anything. In Security you can create a new key (the old one stops working).
- **Encrypted backup** (in Security): an `.ourabox` file with the whole space, encrypted, saved wherever you like (a USB stick, Google Drive). Without the password it is unreadable: you can't even see the names or how many documents there are. On another computer it is opened when creating a user ("Used OuraBox before? Open a backup"), with the password that was in place when the backup was made or with the recovery key.
- **Sidebar like a code editor's** (VS Code, Cursor): on the left, a strip of icons that is always there: Explorer, Search and Roots map at the top; Trash, **Lock** (a padlock) and the Settings **gear** at the bottom. Next to it, the chosen view. The explorer is a compact tree: project, files and notes, with an icon per type and indent guides for roots. Clicking the icon of the view that is already showing hides it.
- **Settings** (the gear, at the bottom of the icon strip): everything in one place. **Sky** (palettes), **Language** (English, Español or Português (Brasil)), **Security** (auto-lock after 5, 15, 30 or 60 minutes of inactivity, or never, 15 by default; encrypted backup; change password; recovery key; add another user; delete this user), who is signed in, **Lock** (also Ctrl+L) and **Sign out**.
- **Projects, one at a time:** above the list, a selector shows a single project; the others wait there, so as not to overwhelm. From the selector you switch projects or **add another one to the view** ("Also show"), to get inspired or move two forward at the same time. Each project keeps its **files** separate from its **notes**. Documents are moved by dragging them onto a project or with "Move to another project". **Everything lives in a project:** when OuraBox opens with no projects, the first thing that appears is "Start a project". Documents that used to have no project go into one called "General", which can be renamed.
- **Files and notes:** a file is for working on an idea seriously; a note, for something quick: it looks like a note, not a page (a small card, 460 px wide and only as tall as what it holds, with plain letters and its color as a strip along the top; no "About this idea"). Notes come **collapsed** ("Notes · 3") and open in chronological order, newest to oldest. Each note can have a **color** and a **label**. A note can be turned into a file.
- **Quick note** (button at the top right, next to Export): without leaving what you're doing, you write the idea, choose the **destination** (the current project or another one) and send it. It stays **pending**, with a dot, until you open it.
- **The list hides itself** when you touch the page, to give the idea all the space; the icon strip stays at hand. The pin button **pins** it if you want it always in view.
- **Roots:** on any page, select a phrase and click **"Go deeper"**: a root is born, a page of its own below the previous one with its assumptions, and you move down to it with a smooth motion (the sky darkens slightly with each level). You can go deeper as many times as you like. The phrase stays marked ("Go to this root") and, in the list, a document with roots unfolds like a folder and shows where each one comes from. The **roots map** (in the icon strip) draws the project's tree with each root's assumptions. It's useful for researching in depth and for building story universes.
- **Search** (the magnifying glass in the strip): across all projects, in just one, or **in what's open**: with several files in view, in all of them together ("in the window") or only in one chosen by name (it marks each match and takes you to it, on its page); in the name and the content, or only in the name. It finds things even when written differently: without accents, by how they sound in Spanish (b/v, s/z/c, silent h, n/m before p/b) and with one or two letters of difference. Searching "ciempies" finds "cienpies". No AI or libraries: the text is decrypted only in memory while you search.
- **Back exactly where you were:** when OuraBox opens, the documents that were open come back (also the split view and the list hidden or visible), and each document opens at the spot where you were reading, with the cursor where you left it and its zoom. It's stored only on this computer, and only ids and positions: nothing readable from the ideas.
- **Pages** (pages button, at the top right, in files): letter size by default, or A4, legal, square, 16:9, portrait or landscape, or custom in centimeters. **Add a page below**, **duplicate** (text, drawing and boxes) or **remove** the page in view (if it has something on it, it asks for a second click). **No automatic page breaks:** if the writing goes past the last page, the page grows just enough; you can ask for pages to be added automatically. A soft line marks where each page ends, and when printing the paper has that size. Until you pick a zoom, the page fits the width of the panel by itself.
- **Deep zoom,** from 10% to 10,000%: with the buttons at the bottom right, Ctrl + mouse wheel (or pinching on the touchpad) or Ctrl+= / Ctrl+- / Ctrl+0. With a lot of zoom you can draw and write tiny details inside the same page: the pen width and the font of the boxes are measured on screen, so what you do while zoomed in stays small on the page. Each document remembers its zoom.
- **Free text boxes:** besides inline text, you can write anywhere on the page: double-click an empty spot or use the text box tool. A new box is as wide as what you write in it (it wraps only when the line gets long), until you widen it by hand from the right edge; it moves with its handle, and an empty box disappears by itself.
- **Blank documents** where you can write, draw or paint freely on the same page, and add images.
- **Up to four documents at once:** drag a document from the list onto the open page and it opens beside it. With two or three, they sit in columns; with four, in a two-by-two grid. **Write or Draw applies to all of them:** you draw from one to another without changing the mode in each. The dividers can be dragged; double-click evens them out.
- **About this idea** (the small light bulb above each page, outside it so it doesn't cover anything; closed by default): what I want to achieve, a single next step (it appears above the page), the box ("What are you taking for granted?"), the attempts and the history ("See how it grew").
- **Ideas that come back:** at most once a day, an idea that has been still for a while appears gently: pick it up again, let it rest or let it go.
- **Letting go is not deleting:** ideas you let go wait, collapsed, at the end of the list.
- **Trash** (in the icon strip): deleting a file, a note or a project moves it to the trash, never erases it right away. A document goes with the roots that were born from it; a project, with all its documents. From there it can be restored or deleted forever (with confirmation), one by one or by emptying it entirely.
- **Rename files and notes** however you like ("Rename", when hovering in the list). With a name set, the title no longer changes with the first line; leaving it empty goes back to the automatic title.
- **Writing:** a "B" button that opens with one click gathers **bold** (clearly marked), **handwritten italics** (handwriting-style font, Dancing Script, included in the app), underline, strikethrough and the **letter outline** (thin, medium or thick, with its color, or hollow letters). Next to it, the **font size in points**, like in Word: type it (6 to 96) or pick it from the list. Title, subtitle and normal text are in a single button ("Aa") that opens with one click and shows how each one looks. In **Format**: alignment (left, center, right, justified) and font color (the palette colors, which follow the sky, plus the pen's basics and favorites). A style chosen with nothing selected (bold, italics…) waits for the next letter, even after clicking somewhere else on the page. Hollow letters are not spell-checked, so a misspelled word doesn't lose its outline. In **Insert**: numbered list, **task list** (checkboxes you tick with one click), table and divider line. Just enough for a CV, a letter or tidy notes, without recreating Word.
- **Tables with math:** a cell that starts with "=" calculates: `=B2*C2`, `=SUMA(B2:B5)`, `=PROMEDIO(…)`, `MIN`, `MAX`, `CONTAR`, `REDONDEAR`, `ABS` (also in English), with percentages and parentheses. It reads numbers written the Spanish way ("1.250,5"). Tab moves to the next cell. The table bar adds or removes rows and columns, **fills series** downward (1, 2… · Monday, Tuesday… · January, February… · "Item 1", "Item 2"…) and adds a **total** row with the sum of each column. Without recreating Excel.
- **Fluid drawing,** with a single simple pen: with a digital pen the stroke responds to pressure; with a mouse, pressure is simulated from speed. The **width** can be chosen freely (1 to 60), as can the **transparency** (from solid to 95% transparent), and the **color** too: its own large picker, with a saturation and brightness square, a hue bar and the color code, instead of the system's old picker. You can **pin up to 21 favorite colors** (right-click to remove one). The palette colors adapt to the sky, and black is drawn light on dark skies so it doesn't disappear (it stays black in exports and prints). At the top, 12 **basic colors** (black, white, gray, red, orange, yellow, green, turquoise, blue, purple, pink and brown). And **Color palettes** opens a separate panel with ready-made palettes (pastel, earth, ocean, forest, sunset, skin, vivid and grays): it hides when you click outside or can be **pinned** to keep it at hand while you draw (right-click a color: to favorites).
- **Each tool with its own settings:** the drawing bar has **Pen**, **Blend** and **Eraser**; one click picks the tool and opens its settings right below. The pen always goes back to drawing normally (freehand). **Undo** and **Redo** are side by side.
- **Blending colors**, in three ways: **watercolor** (paints with the chosen color and mixes with what's underneath, like pigments: yellow over light blue gives green, with soft edges), **blur** (melts the colors wherever you pass) and **smudge** (carries the color in the direction you move the stroke, like with a finger). With their own size and intensity. It's saved like the rest of the drawing: it looks the same when reopened, exported and printed.
- **An eraser like Paint's:** it erases exactly where it passes, also with zoom and on large drawings, without stuttering. It has its own **size** and **intensity**, in its own panel: at lower intensity, it lightens instead of erasing completely. Undo reverts a stroke as well as an eraser pass.
- **One undo for the whole document:** Ctrl+Z undoes the last thing done, whether it was writing or drawing, in either mode, in the order it was done (text typed in one go is undone at once). Ctrl+Y or Ctrl+Shift+Z redoes. In other fields (a name, the search) Ctrl+Z works as usual.
- **The drawing goes behind the text,** truly between the paper and the letters: they read on top, and a white outline or hollow letters look good over a drawing. What you see while drawing is what stays when you lift the pen, even if you paint over another color. You can draw on top of the text (in the pen panel), and **each stroke remembers where it was drawn**: changing the option doesn't move what's already drawn, so you can interleave as you like. A thick, transparent stroke leaves no gaps or spikes, even if the hand zigzags. You only draw inside the page: a stroke doesn't start outside, and what goes past the edge isn't shown. Drawing down to the bottom edge doesn't make the page bigger. With zoom, when scrolling, the drawing moves together with the text, without lag, and it doesn't flicker when the sidebar opens.
- **Shapes, like objects:** lines, rectangles and ellipses (with Shift: squares, circles and straight lines), with their own **thickness** and **transparency** (apart from the pen's), an **outline** in the chosen color and, for rectangles and ellipses, a **fill** (with or without outline). When released, a shape stays **selected**: drag it to move it, pull its handles to resize it, change its color, outline, fill or transparency from the panel, or remove it with Delete; a click on any shape (with a shape chosen) selects it again. Each change can be undone. Arrows drawn before still show. With the **center guides** on (in the shapes panel), a shape snaps to the center of the page and a line stays straight, with a dotted guide meanwhile: for symmetrical work. That also works on shapes already drawn: moving one centers it, and pulling a side makes it mirror the other side. Together with text boxes, it's enough for a logo or a quick image, without recreating Canva.
- **Export** (button at the top right): **PDF or print** (only the page, with paper colors; the PDF is saved from the same dialog), **drawing image** as PNG with a transparent background (the drawing and its text boxes, nice and sharp) and **text** as Markdown. What's exported leaves the encrypted space: it only happens when you ask for it and wherever you choose.
- **Typeface of the pages:** book style by default, or modern, from the letter panel ("B") in the top bar. The size of each part of the text is set from the top bar too.
- **Colors:** the chosen color has a centered ring; the basics come in two rows. The **eyedropper** (next to the color code) takes a color from anywhere on the screen (or, where the system doesn't offer it, from the page with a click). The **text color** menu also offers the pen's basics and favorites.
- **Optional stroke correction**, off by default (in the pen panel): without it, the line follows the hand exactly.
- **Icon-only buttons:** if you leave the mouse over one for a second, the button says what it is. Colors and width open the same way, after a second (or with a click). A panel opened with a click stays until you click outside, press Esc or click its button again; one that opened by itself closes when the mouse leaves. The bar is the same size when writing and when drawing, so the buttons never move under the cursor.
- **Skies:** 9 palettes, each with its own background sky (clear, morning, pink afternoon, intense sunset, gray day, rainy, storm, blue hour and starry night), plus an automatic option. The drawing colors adapt to the chosen sky. The background is still: two soft lights, drops in the rainy one and stars at night, with nothing that moves or uses resources while you work.
- **Images:** with the button, by dragging or by pasting them. They are scaled down to a maximum of 1600 px and saved encrypted separately from the document, only once even if used in several places.
- **Automatic saving**, with no save button.
- An interface with glass panels over the sky and typefaces included in the app, not downloaded from the internet: Inter and, for italics, Dancing Script (both under the free OFL license).
- Respect for anyone who turns off animations or asks for less transparency in their system.
- **Three languages:** English, Spanish and Portuguese (Brazil). The first time, OuraBox speaks the system's language if it's one of the three, and English otherwise. It can be changed in Settings › Language, or on the sign-in screen before creating a space (except while the recovery key is on screen, since it's shown only once). Changing it reopens the window in a moment, after saving everything, and you come back to the same place. What you wrote is never translated. Table formulas accept their names in all three languages (`SUM`/`SUMA`/`SOMA`, …).

### Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | New file, in the current project |
| Ctrl+Shift+N | New note, in the current project |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / zoom out / back to 100% |
| Ctrl + mouse wheel | Zoom in or out from the pointer |
| Ctrl+L | Lock (the door asks only for your password) |
| Ctrl+Shift+D | Switch between writing and drawing |
| Esc | Back to writing |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / redo the last change to the document, written or drawn, in either mode |
| Ctrl+B / Ctrl+I / Ctrl+U | Bold / italic / underline |

## What it does NOT do yet

- **The external security review is missing**, which the plan requires before other people store real ideas.
- No sync between devices and no mobile app: everything lives on one computer (moving it means an encrypted backup).
- Exporting the whole space to readable formats, and deleting everything at once, are still missing (each document can be exported, and the encrypted backup covers everything).
- Images sit in the text flow; they can't be moved freely around the page yet (text boxes can).
- There is no customizable profile (optional feature, for later).
- There is no AI (if it comes, it comes almost at the end; first, the everyday experience).

## How it's built

The interface lives in `src/`, one folder per area: `workspace/` (the sidebar, projects, panes), `page/` (the page and everything you write on it), `drawing/`, `ideas/` (about this idea, roots), `space/` (signing in, security, settings, skies) and `core/` (the bridge to the Rust core, languages and shared pieces). Each test sits next to the file it tests. The Rust core is in `src-tauri/src/`.

| Part | Where | What it does |
|---|---|---|
| Encryption | `src-tauri/src/crypto.rs` | Argon2id to turn the password into a key and XChaCha20-Poly1305 to encrypt. See [Technology](../docs/07-technology.md#security). |
| Backups | `src-tauri/src/documents/copy.rs` | The encrypted backups: writing them in sealed chunks and opening them by checking everything before touching the space. |
| Users | `src-tauri/src/users.rs` | One encrypted space per user, found by a fingerprint of the username; names aren't stored. |
| Rust core | `src-tauri/src/documents.rs` | The vault (create, unlock, lock and recover), the documents and the encrypted projects. It writes atomically and only accepts its own identifiers, so nothing can read or write outside its folder. It encrypts the documents that the first version saved unencrypted. |
| Sign-in screen | `src/space/lock.ts` | The screens to create a user, sign in, unlock after a lock and recover access. |
| Security | `src/space/security.ts` | Auto-lock after inactivity, password change and deleting the user. |
| Errors | `src-tauri/src/error.rs` | Errors with a code (`locked`, `conflict`…), so the interface can react to each case. |
| Bridge | `src-tauri/src/lib.rs` | The commands the interface can ask the core for. The ones that touch the disk run off the window's thread. |
| Interface | `src/` | TypeScript with no framework, to keep it as light as possible. |
| Workspace | `src/main.ts` and the modules it wires | `main.ts` only starts the app. `state.ts` holds what is shared; `workspace.ts` the panes and split view; `explorer.ts`, `projects.ts`, `documents.ts`, `trash.ts`, `searchpanel.ts`, `quicknote.ts` and `rootsmap.ts` the sidebar; `toolbar.ts`, `lettering.ts`, `sheets.ts`, `drawtools.ts` and `colorpanel.ts` the bar and its panels; `session.ts` signing in, locking and deleting the user; `shortcuts.ts` the keyboard. |
| Styles | `src/styles.css` | Only imports `src/styles/*.css`, one file per area, in cascade order. |
| Pane | `src/page/pane.ts` | One page with its document, its drawing, its mode, its zoom and its saving. |
| Undo | `src/page/history.ts` | One history per document for text and drawing, in the order things were done. |
| Roots | `src/ideas/roots.ts` | The map: builds the tree, places each card above its roots and draws the curves. |
| Search | `src/workspace/search.ts` | Compares words without accents, by sound and by Damerau-Levenshtein distance. All in memory. |
| Text boxes | `src/page/boxes.ts` | Creating, moving and widening them (a new one follows its text until it's widened by hand). The text is laid out at normal size and the whole box is scaled down, so it looks sharp at any scale. |
| Pen | `src/drawing/colors.ts` | The favorite colors and the last color and width. |
| Names after a second | `src/core/hints.ts` | A button's name, or the color and width panel, when the mouse rests over it for a second. |
| Back where you were | `src/core/place.ts` | Remembers the reading spot, the cursor and the zoom of each document, and what was open. |
| Drawing | `src/drawing/ink.ts` | Strokes are saved as points, not as an image. Three canvases inside the page that cover what's visible plus a margin: the strokes behind the text, the ones on top, and one for the pen, the eraser and the guides. Watercolor, blur and smudge are painted with the canvas (multiply, blur and soft dabs). The stroke shape uses [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT). |
| Skies | `src/space/themes.ts` | The 9 palettes and their skies. The tests check the contrast of each one. |
| HTML cleanup | `src/core/sanitize.ts` | When a document opens, only formatting tags and embedded images are kept, so no content can run code inside the app. |

The architecture and its guarantees (atomic saving, revisions, errors) are in [Architecture](../docs/12-architecture.md).

The app also limits what the window can do: a content security policy (CSP) that doesn't allow loading anything external, and only the minimum Tauri permissions.

## Requirements

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Node.js](https://nodejs.org/) 22 (the version the checks use)
- Tauri's system dependencies for your operating system: <https://tauri.app/start/prerequisites/>

## Usage

```bash
cd app
npm install

npm run tauri dev               # opens the app in development mode
npm run tauri build             # builds the installer for your system
npm run tauri build -- --no-bundle   # only the executable

npm test                        # interface tests
npm run lint                    # ESLint: promises and other mistakes TypeScript lets through
npm run e2e                     # end-to-end tests in a browser (Playwright)
cd src-tauri && cargo test      # core tests
```

**Publishing a version:** raise the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, add its section to [CHANGELOG.md](../CHANGELOG.md), and push a tag like `v0.2.0` (or press **Run workflow** on Release, in the Actions tab). The Release workflow (`.github/workflows/release.yml`) runs the tests, builds the Windows installer and publishes it on [Releases](https://github.com/viraloyster/OuraBox/releases) with its checksum.

`npm run dev` opens only the interface in the browser, to work on the design. In that mode documents live in the tab's memory and are lost on reload: it's not the real app.

## Initial measurements

Measured on Linux, on a virtual display without graphics acceleration:

| Measure | Result | Target ([Technology](../docs/07-technology.md)) |
|---|---|---|
| Executable, first version | 3.7 MB | Installer under 15 MB |
| Executable, with backups and email | 5.2 MB (the file dialog and the link opener add ~1.5 MB on Linux) | Installer under 15 MB |
| Interface (HTML, CSS and JS), version 0.1.0 | ~350 KB uncompressed (~95 KB compressed), plus ~20 KB per language and 198 KB of fonts | — |
| Memory, first version | ~165 MB the main process and ~380 MB the web engine | Under 150 MB |
| Memory, with skies and glass | ~150 MB the main process and ~510 MB the web engine | Under 150 MB |

Memory **does not meet the target**, and the frosted glass pushed it up. These measurements overestimate real usage, because everything is drawn in software, without a graphics card, but they aren't enough to rule it out: it has to be measured on Windows and on the real minimum PC. If the glass turns out to be expensive, it is replaced with solid panels on those machines (see [Design](../docs/10-design.md)).
