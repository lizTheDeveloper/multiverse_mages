## Why

The strategy space is one axis. Measured at 2400 ticks against the reference universe, mean nodes
known was `permissive-breadth` 273.2; `passive-control`, `archivist`, `portal-rush` and
`worship-maximizer` all exactly 51.0; `denial-warden` 7.8; `narrow-depth` 7.0. Five of eight
strategies are indistinguishable from doing nothing, and the one thing the god can meaningfully
choose is how much magic to permit. A game with one axis has one strategy.

Vision §8a promises a summit, and vision §2 promises that different civilizations are different.
Two ascension routes already exist and are already framed as different in kind — apotheosis rewards
a spike, canon rewards custodianship. **They are not measurably different, and three separate
mechanisms make that so:**

1. **Both are reached passively.** `ascensionPath` flips at the 51-node baseline a universe reaches
   with no god at all, around tick 700. That is the tuning problem, and it belongs to W2
   (`campaign/ascension-meta`, approach B), not here.
2. **`qualifyingPath` picks by evaluation order, not by intent.** It returns apotheosis if
   apotheosis is satisfied and only otherwise considers canon
   (`packages/coordination/src/god/ascension.ts`). A universe satisfying both is always recorded as
   apotheosis, so canon's measured share is structurally suppressed no matter how the constants are
   tuned.
3. **`ascensionRateByPath` does not exist.** It is specified — `god-agency` task 7.3, and the
   "A dead path is caught even inside the band" scenario in that change's
   `ascension-and-prestige` spec — and unimplemented. Worse, the harness cannot compute it even in
   principle: `agent-api`'s session collapses both terminal reasons to the single status
   `'ascended'` (`packages/agent-api/src/session.ts`), and `mc-harness`'s `TERMINAL_STATUS` carries
   nothing finer.

So the honest reading of the finding is not "we need more routes" alone. It is that **the game has
two routes and one instrument, and the instrument reports a scalar.** This change fixes the
declaration and detection layer first, and then adds routes — in that order, because adding a third
summit to a mechanism that cannot distinguish the first two would be unmeasurable by construction.

`archivist` is the sharpest illustration. Its written hypothesis is *"whether redundancy defeats the
loss channel"*, and Enduring Canon — four consecutive era boundaries under a `libraryDependence`
ceiling with bounded losses — is precisely the summit an archivist plays toward. The archivist's
route is not missing. It is invisible.

## What Changes

- **Ascension routes become authored content.** A new validated file
  `packages/content/data/ascension-route.json` declares the routes a build offers: id, terminal
  reason, playstyle gloss, condition kind, which `god-constant` ids parameterize it, and its rate
  budget. Adding or retiring a route becomes a content edit, exactly as vision §4's "content lives
  in validated data files" requires, and never an action-space change.
- **A closed vocabulary of five condition kinds**, implemented once each in `@mm/coordination`, in
  the same spirit as §4's effect primitives: `deepest-node-held`, `era-run`, `breadth-held`,
  `worship-recovered`, `constrained-thriving`. Routes are compositions of a closed set, so balance
  is assertable over the kinds rather than over bespoke predicates.
- **Qualification becomes a set, not a priority.** God state gains
  `ascensionQualified`, a bitmask over route slots recomputed every world tick so it can still
  lapse. `qualifyingPath`'s first-match-wins ordering is deleted. `ascensionPath` is retained and
  narrowed to mean *the route actually declared*, `0` while the run is live.
- **`declareAscension` (action 15) gains a parameter.** Its candidate list is the qualifying routes
  in authored order, with `CANDIDATE_SLOTS[15] = 8` pinned. **Which summit was claimed becomes a
  decision an agent makes and an observer can see.** Parameter `0` resolves to the highest-ranked
  qualifying route, so a policy that emits no parameter reproduces today's behaviour exactly,
  provided apotheosis and canon stay first and second in authored order — which the loader asserts.
- **Three new routes**, one per playstyle that currently has no summit:

  | Route | `terminalReason` | Condition kind | Playstyle it serves |
  |---|---|---|---|
  | `apotheosis` (existing) | 1 | `deepest-node-held` | `narrow-depth` — drive one cell to its floor |
  | `enduring-canon` (existing) | 2 | `era-run` | `archivist` — redundancy against the loss channel |
  | `great-compendium` | 5 | `breadth-held` | `permissive-breadth` — hold a wide grid, redundantly |
  | `unbroken-devotion` | 6 | `worship-recovered` | `worship-maximizer` — devotion that survives a shock |
  | `warded-silence` | 7 | `constrained-thriving` | `denial-warden` — a narrow ruleset that still thrives |

