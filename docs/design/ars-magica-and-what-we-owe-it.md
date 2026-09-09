<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Ars Magica: what this game took, what it owes, and the one balance idea worth taking next

**Status: author's ruling plus a licensing finding, recorded 2026-08-17.** Companion to
`substrate.md`. The licensing section is a statement about the world and was verified against the
publisher; the design section is a decision.

## Say the obvious thing first

The grid is Ars Magica's. Five Techniques — *Creo, Intellego, Muto, Perdo, Rego* — and ten of the
fourteen Forms — *Animal, Aquam, Auram, Corpus, Herbam, Ignem, Imaginem, Mentem, Terram, Vim* — are
that game's, verbatim, down to the Latin. Four Forms are this project's own: *Umbra, Fatum, Limen,
Nomen*.

Nothing in the repository said so until now. That is the gap this document closes, and it should
have been closed on the first commit that named a cell.

## The licensing position, which is better than it had any right to be

**Ars Magica 5th Edition and 53 sourcebooks were released by Atlas Games under
[CC BY-SA 4.0](https://github.com/OriginalMadman/Ars-Magica-Open-License)** — Attribution,
ShareAlike, International — through a 2024 crowdfunding campaign. Commercial use is permitted.

Three things follow, and each matters to a public AGPL repository:

- **It is compatible.** `CLAUDE.md` already names CC BY-SA 4.0 as *"the natural copyleft
  counterpart"* for non-code assets, and rules out anything non-commercial. BY-SA is not
  non-commercial. There is no conflict.
- **It is a copyright licence, not a trademark licence.** The *text* is licensed; *"Ars Magica"* as
  a name, and the trade dress, artwork and logos, are not. **This game must never brand itself as
  Ars Magica or imply endorsement**, and nothing here proposes to.
- **ShareAlike is viral over derivative text.** If a content file ever *derives from* their
  guideline text, that file becomes CC BY-SA 4.0 — which `CLAUDE.md` anticipates: *"assets are
  licensed separately from code."* Code stays AGPL either way.

## The ruling: take the concept, roll our own numbers

> *"So we can take the concept and roll our own stuff."*

That is the decision, and it is the right one for a reason beyond taste: **game mechanics are not
copyrightable — systems and methods of operation are excluded (17 USC §102(b)) — while the specific
expression of a guideline table is.** Taking the *idea* that Range, Duration and Target multiply a
spell's cost requires no licence at all. Copying their table of base effects would require the
licence, and would bind that file to BY-SA forever.

So: no guideline text is copied, no table is transcribed, and this document is the attribution the
grid has been missing regardless.

It also happens to be what the design already did. `substrate.md` did not take Ars Magica's
*casting totals*; it made the five Techniques into **five operations on one conserved quantity** —
Creo adds, Perdo removes, Muto and Rego conserve, Intellego reads and moves nothing. That is a
calculus over a substrate, not a spell-level table, and it produced a rule that Ars Magica does not
have and that this codebase now enforces in `load.ts` as the `technique-sign` diagnostic.

## The one thing genuinely worth taking, and it is not a number

**Ars Magica prices *scope*. This game does not price it at all.**

Measured on `origin/main`, over all 300 shipped nodes:

```
researchCost by tier: {1: 2048, 2: 4096, 3: 8192, 4: 16384, 5: 32768, 6: 65536}
```

One value per tier, and **nothing else moves it**. Every effect record carries a `target`
(`self · single · area · side · universe`) and a `durationTicks`, and *neither is priced*. A node
whose effect reaches the whole universe costs exactly what a node that affects one mage costs, at
the same tier. Confirmed by execution: at every tier, all five target kinds appear at the same
`researchCost`.

Ars Magica's whole balance system is the opposite claim — that reaching further, lasting longer and
affecting more is what a spell *pays for*. Thirty years of play stand behind the shape of that
claim, if not behind any particular number.

**This is the missing opposing term, and it is the same shape as every other one this project has
found.** The campaign record is full of them: an effect that only ever adds is a rate mechanic;
`check:consumption` going green proves reachability and not effect; a clamp is only mechanical if a
mechanism supplies it. *"A universe-wide permanent effect costs the same as a personal momentary
one"* belongs on that list, and it is the largest remaining instance.

### What that would look like here, in this game's own terms

Not their magnitudes — ours, derived from what this game already has:

- **`target` becomes a cost multiplier.** The five kinds are already an ordering by scope, and
  `contracts.md` §3 already routes effects by them. Pricing them is arithmetic on a field that
  exists.
- **`durationTicks` becomes one too**, with the natural break this game already has: an effect that
  is *permanent while held* is categorically different from one that expires, and `sustain`
  (`docs/design/effect-sustain.md`) already models the difference.
- **The two compose multiplicatively**, which is Ars Magica's structural idea and is not anyone's
  expression.

And the reason to want it is not fidelity to another game. It is that **the deep grid currently
prices a universe-scale permanent effect as cheaply as a personal one**, so every authored summit
node is underpriced relative to its reach, and no sweep can see it because the cost curve has only
one input.

## What is not proposed

- **Not their guideline tables.** Copying them would bind a content file to BY-SA and would import
  balance tuned for one mage in a scene, where this game prices a permanent capability a
  civilization discovers. The structure transfers; the arithmetic does not — the same conclusion
  `substrate.md` §4a reached about a different borrowed idea, for the same reason.
- **Not casting totals, botch dice, or Vis costs.** This game has no per-cast roll to attach them to,
  and inventing one to hold borrowed numbers would be the tail wagging the dog.
- **Not the name.** Trademark, not copyright, and not licensed.

## The attribution, which stands whatever else is decided

> The Technique and Form structure of the magic grid derives from **Ars Magica**, published by
> Atlas Games. Ars Magica 5th Edition and its sourcebooks are available under
> [CC BY-SA 4.0](https://github.com/OriginalMadman/Ars-Magica-Open-License). This project is not
> affiliated with or endorsed by Atlas Games, and *Ars Magica* is their trademark.

`vision.md` §4 should carry that paragraph. This document is not the place a reader looks.
