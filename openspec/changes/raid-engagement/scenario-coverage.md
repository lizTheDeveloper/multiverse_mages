# Scenario coverage — `raid-engagement`

Task 10.5: *"confirm every scenario across the five capability specs has a corresponding passing
test"*.

A confirmation nobody can re-run is an opinion. So this file is a **manifest**, and the coverage
test checks it against the specs and against the filesystem:

- every `#### Scenario:` heading in `specs/host-ruleset-arbitration`, `specs/portals`,
  `specs/raid-consequences`, `specs/raid-objectives` and `specs/raid-space` appears here exactly
  once, and nothing appears here that is not in a spec;
- every file named below exists and is a file `vitest` collects.

That makes the manifest fail when a scenario is added and left unmapped, and when a test file is
renamed or deleted out from under a claim. What it deliberately does **not** do is assert that a
named file contains an assertion *about* the scenario — nothing mechanical can, short of writing the
scenario id into every `it`, which turns a design document into a test-naming convention. The
mapping is a reviewed claim; the check keeps it from rotting.

Rows are `Requirement > Scenario | file`. A scenario covered in more than one place names the file
that asserts it most directly.

## `specs/host-ruleset-arbitration`

| requirement > scenario | test |
|---|---|
| The host universe's ruleset governs every spell cast inside it > Host forbids what the raider's home permits | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > Host permits what the raider's home forbids | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > The defender is bound by their own ruleset | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > An interdiction binds both sides symmetrically | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > A host dispensation arms both sides | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > Both sides throw fire when both universes permit it | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The host universe's ruleset governs every spell cast inside it > No consumer reimplements arbitration | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Legality is enforced twice — as a selection mask and as a resolution assertion > The mask is computed once and never recomputed | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Legality is enforced twice — as a selection mask and as a resolution assertion > An illegal node is never a candidate | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Legality is enforced twice — as a selection mask and as a resolution assertion > The resolution assertion is live, not vacuous | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Legality is enforced twice — as a selection mask and as a resolution assertion > Forbidden casts never resolve across a Monte Carlo sweep | `packages/scenario/test/unit/raid-engagement.test.ts` |
| Legality is enforced twice — as a selection mask and as a resolution assertion > Effect application has exactly one entry point | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Acquire and store follow the combatant's home tradition > A memory palace travels with its holder | `packages/rules-magic/test/unit/palace-mortality.test.ts` |
| Acquire and store follow the combatant's home tradition > A raider's grimoires remain grimoires abroad | `packages/rules-magic/test/unit/tradition-arbitration.test.ts` |
| Acquire and store follow the combatant's home tradition > Home acquire governs a raider's theft | `packages/rules-magic/test/unit/tradition-arbitration.test.ts` |
| Cast and cost follow the host's tradition > A raider pays the host's price | `packages/rules-raid/test/unit/readying-cost.test.ts` |
| Cast and cost follow the host's tradition > The defender uses the same hooks as the invader | `packages/rules-magic/test/unit/tradition-arbitration.test.ts` |
| Cast and cost follow the host's tradition > Two different hosts distinguish the same raider | `packages/rules-raid/test/unit/readying-cost.test.ts` |
| The prepared spell list is the host cast hook applied to the home store pool > Home store determines the pool | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| The prepared spell list is the host cast hook applied to the home store pool > Host cast determines the readied list | `packages/rules-raid/test/unit/readying-cost.test.ts` |
| The prepared spell list is the host cast hook applied to the home store pool > Preparation is filtered by host legality | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Casting legality is independent of knowledge existence > Stolen knowledge enters a universe that forbids it | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| Casting legality is independent of knowledge existence > Forbidding a cell does not destroy its instances | `packages/rules-magic/test/unit/dormancy.test.ts` |
| Casting legality is independent of knowledge existence > Permitting a cell makes held knowledge live again | `packages/rules-magic/test/unit/dormancy.test.ts` |

## `specs/portals`

