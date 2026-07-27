# Lore documents

One markdown file per level. Each file carries **two layers** of lore:

1. **The wiki entry** (`## Description` through `## Field Notes`) — shown in the main menu's
   lore viewer, in the detached voice of a wanderer-maintained database, capped with raw
   field-note scraps from previous wanderers.
2. **The found document** (`## Found Document`) — the text of an in-world artifact the player
   can find inside that level (a torn page, a catalog card, a journal). Shown when picked up
   in-game, in whatever form the document takes for that level.

## Unlock rule

The menu wiki entry for a level unlocks only when **both** are true:

- the level has been beaten, **and**
- that level's document was found during a run (`beaten && documentFound`).

The found document's text itself displays in-level at pickup time regardless.

## File format (parser contract)

Frontmatter is a fenced `---` block of **flat** `key: value` lines — no nesting, no YAML
library needed. A future parser can split frontmatter on `\n`, and the body on `^## ` headings.

```markdown
---
id: 2
name: THE NEST
subtitle: Level 8, wrong side out
danger: 4
entities: The Librarian, Hatchlings
document-form: waterlogged journal
document-found: beside the lantern corpse
---
```

| key              | meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| `id`             | integer, matches `STATE.level`                                 |
| `name`           | level name as shown on the title card                          |
| `subtitle`       | one-line epithet under the name                                |
| `danger`         | 1–5, rendered as a glyph row in the menu                       |
| `entities`       | comma-separated display names                                  |
| `document-form`  | what the in-game document pickup looks like                    |
| `document-found` | where the pickup lives in the level                            |

Body sections, in this exact order (all `## ` level-2 headings):

| section             | audience | notes                                                  |
| ------------------- | -------- | ------------------------------------------------------ |
| `## Description`    | menu     | the level itself                                       |
| `## Entities`       | menu     | what lives there and how it hunts                      |
| `## Survival`       | menu     | how to stay alive, tied to real game mechanics         |
| `## Exits`          | menu     | how the level ends (matches what the game does)        |
| `## Field Notes`    | menu     | short scraps quoted from previous wanderers            |
| `## Found Document` | in-level | the artifact's full text                               |
| `## Design Notes`   | dev only | mechanics/loop spec — **the parser must ignore this**  |

## Files

- [level-0.md](level-0.md) — LEVEL 0, The Lobby
- [the-end.md](the-end.md) — THE END, the infinite library
- [the-nest.md](the-nest.md) — THE NEST, below the library (in design; level not yet built)
