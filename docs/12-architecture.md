# Desktop app architecture

How the app is built inside, designed to work well in production: never lose data, never make typing stutter, and fail clearly. It complements [Technology](07-technology.md), which explains the reason behind each choice.

## The pieces

```
Interface (TypeScript, app/src/)                     Core (Rust, app/src-tauri/src/)
───────────────────────────────────────────          ─────────────────────────────
main.ts       startup and wiring                     lib.rs        commands
workspace/    what the workspace shares (state.ts),  users.rs      users: one space per person
              panes and split view, the sidebar      documents.rs  vault and documents
              (explorer, projects, documents,   ⇄    crypto.rs     encryption
              trash, search), quick note, keyboard   error.rs      errors with a code
page/         a pane and its page (pane.ts): text
              formatting, tables, text boxes,
              pages, one undo (history.ts), export,
              the toolbar
drawing/      the drawing layer and shapes (ink.ts),
              pen, blend, eraser and colors
ideas/        about this idea, roots and their map,
              ideas that come back
space/        sign-in, locking, security, settings,
              skies
core/         bridge to the core (storage.ts),
              languages (i18n.ts), images, places,
              hints, HTML sanitizing
locales/      texts in en, es, pt
styles/       one stylesheet per area (styles.css
              imports them in order)
```

**Golden rule:** the interface never touches the disk or the keys. Everything sensitive (encrypting, saving, validating) happens in the Rust core. The interface only displays and captures.

## Data on disk

### Users

Each person who uses OuraBox on the computer has their own space: their vault and their documents, in `users/<fingerprint>/`. The fingerprint is SHA-256 of the username (case-insensitive, without extra spaces) mixed with a salt specific to the computer (`users/device.salt`). Names aren't stored anywhere: looking at the disk you can't tell who uses OuraBox, and to get in you have to type the name. A user that doesn't exist gives the same error as a wrong password ("Incorrect username or password") and takes the same time, because the Argon2id computation is done anyway. With a user signed in, the core only serves their space; on lock or sign-out the key is forgotten. Locking and signing out are the same for the core: only the interface keeps, in memory, the name of who locked, so the door asks just for the password. Deleting a user (`delete_user`) asks for their password, forgets the key, removes the vault first (so a half-finished deletion can no longer be opened or counted as a user) and then the whole folder; with no users left, the door goes back to creating the first one. What the window remembered for that user in local storage (keys marked with their fingerprint) is removed too.

The space from before users existed (a single password, in `documents/`) stays where it was until the person gives it a username with their usual password: then the password is checked and the whole folder is moved, without opening or rewriting anything, to `users/<fingerprint>/`.

### Inside each space

In each user's folder:

| File | Contents | Encrypted |
|---|---|---|
| `vault.json` | The master key wrapped with the password and with the recovery key, and the Argon2id parameters | The key is encrypted; the rest isn't secret |
| `<id>.obx` | A document: text, free text boxes, drawings, why, next step, assumptions, its status, the root it grows from and, for notes, label, color and whether it's unopened. Images are only referenced by their id | Yes, bound to its `id` |
| `index.obx` | The summaries: title, dates, revision, attempt, status (let go, resting), project and type (file or note) of each document | Yes |
| `projects.obx` | The projects: id, name and date | Yes |
| `assets/<fingerprint>.obx` | An image. Its name is the SHA-256 fingerprint of its content: the same image is stored only once | Yes, bound to its fingerprint |
| `.restoring/` | Only while a backup is being opened: the files already checked, before they move into the space | Yes (they're the same encrypted files) |
| `history/<id>/<date>-<revision>.obx` | An earlier version of a document. At most one every 5 minutes of work; empty documents don't generate versions | Yes, bound to the document and to the version |

Each document carries:

- **`revision`:** how many times it was saved.
- **`format`:** the format version, to be able to migrate in the future. A document from a newer version of OuraBox is rejected instead of being misread.

Outside the core, in the window's local storage, the interface stores **unencrypted** only preferences and positions (what belongs to each user, like what's open and what's unfolded, carries their session's fingerprint, not their name; the sky, reading and pen settings belong to the computer): which projects are unfolded, which documents were open, and for each document the reading position, the cursor (as a character count) and the zoom. They're ids and numbers, never text from the ideas; even so they reveal how many documents were visited, and they're mentioned here for the sake of precision.

