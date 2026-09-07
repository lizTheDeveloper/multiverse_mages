# material-economy: null bar check (task 7.3)

Taken 2026-09-06 on `plan-w18` @ `77733b89`.

## Finding

**`permit-then-idle` still holds the null bar. Pricing the verbs has not moved it.**

## Reasoning

The five god verbs that gained a `materialCost` in material-economy (tasks 4.1-4.4) are:

| verb | materialCost |
|---|---|
| `issue-dispensation` (action 5) | `essence: 4096` |
| `grant-founding-knowledge` (action 7) | `vellum: 4096` |
| `bless-mage` (action 9) | `insight: 2048` |
| `fund-university` (action 11) | `stone: 8192, labor: 4096` |
| `initiate-raid` (action 14) | `passage: 16384` |

`permit-then-idle`'s signature actions are `permitTechnique` (action 1) and `permitForm`
(action 3), and after round 140 it submits nothing at all. **Neither action has a
`materialCost`.** The four new material kinds (labor, essence, insight, passage) and the three
existing ones (food, stone, vellum) are stocks that accumulate from form yields and drain through
god verb costs, but `permit-then-idle` never issues a verb that spends any of them.

The sinks fire only when a god verb that costs materials is played, or when autonomous processes
triggered by such verbs (e.g. university construction after `fund-university`) consume materials.
Since `permit-then-idle` never funds a university, never blesses a mage, never initiates a raid,
never issues a dispensation, and never grants founding knowledge, none of the sinks fire.

The new yield weights in `form.json` mean forms produce the four new material stocks when a mage
casts, but those stocks accumulate without effect — they are not read by any autonomous process
in the absence of the god verbs that spend them. This is by design:
`economy-flow-models.md` §3.4's rule that a cap must spill explicitly rather than truncate
silently means idle accumulation is inert.

The RNG registry hash changed (from other changes on this branch, not from material-economy
itself), but the stream-splitting invariant (§6) means no existing stream's draws were
re-rolled. `permit-then-idle`'s trajectory through the simulation is unchanged on the axes that
determine ascension eligibility.

## What this means

This is evidence about the win condition, not about this change. The null bar — the ceiling on
what doing nothing can achieve — has not moved because the material costs are on verbs that
doing-nothing never calls. A strategy that clears the null bar today clears it with identical
margin after this change. The economy is new spending power for strategies that *play*, not a
tax on strategies that idle.
