## 0. Preconditions

- [x] 0.1 Re-take the three measurements in `proposal.md` against the branch being built on, rather than trusting them. They were taken on `origin/main` @ `edcaf591` on 2026-08-15 and this repository has a documented history of measurements rotting in the present tense
- [x] 0.2 Read `docs/design/economy-flow-models.md` §3.3–§3.4 before writing any flow: converter-vs-trader, gate-vs-drain, and the rule that a cap must spill explicitly rather than truncate silently
- [x] 0.3 Confirm whether `discriminating-ascension` task 1.5 has landed — `declare-ascension.favorCost` is still `0` on `main` while that change's tasks call for `20480`. If the ending is still free, pricing the *verbs* here will not change the optimal policy and the two changes must be sequenced deliberately
- [x] 0.4 Decide, and record, whether `insight` double-counts `encourage-research`'s existing effect on research rate. Two levers pointed at one outcome is the defect class this campaign has hit three times

## 1. Content: the materials exist and every form yields one

- [x] 1.1 Write a failing content test asserting **no form has an all-zero `yieldWeights`**. This is the assertion the whole change exists to satisfy and it must fail before anything else is written
- [x] 1.2 Extend `form.schema.json`'s `yieldWeights` to require the seven keys, so an unlisted kind fails the load rather than defaulting to zero
- [x] 1.3 Author `yieldWeights` for the seven inert forms in `packages/content/data/form.json`, keeping `tuningStatus: untuned`, each with a gloss naming the fiction: corpus→labor, vim→essence, mentem/imaginem→insight, limen/fatum/umbra→passage
- [x] 1.4 Re-check the seven forms that already yield: adding kinds must not silently renormalize their existing weights. Assert the existing seven rows are byte-identical apart from the four appended keys
- [x] 1.5 Update `interning.test.ts`'s `contentRevision` literal **once**, keeping the prior comment block and adding the new one — this file's convention is that neither side's literal survives a union and the history is the record

## 2. State: the component and the migration

- [ ] 2.1 Write a failing test asserting a world at `WORLD_SCHEMA_VERSION` 6 loads at 7 with all four new kinds reading zero, and that its behaviour is otherwise byte-identical
- [ ] 2.2 Add `labor`, `essence`, `insight`, `passage` as `i32` fields to `MATERIAL_STOCK` in `packages/state/src/components.ts`, with the same doc-comment discipline the existing three carry — each names its producing forms and its sink
- [ ] 2.3 Bump `WORLD_SCHEMA_VERSION` to 7 and write the migration. **An absent kind reads as zero, never as a shortage** — a migrated save must not starve
- [ ] 2.4 Confirm `SNAPSHOT_VERSION` did **not** move, and that the golden fixtures fail with a behaviour diff rather than a version error if they fail at all
- [ ] 2.5 Run `npm run check:purity` — no float entered the rules path

## 3. Rules: production and the sinks

- [ ] 3.1 Write a failing test per new kind: casting in a cell whose form yields that kind raises that stock and no other
- [ ] 3.2 Route production through the existing applied-magic path rather than a second one. There is already one `resource-yield` reading and a second would be the fourth reading of the capital term that no balance assertion covers
- [ ] 3.3 Write a failing test per sink: `labor` accelerates construction, `essence` prices a dispensation, `insight` raises university teaching throughput, `passage` is spent opening a portal
- [ ] 3.4 Implement the four sinks. Each must **drain**, not gate — a sink that accumulates nothing and destroys only as a side effect is the shape `economy-flow-models.md` warns reads as a policy while behaving as a switch
- [ ] 3.5 Assert no sink truncates at a cap silently: an inflow over a ceiling spills explicitly and the spill is recorded

## 4. Costs: the two economies meet

- [ ] 4.1 Add an optional `materialCost` map to `god-cost.schema.json` and to the loader, with a content invariant that an action naming a kind the schema does not know fails the load
- [ ] 4.2 Write a failing test asserting an action whose material cost cannot be paid is **masked**, and that the mask's reason is distinguishable from "cannot afford the favor"
- [ ] 4.3 Author `materialCost` for the verbs named in `proposal.md` B, each with a gloss stating the rule: a verb that makes a thing spends the material that thing is made of
- [ ] 4.4 Extend `applyAffordability` in `packages/agent-api/src/mask.ts` to clear an action the god cannot pay the materials for, beside the favor check it already runs
- [ ] 4.5 Confirm `illegalActionRate` does not inflate: a newly unaffordable verb must be **masked**, not submitted-and-refused. Re-run the strategy sweep and check the rate against the 0.01 ceiling

## 5. Entitlement: the player can see it

- [ ] 5.1 Add a named per-kind block to `PlayerState` in `packages/agent-api/src/player-state.ts`, leaving `resources.materials` as the documented `food + stone + vellum` sum
- [ ] 5.2 Confirm `OBSERVATION_LAYOUT_DIGEST` did **not** move — `PlayerState` is not the vector, and this is the property that makes the change cheap
- [ ] 5.3 Update `docs/design/observable-trait-inventory.md`: four kinds move from withheld to entitled, and the count of withheld traits changes
- [ ] 5.4 Expose the seven stocks on the play server's frame so a UI can draw them

## 6. The ledger, which is the part that can fail loudly

- [ ] 6.1 Write a failing test: a tick that produces and consumes must satisfy `delta == faucet - sink` per kind
- [ ] 6.2 Implement the per-tick faucet/sink ledger
- [ ] 6.3 Add the conservation assertion to the sweep as a reported metric, not only as a test — `economy-flow-models.md` §3.4 asks for it to be reported
- [ ] 6.4 Give the assertion a positive control: a deliberately leaking flow must fail it. A checker that has never failed is not known to work

## 7. Balance and the record

- [ ] 7.1 Re-run the strategy sweep at a horizon where ascension is reachable — not at `ascension-min-tick`, which reports `horizon-bound` by construction
- [ ] 7.2 Re-record the balance baselines with the reason stated. Adding costs to free verbs is an accept, not a regression
- [ ] 7.3 Check whether `permit-then-idle` still holds the null bar. If pricing the verbs has not moved it, say so plainly — that is evidence about the win condition, not about this change
- [ ] 7.4 Date every measurement written into `docs/` and name the ref it was taken on
