# Design

How OuraBox looks and how it feels.

Legend: **Decided** means agreed; **Proposed** means recommended but still to be confirmed.

## Decided

1. **Visually beautiful, fluid and modern.**
2. **Useful, very useful, and abstract at the same time.**
3. **Minimalist:** the interface and everything else. Simple, but fluid.
4. **A place of calm and quiet for overstimulated people.** In 2026 there are stimuli everywhere; OuraBox doesn't add more.
5. **Minimalist isn't cold:** none of a cold interface like Excel's.
6. **Beautiful effects, but minimalist.**
7. **Inspired by water:** it's calm, but it flows a lot.
8. **Divided into sections, where everything connects to everything without overwhelming**, according to what's needed at each moment.
9. **Direct, descriptive names** that don't confuse. No poetic or themed names for now. This applies to sections and tools; palettes do carry sky names (see below).
10. **Occasional notices, never overwhelming.** Notifying every so often is fine; bombarding, like Duolingo does, isn't.
11. **Each color palette is a sky.** When choosing a palette you see the sky that inspires it, so that choosing a theme feels like choosing a sky: mornings, clear middays, pink afternoons, intense sunsets, gray days, rain, storm, nights.
12. **Drawing has to feel fluid**, like a digital pen on a tablet. It's the main thing about drawing.
13. **No stroke smoothing by default.** If it exists, it comes off and the person decides to turn it on.
14. **Focus on minimalism.**
15. **Keyboard shortcuts come last.** Everything has to be doable with the visible interface. The shortcuts that already exist stay as an extra, but no new ones are added (nor typing shortcuts like `#` for headings) until everything else is polished. Tab inside a table and Shift when drawing a shape aren't new shortcuts: they're the usual way in any table or drawing program, and everything can be done just the same with the buttons.
16. **Balance between minimalism and usefulness.** A lot of minimalism without usefulness doesn't work; a lot of usefulness that overwhelms doesn't either. OuraBox doesn't recreate Word, Excel or Canva, but it does bring the most basic and useful things from each (a CV, a table with calculations, a quick logo), hidden until asked for. For more depth, later on, connections with those tools (see [Plan](08-plan.md)).
17. **For perfectionists:** whoever spends thousands of hours here wants to create, organize and polish every detail, and feel they're making good use of their time. Details (alignment, a neat table, a clean export) matter.
18. **The sidebar looks like a code editor's** (VS Code, Cursor): a strip of icons that's always there and, next to it, the chosen view in a compact tree. It's a familiar way to organize a lot without showing a lot.

19. **Settings live under the gear.** The sky, security, language, users and signing out are in a single place, at the bottom of the icon strip, as in an editor. The strip keeps what's used all the time, like the padlock to lock, just above the gear.
20. **Nothing changes suddenly on its own.** Pages aren't added automatically (you can ask for that), and changing a drawing option doesn't change what's already drawn.

## Minimalism in practice

- **Icons, not words:** the bar shows only good-sized icons, easy to tap and hard to miss. If the mouse stays over one for **a second**, the button says what it is; the colors and the pen thickness open the same way. The side list doesn't use this behavior.
- **What isn't the page steps aside on its own:** when you touch the page, the list hides (it can be pinned) and only the icon strip remains.
- **What's used sometimes, one click away:** heading, subheading and normal text live in a single button ("Aa") that shows how each one looks.
- **Nothing is deleted outright:** what's deleted goes to the trash, in the icon strip.
- **The useful things, in two panels:** "Format" (alignment and color) and "Insert" (numbered list, task list, table, line) open after a second, like the colors. The table bar only appears with the cursor inside a table. "Shapes" lives inside draw mode and "Export" at the top right. Notes come folded and only one project is shown at a time.
- **No dimming while writing:** a mode that faded everything out while writing was tried and removed: if a quick change is needed, everything has to be where you expect it.
- **Actions in view only when needed:** in the list, "Rename", "Move to another project", "Let go" and "Move to trash" appear when hovering over a document; "Rename" and "Move to trash" when hovering over a project; the "+" for Files and Notes, when hovering over each group.
- **Projects without noise:** each project shows just two groups, Files and Notes. Projects fold and unfold; when a document is opened, its project unfolds on its own.
- **A note looks lighter** than a file: a small card instead of a page, and without the "About this idea" light bulb.
- **Going deeper into a root** has its own movement: the page moves away upward, the new one rises from below and a soft veil darkens the sky with each level. Whoever turns off animations goes down without movement.
- **The roots map** draws the branches as roots growing downward, with soft curves.
- **The zoom** is a small pill at the bottom right of each page, which only appears on hover or when the zoom isn't 100%.
- **The saved notice** is a small pill at the bottom center, which appears and goes away on its own.
- **Split view without noise:** the active pane (where the toolbar acts) is marked with a short line at the top; the divider is only visible on hover.