- **`TERMINAL_REASON` is extended append-only.** `1`, `2`, `3`, `4` keep their meanings forever; new
  routes take `5`, `6`, `7`. The enumeration is serialized in every episode record and on the gym
  wire, so renumbering is never permitted.
- **`mm_gym.rewards` gains an exported `ASCENSION_TERMINAL_REASONS` frozenset.** Today
  `sparse_terminal` hardcodes a two-tuple; a run that ascended by route 5 would score `0.0` and
  silently teach a policy that the route is worthless. This is a training-correctness bug the moment
  a third route exists.
- **`ascensionRateByPath` is implemented**, keyed by route content id, with the per-route rate and
  the derived share both defined. No new §7 metric name is invented — the one the spec already names
  is the one that gets built.
- **Two sweep assertions**: a route whose share exceeds **0.60** fails the sweep, and a route that
  records **zero** ascensions in a sweep large enough for its budget to predict at least eight fails
  the sweep as dead. The first tightens `god-agency`'s existing 90% scenario, which this supersedes.
- **A strategy × route cross-tabulation in the tournament report** — not a §7 metric, because it is
  a property of a scripted pool rather than of the game, and §7 metrics are collected against
  builds that have no pool.

## Capabilities

### New Capabilities

- `ascension-routes`: what a route is, how routes are authored, how qualification is computed as a
  set, how a route is declared and recorded, the five condition kinds, the payout-parity rules that
  stop one route dominating, and the two sweep assertions that catch a dead or dominant route.

### Modified Capabilities

- `content-schemas`: ascension routes join the enumerated kinds of authored, schema-validated
  content.

## Impact

- **Content**: a new `packages/content/data/ascension-route.json` and its schema; new *appended*
  ids in `packages/content/data/god-constant.json` for the three new routes' thresholds. **W3
  appends only. W2 modifies existing ascension constants.** Appends and modifications on disjoint
  ids merge without conflict, and the task list holds this change's content edit until W2 has
  landed.
- **Code**: `packages/coordination/src/god/ascension.ts` (the condition kinds and the qualification
  bitmask), `system.ts` (recompute per tick), `interventions.ts` (`ascensionPlan` reads a
  parameter), `packages/agent-api` (candidate list for action 15, the mask, the session's terminal
  reason accessor), `packages/state` (the new god-state field and the extended terminal-reason
  enumeration), `packages/mc-harness` (route on the run record, `ascensionRateByPath`, the two
  assertions, the tournament cross-tab), `packages/gym-bridge/python/mm_gym/rewards.py`.
- **Observation shape changes.** Action 15 gains eight candidate slots, and the god block gains the
  qualified-routes bitmask. This is a contract change to `docs/design/contracts.md` §4.1/§4.2/§4.4.
  It is cheap now and expensive later: release-plan 0.12.0 is where trained policies start
  accumulating, and every policy trained before this lands would have to be retired after it.
- **Contracts**: §4.2's action table gains a parameter column entry for action 15; §4.4 gains the
  pinned `k`; §1.1's terminal-reason enumeration gains three members; §7's `ascensionRateByPath` row
  is given a definition and a threshold owned by `god-agency`.
- **Vision**: §8a gains the statement that a route exists per playstyle and that route payouts are
  equal by design; §11 gains a roadmap row.
- **Golden fixtures**: `contentRevision` moves when the new content file lands. That is a
  compatibility break to record, not a behaviour change to regenerate around. **No golden fixture is
  regenerated by this change.**
- **Sequencing — this change is blocked, and says so.** It depends on W1 (every scripted strategy
  declares an explicit ascension stance, so that "did it win" measures play rather than
  preference-list position) and on W2 (ascension gated on something the god's play moves). Until W2
  lands, every strategy reaches the same state at the same tick, so a sweep of five routes would
  measure five ways of pressing the same button. **The route content and the new condition kinds
  MUST NOT be authored before W2's retune is committed and green.** The declaration and detection
  work in task groups 1–4 is not blocked and can land first; it is what makes W2 measurable by path
  at all.
- **Not claimed**: no assertion is made here that variety improves play, or that these five routes
  are the right five. The claim made is narrower and is stated in `design.md` with the sweep that
  disproves it.
