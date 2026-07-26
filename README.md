# NOCLIP — Escape the Backrooms

**Version: v3.0.0**

A browser-based survival horror game, playable at
[danieldees.github.io](https://danieldees.github.io). Vanilla JS ES modules built
on three.js — no build step, no dependencies to install.
Vibe-coded with Claude Fable 5 / Claude Mythos 5.
Per-level lore lives in [lore/](lore/).

## The game

Three levels, one keeper you keep meeting again, and always another way down.

**Level 0 — the backrooms.** You fell through the world into damp carpet, yellowed
wallpaper, and the endless drone of fluorescent light. Collect 3 bottles of almond
water, find the fuse, restore power at the breaker panel, and reach the exit
elevator — all while avoiding the entity that fell through long before you did. The
lights nearest to it misbehave: distant flickering (and a sickly orange shift)
tells you exactly where it is. With each objective it grows faster, hungrier, and
learns to **fold space** — poofing across whole stretches of corridor in an instant.
Restoring power floods you with adrenaline (a blue bar, bottomless sprint) for the
final dash, because by then you cannot outrun it on legs alone. The elevator ride
down is not the clean escape it looks like.

**THE END — the infinite library.** The brakes never caught. You wake in the wreck
of the cab on the floor of a vast, dim library: half-abandoned stacks, dead
machines, and a horse-sized blind spider that pads between the shelves. It cannot see you — it
**hears** you, and it keys on **motion**: every footfall above a crouch, every floppy
disk you pull from a shelf, draws it closer, but holding perfectly still — even
uncrouched, even turning to look — reads as safe. And it does not stay on the floor:
when it loses your trail it **crawls the walls and webs up to the ceiling** to cut across
the room, then **drops on you** from above — a telegraphed plunge you survive only by
moving clear, crouch or not. Find the scattered disks and feed them to the terminal at
the heart of the room while staying quiet and using the tables for cover. About a minute
and a half after you take the first disk, the lights burn down to embers and the library
wakes up the rest of the way. Return every disk and the librarian answers in person —
not for you, but to open the way down. It did warn you.

**THE NEST — the cave below.** You followed it home. The stair gives up into a karst
warren lit only by veins of blue fungus: crawl-squeezes the spider can't follow you
through, a black stream that hides your footsteps while you wade it, loud scree, a rock
bridge over a chasm, and silk that thickens toward what it protects. Beside the dead
stair, a corpse still cradles a **hand-crank lantern**, its ember glowing faintly in
all that blue: take it, and its warm ring of flame-light physically drives the
eight-eyed, cat-sized **hatchlings** back all around you — but cranking it is loud, and a flame held
burning in open cave is a beacon the **matriarch** reads fluently. She tends her four egg clutches on a
patrol; near the nests the silk-laced ground carries your footfalls to her at twice the
range. Ignite all four clutches — a three-second channel, stationary, sparking — and
survive what each burn wakes: a frenzy, a rockfall that reshapes the maze, and less
fungus-light every time. When the last clutch burns she stops tending anything, ever
again — and somewhere in the rubble a fissure opens, breathing cold air from above.
The chimney is real: climb it yourself, tread by tread, into the pale.

## Controls

| Key | Action |
| --- | --- |
| `WASD` + mouse | move / look |
| `SHIFT` | sprint (drains stamina / makes noise; bottomless once adrenaline kicks in) |
| `SPACE` | jump |
| `C` | crouch / hide (silent in THE END; the only way past the spider). Hold by default, or switch to a toggle in the sound/options sheet |
| `E` | interact (hold it to channel THE NEST's clutch burns) |
| `F` / `R` | THE NEST only: lantern on/off / hold to crank the charge back up (loudly) |
| `O` / `ESC` | sound mixer / pause (how to play lives on the pause sheet) |

Headphones recommended — audio is positional, and both monsters are far easier to
track by ear.

## Changelog

### v3.0.0 (2026-07-18)
- **A third level: THE NEST.** The spiral stair below the library now lands somewhere —
  a procedurally carved karst cave (chambers, winding tunnels, crawl-squeezes, a black
  stream, scree aprons, one rock bridge over a chasm) lit only by bioluminescent fungus
  wired into the same flicker-radar light pool as every floor above it. Cosmetic silk
  thickens toward the brood chambers: you navigate by reading how afraid you should be.
- **The crank lantern.** Found on a corpse beside the dead stair — the dropped lantern
  still holds a **dying ember**, a warm breathing point of light in the fungus blue that
  marks the pickup (with the journal lying open beside it) from across the chamber. In
  hand it is a *lantern*, not a flashlight: an all-round pool of warm orange flame-light
  that breathes with the slow unevenness of a real mantle (plus a soft wide forward wash —
  no cone edge on the rock). The glow repels the brood in every direction, the charge
  runs down, cranking it back up is loud, and a flame held burning in open cave steers
  the matriarch to you. Both of its lights live in the scene from boot at intensity 0,
  so switching it on can never trigger a shader recompile.
- **The hatchlings.** 5–6 sound-hunting, photophobic skitterers with their own
  territories. One that reaches you latches on — stamina bleed, screen-corner horror,
  and a screech that feeds the matriarch your position until you shake it off or burn
  it off with the lantern. At range their taps are tuned to be mistakable for dripwater.
- **The librarian, at home.** Same spider, same gait — new life: a tending patrol
  between the four clutches, doubled hearing through the silk-laced nest floors, duller
  senses in open cave, a dead-run frenzy when a clutch burns, and a permanent hunt once
  the last one goes. It cannot follow you through the squeezes; they are the tables of
  this level.
- **Burn the brood.** Four egg clutches, each a held three-second ignite channel —
  stationary, sparking, maximally vulnerable. Every burn triggers a 60–90s frenzy, kills
  the local fungus glow, and drops a rockfall that closes one corridor and opens a
  sealed one — validated so the cave can never strand you. The fourth burn opens the
  fissure: a real, walkable chimney (the library stair's math, inverted) climbed into a
  pale fade-out.
- **Cave audio.** Drip percussion with double echoes, a stream bed that masks your
  noise, crank ratchet, striker ticks, clutch fire crackle, rockfalls, hatchling
  hisses/screeches, and the fissure's updraft wind — all synthesized, as ever.
- **The look.** A cave that is actually cave-shaped: no boxes, no flat panels
  anywhere — the floor rolls, the walls are displaced faceted rock that leans
  into overhangs near the vault, and the ceiling is a craggy corner-shared
  surface that domes to 18m over the central chamber and pinches into the
  crawls (their mouths ramp down inside the squeeze — over any ground you can
  stand on, the rock is guaranteed to clear twice your height). Tunnels are 8m
  bores you could drive a bus through; every surface, the player's feet, the
  spiders' legs and every web/fungus/dripstone anchor sample the same terrain
  functions, so nothing floats and nothing buries. The way you came is still
  there: the library's own descent shaft comes down **through the vault** —
  a round stone bore ringed in flowstone, the same spiral stair (same treads,
  same pitch, the same helix) winding up out of sight into a haze that goes
  lightless, its lowest flight collapsed into half-sunk treads and silked
  shut — the mirror, wrong side out, of looking down the hole behind the
  library desk. Bump-mapped strata rock;
  real dripstone grown from lathe profiles with drip-ring bulges,
  per-vertex noise and a pale streaked calcite skin (nothing is a cone), in
  location-bred varieties — knobby spire stacks on flowstone mounds answered by
  hanging spires, full floor-to-vault columns waisted where the pair met,
  drapery curtains folded off the chamber walls, flowstone cascades spilling
  down the stream banks, snapped stumps and toppled spires in the scree,
  soda straws clustered around ceiling seeps, and partner-less stalactite
  fields hung thick across every chamber dome — merged to three draws total;
  a real fungus ecosystem — lathe-built
  mushrooms skinned by a procedural atlas (glowing gill undersides, banded conk
  tops, pore-speckled bulbs) in location-driven varieties: shelf conks climbing
  the chamber walls in size classes from palm-width juveniles to metre-wide
  ancients mounted above head height, toadstool families on the floors, green
  coral fingers on the stream banks, pale puffballs in the scree, all blushing
  violet near the brood chambers — every colony trailing real **mycelium
  cords**, thin glowing root-ribbons that follow the displaced rock point by
  point (no painted-on decals anywhere); webs that are
  silk STRUCTURES, not wall decals — sagging corner sheets strung between wall
  faces, cobweb fans hung off the wall-ceiling line, funnel-weaver retreats
  diving into the floor junctions, hammocks slung on real guy-lines, twisting
  streamers that brush your face in the low tunnels, torn veils choking the
  squeeze mouths, old stalagmites wrapped and staked in silk, a layered canopy
  of generations directly over every brood, every chamber dome **rigged like
  the den it is** — sheets slung under the vault, veils off the stalactite
  line, lines strung vault-to-vault — and the mouth you arrived by webbed
  shut — all of it lit silk that glistens under the lantern, dense by brood
  proximity, merged to seven draws; a drifting
  caustic skin on the stream;
  layered cold haze in the chasm; nest-glow pooled under the clutches that turns
  fire-orange as they burn.
- New intro and ending cinematics; new death/win copy; level-2 objectives HUD +
  lantern charge bar; the descent from THE END now hands off seamlessly mid-black.
- Cheat: triple-[9] drops you into THE NEST with the lantern (again from inside: burns
  the brood down to one and stands you at the survivor).
- `lore/` folder: parseable per-level lore documents (wiki entry + in-world found
  document per level) — the groundwork for in-game lore pickups and a menu viewer.

### v2.6.0 (2026-07-04)
- **A real ending for THE END.** Feeding the terminal its last disk no longer whites
  out into the win sheet. The machine prints "THE END", dies into static — and the
  camera cranes up and out to an aerial seat (chosen at runtime for clearance through
  the random canopy of hanging lights) to watch the answer: the librarian sprints in
  and **digs itself through the floor** behind its own desk, working in a churning
  shroud of earth-brown and carpet-blue dust that swallows the ground completely while
  the spider stays half-readable inside it. When the dust settles there is a **round
  hole** rimmed with flung dirt, a **stone spiral stair** winding down its wall, and a
  blue glow/fog that lets you read two or three turns before it swallows the depths.
  The camera settles back into your eyes — and the terminal's CRT burns red with a
  crying face, drawn in chunky pixels, weeping for as long as you stand there.
- **Enter the hole.** A new final objective — and the stairs are *real*. Walk over
  the rim and descend the spiral yourself, tread by tread, the shaft wall at your
  shoulder and the blue fog thickening with every turn. A couple of spirals down,
  with most vision already gone, the dark takes the rest of the walk: fade to
  black, your echoing footsteps on stone carrying on a while longer. (The next
  floor is TBD — for now, this is the win.)
- **The dig is dressed properly.** The dust is a pooled soft-billboard particle
  system — a mottled procedural puff texture tinted across earth and carpet hues,
  with a churn boiling out of the work, a heavy ground shroud, a breakthrough ring
  burst when the floor lets go, and tumbling clods that raise their own little puff
  where they land.
- **New synthesized audio**: scrabbling claw-work and carpet rips for the dig, a deep
  rolling collapse for the breakthrough, and echoing stone footfalls for the descent.
- **Debug warp remapped**: the terminal warp is now tap `8` ×3 (it was typing
  "the end"), joining `6` ×3 and `7` ×3.

### v2.5.0 (2026-06-24)
- **Runs on far weaker hardware.** A performance and memory pass targeting the
  lowest-end machines — integrated graphics, and even no discrete GPU — with **no
  change to how either level looks or plays**. The headline fixes are structural:
  they lower the minimum spec rather than chasing raw FPS on strong cards.
- **The memory leak is gone.** Level teardown now properly **disposes** its GPU
  resources. Previously every death-and-respawn (Level 0) and the descent into THE
  END leaked the *entire* previous level — hundreds of textures and geometries that
  were never freed — so on a low-VRAM device a handful of deaths could exhaust memory
  and crash the tab. Memory is now **flat across any number of respawns and
  transitions** instead of climbing without bound.
- **Far fewer draw calls.** Every wall in a level is merged into a single mesh
  (Level 0: ~170 wall blocks → **1**; the library: ~95 → **1**), and every static
  object stops recomputing its transform every frame. Together these cut the per-frame
  CPU cost the most on weak CPUs and integrated drivers, where each draw call is
  expensive.
- **A smoother frame loop.** The per-frame lighting update no longer allocates throwaway
  arrays and objects every tick — a source of garbage-collection stutter on slow
  hardware — and reuses its scratch buffers instead.
- **New LOW graphics option.** The Options sheet gains a **GRAPHICS** toggle: LOW caps
  the render resolution to 1× and turns off antialiasing — a large gain on integrated
  GPUs, fill-rate-limited laptops, and high-DPI screens. The setting persists. (The
  antialiasing change applies on the next reload.)
- **Table-disc softlock fixed.** A disk sitting on a table could pin the librarian
  against the table edge forever: its "reached the sound" check needed it within
  2.0m of the heard spot, but the personal-space rule around tables holds its body
  at *exactly* 2.0m — geometrically unreachable, so it could re-path the same
  unreachable spot indefinitely and only a louder noise (the player moving) would
  break it out. Sounds on a table now count as reached from just outside that
  keep-out, and the anti-stuck watchdog escalates a pinned search into a proper
  investigate — the episode always ends and its stacked speed always resets.
- **Codebase health pass.** A cleanup sweep ahead of the next feature push, with no
  gameplay changes (seeded generation verified byte-identical before and after):
  - Three real bugs fixed: the circulation-desk lamp now actually goes dark during
    the ending blackout (its handle was never wired through, so "every light lets
    go" spared exactly one); dying mid-blackout no longer leaves the library's
    strips stuck dim after respawn; and the elevator carve now disposes the wall
    decals it removes instead of leaking them every rebuild.
  - Recurring waste removed: the Level-0 troffer fixture is now a proper builder
    (`makeTroffer`) with module-level shared assets instead of regenerating its
    textures and geometry on every respawn; the entity's smoke texture is cached
    instead of being rasterized fresh on every space-fold; and the HUD only writes
    to the DOM when a value actually changes instead of every frame.
  - Consistency: one shared `hash` helper (was four copies), one settings
    key/reader module (was two independent `localStorage` parses), one
    shelf-board elevation table (was three hardcoded copies that had already
    drifted a few millimetres), and fail-soft guards on the options sliders.
  - Robustness: the prop-placement loops got bounded retries and grid-sweep
    failsafes, so a pathological map generation degrades gracefully instead of
    crashing or hanging the level build.
- Still zero-dependency vanilla JS; both levels verified to render identically before
  and after.

### v2.4.0 (2026-06-24)
- **Input hardening.** Crouch is now `[C]` only — `CTRL` is no longer a crouch key and
  is swallowed in-game, so browser chords (Ctrl+W to close the tab, etc.) can't kill a
  run. Every held key is cleared on focus, tab-visibility, and pointer-lock loss, so a
  dropped keyup can no longer strand you drifting with nothing pressed. The cutscene
  camera no longer whips a full ~360° toward its mark (a shortest-arc `angLerp` fix).
  The "Sound" menu is renamed **Options** — it also holds mouse sensitivity and the
  crouch mode.
- **A harsher entity (Level 0).** Chase speed is up 10% and kill reach up 25%, so
  corners buy you less. Crouching still cuts its detection range hard (−60%), but only
  before it has committed to the chase. Death now **restarts the floor** — the maze
  reshuffles, objectives and timer reset, and the entity goes back to sleep; progress
  is no longer carried across a death down here. Almond water no longer spawns in
  direct line of sight of the fall-in point.
- **A tighter library (THE END).** The spider's floor detection (sight + hearing) is up
  10% — except while you are stationary *and* crouched, which is untouched; its
  wall/ceiling senses are unchanged. The disk hunt is shorter (**15–20** disks, down
  from 18–23), and the burnout blackout is pushed back another 30s (to 125s after the
  first pickup) to give the search room to breathe.

### v2.3.0 (2026-06-13)
- **The librarian climbs.** The spider gains a third dimension. When it loses your
  trail it crawls the **perimeter walls** and webs itself up to the **ceiling** to
  reposition across the room, righting its whole body and eight-leg gait to whatever
  surface it's on. On a far disc pickup it now takes the faster surface route —
  rounding wall corners or gliding straight over the ceiling — instead of slogging the
  floor. New pickups **re-route it mid-glide** to the newest disk (unless it's already
  committed to a descent).
- **Drop attacks & silk.** Once overhead it **rappels straight down head-first on a
  silk line** — a telegraphed plunge (1.5 s wind-up + a fast descent) you escape only
  by moving out from under it; crouching does **not** save you from a drop. Severed
  rappel lines shrivel into **persistent coils that accumulate on the ceiling**,
  dressing the room with the evidence of the hunt.
- **Surface-aware hearing.** Detection is now properly **cylindrical** — the spider
  hears you by horizontal distance whether it's on the floor, a wall, or the ceiling
  (so a player directly below an overhead spider is squarely in range). A wall-mounted
  spider only faces a semicircle, so its hearing reaches **+40%** to compensate, and a
  player who runs near it on the wall now pulls it off its errand to pursue.
- **Faster, tenser loop.** Base wander speed is doubled and the calm browse → pause
  cycle is much shorter, so the spider covers ground and leaves the floor far more
  often instead of plodding. Chase / stalk / mild-seek sit at 1.4× / 1.25× / 1.1× the
  wander pace. Fewer bookshelf runs and **two to three more disks** tighten the search;
  the burnout blackout is pushed back to give the new pace room to breathe.
- **More survivable stealth.** Crouched-and-still detection drops 30% and ordinary
  movement 20%, with running read a touch farther than walking — quiet, deliberate
  play is rewarded against a spider that is now much more mobile.
- **Atmosphere.** The library ceiling's faint backlight is brighter and its hue dialed
  toward neutral so the climbing silhouette reads cleanly overhead against it.

### v2.2.0 (2026-06-12)
- **Distinct 3D bookend & archive-box assets.** Bookends that used to read as
  untextured "ghost books" are now thin brushed-gunmetal plates with a foot the
  end volumes stand on. The plain brown storage boxes are rebuilt to the books'
  standard: a pool of kraft-cardboard archive boxes, each laid out per-design at a
  uniform texel scale (no stretching) with a pasted, bordered label — eight label
  variants — oval handle cut-outs in the ends, and a creased, corrugated lid.
- **Fuller shelves.** Each shelf board now carries 0–20 volumes (≈8 on average, so
  a four-row case holds ~32) instead of the old 0–12, while staying convincingly
  half-abandoned. Carts carry 2–12.
- **Crouch toggle.** A new option in the sound/options sheet switches crouch between
  hold-to-crouch (default) and a press-to-toggle latch; the choice persists.
- **Stillness is safety.** The librarian now keys on motion rather than posture:
  standing perfectly still — even uncrouched, even rotating the camera to look
  around — reads the same as crouching. Movement is the giveaway.
- **HUD bows out for cutscenes.** Whenever a cinematic owns the camera, the whole
  HUD — objectives, stamina bar, menu button, key hints, crosshair — fades out over
  ~1s and fades back in when control returns, so the scripted shots play clean.
- **Re-lit elevator crash.** The emergency-light red no longer strobes the whole
  screen by recoloring the bright ceiling panel. The panel stays white and simply
  sags, stutters, and dies as the power fails; a real dim point source at the
  emergency lamp in the back of the cab supplies the red, matching the lit-by-one-
  lamp look of the wreck you wake in. The cab's ambient floor also drains ~50%
  through the failure, so the spark spray reads as the brightest thing left.
- **Debug:** typing `the end` in-game warps to THE END set up for the finale —
  every disk pocketed, the librarian parked far off, you standing at the terminal.
  The `H` how-to-play hotkey was removed (it lives on the pause sheet); the rest of
  the hidden warps (`6`×3, `7`×3) are unchanged.

### v2.1.0 (2026-06-12)
- **Real 3D books.** The library's flat-colored box "books" are replaced by a pool
  of 16 distinct, properly 3D volumes — cover boards with fore-edge overhang, a
  rounded spine, a recessed page block — each with its own procedural cover and
  **legible backrooms titles** in gilt serif on both the spine (top-to-bottom,
  raised bands, some with volume numbers) and a framed front-cover plate with a
  line-art motif (an eye, a door ajar, a spiral, an hourglass, a key, a descending
  stair) and author. Cover canvases are laid out per design at uniform
  pixels-per-meter, so titles map 1:1 with no stretching or blur.
- **Lived-in, half-abandoned stacks.** Every shelf board rolls its own 0–12 book
  budget (~4 on average, so a four-row bookcase carries ~16 volumes) in natural
  arrangements: lone survivors sometimes slumped sideways, short rows with one
  more book tipped against the end, books left lying cover-up, small stacks,
  bookend pairs still clamping a few spines, and books abandoned open mid-read —
  a splayed spread with an italic epigraph over two columns of faded lines. Return
  carts carry 2–12 real volumes plus a push handle and a stencilled RETURNS
  plaque; some lecterns still hold what their reader walked away from. Floppy
  disks only ever spawn on shelf space the books left open.
- **Coherent posters.** Wall notices and clippings are now ~80% readable signage
  written for this place — several lines double as honest gameplay advice (crouch
  beneath the reading tables, the librarian hunts by sound, return all disks to
  the terminal) — with one line in five still sliding off into the old madlib
  nonsense. A new MISSING-patron notice layout joins the official notice and the
  newspaper clipping.
- The wall around the crashed arrival elevator is a no-spawn zone for posters,
  artwork, and cracks.

### v2.0.0 (2026-06-12)
- **THE END — the infinite library (Level 2).** The failed elevator drops you into
  an entirely new level: one vast room of bookshelf runs, crouch-under tables, free-
  standing set dressing (lecterns, ladders, mannequins, return carts, globes), and a
  central circulation desk with the one terminal that matters. Everything is
  procedurally generated and laid out so the spider can path any aisle or circle any
  table cleanly.
- **The librarian.** A blind, horse-sized spider with a procedural eight-leg gait
  hunts entirely by sound. Disc pickups alert it to that spot after a distance-scaled
  delay; stacking pickups before it arrives wind up its speed (up to 2.5× your
  sprint, with an acceleration ramp). Moving uncrouched within ~17m alerts it
  strongly; crouching is silent. It cannot reach under the tables — a hidden player
  gets a circling stalk that eventually times out.
- **The objective.** Collect 16–22 floppy disks off the shelves and feed them to the
  terminal. Returning the last one triggers the ending cinematic: the machine boots,
  prints "THE END", dies into static, and the spider rushes the noise as the lights
  fail and the screen whites out.
- **The crash transition.** The Level 0 elevator's brake failure *is* the level
  change — the screen is already black when you come to in the wrecked cab, the doors
  grind open in two tries, and the faulty library grid wakes in a slow wave rolling
  out from the doorway.
- **The space-fold.** Level 0's entity now teleports along its current path every
  ~13s (tightening with difficulty), poofing into dark fog crossed with dissipating
  shear lines, with a muted *vvwmp* at both ends. Every recurring disruption pulse
  also hands it your current position. Its old per-difficulty speed creep was removed
  — the fold more than makes up for it.
- **Adrenaline finale.** Once the breaker is fixed, stamina goes bottomless and turns
  into a blue ADRENALINE bar, and sprint speed rises 20% (to 9.6 m/s) — a fair shot
  at reaching the elevator now that the entity can fold.
- **Quieter HUD.** The yellow pop-up tooltips are gone on both levels; the objective
  box is the single source of truth. Blocked interactions give a dull clunk instead
  of a text scold.
- Still zero-dependency vanilla JS. Hidden debug warps for testing: tap `6` ×3 to
  jump to the Level 0 endgame, `7` ×3 to drop into THE END (or, once there, to pocket
  every remaining disk).

### v1.5.0 (2026-06-12)
- **The exit elevator.** The exit door is now a recessed, two-leaf elevator
  carved into its wall — brushed-steel panels, a speckled floor, handrails,
  corner posts, an interior button column, and a wall-mounted floor indicator.
  Calling it (once power is restored) plays a full escape cinematic.
- **Elevator escape cutscene.** Press the call button, watch the doors open, step
  in and turn — the entity is sprinting down the corridor straight at you, and the
  doors seal a beat before it slams into them. Then the ride down: the floor
  indicator ticks −1, −2, −3 as the cab descends, a button sours from green to
  yellow, a pop, and the brakes fail. The indicator and button panel glitch into
  impossible floor numbers (down to −132) and strobing red/amber, sparks spray
  through the door seam, the lights cut to a dim red emergency lamp, the cab lurches
  and the brakes grind themselves apart as the screen shakes and fades to black.
- **Breaker-fix cutscene.** Restoring power now plays a short scripted animation —
  the panel door swings open, a fuse conjures into the slot and seats with a
  surge, the door claps shut. You lose control for the ~3.5s it runs, which is the
  point: the entity drops everything and **rushes the breaker at full chase speed**
  the instant you start it. If it reaches a 30m ring around you while the animation
  plays, it freezes there — then cries out and gives chase the moment control
  returns.
- **Ceiling-leak drips.** Brown water stains now run from the ceiling seam down the
  walls in tapering stalactite-shaped rivulets, each with a small feed blotch on
  the ceiling above it — unique per leak and scattered across the map.
- **Louder, more frequent entity.** All of the entity's noises are ~20% louder, and
  its groans and wall-knocks recur ~30% more often.
- **Shockwave tuning.** Escalation now tightens the disruption pulse by 5s per
  objective (was 10s), and every shockwave's pitch, voicing, and sweep are
  randomized so the recurring pulse never plays the same twice.
- All cutscenes are verified end-to-end and the game still ships as zero-dependency
  vanilla JS. (For testing, a hidden debug warp — tapping `6` three times in game —
  jumps straight to the elevator with all objectives cleared.)

### v1.4.0 (2026-06-11)
- **Escalation.** The entity now grows more dangerous as you progress. Each
  objective step after the first bottle (the 2nd and 3rd almond water, the fuse,
  the breaker fix) widens its detection range by 5%, raises its odds of wandering
  toward you by 5%, and shortens the gap between its disruption pulses by 10s —
  from 60s down through 50/40/30 to a floor of 20s once power is restored.
- **Recurring disruption pulse.** The light-disruption shockwave no longer fires
  only at wake — it recurs from the entity's current position on that tightening
  timer.
- **Deeper, smoother aura.** The darkness aura is rebuilt from 10 to 20 concentric
  shells for a smoother gradient and pushed ~20% darker at the core, reaching out
  to ~53m.

### v1.3.0 (2026-06-11)
- **The entity's arrival.** Taking the first bottle of almond water now lights a
  ~4-second fuse; when it expires the entity wakes and a shockwave of light
  disruption sweeps outward from its spawn point across the whole map. Each panel
  the ring crosses slams to deep blood-red, strobes violently for a few seconds,
  then eases back to normal — so a second "recovery" ring chases the first out
  from the same origin. A layered, dissonant drone (overlapping detuned voices
  across four octaves) holds for the full sweep.
- **Darkness aura.** The entity is wreathed in ten concentric shells of near-black
  fog that dim the floor, walls, and air around it in true 3D out to ~48m,
  ramping from a faint far halo to a deep core — ambiguity that smooths the
  game-asset look without reading as a fog cloud.
- **Body steam.** Wafting dark vapor hugs the entity's silhouette, blurring its
  edges like dark steam.
- **Slime-mold overhaul.** Baseboard mold is now grown per-splotch as a unique
  branching colony with patchy density, can overhang a wall section and continue
  onto the neighbouring wall or wrap around corners, and is spaced out across the
  map (no two colonies in adjacent cells) while appearing more often overall.
- **Proximity static** is now black/red analogue interference biting into the
  image (was a white wash), at lower intensity.
- The entity's light-disruption radius and orange/red hue shift are stronger, its
  in-sight detection and chase range is ~20% longer, and a pathfinding bug where
  it could come to rest inside a wall and stop moving entirely is fixed.

### v1.2.0 (2026-06-11)
- **Much darker.** The ambient lighting floor was cut dramatically — corridors
  away from any fixture now sit in real murk instead of universal low light.
- **Living lights.** Each healthy fixture idles at 85–100% brightness with a faint
  yellow tint on the dimmer ones; the fog is darker and reaches farther, so the
  entity's silhouette stays readable deep into the distance before it's swallowed.
- **Grime.** Procedural slime-mold colonies creep along the baseboards (blackish
  with dark-green hints, growing from wall onto floor); rare water stains and
  irregular blotches mark the ceilings; ceiling tiles are now the classic drop-tile
  size.
- **The entity, heard.** Its breathing, groans, knocking, and proximity bed are
  positionally panned to its true direction with a wider stereo curve, calm-state
  audio is louder and more frequent, and its head now twitches in stepped jolts —
  occasional when alone, near-constant while hunting.
- **The entity, smarter.** Chase paths are straightened (no more grid zig-zag), it
  drifts toward the player's side of the map more often than chance, walks right
  up to a wall before knocking on it, and is recolored near-black with a faint-red
  mouth and eyes.
- **Proximity static** overlay intensifies as the entity closes in.
- The two top-right HUD buttons were consolidated into a single **MENU [ESC]**
  button, and button wiring is fail-soft (a missing element warns instead of
  crashing the page).

### v1.1.0 (2026-06-11)
- Reduced ceiling fixture density (~30% of slots are now dark, up from 15%),
  with gap-limiting so dark slots never cluster into missing rows.
- New end-of-life fixtures: ~10% of lights have warm orange tubes (yellower at
  the ends, more orange at the center) glowing against a dim housing, cast half
  the light, and periodically run a dying cycle — a ~2s hilly dim-down with
  brief partial recoveries, a strobe at the bottom, then a half-second
  flickering climb back to full brightness.
- Each fluorescent tube near the player is now its own light source instead of
  one light per fixture.
- The entity's light-disruption radius is ~15% larger, and lights in range now
  shift to the orange end-of-life color in addition to flickering.
- Fixture rendering fixes: sealed housing interior (no more ceiling texture
  inside), metallic trim flange and frame, grate closed on all four edges and
  aligned with the rim, brighter near-white interior wash behind the tubes.
- Version number now shown on the title screen.

### v1.0.0
- Initial release: procedural Level 0, entity AI with sight/sound detection,
  stamina, hiding, objectives, positional audio, event-driven light flicker.