## Guarantees

### A half-done save is never lost
Each write goes to a temporary file that is synced to disk and then renamed over the original, which is an atomic operation. On Linux and macOS the folder is also synced, so the rename survives a power cut.

### An old version never overwrites a newer one
Each save includes the revision it was made on. If there's already a newer one on disk, the core rejects the save with the `conflict` error, instead of overwriting. In addition, the interface never opens the same document in both panes: if it's already open, it activates the pane showing it.

### Typing never stutters because of saving
Commands that touch the disk or encryption run outside the window's thread. Encrypting and syncing to disk can take a while on a modest computer, but it doesn't block typing.

### Encrypted backups that can't be tampered with
A backup (`.ourabox`) carries the vault and all of the space's files, which are already encrypted, inside a second layer sealed with the master key: that way the file names, how many there are and their dates can't be seen. The only thing visible is the total size.

The second layer goes in 1 MB chunks. Each chunk is bound to the backup's id, to its number and to whether it's the last one, so they can't be reordered, mixed with another backup's chunks or truncated without it being noticed. When a backup is opened, everything is decrypted and checked in a separate folder, only paths that OuraBox writes are accepted, and the vault is written last: if anything fails, the space stays empty as it was. For now, a backup only opens into a new space; merging a backup with a space that already has ideas is left for later.

A backup opens with the password there was when it was made. If the password is changed afterward, earlier backups still open with the old one or with the recovery key.

### Searching without leaving a trace
To search, the core decrypts the text of all documents and hands it to the interface, which searches in memory. There's no search index on disk: nothing readable is stored. The text is forgotten when a change is saved (it's read again on the next search), when the search is cleared and on lock.

### Deep zoom without distorting anything
The page is scaled as a block (`scale`) and its frame takes up the scaled size, so scrolling reaches the whole page. The drawing canvases cover only what's visible (plus a margin). Two details make it work up to 10,000 %:

- **Tiny strokes:** the pen thickness is measured on screen, so with a lot of zoom the stroke is very thin on the page. The stroke library is designed for normal sizes and distorts tiny ones, so its outline is computed with the stroke enlarged to a normal size and drawn scaled down. Points are stored with four decimals.
- **Tiny letters:** the browser can't lay out letters at fractions of a pixel, so a box's text is laid out at normal size and the whole box is scaled down with `scale`.

### Erasing like in Paint, at any zoom

The eraser doesn't cut strokes: each pass is stored as one more stroke (`erase`), which when painted removes what was drawn before in that spot (`destination-out` on the canvas). That way erasing costs the same as drawing a line, no matter how large the drawing or the zoom, it erases exactly where it passes (also part of a stroke's thickness) and undoing means removing that pass. When erasing starts, a copy of how the layers look is kept (a screen-sized image); each frame starts from that copy and removes the whole pass, so the cost doesn't depend on how much has been drawn and the strength stays even. The eraser has its own size and its strength (the pass's `opacity`): below 100 %, it lightens instead of removing completely. A pass that touches no drawing isn't saved. Strokes also store their transparency (`opacity`); those saved before count as solid.

### Blending colors

A stroke can carry an effect (`effect`) instead of plain painting. Everything comes from the stored points, like the rest of the drawing:

- **Watercolor** (`watercolor`): the stroke is painted with `multiply`, which behaves like transparent pigments (yellow over light blue gives green). The soft edge is the stroke's shadow: the stroke is painted far away, outside the page, and only its blurred shadow falls in its place (it works in any browser, without filters).
- **Blur** (`blur`) and **smudge** (`smudge`) work on what's already painted on their layer, with dabs at an even distance along the stroke. At each dab a circle of what's painted is taken (blurred, or from the previous dab for smudge), a soft-edged mask is applied to it and that part is replaced: first it's removed (`destination-out`) and then added (`lighter`), so transparency is blended too. Adding points at the end doesn't change the earlier dabs: live, only the new ones are applied, and when reopened the result is exactly the same. Without browser filters, the blur is done by shrinking and enlarging again.