## The logo

A box with one corner open and a dot already outside: "Out of the Box" said literally, the idea that got out of the box. A white, rounded stroke on a soft-cornered square, in navy blue (`#17305a`), like a clear sky just after dusk or the deep Pacific; inside the app only the stroke is drawn, in the sky's accent color. It was chosen because it's direct and recognizable even at 16 px. The original is in [`app/src-tauri/icons/source/logo.svg`](../app/src-tauri/icons/source/logo.svg); it's exported to a 1024 px PNG and the app icons come from that with `npx tauri icon`.

## The skies

Implemented in [`app/src/themes.ts`](../app/src/themes.ts). Each sky has a background drawn with gradients (no images, no internet) and its own palette. The page always stays a serene color: the sky lives around it.

| Sky | Feeling | Tone | Page | Text | Accent |
|---|---|---|---|---|---|
| Clear | Clarity to concentrate | Light | `#FCFEFF` | `#1E3040` | `#246FA3` |
| Morning | Fresh calm to begin | Light | `#FFFDFB` | `#262C3A` | `#4A6B98` |
| Pink afternoon | Softness to create | Light | `#FFFCFC` | `#33283A` | `#94487A` |
| Intense sunset | Energy that fades slowly | Light | `#FFFAF6` | `#35262A` | `#A9472C` |
| Gray day | Silence without distractions | Light | `#FBFCFC` | `#262D33` | `#4A5F6C` |
| Rainy | A shelter to think | Light | `#F9FBFC` | `#1F2C36` | `#2F6681` |
| Storm | Contained intensity | Dark | `#1B1F2C` | `#DDE0EB` | `#ABB4EE` |
| Blue hour | The moment between day and night | Dark | `#162038` | `#DCE3F2` | `#9FB6F0` |
| Starry night | Visual rest with little light | Dark | `#111C26` | `#D8E3E7` | `#7EB6C3` |

**Still background.** Over each sky there are two soft lights in the sky's color and, depending on the sky, drops on the rainy one, as if seen through glass, or stars at night. They used to move very slowly; the movement was removed because it was barely noticeable and forced the background and panels to repaint twice a second, which made the screen stutter when drawing a lot.

**Automatic** is used by default: Clear if the system is in light mode, Starry night if it's in dark mode. The chosen sky is remembered.

**Rules checked by the automated tests** ([`themes.test.ts`](../app/src/themes.test.ts)), for each sky:

- Text on the page: contrast of at least 7 to 1.
- Secondary text and accent: at least 4.5 to 1.
- Each drawing color: at least 3 to 1.
- No pure white or pure black on the page or in the text.