| requirement > scenario | test |
|---|---|
| Portal opening is gated by the attacker's ruleset and knowledge > All gates satisfied | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| Portal opening is gated by the attacker's ruleset and knowledge > Attacker forbids the portal cell | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| Portal opening is gated by the attacker's ruleset and knowledge > Portal knowledge has been lost | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| Portal opening is gated by the attacker's ruleset and knowledge > Host forbidding the portal cell does not confer immunity | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| A raid pairs two persisted universe snapshots > Same inputs produce the same raid | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| A raid pairs two persisted universe snapshots > The host is always the defender | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| A raid pairs two persisted universe snapshots > A differing seed produces a differing raid | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The ruleset in force is captured as an immutable snapshot at portal open > Arbitration reads the snapshot, not live state | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| The ruleset in force is captured as an immutable snapshot at portal open > A mutation attempt on a captured snapshot fails | `packages/rules-raid/test/unit/mid-raid-lock.test.ts` |
| The ruleset in force is captured as an immutable snapshot at portal open > Both participants' rulesets are captured | `packages/state/test/unit/engagement-exclusion.test.ts` |
| Entering a raid pauses world time for both participants > World tick frozen during engagement | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Entering a raid pauses world time for both participants > World time resumes without loss | `packages/scenario/test/unit/raid-engagement.test.ts` |
| Entering a raid pauses world time for both participants > World-time cost is favor, not ticks | `packages/scenario/test/unit/raid-engagement.test.ts` |
| The ruleset is frozen for the duration of a raid > A rules-change action mid-raid is a no-op | `packages/rules-raid/test/unit/mid-raid-lock.test.ts` |
| The ruleset is frozen for the duration of a raid > A live ruleset change cannot reach an in-progress raid | `packages/rules-raid/test/unit/mid-raid-lock.test.ts` |
| Nested raids are forbidden > Opening a portal during a raid is rejected | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| Nested raids are forbidden > Engagement state holds exactly one raid | `packages/state/test/unit/engagement-exclusion.test.ts` |
| Raid resolution exits engagement mode and discards engagement state > Engagement entities do not survive resolution | `packages/state/test/unit/engagement-exclusion.test.ts` |
| Raid resolution exits engagement mode and discards engagement state > A world snapshot taken mid-raid excludes engagement state | `packages/state/test/unit/engagement-exclusion.test.ts` |
| Raid resolution exits engagement mode and discards engagement state > A universe that never raids is unaffected by this capability | `packages/scenario/test/unit/raid-engagement.test.ts` |

## `specs/raid-consequences`

| requirement > scenario | test |
|---|---|
| Raid consequences are applied to world state as one atomic delta > Interrupted application leaves no partial state | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Raid consequences are applied to world state as one atomic delta > The outcome record is complete before application | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Raid consequences are applied to world state as one atomic delta > Both universes are updated | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Casualties are permanent > A dead raider is dead at home | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Casualties are permanent > Detachment losses reduce a cohort | `packages/rules-raid/test/unit/detachment-remainder.test.ts` |
| Casualties are permanent > Summons leave no trace | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Casualties are permanent > There is no resurrection path | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Raiders stranded at portal collapse are lost > A stranded raider dies | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Raiders stranded at portal collapse are lost > A withdrawn raider survives | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Raiders stranded at portal collapse are lost > Withdrawal is a combatant decision, not a god action | `packages/rules-raid/test/unit/verbs.test.ts` |
| Destroyed knowledge instances are destroyed permanently > A burned library loses its contents | `packages/rules-raid/test/unit/knowledge-corruption.test.ts` |
| Destroyed knowledge instances are destroyed permanently > A dead mage's mind is emptied | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Destroyed knowledge instances are destroyed permanently > A memory palace dies with its holder and cannot be burned | `packages/rules-magic/test/unit/palace-mortality.test.ts` |
| Destroyed knowledge instances are destroyed permanently > Dwarven grimoires resist destruction | `packages/rules-raid/test/unit/grimoire-durability.test.ts` |
| A node is lost when its last instance is destroyed > The last instance burns | `packages/rules-raid/test/unit/knowledge-corruption.test.ts` |
| A node is lost when its last instance is destroyed > A redundant instance survives the loss | `packages/rules-raid/test/unit/knowledge-corruption.test.ts` |
| A node is lost when its last instance is destroyed > Existence is never cached | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| A node is lost when its last instance is destroyed > Knowledge loss stays within its band | `packages/mc-harness/test/unit/metrics-knowledge.test.ts` |
| Knowledge theft is cell-gated and resolved on its own stream > A host that forbids mind-reading cannot be mind-read | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Knowledge theft is cell-gated and resolved on its own stream > The attacker's own prohibition does not protect the host | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Knowledge theft is cell-gated and resolved on its own stream > Two steal sources take the maximum | `packages/rules-raid/test/unit/combat-knowledge.test.ts` |
| Knowledge theft is cell-gated and resolved on its own stream > A defender may steal too | `packages/rules-raid/test/unit/combat-knowledge.test.ts` |
| Reading a mind copies, looting a grimoire moves, burning destroys > Mind theft leaves the victim's knowledge intact | `packages/rules-raid/test/unit/combat-knowledge.test.ts` |
| Reading a mind copies, looting a grimoire moves, burning destroys > Looting removes the grimoire from the host | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Reading a mind copies, looting a grimoire moves, burning destroys > Burning gives nothing to the attacker | `packages/rules-raid/test/unit/knowledge-corruption.test.ts` |
| Reading a mind copies, looting a grimoire moves, burning destroys > A memory palace cannot be looted | `packages/rules-magic/test/unit/palace-mortality.test.ts` |
| Stolen knowledge is retained only by a raider who returns alive > Theft outruns loss | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Stolen knowledge is retained only by a raider who returns alive > A killed thief loses what she took | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Stolen knowledge is retained only by a raider who returns alive > Stolen knowledge starts unmastered | `packages/rules-raid/test/unit/verbs.test.ts` |
| Stolen knowledge is retained only by a raider who returns alive > Stolen knowledge may be inert at home | `packages/rules-raid/test/unit/portal-gate.test.ts` |
| The outcome record supplies the balance harness > Every raid emits a record | `packages/scenario/test/unit/raid-metrics.test.ts` |
| The outcome record supplies the balance harness > Primitive attribution is derivable | `packages/scenario/test/unit/combat-ablation-reaches-a-raid.test.ts` |
| The outcome record supplies the balance harness > The arbitration invariant is reported | `packages/scenario/test/unit/raid-engagement.test.ts` |