Effects don't count as drawing for the page size or for exporting the image.

Computing a blend is costly (hundreds of dabs), so it's computed **only once** and kept in memory as an image, at a resolution that doesn't depend on the zoom: the screen's, but never more than 2048 pixels on its longest side nor with a dab wider than 48 pixels (an effect is soft: more detail costs a lot and hardly shows). Watercolor is kept as its soft stroke, drawn with `multiply`. Blur and smudge are computed in an image of their own, not on the screen: what's under the stroke on its layer is painted there (earlier strokes, and earlier blends pasted as they were kept), the dabs are applied, and the result is kept together with a mask of where the dabs went. When pasted, only that area is replaced (`destination-out` with the mask, then `lighter` with the result): around it, what's on the layer stays sharp at any zoom. While the zoom is changing nothing is computed again, and the canvases aren't even repainted: they are inside the page, so they grow and shrink with it as images, and they are repainted at the new size 140 ms after the last step (the page itself is scaled as an image too while zooming, `will-change: scale`, and drawn sharp after). A blend that could look at least twice as sharp after zooming in is computed again later, one at a time, only if it's on screen and only when nothing else is happening (`requestIdleCallback`). Blends are also computed again when switching skies (the colors change), when moving pages, and when something under them changes (undoing or redoing a stroke, moving a shape): then only the blends above it that overlap it, and the ones over those. What's stored doesn't leave the computer: it only lives in memory.

