# foxes — dev notes

Repo: `justbobonx/foxes`, branch `main`. Bump every `?v=` in `index.html` after script/css edits. Current cache is `?v=50`.

Do not rewrite `README.md` unless asked. Owner hand-edits it.

## Files

- `index.html` — canvas, HUD, start / menu / win overlays, script tags
- `css/style.css` — HUD, title, menus, win card
- `js/sprite.js` — `Sprite` / `SpriteBank`. Bitmaps 32×32 in `images/`
- `js/cell.js` — cell data + draw + `CELL_TYPES` + `Cell.dressGrid`
- `js/grid.js` — live board: cells, queries, marks, check, dump / load. No generate.
- `js/grid_builder.js` — ponds, cave, bunny, foxes, dell paint, `rebuild`, `GridBuilder.build(plan)`
- `js/solver.js` — uniqueness count, cap 2
- `js/planner.js` — `{ n, ponds, wolf, bunny }` card for a size
- `js/hint.js` — print painter for levels 2 / 3 / 4. `apply()` returns the level that fired, or 0
- `js/save.js` — localStorage size, lifetime stars, in-progress board
- `js/chrome.js` — fullscreen enter / leave
- `js/game.js` — layout, input, HUD, timer, score, CHECK/HINT flow

Load order: `grid.js` → `solver.js` → `grid_builder.js`.

## Cell

`type`: `grass` | `pond` | `cave` | `bunny`

Helpers: `cell.is(name)`, `cell.isHole()` (anything not grass), `cell.canTap()`, `cell.setType(name)`.

Truth vs pencil:
- `spriteId` — hidden fox is `"o"`, else null. Never store wolf / bunny here.
- `guessId` — `null` | `"x"` | `"o"` only. Cave + `o` means “wolf guessed here.”
- `locked` — found fox or HINT print. Locked foxes get the green ring. Locked prints do not.
- `wrong` — red ring after a legal CHECK that missed. Actual miss.
- `warn` — yellow ring after rule 0. Conflict only; could still be a real fox. You do not get to know until the board is legal again.

Locked `x` draws `prints.png` (`sprite "p"`). Pencil `x` stays the letter. HINT never restyles an existing pencil `x`.

Look is not assigned in the generator. After `GridBuilder.build` / `rebuild` and after `Grid.load`, game calls `Cell.dressGrid(grid)`. That writes `look` from `CELL_TYPES`, `fill` (dell color on grass, type fill on specials), and `round` `[tl,tr,br,bl]`.

`look.edge` is only the inner type ring on pond / cave / bunny. Not the warn / wrong / lock stroke.

Wolf seat is **not** a cell field. Grid keeps `wolfRow` / `wolfCol` (−1 if none). `grid.isWolfAt(r,c)`, `grid.nearWolf(r,c)` (Chebyshev ≤ 1).

## Build

`Planner.roll(n)` today: pond 50% on 7+, wolf 50% on 8+, bunny 50% on 8+. Independent coins. Intended later: a path of cards so extras show up one at a time.

`newBoard` calls `GridBuilder.build(plan)`, which `new Grid(plan.n)` then `grid.rebuild(plan)`:

1. ponds
2. cave (then pick wolf seat inside it)
3. bunny
4. place N foxes (seed bunny pair first if present)
5. paint dells with uniqueness prune
6. accept if `Solver.count(2) === 1`

Holes use `dellId === HOLE_DELL` (−2) so flood-fill and the solver skip them.

Fox placement: permutation of rows / cols, reject holes, wolf 3×3, and 8-way adjacency. Bunny boards plant a legal pair on the ring first (different row and col, Chebyshev ≥ 2). Bunny is never a corner. Solver also requires exactly two ring foxes when a bunny exists.

Dell paint: seed on each fox, grow one free 4-neighbor per step. Hunger: everyone to size 2, then most to 3, quota of 1–2 size-2s kept, prefer some size-3s, then fill the rest. If the only edge is a reserved small dell, it may grow. Each claim is kept only if the board still has one solution.

`UNIQUE_TRIES` 250, `PLACE_TRIES` 200, `DELL_PAINT_TRIES` 40.

## Rules the player already has