## `specs/raid-objectives`

| requirement > scenario | test |
|---|---|
| Objectives are generated from the defender's world state > Objectives name real world entities | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Objectives are generated from the defender's world state > Objective value reflects what is at stake | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Objectives are generated from the defender's world state > An archmage objective is designated deterministically | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Objectives are generated from the defender's world state > A universe with nothing to take still yields a raid | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Objectives are captured, looted, burned, or held, and these differ > A looted library still stands | `packages/rules-raid/test/unit/verbs.test.ts` |
| Objectives are captured, looted, burned, or held, and these differ > A burned library is destroyed | `packages/rules-raid/test/unit/verbs.test.ts` |
| Objectives are captured, looted, burned, or held, and these differ > An unreached objective is held | `packages/rules-raid/test/unit/verbs.test.ts` |
| Portal stability decrements unconditionally on every engagement tick > Stability strictly decreases every tick | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Portal stability decrements unconditionally on every engagement tick > Exactly one writer | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Portal stability decrements unconditionally on every engagement tick > No effect can extend a portal | `packages/content/test/unit/raid-constants.test.ts` |
| The decay rate is an authored integer validated at load > A zero decay is a hard load failure | `packages/content/test/unit/raid-constants.test.ts` |
| The decay rate is an authored integer validated at load > A division-derived decay is rejected | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| The decay rate is an authored integer validated at load > An over-long raid is rejected at load | `packages/content/test/unit/raid-constants.test.ts` |
| Every raid terminates within a bound computable at portal open > No raid exceeds its bound across a Monte Carlo sweep | `packages/scenario/test/unit/raid-engagement.test.ts` |
| Every raid terminates within a bound computable at portal open > The bound is known before the first tick | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Every raid terminates within a bound computable at portal open > A stalemate still ends | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Every raid terminates within a bound computable at portal open > Reaching the hard ceiling is a loud failure | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Victory is a total function of the final raid state > Attacker reaches the threshold | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Victory is a total function of the final raid state > Defender holds until collapse | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Victory is a total function of the final raid state > Attacker force eliminated | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Victory is a total function of the final raid state > Exactly one victor is always recorded | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| The engagement observation block summarises a raid within its fixed 64 slots > Shape is constant across raid sizes | `packages/agent-api/test/unit/observation-shape.test.ts` |
| The engagement observation block summarises a raid within its fixed 64 slots > Concealed enemies are not observable | `packages/agent-api/test/unit/observation-shape.test.ts` |
| The engagement observation block summarises a raid within its fixed 64 slots > Zero-filled at world scale | `packages/agent-api/test/unit/observation-shape.test.ts` |
| The engagement observation block summarises a raid within its fixed 64 slots > More combatants do not require more slots | `packages/agent-api/test/unit/observation-shape.test.ts` |

## `specs/raid-space`