Each pane also keeps the strokes of the last documents it showed (up to 6, within about 64 MB of computed blends): going back to one of them, if its strokes are the same as the saved ones, reuses their outlines and blends instead of computing everything again. And a repaint never spends more than 12 ms computing blends: the rest show up over the next frames (once one waits, the ones above it on its layer wait too, since each one is computed over what's under it). So switching between documents with many blends doesn't freeze the window.

At the edge of the page, blur and smudge only take what's inside the page: where a dab goes past the edge, the page's last row or column of pixels is stretched instead, so the emptiness outside never gets smeared in as white.

### Shapes as objects

A shape (`shape`: `line`, `rect`, `ellipse`; earlier `arrow`s still show) is a stroke with two points, its own thickness and transparency, and for rectangles and ellipses an optional `fill` (a color like `color`) and `outline: false` (filled, no outline; never without both). With a shape chosen, a click on a shape selects it: its box and its handles are drawn on the live canvas; dragging moves it or pulls a side or an end. Each change replaces the stroke with a new version in the same place: the history keeps added, changed and removed strokes, so undoing a move or a resize, or a removal (Delete), takes one step. If there are blur or smudge strokes, they're computed again after the change, since what's under them may have moved.

### Strokes without gaps

A freehand stroke is painted as a union of circles (one per point, with the radius given by the pressure) and of the segments joining each pair, all winding in the same direction, in a single fill. With the "nonzero" fill rule the pieces add up and never cancel out: even if the hand zigzags with a thick, transparent stroke, no gaps or spikes are left, and the transparency is even. The curve passes through every point (Catmull-Rom): without smoothing, it follows the hand exactly. From perfect-freehand only the point sampling and the smoothing are used.

### Formatting without opening doors

Text formatting (alignment, font size and color, task lists, table formulas) is stored in a few `data-` attributes with values from a closed list (`data-align="center"`, `data-color="coral"`, `data-size="14"`, `data-outline="medio"`…). Font size is in points, from 6 to 96, as in Word; each size has its own style rule, installed at startup, so `style` is never needed. The letter outline uses `-webkit-text-stroke` with the thickness and color in variables, so they combine even when they're in different spans. The HTML sanitizer keeps only those, on the tags where they make sense, and still removes every `style`, `class` and any other attribute: a document can't bring in foreign styles or code. Colors are palette names, so they follow the chosen sky. To apply size or color over a selection that spans paragraphs, the browser marks it with a made-up font and that mark is swapped for the attribute.

### Tables with calculations, without a spreadsheet

A cell with `data-formula` stores the formula and shows the result; entering the cell shows the formula. When a row or column is added or removed, formulas are rewritten to keep pointing at the same cells (a range shrinks; a cell that no longer exists gives an error; a row added right below the data is included in the total). A decimal comma ("3,5") or point both work, and arguments are separated with ";" (or a comma followed by a space). An error or a cycle spreads to the cells that use it. The calculations (`tablemath.ts`) are a small, pure parser: numbers, operations, cells, ranges and seven functions, named in English, Spanish or Portuguese, with cycle detection. Nothing is evaluated as code. The result stays written in the cell, so search and exports see it.

### Export: the only thing that leaves unencrypted

Exporting is the only way something leaves the space unencrypted, and always on request: the core (`save_export`) opens the system dialog, accepts only PNG, Markdown, text or HTML, up to 64 MB, and writes wherever the person chose. PDF uses the system print dialog ("Save as PDF" or "Microsoft Print to PDF"); since the canvases only cover the screen, right before printing the whole drawing is painted once as an image over the page, with paper colors.

### The trash doesn't change revisions

Moving something to the trash is a separate piece of data (`trashedAt`, the date), like the project or the label: it's changed without touching the revision and saving doesn't undo it, so an open pane doesn't conflict or take it out of the trash. A document goes along with the roots that grew from it, with the same date; when it's recovered, only those come back, not the ones that were already in the trash from before. A project in the trash hides its documents without marking them one by one. The core doesn't delete a project that isn't in the trash, and when deleting it, it deletes its documents and their history.

### The drawing, behind or in front of the text, stroke by stroke

There are two stroke canvases (behind and in front) plus one on top of everything that receives the pen and shows the eraser and the guides. All three go **inside the page**: the page is its own plane (`isolation: isolate`) and the back layer has `z-index: -1`, that is, between the paper and the letters; the front one, over the text and the boxes. That way the white parts of the text (an outline, a hollow letter) show over a drawing, which a color blend didn't allow. The canvases measure what's visible plus a margin above and below (35 % of the screen), always the same even when the zoom changes (creating them again is costly): when scrolling they move with the page without repainting, and they're only repositioned when what's visible comes within 96 px of their edge. Their size goes in steps of 128 px, and a canvas that is already big enough is kept unless it's much too big: opening or closing the sidebar usually changes nothing, and when something does change they're repainted in the same frame (resizing clears a canvas, so it's avoided). A layer that was empty and stays empty, and the top canvas when it shows nothing, aren't even cleared: touching a canvas makes the browser send all of it to the screen again. The stroke in progress is painted on its own layer: when it starts, a copy of how it was is kept and each frame starts from it, so what you see while drawing is what stays when you let go, even when painting over another color. Each frame repaints only the part that changed (the new pieces and the end that moves with the hand), with the pieces of the stroke that fall there filled together, so the transparency is applied once; the settled part of the stroke is computed only once (`LiveBrush`, tested to give the same stroke as computing it whole). The eraser works the same way. Each stroke stores which layer it was drawn on (`front`), so changing the option only affects what's drawn afterward and layers can be interleaved. The eraser removes on both layers. When printing, each layer goes as its own image. The drawing is clipped to the page and a stroke can't start outside it.

### Center guides

With guides on, while a shape is being drawn its end point snaps if it's within 8 screen pixels of: leaving the shape centered on the page, touching the middle line, or (for a line) being perfectly horizontal or vertical. Each page has its own center. While the shape is snapped, the dotted guides are shown. It's a pure function (`snapShape`), tested separately. A shape already drawn snaps too when it's moved (its middle or a side on the middle line) or resized (the side that moves mirrors the one that stays, or lands on the middle line): `snapDrag`.

### One undo

Each pane has one history for its document (`src/page/history.ts`): the drawing keeps its own changes and the history only marks them in line; the text is kept as it was (HTML and boxes) before each group of changes, and a pause of 0.8 s closes a group. Ctrl+Z, Ctrl+Y, the toolbar buttons and the browser's own Undo all go there, in either mode. Opening a document or changing its pages starts the history over: the drawing moves with the pages, and undoing from before would leave it out of place.

### Pages added by hand

Each file stores the size of its pages and how many it has (`sheet`: width and height in pixels at 96 dpi, count and whether they're added automatically). By default they're not added automatically: if what's written or drawn goes past the last page, the page grows just enough. Adding, duplicating or removing a page moves the drawing and the boxes of the following pages (each stroke belongs to the page where its center is). Since the text flows continuously, a blank space is added (or shrunk) between blocks of text (`<div data-space="alto">`), measured so that what's below stays at the same height as its drawing; the text itself isn't touched. Duplicating also copies that page's text blocks. When printing, the paper has the size of the pages. Earlier files count their pages from what they have the first time they're saved.

### Roots form a tree that doesn't break
Each document can grow from another (`parent`). That relationship is set when the root is created and, like the project, doesn't change on save: a pane with stale data can't undo it. That way cycles can't appear. A root inherits the project of the one it grows from; moving a document takes its whole branch, and separates it from the root it grew from if it ends up in another project. In the core, deleting a single document doesn't delete its roots: they stay loose in the project. (Through the trash, a document goes with its roots and is deleted with them; see above.) The roots map decrypts only that project's documents, in memory.

### Moving or organizing doesn't interrupt whoever is writing
A document's project and type (file or note) are changed with their own commands, which rewrite the document **without changing its revision**. On save, the core keeps the project and type the document already had, instead of the ones the pane sends. That way, moving an open document to another project doesn't cause a conflict on its next save, and a pane with stale data can't undo the move.

Removing a project first takes its documents out and then deletes it from the list: if something fails halfway, no document is left pointing to a project that doesn't exist.

### A pane's saves go in a queue
Each pane saves with a delay of half a second after the last change, and its saves go one after another. Before switching documents, locking or closing a pane, whatever is pending is saved.

### The index isn't read from disk on every save
While the space is open, the index lives in memory; on lock, it's forgotten along with the key. If the index file is missing or damaged, it's rebuilt by decrypting each document.

### Three languages, one reference

The interface text lives in `app/src/locales/<language>/`, one file per part of the app, and nowhere else. English is the reference: the Spanish and Portuguese files must have exactly the same keys (TypeScript rejects a missing or extra one), and a test checks that they use the same placeholders (`{count}`, `{name}`), that no text is empty and that every key named in `index.html` exists. Texts that change with a number have two forms (`one`, `other`) chosen with `Intl.PluralRules`; dates and numbers use `Intl` in the chosen language.

Only the chosen language is loaded: each one is its own small file in the build, like a language pack that comes with the app, so adding a language means adding a folder and a line in `LOCALES` (`i18n.ts`). Nothing is downloaded: OuraBox works offline and doesn't ask a server for anything.

The choice is saved on the computer (`ourabox.locale`); without one, the system's language is used if OuraBox speaks it, and English if not. Changing it saves everything and reloads the window: the space stays open in the core, so the person comes back to the same place without typing the password again. The texts the core shows by itself (the titles of the save and open dialogs, and the recovery email) are sent by the interface in the chosen language; without them, the core uses English.

Stored values never depend on the language: color names, sky ids, formula names and everything in the documents stay the same, so a document written in one language opens the same in another.

### Errors with a code
The core responds `{ code, key, message }`. The interface decides by the code, not by the text, and shows the message for the `key` in the person's language (`locales/<language>/errors.ts`); the `message` is the English text, for logs:

| Code | Meaning | What the interface does |
|---|---|---|
| `locked` | The space is locked | Goes back to the sign-in screen |
| `wrong_password` | Incorrect password or recovery key | Calm message |
| `conflict` | A save was attempted over a newer version | Warns and doesn't retry |
| `invalid_input` | Invalid data (short password, invalid id, document too large) | Shows the message |
| `not_found` / `corrupted` | The file doesn't exist or was tampered with | Shows the message |
| `io` / `internal` | Disk failure or unexpected error | Shows the message and retries on the next save |

## Tests

- **Core (Rust):** 61 tests. They cover encryption, vault, recovery, password change, revisions and conflicts, in-memory index, migration, tampered or swapped files, malicious identifiers, documents from future versions, roots (growing, moving as a branch, surviving the root they grow from), text boxes (being saved, validated, searched, and older ones keeping their width), label, color and pending state of notes, encrypted backups (password, recovery key, damaged, truncated or with malicious paths), new recovery key, email links that can't be broken by their text, projects (creating, renaming, moving without conflict, removing without losing documents), the text of tables and lines for search, the trash (documents with their roots, projects that can only be deleted from there), page size and each stroke's layer (being saved and validated), that a deleted document doesn't come back through a late save, and users (each with their own space, deleting one only with its password and without touching the others, unique names that aren't readable on disk, the same error for a wrong user or a wrong password, and the earlier space becoming a user), and the shape of errors (code, key and message).
- **Interface:** 157 tests. They cover HTML sanitizing (including links to roots, formatting attributes, size in points, outline and page spacing), font size typed by hand, a list made on an empty paragraph coming out of it, that a thick zigzag stroke leaves no gaps, center guides (also moving and resizing a shape), a stroke computed piece by piece being the same as computed whole, one undo for text and drawing, table calculations and series (also errors that spread, decimal comma and formulas that adjust when rows and columns are added or removed), exported Markdown, find in the open page, shapes, color blend dabs (even, and unchanged as the stroke continues), the roots map tree, the eraser's path at any zoom, deep-zoom tiny strokes, favorite colors, sky contrast, black ink painted light on dark skies (and kept black on paper), auto-lock, going back where you were, search, that the browser preview mimics the core's rules, and the languages (the same keys and placeholders in all three, plurals, numbers, choosing the language from the system, and formula names and day and month series in each language).
- **End to end (Playwright, `app/e2e/`):** 9 tests that drive the whole app in a browser, against the browser preview of the core: writing is saved and is back after signing out and in; drawing, undoing and redoing (also a first stroke while the side list slides away); one undo across writing and drawing; a long stroke; a shape deleted and brought back; locking (wrong and right password); deleting the user; and switching to Spanish. Any page or console error fails a test.
- **In CI** (`.github/workflows/checks.yml`, on Linux, on every push to `main` and every pull request that touches `app/`): typecheck, ESLint (only rules that catch mistakes, such as a promise whose error would be lost; no style rules), the interface tests, the end-to-end tests, and for the core `cargo fmt --check`, `cargo clippy` with no warnings and `cargo test`. The Windows workflow (`windows.yml`, on every push to `main` that touches `app/`) runs the unit tests again and builds the installer.

## What's missing for production

In order of priority:

1. **Cleaning up unused images.** Images are stored separately and shared between documents and history versions, so deleting a document doesn't delete its images. A collector that deletes the ones no one references anymore is missing.
2. **History limit.** Today every version is kept (at most one every 5 minutes of work). With years of use it'll be better to space them out further back: for example, one per day after a month.
3. **Partial saves.** With very long documents, sending the whole document on every save becomes expensive. The next step would be sending only the changes.
4. **Error log without content.** A local diagnostic file that records what failed, never what was written, so someone can be helped without seeing their ideas.
5. **Backups to a chosen folder (optional):** today the encrypted backup is made by hand. It could be added that the person, **if they turn it on**, chooses a folder (for example, the Google Drive one on the computer) where OuraBox leaves a new backup every so often. It's never on by default: storing something in the cloud is always the person's decision. Exporting to PDF, PNG and Markdown already exists; exporting the whole space at once and to Word is still missing.
6. **Measure on the minimum machine** the save time with large documents and the memory with two panes open.
