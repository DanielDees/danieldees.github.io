---
id: 1
name: THE END
subtitle: The Infinite Library
danger: 3
entities: The Librarian
document-form: card-catalog card
document-found: in a drawer of the central desk
---

## Description

At the bottom of everything there is a library.

The old wanderer databases give it a name that is less a name than a verdict: THE END. The
last level. The floor beneath every floor. It is said to hold a record of every level of the
Backrooms — every survey, every field note, every wanderer who ever wrote anything down —
shelved, indexed, and kept. It is also said that nothing kept here is ever permitted to leave.

You do not find THE END by looking. You fall into it. Elevators whose brakes were older than
their levels; stairwells that kept going after their buildings gave up. Most arrivals are
wrecks. The library does not seem to mind. The wrecks get catalogued too.

It is one room, and the room does not end. Shelf runs converge and anchor into walls that
exist only to receive them. Hanging light strips wake in slow waves when something new
arrives, as if the library is opening one eye. Reading tables, ladders, lecterns; a great
central desk; and — incongruous, humming — banks of very old computers, because at some point
the library began keeping its newest records on floppy disk, and no one who might explain why
has ever come back up.

The carpet is thick. Your footsteps belong to it, not to you. Remember that.

## Entities

**The Librarian.** The library's keeper is the size of a horse and has eight legs, and it does
not see so much as *hear*. It browses the stacks at a patient walk, tending to something —
reshelving, wanderers say, though no one has watched long enough to be sure what.

It knows the sound of its collection being touched. Take a disk from a shelf and it will stop,
consider, and come — and every further disk you take before it loses interest brings it faster.
It has been observed crossing the room along the walls and the ceiling when it judges the
floor too slow. The hanging lights gutter as it passes beneath them: in THE END, as in the
level above, flicker is your radar.

It cannot reach beneath the reading tables. It knows this, and it will wait. It does not wait
forever; it is a librarian, and there is always other work.

## Survival

- **Crouch.** Crouched movement on that carpet is silent — genuinely silent. Walking upright
  can be heard from a corridor away; running, from much further.
- **Take the disks one at a time.** Every pickup is a bell rung directly in its ear. Stack
  pickups and it arrives angrier and faster. Take one, move, wait for the stacks to settle.
- **Under the tables is sanctuary,** but sanctuary with a clock on it. Use it to break its
  search, not to live in.
- **Watch the lights, always.** The wave of guttering strips is the only map of its position
  you will ever get.
- **When the lights drop to embers** — and they will, once you have begun taking things —
  do not panic-run. The dark is the same room. The carpet still muffles a crouch.

## Exits

The databases are unanimous: THE END has no exits. That is what the name means. The stairwells
and elevator shafts that empty into it do not run in the other direction.

The library's own records disagree. The newest entries, the ones on disk, describe a terminal
at the central desk that accepts the collection one floppy at a time — and what it printed
when a wanderer fed it the last one. A single line, before the static:

Every account of what happened next describes the same three things: the Librarian abandoning
its patrol at a dead sprint; the sound of digging; and a hole in the library floor, ringed in
torn carpet, breathing cold blue light, with a stair spiralling down into fog.

There is no record of what is at the bottom of the stair, because everyone who has ever
written for this database stopped writing at the top of it.

The terminal's last words are the only exit sign THE END has ever hung: **I WARNED YOU.**

## Field Notes

> the books are real. i pulled one. it was a transcript of a conversation i had when i was
> nine. i put it back very carefully.

> it reshelves. hours of it. what kind of predator tidies?

> counted the seconds between taking a disk and hearing it stop walking. one. exactly one.
> every time. it isn't reacting. it's *deciding.*

> the tables work. it circled me for ten minutes. i listened to it breathe. then it just —
> lost interest. went back to work. i am furniture to it until i touch the collection.

> fed the terminal the last disk. the screen said THE END. then it said something else, and
> i want it on record that i typed nothing. it answered a question i hadn't asked yet.

## Found Document

*A card-catalog card, heavy stock, typewritten, found in a drawer of the central desk. The
drawer's brass label frame is empty. There are handwritten additions in the margins, in more
than one hand.*

    CATALOGUE OF ACQUISITIONS — SUB-BASEMENT (FINAL)

    ITEM:        WANDERER, UNINDEXED. ARRIVED VIA SHAFT COLLAPSE.
    CONDITION:   AMBULATORY. NOISY.
    DISPOSITION: PENDING.

    CROSS-REF:   MAGNETIC MEDIA, ASSORTED (16–22 VOLS.)
                 SEE: TERMINAL, CENTRAL DESK.
                 SEE ALSO: WARNING, IGNORED.

    LENDING RECORD:
    ______________________________________
    DUE DATE            RETURNED
    —                   NEVER
    —                   NEVER
    —                   NEVER

*In the top margin, pencil, small and neat:*
it counts what you take. it does not count what you read. read anything. take nothing.

*In the bottom margin, ink, hurried:*
the terminal asks for the disks. the keeper hates every one you feed it. one of them is
lying to you and i no longer believe it's the spider.

## Design Notes

Dev-facing; the lore parser ignores this section.

- Matches game v2.6.0: arrival via elevator brake failure (crash IS the transition);
  16–22 floppy disks; disc pickups alert the Librarian after a flat 1s (stacked pickups cut
  the countdown and add speed; distant pickups trigger wall/ceiling transits); crouched
  movement is silent; tables are crouch-only sanctuary with a stalk timeout; flicker radar;
  125s post-first-pickup light drop + blackouts; terminal ending → dig cutscene →
  `revealHole()` → CRT burns red "I WARNED YOU" → ENTER THE HOLE objective → walkable spiral
  stair, depth fog, fade below −8.5m.
- "The End" per canon flavor: the infinite library at the bottom of the Backrooms, keeper
  entity, knowledge of every level, no exits. Ours adds the hole as the contradiction.
- The wiki entry deliberately withholds what the terminal printed until the Exits section's
  final line, mirroring how the game withholds the objective until the dig has happened.
- **Document pickup (future):** a `catalog card` interactable in a card-catalog drawer near
  the central desk (new small prop, or reuse a desk drawer face). Flag as `documentFound[1]`;
  menu unlock `beaten && documentFound` per [README.md](README.md).
