
---

## The general rule: every number that should be figured out is a search space

*Owner, 2026-08-13. This is the widest statement of what the search is for, and it is worth stating
separately because it applies to decisions nobody currently thinks of as search.*

**If a number has to be figured out, do not figure it out. Search it.**

This project has already been wrong in both directions, repeatedly:

- **A guessed scalar in a flat region of its own curve is indistinguishable from a mechanic that does
  nothing.** Half the campaign's null results are of this shape.
- **And a scalar defended by argument is worse than one defended by a curve**, because the argument
  survives the evidence. `researchCost` being a pure function of tier was argued for years and refuted
  in an afternoon.

The rule, stated once:

> **Whenever a design decision reduces to a number nobody can defend from first principles, the
> deliverable is the curve, not the value.** Sweep it with **both degenerate ends as controls** — the
> value at which the mechanic does nothing, and the value at which it dominates — and let the
> measurement pick. **A flat curve is a real finding**: it means the mechanic is theatre and the number
> was never the constraint.

### What this covers that is not currently thought of as search

Every one of these is an open decision in this project today, and every one is a scalar or a small
discrete set:

| decision | the space |
|---|---|
| worship → grid width threshold | when does the second cell unlock |
| how random "a random student" is | pure lottery ↔ pure aptitude weighting |
| concentration-buys-depth function | flat ↔ spreading never correct |
| opening square size | 1×1 ↔ the full grid *(3×3 measured, ruled)* |
| founding grant budget | 0 ↔ unlimited *(swept; curve flat, mechanic inert)* |
| the equivalence class for "foundational" | cell ↔ technique ↔ form *(cell ruled by the owner)* |
| displacement cap | `fp(512)` ↔ break-even *(argued, held, not swept)* |
| species count at founding | 1 ↔ 6 *(one ruled; the sweep exists)* |
| every `tuningStatus: "untuned"` constant | all six species, seventy `dailyRelevance` values, 73 god constants |

**That last row is the point.** There are hundreds of untuned constants in this project, each one a
number somebody will eventually be tempted to argue about. **The tuner already exists** —
`tune-balance.mjs` does coordinate descent over god constants scoring band × variety — and it has been
hand-run and never wired into anything.

### Two guards, both learned the hard way

**A number cannot be searched if the metric it moves cannot move.** That is stage 0, and it is not
optional: 16 of 28 registered metrics are quarantined, and an optimiser pointed at any of them would
run forever reporting progress.

**And a shared constant cannot be a source of divergence.** Pricing all 300 nodes moved containment
*the wrong way*, at 10 fp against appeal bounds of 256–512, because a cost surface is shared by every
universe and can only reweight terms that already differ between them. **Search a shared constant for
tuning; search a per-universe factor for variety. They are different searches and conflating them
wastes both.**
