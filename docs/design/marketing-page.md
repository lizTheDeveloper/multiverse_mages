# Marketing Page — Specification

*What the public page for Multiverse Mages says, shows, and does. Companion to
`docs/design/art-plan.md`, which governs how its imagery is made.*

---

## 1. The job

One job: **make a strategy player understand the central mechanic in under thirty seconds, and want
to play it.** Not to list features. Not to announce a studio.

The central mechanic is unusual enough to be the whole pitch:

> The host universe's ruleset governs all magic cast inside it, for both attacker and defender.

Everything on the page serves that sentence and its consequence — that every permission you grant
arms your enemies as surely as your own scholars.

**Audience:** players of systems-heavy strategy games — Dwarf Fortress, Rimworld, Civilization,
Against the Storm. People who read a mechanic and immediately start looking for the exploit. Write
for them: no marketing adjectives, no "epic," no invented urgency. Show the system and trust it.

**Explicitly not the audience:** anyone who needs to be told what a tech tree is.

## 2. Structure

Five sections, in this order. Each earns the next.

| # | Section | Job |
|---|---|---|
| 1 | **Hero** | Establish the world in one image and one sentence. The image is a candlelit archive, not a battle — the game is about scholars |
| 2 | **The symmetry** | The portal rule, shown as two mirrored skies. The reader must feel the trap: permitting fire arms invaders standing in your realm |
| 3 | **The grid, live** | 5 techniques × 14 forms = 70 cells, as an interactive toggle. Nineteen switches, seventy outcomes. This is the page's centrepiece |
| 4 | **Knowledge is physical** | The intact library crossfading to the burned one. Kill the last mage who knew it and burn the book, and it is *gone* |
| 5 | **What it is / status** | Honest current state, links to the public repo. No signup, no wishlist theatre |

## 3. Copy principles

- **The mechanic is the hook.** Lead with the rule, not with atmosphere. Atmosphere is the image's job.
- **Concrete over evocative.** "Kill the last mage who knew it and burn the book, and it is gone"
  beats "a world of consequence."
- **No feature bullets.** Three ideas explained properly outrank twelve listed.
- **State the development stage truthfully.** The game is pre-alpha and the repo is public. Saying so
  earns more credibility with this audience than a polished vagueness would.
- **Never claim a system that isn't built.** The page describes the design; the repo shows what
  exists. That gap is stated, not hidden.

## 4. Interaction

Two interactions only, both demonstrating the thesis rather than decorating it.

**The grid toggle.** Techniques and forms are independently permittable. Toggling one lights or darkens
an entire row or column, and a running line names the consequence — *"Ignem is permitted. Fire works
in your realm, for anyone standing in it."* This is the fastest possible demonstration of why
nineteen switches produce seventy outcomes, and why the choice is symmetric.

**The library crossfade.** Dragging or hovering moves the intact archive to the burned one. Knowledge
loss is the game's emotional core and the hardest thing to convey in prose; one image pair does it.

Everything else is static. Both interactions respect `prefers-reduced-motion` — the grid is fully
usable without animation, and the crossfade falls back to a side-by-side pair.

## 5. Visual direction

Inherits `docs/design/art-plan.md`. The page is **committed to a dark ground** — this is not a
theme-switching decision but an identity one: the entire subject is lamplight in a dark archive, and
a light rendering would betray it.

| Token | Value | Role |
|---|---|---|
| Ground | `#0E1018` | Indigo-biased near-black — night through a library window |
| Surface | `#171A24` | Raised panels |
| Vellum | `#E8E0CE` | Body text; parchment, never pure white |
| Muted | `#9A9384` | Secondary text, hue-biased warm to match vellum |
| Lamp | `#D9A441` | The single accent. Brass and candlelight |
| Slate | `#3A4358` | Thresholds, portals, rules — the cold half of the palette |
| Ember | `#C4552F` | **Reserved for loss.** Used only where something burns |

Warm against cold is the game's own tension: lamplight versus the void beyond the gate. Ember is
semantic, not decorative — if it appears anywhere except destruction, it has been misused.

**Type:** a calligraphic humanist serif (Iowan Old Style / Palatino lineage) for display and body,
because the subject is manuscripts; a monospace utility face for labels, grid coordinates, and status,
because the project's own character is deterministic simulation and lab notes. No webfont CDN — the
artifact CSP blocks them, and a silent fallback is worse than a considered system stack.

**Imagery:** pixel art from PixelLab, per the art plan. `image-rendering: pixelated` everywhere;
scaling pixel art smoothly destroys the only reason to use it.

## 6. What the page must not do

- No email capture, no wishlist button, no countdown. There is nothing to wishlist yet, and this
  audience reads fake urgency as a tell.
- No gameplay claims in the present tense that the build cannot honour.
- No stock fantasy vocabulary — no "ancient evil," no "forge your destiny."
- No autoplaying audio or video.

## 7. Open questions

- Does the grid toggle read without instruction, or does it need a one-line prompt? Testable the
  moment anyone unfamiliar looks at it.
- Is the burned library too bleak as the final image before the status section? It may need the
  portal to follow it, so the page ends on an opening rather than an ending.
- Should the page name the AGPL licence prominently? For this audience it is likely an asset, not
  fine print.
