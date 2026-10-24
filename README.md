<div align="center">

![Czech Life — learn Czech, explore Prague, build a life. Vision art.](docs/media/hero-vision.png)

# Czech Life · 捷语人生

### Your game level. Your real-world Czech.

A language-first life simulator with one central ambition: **the Czech you master in the game becomes the Czech you can use in real life.**

**[中文](README.zh-CN.md) · [Play the prototype](#play-the-prototype) · [Roadmap](docs/ROADMAP.md) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/lz850522055-bot/czech-life/issues/new/choose)**

![Stage: early prototype](https://img.shields.io/badge/stage-early_prototype-e8ae50)
![Code: MIT](https://img.shields.io/badge/code-MIT-27697d)
![Node.js: 24+](https://img.shields.io/badge/Node.js-24%2B-43853d)

</div>

## Play a Czech life. Build real Czech ability.

**Our mission: when you genuinely pass A1, A2 or C2 in the game, your real-world Czech ability should match that level.** Progress must mean being able to understand, speak, read, write and respond independently — including situations you have never memorized. This is the standard we want to build and validate, not an XP badge.

To make that possible, we aim to recreate a Czech life **one-to-one**, starting with Prague and eventually extending across Czechia: actual streets and routes, buildings, infrastructure, landmarks, neighborhoods and the social situations that make a language necessary. The city is the training ground; real-world language transfer is the point.

You might rent a home, shop for groceries, make friends, handle a misunderstanding, read an official notice or start a business. A shop should have customers, suppliers, stock, rent, purchasing costs, wages, utilities and trade-offs. Business scenarios should reflect dated, sourced Czech policy and local conditions. Learning Czech remains the first requirement throughout: the world should make you need, use and retain the language.

**The destination is a game life that prepares you for real life in Czechia.** Geography, culture, commerce and future social play all serve that goal.

| Core goal | What the world provides |
| --- | --- |
| In-game A1–C2 mastery transfers to real Czech ability | Listening, speaking, reading, writing, interaction and unfamiliar-context checks |
| Learn by living, not memorizing a route through questions | Daily life, relationships, decisions and consequences |
| Feel present in a real place | A faithful 1:1 reconstruction target for Prague's roads, buildings and infrastructure |
| Rehearse independent life and business | Customers, sourcing, rent, stock, labor, utilities and policy-grounded simulations |
| Grow into a shared world | Future multiplayer; not implemented in this alpha |

This is the project's **development and validation goal**. The current release is an early single-player prototype: two authored outdoor chunks, initial learning/quest/economy systems and a course structure through C2. Map stutter and language review remain open work; equivalence between game completion and real CEFR ability has not yet been validated. See the [mastery and simulation design](docs/VISION.md).

## See the direction

![Concept UI: learning through Prague exploration and sound doors.](docs/media/learn-explore-concept.png)

*Concept UI · roadmap vision. Current UI is primarily Chinese with Czech learning content; English localization is open work.*

![Future vision: a living neighborhood, shop simulation and eventual multiplayer.](docs/media/community-economy-vision.png)

*Future vision · multiplayer not implemented. Property, investment and currency are fictional game systems.*

For actual prototype captures and reproducible checks, see [current state](docs/CURRENT_STATE.md). All concept images are labeled; no concept render is presented as a performance demonstration.

## What is here today?

| Area | Present in this release | Next work |
| --- | --- | --- |
| Beginner adventure | Sound gates, first-district story, NPC dialogue and saved tasks | Better onboarding and playtesting |
| Learning | Missions, grammar patterns, review, audio and a graded lesson structure through C2 | Native Czech review and richer progression |
| Prague world | Real-geography data, streamed 2D assets, two detailed outdoor chunks | Frame pacing, touch controls, more streets and interiors |
| Economy | Initial virtual shop/ledger/courtyard loop | Deeper trade, property and neighborhood design |
| Persistence | Local SQLite account and saved progress | Cross-device testing and recovery UX |
| Multiplayer | Not implemented | Design after the single-player loop works well |

See [roadmap](docs/ROADMAP.md), [known limitations](docs/CURRENT_STATE.md) and [architecture](docs/ARCHITECTURE.md).

## Play the prototype

Requires **Node.js 24+**, Git and `tar` on Windows, macOS or Linux. The application has no npm runtime dependencies. There is no hosted public demo yet.

```sh
git clone https://github.com/lz850522055-bot/czech-life.git
cd czech-life
npm run assets:fetch
npm start
```

Assets are approximately **1.01 GB compressed / 1.13 GB extracted**, fetched once from the versioned GitHub Release and checked against SHA-256. No paid API or map key is needed for the bundled prototype. Raw geography is a separate optional archive for data contributors.

1. Open the local address printed in the terminal (default `http://127.0.0.1:8766/`).
2. Use the **first-run token printed in your own terminal** to create your account. There is no shared default password.
3. Open `http://127.0.0.1:8766/game/?district=small-town` for the first district.
4. Follow the visible task controls. Audio playback needs a click/tap.

[Setup, mobile access and troubleshooting](docs/GETTING_STARTED.md). Learner records/recordings are private and excluded from this repository.

## Help make in-game mastery work in real life

The first neighborhood is the proving ground: can a complete beginner learn something here and independently use it in a new real-world situation?

- **Game/rendering developers:** profile camera panning, texture uploads, chunk loading and mobile frame pacing.
- **Czech speakers and teachers:** review phonetics, natural dialogue and beginner progression.
- **Game designers/writers:** turn grammar into choices, quests and consequences.
- **2D artists:** extend the detailed Prague art direction with readable scenes.
- **Prague locals/data contributors:** improve place accuracy, bilingual labels and provenance.
- **Web contributors:** English localization, accessibility, progress recovery and tests.

Start with [help wanted](https://github.com/lz850522055-bot/czech-life/labels/help%20wanted) or [good first issues](https://github.com/lz850522055-bot/czech-life/labels/good%20first%20issue). Read [CONTRIBUTING.md](CONTRIBUTING.md), then open a focused PR with verification. Maintainers review before merging. Bug reports are welcome without code.

## Open by design

- **Code/original contributions:** [MIT](LICENSE).
- **Third-party recordings, maps and vendor code:** their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). MIT does not relicense these assets.
- **AI assistance:** initial code/content and promotional art were produced with AI assistance. Native-speaker and human gameplay review are open contribution areas. [Visual provenance](docs/media/README.md).
- **History:** public Git history starts with this baseline. Git records committed changes, not every keystroke. Private backups and learner records are not published.

Prague's **Historic Centre** is a UNESCO World Heritage property ([official listing](https://whc.unesco.org/en/list/616/)). This is an independent game, not an official city or language-certification product.