- N foxes, one per row, column, dell
- 8-way no-touch
- pond / cave / bunny are extra types on some boards (do not document their rules in README)

## CHECK / HINT

Bottom button is HINT while grass `o` count `< N`, CHECK at `≥ N`. One outcome per click. Drop out as soon as something fires.

0. Rule break on guessed grass foxes (row, col, dell, or 8-way touch). Paint **all** members of the clash yellow, even if some sit on truth. No scoring of right / wrong, no prints. Charge hint level 0.
1. `grid.checkGuesses()`: lock correct foxes (green), paint actual misses red. N locked foxes is a win. A full-N CHECK, or any red miss, stops here. Reds charge hint level 1. A clean lock-only CHECK / HINT that then continues does **not** charge.
2. Level 2 prints — player-locked foxes only. Shuffle row / col / ring / dell. First test that still has empty grass targets paints **all** of those empties as locked prints. Charge 2.
3. Level 3 prints — strip dell (whole dell in one row or column); two-line claim on **adjacent** lines only, and skip when both dells are already strips; small-dell halo (cell 8-adjacent to every remaining seat of a 2–3 seat dell). Shuffle matching batches; paint one batch. Charge 3.
4. Level 4 leak — nothing left to deduce. Prefer a **small** dell. Grow a 2–3 pack with orthogonal adjacency. Leave at least two unknown cells in that dell so the packet does not gift the fox. Charge 4.

Prints only land on blank grass. Pencil `x` is left alone. `x` on a real fox is not a correction.

Wolf / bunny extra rules are not in the painter yet.

## Score

Mid HUD is cleanliness, not progress.

- Starts at `100%` (`hintCut = 1`).
- Each charged click multiplies remaining: level 0 ×0.9, 1 ×0.93, 2 ×0.95, 3 ×0.93, 4 ×0.9.
- Display: `81%` or, once `hintCount > 0`, `81%  (2 HINTS)` with the count in red.
- Left `#/N` is grass fox **marks**, not locks.
- Right `\u2605 ##` is lifetime clears (`score.cleared`).
- NEW and RESET zero `hintCount` / `hintCut`. Lifetime stars stay.

Win card: **FOXES FOUND!** then SCORE / TIME / HINTS, then NEXT.

Time is a level clock. Starts on create. `clockOff` folds elapsed on pause / win. Save stores `elapsedMs`. Away time does not count. Time is a display / tie-break, not part of the percent.

## UI / persist

Board sits in the leftover strip between the two HUDs (centered). On win it pins under the top HUD so the overlay does not cover it. Layout measures real HUD `offsetHeight` / `getBoundingClientRect` so large mobile type does not collide.

Tap: empty ↔ `x` only. Drag keeps the first cell’s mode and will not overwrite a fox or a wolf mark. Double-tap in `TAP_MS` (280) is a single-cell `o`. First tap on an `o` clears it; drag after that only paints empty ↔ `x`.

Won boards stay saved (`won: true` plus the dump) until NEXT / NEW. Pause on a win and Start lands back on the win card with frozen time and the same score / hints.

Board dump extras: `elapsedMs`, `won`, `hintCount`, `hintCut`, `wolfRow/Col`, `plan`. Marks persist as `guessId` + `locked` / `wrong`. `warn` is session-only.

Menu CLEAR is still a stub. RESET clears marks and the level cut, same puzzle. Size clamp is 6–12.

Canvas: `image-rendering: pixelated`; `imageSmoothingEnabled` only when dest tile is smaller than `TILE` (32). Sprite pad inside the cell bg is `0.06` of the inner square. Cell bg inset from the grid is also ~6%.

## Next

- Planner should become cards / a path, not three independent 50% rolls.
- Implement menu CLEAR (wipe unlocked pencil marks, keep locks / prints / score cut).
- HINT does not know wolf-ring or bunny-ring yet.
- Old saves with `pond` / `cave` / `bunny` / `wolf` booleans still load; new dumps use `type` + `wolfRow/Col`.
- Ideas parked (not shipped): owl diagonal as a fourth set, berry bush (exactly two touching foxes on a ring — exception to no-touch), tree / log line split, yard overlay (rejected as confusing), time-attack as a side mode.
- Bunny art file is `bunnies.png`; `bunny.png` still sits in `images/`.
