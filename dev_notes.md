# foxes — dev notes

Repo: `justbobonx/foxes`, branch `main`.

Do not rewrite `README.md` unless asked. Owner hand-edits it.

Bump every `?v=` in `index.html` after script or css edits. Do not put the current stamp here.

## Files

- `index.html` — canvas, HUDs, overlays, script tags
- `css/style.css` — HUD, title, menus, overlays, win card
- `fonts/` — pixel type
- `images/` — 32×32 bitmaps
- `js/sprite.js` — `Sprite` / `SpriteBank`. Glyphs until the png loads
- `js/cell.js` — cell data, draw, `CELL_TYPES`, `Cell.dressGrid`
- `js/grid.js` — live board: cells, queries, marks, check, dump / load. No generate
- `js/solver.js` — uniqueness count, stops at the cap
- `js/grid_builder.js` — land, seats, dell paint, `build` / `buildAsync`
- `js/plan.js` — field spec `{ size, features[] }` and query parse
- `js/planner.js` — feature catalog, unlock chart, travel / give-up cards
- `js/forest.js` — persistent run: stars, unlocks, location, offers, stories seen
- `js/story.js` — page catalog. Game decides when to show
- `js/hint.js` — print painter. `apply()` returns the level that fired, or 0
- `js/save.js` — localStorage board and forest
- `js/chrome.js` — fullscreen enter, wake lock
- `js/ui.js` — HUD, overlays, DOM wiring. Game keeps board state
- `js/game.js` — layout, input, flow, clock, score charge, draw

Load order matches the script tags in `index.html`. Grid before solver before builder. Save before plan before forest before planner.

## Cell

`type`: `grass` | `water` | `cave` | `bunny` | `hawk` | `tree`

`CELL_TYPES` look fields:

- `fill` — body color for non-grass
- `edge` — inner type ring drawn on the cell body. Not warn / wrong / lock
- `glyphColor` — fallback mark color
- `tap` — whether the cell accepts marks
- `markO` — sprite id used when this type shows an `o`
- `stand` — sprite id drawn as the occupant of the type itself

Helpers: `cell.is(name)`, `cell.isHole()` (anything not grass), `cell.canTap()`, `cell.setType(name)`.

Truth vs pencil:

- `spriteId` — hidden fox is `"o"`, else null. Never store wolf / bunny / hawk / tree here
- `guessId` — `null` | `"x"` | `"o"` only
- `locked` — found fox or HINT print. Locked foxes get the green ring. Locked prints do not
- `wrong` — red ring after a legal CHECK that missed
- `warn` — yellow ring after a rule clash. Conflict only; could still be a real fox
- `flipStand` — mirror the stand sprite
- `dellId` — grass region id. Holes use `HOLE_DELL`

Locked `x` draws `prints.png` (`sprite "p"`). Pencil `x` stays the letter. HINT never restyles an existing pencil `x`. Cave pencil `x` uses `xl`.

Look is not assigned in the generator. After build and after `Grid.load`, game calls `Cell.dressGrid(grid)`. That writes `look` from `CELL_TYPES`, `fill` (dell color on grass, type fill on specials), `round` `[tl,tr,br,bl]`, and `flipStand`.

Wolf seat is not a cell field. Grid keeps `wolfRow` / `wolfCol` (−1 if none). `grid.isWolfAt(r,c)`, `grid.nearWolf(r,c)` (Chebyshev ≤ 1).

Hawk side is not a cell field. Grid keeps `hawk` (`"L"` | `"R"` | null). The band is drawn in game, not by the cell.

## Plan / forest / planner

A plan is `{ size, features[] }`. Each feature has a `type` and optional `size`.

Feature types the catalog knows: `pond`, `river`, `wolf`, `bunny`, `hawk`, `trees`.

- `pond` size picks a pond shape class. Painted cells are `water`
- `river` size 2 is bank-to-bank. Size 1 is an outflow off an existing pond. Painted cells are `water`
- `wolf` plants a cave and a hidden seat inside it
- `bunny` plants a bunny hole
- `hawk` plants a corner perch and a diagonal claim. Not used with trees
- `trees` shrinks column count and paints tree bands that split those columns

`Plan` copies, keys, and reads those fields. `Plan.fromQuery` accepts `?plan=` as JSON or a compact comma list. That path is a test field; it does not advance forest.

`Forest` is the run. Stars, current unlock, feature state (`locked` / `unlocked` / `seen`), per-feature scores (`±20`), running size average, location, last plan, cached offers, stories already shown. Game owns the instance. Save stores a dump.

`Planner` does not build a field. `travel` builds all three cards in one pass. Size pool is `[n-2 if n>=avg, n-1, n, n+1, n+2 if n<=avg]`, clamped to `[SIZE_MIN, maxN]`, pick 3, sort small to large. Features roll independently with `p = p0 + score/100`. Water gate is the mean of pond/river `p` when river is in play; `waterParts` replaces the old `0.5` coins with `riverP/(pondP+riverP)`. Next unlock only on card 3. Give-up is `travel(forest, lastPlan)` so that exact plan key is rerolled. Card pick calls `forest.notePick`: `+1` chosen feature types, `-0.5` once per feature that appeared only on a rejected card, then updates `sizeAvg`.

## Build

`newBoard` / `startField` calls `GridBuilder.buildAsync(plan)`. Find overlay ticks while it searches. Sync `build` still exists for anything that does not need the overlay.

Builder makes `new Grid(size, size - treeWidth)` then searches:

1. trees
2. water (river and/or ponds, then fill trapped grass)
3. hawk
4. cave (then pick wolf seat inside it)
5. bunny
6. place N foxes (hawk seat and bunny pair first if present)
7. paint dells with uniqueness prune
8. accept if `Solver.count(2) === 1`

