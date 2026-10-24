# Architecture and contributor map

Browser/game shell → same-origin Node HTTP API → local SQLite.
2D renderer/streamed assets → Prague geography + authored scene art.
Task/review/progress systems → content JSON + audio.

- `app/server/`: native HTTP, SQLite, auth, game and simulation.
- `app/public/game/`: game, actors, renderer, tasks, economy and caching.
- `content/game/catalog.json`: mission/task catalog; authoring helpers in `scripts/`.
- `content/lessons`, `assessments`, `units.json`: prior structured course.
- `content/authentic`: natural-speech provenance, excerpts, translations and tasks.
- `tools/game-renderer`: optional locked Pixi/viewport/art dependencies.
- Release asset pack: art/maps/audio pinned by per-file and archive hashes.

## Performance

Begin with `world-stream.js`, `world-pixi.js` and scene/tile callers; confirm module names with `rg --files app/public/game`. Rendering is provisional and can stutter. The goal is interactive movement, not a camera sliding over a concept picture.

Measure main-thread work, fetch concurrency, decode memory, GPU uploads, cache misses, state rerenders and high-DPR overdraw. Explore bounded texture lifetime and visible-camera prefetch without degrading chosen art quality. A PR should name device/browser/viewport/DPR/route/cache state and include frame-time distributions. Screenshots alone do not establish performance.

## Boundaries

Geography supplies structure; authored art supplies appearance. Concept art is not georeferenced street accuracy. Business uses fictional property/currency. Learning state must survive scene/asset failures. Never embed secrets or silently depend on a paid API.

Older API/content contracts are in `docs/reference/`; where they describe previous snapshots, current behavior/root docs take precedence.
