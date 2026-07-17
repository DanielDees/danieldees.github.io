---
id: 0
name: LEVEL 0
subtitle: The Lobby
danger: 2
entities: The Entity
document-form: torn notebook page
document-found: tucked behind the breaker panel
---

## Description

If you're not careful and you noclip out of reality in the wrong areas, you'll end up here.

Level 0 is the first floor of the Backrooms: an endless, segmented expanse of empty rooms and
corridors. Mono-yellow wallpaper gone the color of old teeth. Damp carpet that gives slightly
underfoot and never quite dries. Fluorescent panels overhead running at maximum hum-buzz —
a sound so constant that most wanderers stop hearing it within the hour, and never stop feeling
it. Estimates put its extent at some six hundred million square miles. Nobody who produced an
estimate is available for follow-up questions.

The geometry does not persist. Wanderers who died here and — by whatever mercy governs this
place — woke again report that the halls had rearranged while they were gone. Do not bother
mapping. The map is for a building that no longer exists.

The old databases classify Level 0 as safe: no entities, no hazards beyond dehydration and the
slow unravelling that comes from silence and sameness. The old databases are out of date.

## Entities

**The Entity.** Something walks Level 0 now, and it has learned the level's own trick.

It hunts by sight and by sound. It knocks on the walls as it wanders — a knuckle-crack tap
that carries down the corridors, and the closest thing to a warning you will get, along with
the lights: fluorescents gutter and flicker when it is near. Treat every dying tube as a
proximity alarm.

It folds space. Wanderers report walls that were not there a moment ago, standing along the
path it was taking — the level rearranging itself *for* it, a few segments at a time, with a
sigh of fog at both ends of the fold. When the power surges, it comes at a dead sprint.

It does not appear in any earlier survey of this level. Either it noclipped in, like you —
or the level made it. Neither possibility is comforting.

## Survival

- **Crouch and be still.** It hunts movement and sound. If it hasn't seen you, silence and a
  low profile will carry you past it.
- **Watch the lights.** Flicker means close. Dark means closer.
- **Almond water.** The one kindness this level extends: bottles of it, abandoned or left,
  nobody knows. Drink it. It steadies the hands and quiets the head. Collect every bottle
  you find — three is enough to matter.
- **The breaker.** Somewhere in the level is a dead breaker panel and, elsewhere, a fuse that
  fits it. Restoring power wakes the exit — and everything else. The moment the panel surges,
  the body stops negotiating: wanderers describe a flood of adrenaline, bottomless legs, and
  the certain knowledge that the thing behind them is faster anyway.
- **Do not fight. Do not look for it. Do not test the knocking.**

## Exits

One. An elevator, rusted into a wall that has no business holding an elevator, dead until the
level has power. Call it, get in, and ride.

Wanderers' accounts of where the elevator goes are inconsistent, because the elevator is
inconsistent. The consensus, whispered rather than written: pray it stops where you pressed.
The brakes are older than the level.

## Field Notes

> day 4. the water tastes like almonds. i don't drink it for the taste.

> they say level 0 has no entities. someone should tell it that.

> if the lights start dying in a line, the line points at you.

> found the fuse. haven't decided if i'm brave enough to be hunted at full speed for an
> elevator that might not come.

> it knocks. i used to think it was looking for me. now i think it's counting the walls,
> so it knows which ones to move.

## Found Document

*A page torn from a spiral notebook, damp-warped, ballpoint pressed hard enough to tear
through in places. Tucked behind the breaker panel's dead switchgear.*

whoever finds this — the panel works. i watched a man fix it. fuse goes in the bottom slot,
big lever, don't hesitate, the spark won't kill you.

what happens after might. the second the power came back the hum changed pitch, and the
knocking stopped. all of it. everywhere. that's how i knew it was running.

he made the elevator. i watched the doors close on him and i watched the thing hit the doors
one heartbeat later. dented them like a car hood. the arrow above the door pointed down,
which is wrong, because there is no down from here.

i drank his almond water. i'm not proud. my hands stopped shaking for the first time in days,
so when it's my turn to pull that lever, i'll take the steadiness over the pride.

three bottles. that's the ritual. one for the fear, one for the legs, one for

*(the page is torn here)*

## Design Notes

Dev-facing; the lore parser ignores this section.

- Matches game v2.6.0: objectives are almond water ×3 → fuse → breaker (`STATE.powerOn`,
  adrenaline: bottomless stamina + 9.6 m/s sprint) → exit elevator (brake-failure cutscene is
  the transition to THE END).
- The Entity's lore mirrors mechanics: wall-knocking, flicker-as-radar, space-folding
  (~every 13s along its path, −2s per objective), power-surge rush (breaker cutscene).
- Maze regeneration on death/respawn is canonized as "the geometry does not persist."
- **Document pickup (future):** a `notebook page` interactable placed near the breaker panel
  (placement should use the existing `placeProps` clearance rules). Sets a
  `STATE.docFound[0]`-style flag persisted with settings; menu unlock is
  `beaten && documentFound` per [README.md](README.md).