Holes use `dellId === HOLE_DELL` so flood-fill and the solver skip them.

Fox placement packs by grass mass. Reject holes, wolf 3×3, 8-way adjacency, used rows, and used column-runs. Bunny boards plant a legal pair on the ring first (different row and col, Chebyshev ≥ 2). Bunny is never a corner. Solver also requires exactly two ring foxes when a bunny exists, and exactly one hawk-line fox when a hawk exists.

Dell paint: seed on each fox, grow one free 4-neighbor per step. Hunger: everyone to the floor size, then most toward the target, keep a few small, then fill the rest. If the only edge is a reserved small dell, it may grow. Each finished paint is kept only if the board still has one solution.

## Grid extras

`cols` can be narrower than `rows` when trees are on the plan.

`treeSpan(col)` is the painted tree block in that column. `runOf(row, col)` is 0 above the block, 1 below, −1 on the trees. `runKey` is the column-run the solver and hints treat as the “file.”

`onHawkLine(row, col)` is the diagonal the hawk stares down, excluding the perch cell.

`markConflicts` yellows clashing guessed grass foxes (row, column-run, dell, hawk line, 8-way). Already scored cells stay put.

`clearLooseMarks` is CLEAN UP: drop unlocked clash foxes and drop unlocked `x` that no remaining fox forces.

Dump extras on the grid itself: `plan`, `hawk`, `wolfRow/Col`, `wolfShown`, `unique`. Game adds clock / win / hint / test flags when it persists.

Old dumps with `pond` / `cave` / `bunny` / `wolf` booleans still load. `pond` cells become `water`. New dumps use `type` + `wolfRow/Col` + `hawk`.

## Rules the player already has

- N foxes, one per row, one per column-run, one per dell
- 8-way no-touch
- extra types show up on some boards (do not document their rules in README)

## CHECK / HINT

Bottom button is HINT while grass `o` count `< N`, CHECK at `≥ N`. One pass per click.

1. Paint current clashes yellow. Then score guessed grass foxes: lock hits green, paint actual misses red. N locked foxes is a win. Fresh yellow or red cells charge as a check miss. A full-N CHECK with nothing new and no win stops here.
2. Level 2 prints — player-locked foxes only. Shuffle row / column-run / ring / dell / hawk. First test that still has empty grass targets paints all of those empties as locked prints.
3. Level 3 prints — strip dell (whole dell in one row or one column-run); two-line claim on adjacent lines only, skip when both dells are already strips; small-dell halo (cell 8-adjacent to every remaining seat of a small open dell). Shuffle matching batches; paint one batch.
4. Level 4 leak — nothing left to deduce. Prefer a small dell. Grow a small orthogonal pack. Leave at least two unknown cells in that dell so the packet does not gift the fox.
5. Level 5 leak — dump the remaining truth `x` in one open dell and gift its fox.

Prints only land on blank grass. Pencil `x` is left alone. `x` on a real fox is not a correction.

CLEAN UP charges as its own hint level.

Wolf-ring and bunny-ring deductions are not in the painter yet.

## Score

Mid HUD is cleanliness, not progress.

- Starts full (`hintCut = 1`)
- Each charged click multiplies remaining. Check misses and print levels use different cuts. CLEAN UP uses its own
- Display: `81%` or, once `hintCount > 0`, `81%  (H: 2)` with the count in red
- Left `#/N` is grass fox marks, not locks
- Right `★ ##` is forest stars

NEW field and RESET zero `hintCount` / `hintCut`. Forest stars stay. A real win adds a star and may claim the next unlock. URL test plans do not.

Win card: **FOXES FOUND!** then SCORE / TIME / HINTS, then OK. OK clears the board save and opens travel (title if it was a test plan).

Time is a level clock. Starts on create. `clockOff` folds elapsed on pause / win. Save stores `elapsedMs`. Away time does not count. Time is a display / tie-break, not part of the percent.

## UI / persist

Board sits in the leftover strip between the two HUDs (centered). On win it pins under the top HUD so the overlay does not cover it. Layout measures real HUD boxes so large mobile type does not collide.

Tap: empty ↔ `x` only. Drag keeps the first cell’s mode and will not overwrite a fox mark. Double-tap in the tap window is a single-cell `o`. First tap on an `o` clears it; drag after that only paints empty ↔ `x`.

Overlays: start, menu, plan cards, story, find-the-field, win. Menu is CLEAN UP / RESET / GIVE UP. Help replays the start story. Quick Play and Options are in the markup and not wired.

Find overlay ticks fox icons and the builder search path. Tap it while a build is stuck to return to title.

Won boards stay saved (`won: true` plus the dump) until OK / GIVE UP / NEW. Pause on a win and Start lands back on the win card with frozen time and the same score / hints. Hide the tab stashes and returns to title.

Board key and forest key are separate. Board dump extras: `elapsedMs`, `won`, `hintCount`, `hintCut`, `testPlan`, `plan`. Marks persist as `guessId` + `locked` / `wrong`. `warn` is written but is only meaningful for the current session.

Canvas: `image-rendering: pixelated`; `imageSmoothingEnabled` only when dest tile is smaller than `TILE`. Sprite pad inside the cell bg is a small fraction of the inner square. Cell bg inset from the grid is the same idea.

`?plan=` on the start button label becomes “Play URL Plan” when a test spec is present.

## Next

- HINT does not know wolf-ring or bunny-ring yet
- Wire or drop Quick Play and Options
- Ideas parked (not shipped): berry bush (exactly two touching foxes on a ring — exception to no-touch), yard overlay (rejected as confusing), time-attack as a side mode
- Bunny art file is `bunnies.png`; `bunny.png` still sits in `images/`
