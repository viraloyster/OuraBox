# OuraBox

**Out of the Box.**

**A safe space to develop genuine ideas.**

> *"Hay gente que juega mejor que el Bayern y no tiene para comer."*
> *(There are people who play better than Bayern and don't have enough to eat.)*

The world is cruel and people are born naive. OuraBox is the portal that carries naivety into the real world without the clash of worlds: a space for ideas, quick or deep, from any field, where what matters is not who you are or what degrees you hold, but what you bring and what you work on.

It's for people with ideas and callings outside their official lane: the lawyer who always wanted to be an architect, the programmer who always wanted to be a musician, the talent with few resources that nobody sees.

OuraBox doesn't inflate egos or put anyone in the box. It is cold but warm: it helps you see the assumptions that limit each idea and hands the question back to the person who thinks differently. It is minimalist and calm, and it doesn't charge its users.

## From a simple idea to deep research

**A simple idea:** a garden on the school roof. A few lines, a task list, a sketch, and the assumptions you take for granted.

![OuraBox: a page titled "A garden on the school roof" with two paragraphs, a task list and a hand-drawn sketch of garden beds, a rain tank and a sun, next to a sidebar with the project "Community garden".](docs/images/write-and-draw.webp)

| | |
|---|---|
| ![The "About this idea" panel next to the page: what I want to achieve, one next step, and three assumptions marked "I accept it", "I want to break it" or "I don't know".](docs/images/idea-panel.webp) | ![Two documents side by side under the dark "Starry night" sky: a cost table with a calculated total, and the garden page.](docs/images/split-view.webp) |
| **About this idea:** one next step, and what you take for granted. | **Side by side:** the costs next to the plan. |

**Deep research:** how cholera spread in Soho in 1854, when John Snow traced it to a water pump. Underline, highlight and annotate by hand; sketch the evidence; go deeper from any phrase; keep the data in a table.

![A research page, "How cholera spread in Soho, 1854": phrases underlined in teal, a sentence highlighted in amber, a red hand-drawn circle around "brewery" and a squiggle under "suspected the water", and the top of a hand-drawn map.](docs/images/research-page.webp)

| | |
|---|---|
| ![The list of exceptions with a highlighted sentence, above a hand-drawn sketch of Snow's map: streets, the pump, dots for deaths, the empty brewery and the workhouse, with a note saying it is not to scale.](docs/images/research-map.webp) | ![The "About this idea" panel next to the research page under a sunset sky: the goal, one next step, and three assumptions marked "I want to break it", "I don't know" and "I accept it".](docs/images/research-idea.webp) |
| **Sketch the evidence** right under your notes. | **Name what you take for granted,** and choose which one to push against. |
| ![The roots map of "Cholera in Soho, 1854": the research page with its assumptions, and three roots below it: "had its own well", "drank beer" and "bad air".](docs/images/research-roots.webp) | ![Two documents side by side on a deep blue sky: "The grand experiment", with houses and deaths per water company, and the annotated research page.](docs/images/research-table.webp) |
| **Roots:** go deeper from any phrase, and keep the whole inquiry in view. | **The data next to the argument:** Snow's comparison of two water companies. |

**Every palette is a sky.** The same page under four of them:

![The same research page under four skies: Clear, Pink afternoon, Deep sunset and Starry night.](docs/images/skies.webp)

*Screenshots of the app as it is today (beta), with example content. The research example follows John Snow's published work; the map is a sketch, not his data.*

## What exists today

- **A desktop app in beta**, in [`app/`](app/) (version 0.1.0): projects, files and quick notes; writing, drawing and images on the same page; a place in each idea to write down its assumptions. [What it does](app/README.md#what-it-does-today).
- **Windows** is the system it's built and tried on. **[Download the installer](https://github.com/viraloyster/OuraBox/releases/latest)** from Releases; it isn't signed yet and doesn't update itself. What changed in each version is in the [changelog](CHANGELOG.md). Linux and macOS aren't tried yet: Tauri builds for them, but nobody has checked OuraBox there.
- **Everything stays on your computer, encrypted with your password.** There is no server, no online account and no sync between devices.
- **Not there:** no mobile app, no AI, no community and no companies. Those are ideas for later, described below, and may never be built.

[What beta means](docs/08-plan.md#what-beta-means).

## Security, in short

Documents, drawings, images and titles are encrypted on disk (Argon2id and XChaCha20-Poly1305, with established libraries). That protects them from someone who gets the files or an encrypted backup without the password. It doesn't protect them from someone using the computer while the space is open, or from malware on the computer. Exports (PDF, image, text) leave unencrypted. **The encryption has not had an external review yet.** Details: [Technology](docs/07-technology.md#security) and [Security](SECURITY.md).

## The vision: three spaces

Only the first one exists, as the desktop app above. The other two are ideas, not plans with dates. The [plan](docs/08-plan.md) lays the road out in stages: the safe space on PC (now), then on mobile, a community, companies, and one day remote events open to the whole world.

1. **Safe space:** your ideas, private by default. *(desktop app in beta)*
2. **Community:** people working on their ideas. *(idea, not built)*
3. **Companies:** open doors for talent, and perhaps what would keep OuraBox going. *(idea, not built)*

**[Read the documentation](docs/README.md)**

## Taking part

- **Trying it and saying what got in the way** is the most useful help right now: open an [issue](https://github.com/viraloyster/OuraBox/issues).
- **Code, texts or translations:** read [Contributing](CONTRIBUTING.md) first.
- **A security problem:** never in public; see [Security](SECURITY.md).
- Everyone in the project's spaces follows the [Code of conduct](CODE_OF_CONDUCT.md).

## License

Copyright (C) 2025-2026 viraloyster.

OuraBox's code is free under the [GNU AGPL, version 3](LICENSE) (`AGPL-3.0-only`): anyone can use it, study it, modify it and share it, as long as what they distribute, or what they offer to others over the internet, stays open under the same license. That way anyone can check that their ideas are safe, and nobody can take OuraBox and close it.

The license covers the code, not the OuraBox name or logo: a modified version has to carry a different name.

OuraBox builds on the work of others (typefaces, libraries): see [Third-party notices](THIRD_PARTY_NOTICES.md).
