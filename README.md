# NOCLIP — Escape the Backrooms

**Version: v1.4.0**

A browser-based survival horror game set in Level 0 of the Backrooms, playable at
[danieldees.github.io](https://danieldees.github.io). Vanilla JS ES modules built
on three.js — no build step, no dependencies to install.
Vibe-coded with Claude Fable 5 / Claude Mythos 5.

## The game

You fell through the world into damp carpet, yellowed wallpaper, and the endless
drone of fluorescent light. Collect 3 bottles of almond water, find the fuse,
restore power at the breaker panel, and locate the exit door — all while avoiding
the entity that fell through long before you did. The lights nearest to it
misbehave: distant flickering (and a sickly orange shift) tells you exactly where
it is.

## Controls

| Key | Action |
| --- | --- |
| `WASD` + mouse | move / look |
| `SHIFT` | sprint (drains stamina, makes noise) |
| `SPACE` | jump |
| `C` | crouch / hide |
| `E` | interact |
| `H` / `O` / `ESC` | how to play / sound mixer / pause |

Headphones recommended — audio is positional and the entity is easier to track by ear.

## Changelog

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
