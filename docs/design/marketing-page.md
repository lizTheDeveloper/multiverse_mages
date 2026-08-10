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
| 1 | **Hero — the mirror** | The live grid and its reflection. Establishes the world and the one novel mechanic in a single interactive object |
| 2 | **Knowledge is physical** | The intact archive crossfading to the burned one. Kill the last mage who knew it and burn the book, and it is *gone* |
| 3 | **The scholars** | Mages are academics with careers, and species differ by lifespan. Establishes that the player nudges rather than commands |
| 4 | **Status** | Honest current state, public repo. No signup, no wishlist theatre |
| 5 | **Close — the portal** | Ends on an opening, not on ruin: *somewhere, another god is deciding what fire means* |

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

**The mirror — the signature element.** The hero is not a picture, it is the grid itself, rendered
twice: your sky above, and beneath a lamplit horizon, its reflection — dimmer, ember-tinted, labelled
*anyone raiding you*. The same nineteen switches drive both. Permit *Ignem* and it lights in your
grid and in theirs simultaneously; the tally reads `15 / 70 in your sky · 15 in theirs`.

This is the whole pitch in one object. The symmetry of the portal rule is the game's one genuinely
novel idea, and prose takes a paragraph to land it where the mirror lands it in a single click. Every
other element on the page is deliberately quiet so this one carries.

Cells are capped at ~45px so the grid reads as an instrument rather than a wall of squares, and the
horizon sits just above the fold at a laptop viewport — you see your own sky first, and discover the
reflection by scrolling.

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
- Should the page name the AGPL licence prominently? For this audience it is likely an asset, not
  fine print.
