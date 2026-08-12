<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Populating `metricDeltas` — design

**Status:** proposal. Companion to `2026-08-11-ascension-meta-design.md`.

## The gap

`agent-api/src/outcome.ts` declares `metricDeltas: BalanceMetricDeltas` and freezes an empty map
in both branches of `outcomeOf`. The reason is written down and is good:

> Populating this map now would mean inventing definitions here that `agent-interface` then owns,
> and §7's whole warning is that *"a metric whose definition drifts silently makes every committed
> baseline meaningless while still appearing green"*.

The consequence is that a reward function can read four scalars — `terminal`, `truncated`,
`terminal_reason`, `era` — and nothing about the world. Over a 2400-tick episode that is a brutal
credit-assignment problem, and the module's own docstring concedes *"a researcher will almost
certainly want shaping"*.

So the field is the right shape and the emptiness is the right default. What it needs is an owner
and a set.

## The rejected approach

An external review (OpenAI `gpt-5.6-terra`, consulted on this question) proposed four new metrics —
`magic_capability`, `knowledge_transmission`, `sustainable_capacity`, `irreversible_loss` — plus a
list of anti-drift rules to build alongside them: stable identifiers, units, exact formulas,
ownership, semantic versioning, golden replay tests over per-tick metric sequences, and a schema
hash recorded with every checkpoint.

That advice is sound in general and wrong here, for one reason: **this repository already has all
of that machinery, and it is stricter.** Every entry in `BALANCE_METRIC_REGISTRY` carries

- a stable `id` and an exact prose `definition`,
- a `unit`,
- a `definitionVersion`,
- `pinnedConstants` — every constant the definition depends on, named and pinned,
- a `thresholdOwner`,
- a `scope` of `perRun` or `perArm`,

and two tests enforce it: `registryConformance` checks the registry against `contracts.md`, and
`metrics-definition-version.test.ts` pins every `definitionVersion` against `COMMITTED_PINS`.

Adding four freshly-invented names beside that would create precisely the drift surface the project
fears, while leaving the authored definitions unused. The registry is the asset; the proposal
should spend it, not duplicate it.

## The proposal

**`metricDeltas` carries the per-step change in the accounting quantities the §7 metrics are
already computed from — not new metrics, and not the §7 metrics themselves.**

The distinction matters. Most §7 metrics are `perRun` or `perArm`: `knowledgeHalfLife` is a
Kaplan–Meier estimate over census cohorts, `libraryDependence` a mean over census samples. Neither
has a meaningful per-step value, and `metricDeltas` is documented as *"since the previous step"*.
But both are computed from a census whose contents *are* per-tick facts, and those are exactly what
a shaping signal wants.

`metrics-telemetry.ts` already defines them:

| Delta key | Source | What it is | Which §7 metric it feeds |
|---|---|---|---|
| `existingNodes` | `CensusSample.existingNodeIds` | Nodes with ≥ 1 surviving instance (§1.5) | `knowledgeHalfLife` |
| `singleInstanceNodes` | `CensusSample.singleInstanceNodeIds` | Of those, the ones with exactly one instance | `libraryDependence` |
| `deepestTierHeld` | `TierReach` | Deepest node tier any species holds in a mind (§2.3, `1..7`) | `timeToTierBySpecies` |

Three keys. Each is an integer count, so it survives the fixed-point discipline without a float
anywhere near the rules path. Each is already authored, already pinned, and already has an owner.
None of them is a hand-tuned "goodness score" — they are accounting, and a researcher composes an
objective from them rather than being handed one.

A reward built from these can express the three playstyles the strategy pool claims to test:
`Δexisting_nodes` is discovery net of loss, `−Δsingle_instance_nodes` is redundancy against the
loss channel, and `Δdeepest_tier_held` is depth. That is not a coincidence — those are the axes §7
was written to measure.

### What is deliberately excluded, and why

**Worship and favor regeneration.** They are per-tick, readily available in `armContribution`, and
would be the obvious fourth key. They are excluded because including them would reward the exploit
this campaign exists to remove: ascension Path A gates on a worship tier that accrues *passively*,
so a shaping term on worship pays an agent for waiting. `worshipSnowball` carries a 0.35 Gini
ceiling precisely because this quantity is snowball-prone. A shaping signal that pays for the thing
a threshold exists to catch is a bug with a plausible face.

**Action counts and submission rates.** Gameable, and they measure the agent rather than the world.

**Population.** Measured to be inert to every strategy (finding F4 in the companion document).
A delta that is always zero for every policy is noise in the observation budget.

## Consequences to accept

- **This is a contract change.** `metricDeltas` appears in every episode record and on the wire.
  Adding keys is append-only and safe; changing what a key *means* is not, and must go through
  `definitionVersion` like everything else in the registry.
- **The bridge must not normalise them.** `gym-bridge`'s own package note is explicit that §4.1
  makes `agent-api`'s `normalize.ts` the single licensed float boundary, and that a bridge that
  rescaled anything would decouple what a policy learns from what the harness measures.
- **Shaping remains the researcher's choice.** Populating the channel is not the same as offering a
  shaped default. `rewards.py`'s position — offering is not defaulting — still holds, and the
  functions that consume these deltas should require their weights exactly as the current ones do.

## Falsifiable claim

With `metricDeltas` populated and a shaped objective composed from the three keys, a policy trained
through the bridge reaches a higher ascension rate than one trained on `sparse_terminal` alone,
at equal environment steps, on held-out seeds.

*Disproved by:* equal or lower ascension rate, which would say the shaping is not informative and
the sparse objective was not the bottleneck.

**Blocked on:** the ascension-meta work. Until winning depends on play, every objective — shaped or
sparse — is maximised by idling until eligible and pressing one button, and this claim would be
measuring the exploit rather than the shaping.
