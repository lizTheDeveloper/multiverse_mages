## 1. Author decisions that gate everything below

- [ ] 1.1 Obtain a vision amendment — a new §8b, or an extension of §8a — establishing colonization as traceable design. `CLAUDE.md` makes untraceable work scope creep, and colonization appears in no section of `vision.md` today
- [ ] 1.2 Settle open question 1: whether ascension and bubble-clearing are alternative win conditions or composed ones. Nothing below can be sequenced against `god-agency` until this is answered
- [ ] 1.3 Settle open question 2: what a conquered run earns, and author the constant. Do not extend `TERMINAL_REASON` before this is answered — an unbranched addition pays `prestige-base-cutoff` (256), more than a stagnated run
- [ ] 1.4 Settle open questions 7 (attribution), 8 (colony dynamics), 9 (do absorbed people join), and 13 (does a colony get its own worship channel)
- [ ] 1.5 Settle open questions 3, 4, 5 and 6 — rejoin tier, bubble size and composition, what "cleared" means, and the unbounded-bubble exception
- [ ] 1.6 Confirm or discard option C, the imposed dispensation (open question 10)
- [ ] 1.7 Raise the `contracts.md` §1.1 amendment for a multiverse layer above the one-universe-per-instance rule, and the §6 RNG stream registrations this change needs, for acceptance by `core-contracts`. Follow `raid-engagement`'s precedent: raise, do not edit

## 2. Measure before building — both tests can run today

- [ ] 2.1 **Acceptance test 1, inertness.** On the existing harness at n ≥ 96 over 2400 ticks, add a synthetic populace and materials endowment of one reference universe to an arm and report the deltas in `worshipSnowball`, `ascensionRate` and mean nodes known
- [ ] 2.2 Report the negative plainly if the deltas fall inside one standard error, and name which channel accounts for it — worship saturated at ~95% of `worship-populace-cap`, or materials feeding a scribe loop over an exhausted node set
- [ ] 2.3 **Acceptance test 2, reachability.** Once `raid-engagement` executes, report the median number of successful raids required to reach `stagnation-mageless-ticks` consecutive mageless ticks, against the number a universe can mount in 2400 ticks under §8's tempo cost
- [ ] 2.4 Report conquest rate by founding species mix. Flag a draconic rate near zero against a human rate above 0.3 as species deciding the match rather than shaping it
- [ ] 2.5 Sweep `prestigeAdvantage` between a converged repeat-loser (fixed point 512) and a converged maximum earner (cap 8192), and report whether it stays under the 60% bound
- [ ] 2.6 Assign a numeric threshold for `capitalSnowball`, which is measured today with `thresholdOwner: 'god-agency'` and no bound in code, before this change is judged against it

## 3. Extract bubble-as-adjacency and hand it to W8/W10

- [ ] 3.1 Split bubble-as-adjacency out of this change as separable work: it is the only piece the raid layer depends on, and it does not depend on colonization at all
- [ ] 3.2 State to W10 exactly what is needed — a universe identity stable across simulation instances, and a bubble roster. Record that a grep for `universeId`, `hostUniverseId` and `attackerUniverseId` over every package returns zero hits, so this is new surface area rather than a rename
- [ ] 3.3 State to W10 that a bubble is implicitly a set of universes sharing a `contentRevision`, per `contracts.md` §0's no-negotiation rule, and that what happens to a bubble when content is updated is unanswered
- [ ] 3.4 Author the bubble-size content constant with a `gloss` and `tuningStatus: "untuned"`
- [ ] 3.5 Derive the open-portal candidate list from bubble membership, and confirm the mask bit leaves zero for the first time
- [ ] 3.6 Add the conformance check that no coordinate, distance or extent field reaches the bubble layer

## 4. Extinction and attribution

- [ ] 4.1 Add the per-attacker kill ledger component, written by `rules-raid`'s consequence path at the same moment a mage is marked not alive
- [ ] 4.2 Test that mortality deaths change no ledger entry, and that the ledger survives between raids
- [ ] 4.3 Add the claim action, its window, its favor cost, and the rule that a claim without a ledger entry is a no-op with a counter increment rather than an exception
- [ ] 4.4 Implement deterministic resolution of competing claims by largest ledger entry, with ties broken by universe identity rather than submission order
- [ ] 4.5 Extend `TERMINAL_REASON` with a conquered reason and give the prestige computation an explicit branch for it
- [ ] 4.6 Add the conformance check that the prestige computation never reaches the cutoff branch for a conquered run
- [ ] 4.7 Test that an unclaimed mageless universe still ends as `stagnation` with prestige unchanged
- [ ] 4.8 Test that a single living mage resets the mageless counter, and that extinction requires a fresh consecutive run

## 5. The colony record

- [ ] 5.1 Add the `COLONY` component: surviving populace by species, materials stock, worship contribution, derived once at a successful claim
- [ ] 5.2 Raise `WORLD_SCHEMA_VERSION` to 5 and add the migration. Confirm it is an appended component section that reshapes no existing field table and does not move `sim-core`'s `SNAPSHOT_VERSION`
- [ ] 5.3 Wire the colony's worship and materials contribution into the world loop on the conqueror's own clock only
- [ ] 5.4 Add the conformance check that nothing per-tick reads a terminated universe's state
- [ ] 5.5 Test that a conquest leaves the conqueror's cohort totals and carrying capacity exactly unchanged
- [ ] 5.6 Test that a stepped, extinguished, claimed universe changes no component row and its snapshot hash is unchanged
- [ ] 5.7 Author the colony constants, and if a dedicated worship channel is chosen, raise `worship-max` and update the loader's asserted cap-sum identity in the same change
- [ ] 5.8 Add the conformance check that no age, birth, research or teaching computation runs over colony rows

## 6. Rejoin

- [ ] 6.1 Implement the rejoin path: a new universe in a fresh bubble, prestige carried by the existing recurrence with no second carry-forward channel
- [ ] 6.2 Test that a conquered player's rejoined universe is not a member of the conqueror's bubble, and that the conqueror retains the colony
- [ ] 6.3 Register the RNG stream for bubble assignment on rejoin, and confirm no existing subsystem's draws move

## 7. Deferred to post-v1, recorded not built

- [ ] 7.1 Bubble tiers and promotion. Deferred under vision §12's exclusion of a ranked ladder; recorded in the spec so persistence can reserve for it
- [ ] 7.2 Choose and record the tier-index name, distinct from `prestige` in state, content and metrics, with a conformance check on `prestige-*` content ids referring to tiers

## 8. Close

- [ ] 8.1 `openspec validate colonization --strict` green
- [ ] 8.2 Every magnitude added carries a `gloss` and `tuningStatus: "untuned"`
- [ ] 8.3 `npm run verify` green, with any baseline movement justified in writing and no golden fixture regenerated
