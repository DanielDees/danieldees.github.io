# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A first-person browser horror game — "NOCLIP: Escape the Backrooms" — vibe-coded with Claude Fable 5 / Claude Mythos 5. Vanilla JS ES modules with Three.js r128 from CDN; no build system, no package manager, no compilation, no image or audio assets (everything is procedurally generated).

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
- **`state.js`** — the flat mutable `STATE` object (player + progression), `KEYS` (raw input), and the `monster` state object. Everything reads/mutates these shared objects.
- **`map.js`** — grid constants (`W`, `H`, `CELL`, `WALL_H`), random-walk carve in `genMap()`, `cellToWorld`/`worldToCell` conversions, `isWall`, `losCells` (line of sight), `bfsPath` (entity pathfinding).
- **`textures.js`** — `makeCanvas` + procedural wall/carpet/stain/ceiling textures via 2D canvas.
- **`scene.js`** — Three.js scene/camera/renderer, the point-light pool, and `buildLevel()` (walls, floor, ceiling, fluorescent fixture groups, populates the exported `lights` array).
- **`props.js`** — collectible/breaker/exit-door builders, `placeProps()`, the `interactables` array, `updateProps()` idle animation.
- **`audio.js`** — `AU` bus object and all Web Audio synthesis: `audioInit()` (buses, hum, drone, breathing, ambient interval layers), one-shot `sfx*` functions, `panTo` (world position → stereo pan).
- **`monster.js`** — entity mesh, wander/investigate/alert/chase/hunt state machine in `updateMonster()`, sight/hearing checks, wall-knocking, proximity audio.
- **`player.js`** — `updatePlayer()`: movement, sprint/stamina, jump physics, AABB wall collision, camera/head-bob, footsteps.
- **`lights.js`** — `updateLights()`: event-driven flicker bursts (entity proximity triggers them — flicker is the entity radar), light-pool binding, positional buzz binding.
- **`interact.js`** — `updateFocus()` (what [E] targets) and `tryInteract()` (objective progression).
- **`lifecycle.js`** — `startGame`, `respawn`, `die`, `win`.
- **`ui.js`** — DOM refs (`ui`), `toast`, objectives HUD, overlay/pause logic, pointer lock, settings persistence (`localStorage` key `noclip_settings_v1`), mixer wiring.
- **`input.js`** — keyboard/mouse/pointer-lock listeners (side-effect module).
- **`main.js`** — imports everything and runs the `requestAnimationFrame` loop.

THREE is a global (classic CDN `<script>` loads before the module graph) — modules do not import it.

There are intentional function-level circular imports (`monster ↔ lifecycle`, `ui ↔ lifecycle`); they are safe because nothing in the cycle is called during module evaluation. Don't add top-level calls across these boundaries.

## Key conventions

- The map coordinate system uses `cellToWorld` / `worldToCell` to convert between grid cells (integers) and Three.js world space (meters).
- `MeshPhongMaterial` is used deliberately over `MeshLambertMaterial` on large floor/ceiling planes — Lambert is per-vertex in Three.js r128, which produces all-or-nothing lighting on geometry with only corner vertices.
- Light pool pattern: `LIGHT_POOL_N = 20` point lights are reused each frame, bound to the nearest ceiling fixtures within `LIGHT_BIND_RADIUS`, instead of one light per fixture.
- Exported `let` bindings (`grid`, `exitDoor`, `lights`, `interactables`) are reassigned/mutated by their owning module; importers see live values but must not assign to them.

## Archive

`archive/` contains earlier iterations, including the original single-file version of the game (`archive/index.html` lineage). Not served as the live site.