| requirement > scenario | test |
|---|---|
| Spatial state exists only in engagement mode > Combatants are positioned, their sources are not | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Spatial state exists only in engagement mode > Position on a world entity is rejected | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Spatial state exists only in engagement mode > The spatial layer is torn down on resolution | `packages/state/test/unit/engagement-exclusion.test.ts` |
| Combatants are derived from world state at portal open > Selection is deterministic and capped | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| Combatants are derived from world state at portal open > Soldier cohorts become detachments, not individuals | `packages/rules-raid/test/unit/detachment-remainder.test.ts` |
| Combatants are derived from world state at portal open > Summons have no world source | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| Combatants are derived from world state at portal open > Derived combatant statistics come from world state | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| The battlefield is a bounded plane with generated terrain > Terrain regenerates identically from the seed | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| The battlefield is a bounded plane with generated terrain > Combatants cannot leave the battlefield | `packages/rules-raid/test/unit/geometry.test.ts` |
| The battlefield is a bounded plane with generated terrain > Impassable terrain is not occupied | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| Range is tested by squared distance and line of sight is traced on integers > No square root in the rules path | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Range is tested by squared distance and line of sight is traced on integers > A target beyond range is not acquired | `packages/rules-raid/test/unit/geometry.test.ts` |
| Range is tested by squared distance and line of sight is traced on integers > Line of sight is symmetric | `packages/rules-raid/test/unit/geometry.test.ts` |
| Range is tested by squared distance and line of sight is traced on integers > A blocking cell breaks line of sight | `packages/rules-raid/test/unit/geometry.test.ts` |
| The spatial index is a uniform grid with deterministic traversal > Query order is independent of insertion order | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| The spatial index is a uniform grid with deterministic traversal > Radius queries are bounded | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| Movement and blink are clamped and stack by maximum > Two blink sources do not sum | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| Movement and blink are clamped and stack by maximum > Blink does not bypass terrain | `packages/rules-raid/test/unit/terrain-and-index.test.ts` |
| Each engagement tick runs a fixed phase order > Intents are scored against tick-start state | `packages/rules-raid/test/unit/phases.test.ts` |
| Each engagement tick runs a fixed phase order > A dying combatant still acts | `packages/rules-raid/test/unit/phases.test.ts` |
| Each engagement tick runs a fixed phase order > Within-tick damage and displacement are order-independent | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Each engagement tick runs a fixed phase order > Theft resolves after damage | `packages/rules-raid/test/unit/phases.test.ts` |
| Combat random draws are keyed by stable combatant identity > Adding a combatant does not disturb the others | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Combat random draws are keyed by stable combatant identity > Adding a draw does not disturb the others | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Combat random draws are keyed by stable combatant identity > Streams are used as registered | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Targeting acquires the weakest enemy in range and line of sight > The weakest reachable enemy is chosen | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Targeting acquires the weakest enemy in range and line of sight > No target means no expenditure | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Targeting acquires the weakest enemy in range and line of sight > Tie-breaking is stable | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Concealment is resolved as an evasion roll before damage > Two concealment sources combine on the remainder | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Concealment is resolved as an evasion roll before damage > Evasion deals zero damage but still costs | `packages/rules-raid/test/unit/action-economy.test.ts` |
| Concealment is resolved as an evasion roll before damage > Area denial ignores concealment | `packages/rules-raid/test/unit/castable-nodes.test.ts` |
| Concealment is resolved as an evasion roll before damage > No accuracy statistic exists | `packages/rules-raid/test/unit/raid-conformance.test.ts` |
| Damage is summed additively then reduced by a single ward application > Ward applies once to the summed damage | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Damage is summed additively then reduced by a single ward application > Two wards combine on the remainder and respect the cap | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Damage is summed additively then reduced by a single ward application > Many small hits equal one large hit | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Damage is summed additively then reduced by a single ward application > Hit points clamp at zero | `packages/rules-raid/test/unit/combat-arithmetic.test.ts` |
| Per-tick work is bounded by hard per-side caps > A summon over the cap is a no-op | `packages/rules-raid/test/unit/action-economy.test.ts` |
| Per-tick work is bounded by hard per-side caps > Contention for the last summon slot is deterministic | `packages/rules-raid/test/unit/action-economy.test.ts` |
| Per-tick work is bounded by hard per-side caps > Combatant count never exceeds the cap | `packages/rules-raid/test/unit/raid-engine.test.ts` |
| A raid is reproducible tick by tick > Golden raid replay reproduces exactly | `packages/rules-raid/test/unit/raid-fidelity.test.ts` |
| A raid is reproducible tick by tick > Cross-process reproduction | `packages/scenario/test/unit/raid-engagement.test.ts` |