**Drawing colors:** ink (the sky's text color), water blue, coral, amber, green and violet, with one version for light skies and another for dark skies. Strokes store the color's name, not its code, so a drawing made at night still looks right during the day.

**Basis:** according to Valdez and Mehrabian (1994), saturation is what arouses and agitates the most, brightness is associated with pleasant feelings, and blue, blue-green and green tones are among the most pleasant. That's why the page and panels have low saturation even when the sky is intense.

## Drawing

Implemented in [`app/src/ink.ts`](../app/src/ink.ts):

- **Real pressure** with a digital pen: the stroke thins and thickens with the hand. With a mouse, pressure is simulated from speed.
- **No smoothing by default:** the line follows the hand exactly. Smoothing (the stabilizer) is turned on with a button and the choice is remembered.
- **Low latency:** the stroke in progress is drawn on every screen frame, on the layer where it will end up (what you see is what stays); pen events are received as soon as they happen and the next point is predicted to reduce the feeling of lag. With zoom, the drawing moves together with the text when scrolling.
- The points and the smoothing use [perfect-freehand](https://github.com/steveruizok/perfect-freehand) (MIT license); the stroke is painted as joined circles and segments, so a thick, transparent stroke leaves no gaps (see [Architecture](12-architecture.md)).
- **Each stroke on its own layer:** behind the text by default, or in front; changing the option doesn't move what's already drawn.
- **Each tool with its settings:** Pen, Blend and Eraser; one click picks the tool and opens its settings below it (the eraser's size and strength are no longer confused with the pen's). Undo and redo, together.
- **Blend:** watercolor, blur and smudge. It's worth it because it feels like real painting, without adding complexity: it's one more tool, with three options.
- **Colors:** 12 basic ones always at hand, the 21 favorites and ready-made palettes in a separate panel that opens, hides or can be pinned.
- **Center guides (optional):** shapes snap to the center of the page and lines stay straight, for symmetrical work, also when moving or resizing a shape already drawn.

## Foundations

Ideas from psychology and design that support the decisions above:

- **Attention restoration theory** (Rachel and Stephen Kaplan): directed attention gets depleted; "soft fascination" stimuli, like moving water, capture attention without demanding it and help restore it.
- **Calm technology** (Mark Weiser and John Seely Brown, Xerox PARC): technology should ask for as little attention as possible and inform without overwhelming.
- **Progressive disclosure:** showing only what's needed at each moment reduces mental load. It's the "according to what's needed".
- **Incubation:** stepping away from a problem or doing something undemanding, like drawing, can help the solution appear. It supports having a place to draw or switch projects when you go blank.
- **Getting things out of your head:** writing down to-dos in a trusted system reduces mental load. David Allen, creator of the GTD method, calls it "mind like water".

## Proposed

- **Water is felt, not drawn.** The interface isn't filled with drawn drops or waves; the water is in how it moves and how it feels.
- **One thing at a time:** the screen shows what's being done now; everything else waits at the edges.
- **Every effect with meaning:** for example, when a note is saved, a subtle ripple shows it was saved. No decorative animations that demand attention.
- **Soft movements**, that speed up and slow down calmly, never abrupt.
- **Soft, low-saturation colors on the page and panels**, even when the background sky is intense. No pure white or pure black.
- **An almost empty home screen:** a place to write a quick note and, at most, the next step of the current idea or a dormant idea.
- **Empty screens invite:** every empty space offers a path, never a dead end.
- **Out with everything that creates anxiety:** streaks, badges, red counters and infinite feeds.
- **Every notice has to be worth the interruption:** with a real purpose, at the frequency the person chooses and easy to turn off.
- **Respect whoever turns off animations** in their operating system.

## Micro-rewards (proposed)

Small moments that acknowledge something truly worthwhile, without noise, without points, without punishing you for not coming. Nothing is counted for being online; what's counted is what was done. Ideas to be confirmed:

- **Time creating, not time open:** when locking or at the end of the day, a quiet line: "Today: 1 h 20 min writing and drawing in *My novel*". Only time with real activity counts.
- **Milestones of the idea, not the user:** when an idea takes a real step (marking the next step as done, finishing all the tasks in a list, turning a note into a file, completing its assumptions), a brief visual detail in that spot (a soft glow on the checkbox, the roots map growing).
- **Gentle streak:** days creating in the week as quiet dots that fill up; a day without coming breaks nothing and isn't pointed out.
- **The sky as acknowledgment:** after many real hours of work, a new sky appears in settings. Nothing is locked; it's a gift, not a price.

## Beautiful and optimized at once

OuraBox has to work on modest computers (see [Technology](07-technology.md)). Some "modern" effects, like blurs or frosted glass, are expensive and slow on old machines.

**In use:** so the interface looks modern, the document list, the toolbar and the sky picker are frosted glass panels over the sky. To keep the cost low:

- Only panels that open for a moment (colors, thickness, menus) blur. The ones that are always there (sidebar, toolbar, buttons, zoom) and the large windows are still glass, slightly more opaque and without blur. Reason, measured: the blur is recalculated every time what's behind it changes; with the sky moving and every panel blurring, the screen stuttered by up to 50 ms at times. Behind it is a sky of soft gradients, which looks almost the same when blurred.
- The sky is a gradient painted only once, and switching skies is an opacity fade.
- The background doesn't move: that way there's nothing to repaint while writing or drawing.
- Color blends are computed only once and kept as an image; repainting (on undo, with zoom, when scrolling) just pastes them. Measured with 48 strokes (12 pen strokes and 12 of each blend): undo went from almost 3 s of freezes to none, and zoom with scrolling from 7.8 s to under half a second.
- A stroke in progress only repaints the part of the page that changed, and what is settled of it is computed once: a long stroke costs the same each frame as a short one. Measured with one stroke of 1,500 points: frames of up to 3 s went to none over 34 ms. (Closing each piece of the path with `closePath` made the cost grow with the square of its length.) The eraser works the same way.
- When drawing, saving happens 1.5 s after the last stroke, not between strokes; points that fall almost on top of the previous one aren't saved.
- Animations only move opacity and position.
- Whoever asks for less transparency in their system gets solid panels.

**Pending:** measure it on the minimum machine. If the glass doesn't meet the performance budget, it's replaced by solid panels on those machines.

## The difference has to show

The market for idea and note tools is saturated. OuraBox has a difference, but it has to **make it show enough**.

**Proposed:** that in the first seconds of use the calm is felt and it's understood, almost without reading, that OuraBox is for **developing** ideas and not just storing them.
