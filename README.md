# NOCLIP — Escape the Backrooms

**Version: v1.1.0**

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
