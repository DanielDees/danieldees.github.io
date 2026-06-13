# NOCLIP — Escape the Backrooms

**Version: v2.2.0**

A browser-based survival horror game, playable at
[danieldees.github.io](https://danieldees.github.io). Vanilla JS ES modules built
on three.js — no build step, no dependencies to install.
Vibe-coded with Claude Fable 5 / Claude Mythos 5.

## The game

Two levels, two monsters, one way down.

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
uncrouched, even turning to look — reads as safe. Find the scattered disks and feed
them to the terminal at the heart of the room while staying quiet and using the tables
for cover. Fifty-five seconds after you take the first disk, the lights burn down to
embers and the library wakes up the rest of the way.

## Controls

| Key | Action |
| --- | --- |
| `WASD` + mouse | move / look |
| `SHIFT` | sprint (drains stamina / makes noise; bottomless once adrenaline kicks in) |
| `SPACE` | jump |
| `C` | crouch / hide (silent in THE END; the only way past the spider). Hold by default, or switch to a toggle in the sound/options sheet |
| `E` | interact |
| `O` / `ESC` | sound mixer / pause (how to play lives on the pause sheet) |

Headphones recommended — audio is positional, and both monsters are far easier to
track by ear.

## Changelog

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
