# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A first-person browser horror game — "NOCLIP: Escape the Backrooms" — vibe-coded with Claude Fable 5 / Claude Mythos 5. Vanilla JS ES modules with Three.js r128 from CDN; no build system, no package manager, no compilation, no image or audio assets (everything is procedurally generated).

Two levels as of v2.0.0: **LEVEL 0** (the yellow backrooms maze) and **THE END** (the infinite library), entered when the exit elevator's brakes fail. `STATE.level` (0 or 1) picks the active update path; the renderer, light pool, audio buses, interaction/focus, HUD and cutscene systems are shared across levels.

## Running locally

The game uses ES modules, so it must be served over HTTP (opening `index.html` via `file://` will not work):

```
npx serve .
# or
python -m http.server
```

GitHub Pages serves `index.html` at the repo root as the live site.

## Architecture

`index.html` is markup only (HUD + overlay screens); `css/main.css` holds all styling; game code lives in ES modules under `js/`, entry point `js/main.js`:

- **`utils.js`** — `$`, `clamp`, `lerp`, `angLerp`, `rand`, and `srand` (seeded RNG used only by map gen, so layouts are reproducible).
- **`state.js`** — the flat mutable `STATE` object (player + progression for both levels), `KEYS` (raw input), the `monster` state object (level 0), and the `spider` state object (THE END). Everything reads/mutates these shared objects.
- **`map.js`** — level-0 grid constants (`W`, `H`, `CELL`, `WALL_H`), random-walk carve in `genMap()`, `cellToWorld`/`worldToCell` conversions, `isWall`, `losCells` (line of sight), `bfsPath` (entity pathfinding). `CELL` is shared by both levels.
- **`textures.js`** — `makeCanvas` + procedural textures via 2D canvas: level-0 wall/carpet/stain/ceiling, mold/drip decal growers, and THE END's set (`texLib*`, woods, `makeCrackTexture`, `makeEndTextTexture`, `makePosterTexture`).
- **`scene.js`** — Three.js scene/camera/renderer, the point-light pool, and `buildLevel()` (level 0 geometry; populates the exported `lights` array). Objects present at module init are tagged `userData.persist`; `clearLevelScene()` removes everything else (the level-change teardown) and resets `lights`/`wallMeshes`/`wallDecals`. `setLevelEnvironment(level)` swaps fog/ambient profiles. `makeLightRecord()` is the single fixture-record factory: every light in the game (level-0 troffer or library hanging strip) is the same self-contained filament asset driven by lights.js — builders only choose the knobs (`bright`/`dimDen` set how yellow a panel idles; `warm`, `flickery`, `fixY`, `wakeAt`).
- **`props.js`** — collectible/breaker/exit-elevator builders, `placeProps()`, the `interactables` array (+ `clearInteractables`/`addInteractable` for level changes), `updateProps()` idle animation. `makeElevator(p,facing,opts)` takes `{wallH, wallMat}` so THE END reuses it for the crashed arrival cab. The elevator is carved into its wall cell (the wall box mesh is removed and rebuilt as flanks + header around a recessed cab; the grid cell stays solid for collision).
- **`library.js`** — THE END: `grid2` gen (one vast room; perimeter walls, shelf runs that converge/anchor into walls, table islands, the central 3-cell desk), connectivity repair, type-aware queries (`libCollide` — tables passable only while crouched, plus circle obstacles in `LIB.obstacles` for chairs/lecterns/ladders; `losCells2` — shelves block sight, tables/desk don't; best-effort `bfsPath2` that routes to the nearest standable cell when the target is unreachable; `cellAt` for the spider's leg-terrain probe), `buildLibrary()` (geometry — wall boxes get world-scaled UVs via `scaleBoxUV` so the tileable plaster never distorts; hanging fixtures pushed into `lights`; furniture, readable-nonsense posters, cracks, wall texts, vintage PCs, 16–22 floppy disks, the terminal), and `updateLibrary()` (the 55s post-first-pickup light drop, temporary whole-floor blackouts, decor-PC boot-and-die animations). Shelf visual segments are DERIVED from the final grid after repair, so collision and graphics cannot drift apart.
- **`spider.js`** — THE END's librarian: horse-sized spider mesh with a procedural 8-leg gait, and the hearing-driven AI in `updateSpider()`. Disc pickups alert it after a distance-scaled reaction time (2s at ≤10m → 10s at 60% of room span); stacked pickups before it starts moving cut the countdown by 1s each and add +0.5× speed; pickups while it's en route retarget it and add +0.5× (base = player sprint 8 m/s, cap 2.5×). Uncrouched movement alerts it strongly <17m / mildly <25.5m; crouched movement is silent. It cannot enter table cells — a hidden player gets a circling `stalk` that times out. The table keep-out (`pushFromTables`) must stay inside the table's cell (margin ≤0.45), and an anti-deadlock watchdog drops any path it can't physically close.
- **`audio.js`** — `AU` bus object and all Web Audio synthesis: `audioInit()` (buses, hum, drone, breathing, ambient interval layers — the interval layers are gated to level 0), one-shot `sfx*` functions, `panTo` (world position → stereo pan). THE END adds `startLibraryAmbience()` (faint rumble + the spider's proximity skitter bed), `escalateLibraryAmbience()` (post-drop harmonized subs + far thunder), spider/disc/terminal one-shots, and a `muted` footstep variant for the thick carpet.
- **`monster.js`** — level-0 entity mesh, wander/investigate/alert/chase/hunt state machine in `updateMonster()`, sight/hearing checks, wall-knocking, proximity audio. Every recurring disruption shockwave (not the wake one) hands it the player's position; it also space-folds ~every 15s (−2s per objective, floor 7s) 2–4 wall segments along its current path — fog/shear-line poofs at both ends plus a muted `sfxTeleport`.
- **`player.js`** — `updatePlayer()`: movement, sprint/stamina, jump physics, AABB collision (level-aware: `libCollide` in THE END; uncrouching is blocked under a tabletop), camera/head-bob, the post-drop micro screen shake (`STATE.shakeAmp`), footsteps. Once the breaker is fixed (`STATE.powerOn`, level 0 only), adrenaline: bottomless stamina shown as a blue ADRENALINE bar, +20% sprint speed (9.6 m/s).
- **`lights.js`** — `updateLights()`: event-driven flicker bursts (proximity of the level's hunter triggers them — flicker is the radar in both levels), light-pool binding (per-fixture `fixY` height), positional buzz binding, THE END's wake-wave gate (`STATE.libWakeT`: −2 all dark, ≥0 waking in distance order, −1 normal), the 75%-dim + warm shift (`STATE.libDim`), and blackouts (`STATE.libBlackout`).
- **`interact.js`** — `updateFocus()` (what [E] targets; labels may be functions) and `tryInteract()` (objective progression for both levels; disc pickups call `spiderHearDisc`).
- **`cutscene.js`** — `CINE` state + the scripted cinematics: the breaker fuse animation (entity rushes the panel at chase speed, freezes at a 30m ring until control returns), the exit-elevator escape/brake-failure ride (its end calls `enterTheEnd()` — the crash IS the level transition), THE END's intro (waking in the wrecked cab, doors grinding open in two tries, the fixture wake-wave, title card), and the terminal ending (boot → "THE END" → static → scripted spider rush → blackout → white-out → `win()`). While `CINE.active`, main.js skips `updatePlayer`/`updateFocus` and the cutscene owns the camera; `window.NOCLIP_DEBUG` (main.js) exposes hooks for smoke tests, and hidden debug chords exist: triple-[6] warps to the level-0 endgame, triple-[7] drops into THE END (or, already there, pockets every remaining disk).
- **`lifecycle.js`** — `startGame`, `enterTheEnd` (teardown + library build + intro), `respawn` (level-aware: THE END respawns at the wreck, keeps disks, resets the spider far away), `die`/`win` (level-aware copy + stats), debug warps.
- **`ui.js`** — DOM refs (`ui`), `toast`, objectives HUD (level-aware), overlay/pause logic, pointer lock, settings persistence (`localStorage` key `noclip_settings_v1`), mixer wiring.
- **`input.js`** — keyboard/mouse/pointer-lock listeners (side-effect module).
- **`main.js`** — imports everything and runs the `requestAnimationFrame` loop; dispatches `updateMonster` vs `updateSpider`+`updateLibrary` on `STATE.level`.

THREE is a global (classic CDN `<script>` loads before the module graph) — modules do not import it.

There are intentional function-level circular imports (`monster ↔ lifecycle`, `ui ↔ lifecycle`, `cutscene ↔ lifecycle`, `spider ↔ lifecycle`, `library → ui → lifecycle → library`); they are safe because nothing in the cycle is called during module evaluation. Don't add top-level calls across these boundaries.

## Key conventions

- The map coordinate system uses `cellToWorld` / `worldToCell` (level 0) and `cellToWorld2` / `worldToCell2` (THE END) to convert between grid cells (integers) and Three.js world space (meters).
- `MeshPhongMaterial` is used deliberately over `MeshLambertMaterial` on large floor/ceiling planes — Lambert is per-vertex in Three.js r128, which produces all-or-nothing lighting on geometry with only corner vertices.
- Light pool pattern: `LIGHT_POOL_N` point lights are reused each frame, bound to the nearest ceiling fixtures within `LIGHT_BIND_RADIUS`, instead of one light per fixture. Both levels' fixtures share the same `lights`-record shape (library records add `fixY`/`wakeAt`).
- Exported `let` bindings (`grid`, `grid2`, `exitDoor`, `lights`, `interactables`) are reassigned/mutated by their owning module; importers see live values but must not assign to them.
- THE END's grid cell codes: 0 open · 1 wall · 2/3 shelf (along x/z) · 4 table · 5 desk. The spider treats every nonzero cell as solid; players pass type-4 cells only while crouched.

## Archive

`archive/` contains earlier iterations, including the original single-file version of the game (`archive/index.html` lineage). Not served as the live site.
