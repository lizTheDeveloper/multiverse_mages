/*
 * Multiverse Mages — the system that makes raids happen in a headless run.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `rules-raid` is 4,500 lines of complete, tested engine that nothing called.
 * This is the caller.
 *
 * ## How a raid is arbitrated inside a one-universe instance
 *
 * `contracts.md` §1.1 is narrower than it reads: what it forbids is a *legality*
 * decision taken against a live second `Universe` entity. Arbitration reads a
 * frozen `RulesetSnapshot`, captured at portal open, and `rules-raid`'s
 * conformance scan proves there is exactly one `permits()` call site in the
 * package. Everything else about a participant — its mages, its libraries, the
 * component rows a consequence lands in — is live, and `RaidParticipant` carries
 * a whole `SimState` for each side.
 *
 * So the *stepping* instance still holds one universe: `step()` advances one
 * world, and a raid is a self-contained computation that borrows two worlds,
 * runs to termination inside a single call, and writes back. That is exactly the
 * shape `raid-engagement` specified — *"a reproducible function of `(attacker
 * snapshot, host snapshot, raidSeed)`"* — and nothing here has to be invented to
 * satisfy it. The one thing that had to be supplied is the second participant,
 * which in live PvP is a peer's persisted snapshot and here is
 * `rival-universe.ts`.
 *
 * ## Why the whole raid runs inside one world tick
 *
 * `portals`' spec: *"a raid SHALL consume zero world ticks"*, and *"both
 * universes resume at the world tick recorded at portal open"*. `openPortal`
 * enters engagement mode on both clocks itself and `closePortal` leaves it, so
 * the mode change is the engine's, not the step loop's. Running the engagement
 * across several `step()` calls instead would mean holding the `Raid` object —
 * which closes over a `SimState` that `step` replaces by cloning every tick —
 * across those calls, and the raid would be operating on a world one tick stale.
 * One tick in, one tick out, with the engagement clock advancing inside it, is
 * both the spec's reading and the only correct one against `step`'s contract.
 *
 * The consequence is stated rather than hidden: **a raid costs this universe no
 * world ticks**, so `inboundRaidTempoLoss` measures zero here. §8's tempo cost
 * is relative to *uninvolved* universes — *"while you fight, everyone not
 * fighting is researching"* — and a simulation instance holding one universe has
 * no uninvolved third party for the loss to be relative to. That is a finding
 * about what a single-universe Monte Carlo can measure, not a mechanic that is
 * missing. What raids do cost here is favor, casualties, and knowledge, and
 * those are all real.
 *
 * ## Randomness
 *
 * Two draws happen on the world side, both on stream 10 — `contracts.md` §6's
 * *"objective and raid generation"* — which no world-scale subsystem has ever
 * drawn from. Adding them therefore re-rolls nothing: streams are a pure
 * function of `(rootSeed, subsystemId, tick)`, so mortality, research, teaching
 * and every other committed number stays exactly where it was.
 *
 * Everything inside a raid draws from the raid's *own* `RngSource`, built by
 * `openPortal` from `raidSeed` alone. A raid is therefore isolated from the
 * world's streams entirely, in both directions.
 *
 * What does move is every world draw *after* a raid, because `step` keys
 * `ctx.rng` on `clock.stepOrdinal` and a raid changes what the world contains.
 * That is the raid having an effect, not a stream-splitting fault, and it is why
 * the balance baselines move on this commit.
 */

import { RNG_STREAM, TIME_MODE, nextBounded } from '@mm/sim-core';
import type { EntityHandle, SimState, System } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import { KnowledgeSubsystem, portalHookSet, resolvePortalHooks, traditionTableFrom } from '@mm/rules-magic';
import type { MagicGrid } from '@mm/rules-magic';
import {
  ATTACKER,
  DEFENDER,
  EngagementCeilingReached,
  applyRaidOutcome,
  closePortal,
  deployRaid,
  heldInstancesOf,
  openPortal,
  portalGate,
} from '@mm/rules-raid';
import type { ActionEconomyReport, RaidParticipant, RaidTuning } from '@mm/rules-raid';
import type { AblationMask } from '@mm/coordination';
import { settleRaidCasualties } from '@mm/coordination';
import type { ContentCatalogue } from '@mm/agent-api';
import {
  OBJECTIVE_STATUS,
  TERMINAL_REASON,
  captureRuleset,
  findUniverse,
  readUniverse,
} from '@mm/state';

import type { DirectiveLog, EngagementPolicy } from './raid-directives.js';
import { runRaidWithPolicy } from './raid-directives.js';
import { requiredSpeciesOf } from './rival-universe.js';
import type { ReferenceContent } from './reference-universe.js';
import type { RivalConstants } from './rival-universe.js';
import { buildRival, portalTargetIds } from './rival-universe.js';

/** `contracts.md` §4.2 action 14. Named here so the system does not import `agent-api`. */
const OPEN_PORTAL_ACTION = 14;

/** `fp(1)`. The scale the inbound arrival chance is authored at. */
const FP_ONE = 1024;

/**
 * One raid, as this run saw it.
 *
 * Deliberately *not* `mc-harness`'s `RaidObservation`: this carries the two raw
 * numbers the §7 metrics are derived from — the favor an attacker paid, and
 * which side this universe was on — and lets `executor.ts` do the deriving in
 * one place, next to the god report it needs for the other half of the division.
 */
export interface RaidRecord {
  /** Ascending from 1 within the run. */
  readonly raidId: number;
  readonly raidSeed: number;
  /** World tick the portal opened on. */
  readonly worldTick: number;
  /** Whether this universe attacked (`true`) or was raided (`false`). */
  readonly outbound: boolean;
  readonly engagementTicks: number;
  readonly initialPortalStabilityTicks: number;
  /** `RAID_SIDE` value that won. */
  readonly victor: number;
  /** `RAID_END_REASON` value. */
  readonly reason: number;
  /** Mages this universe lost, permanently. */
  readonly localCasualties: number;
  /**
   * The attacking side's mages: sent, brought home, and lost to the timer.
   *
   * **Raid-relative, not local-relative**, for the same reason
   * {@link RaidRecord.actionEconomy} is: they are the attacker's numbers
   * whichever side this universe was on, and re-orienting them here would put
   * arithmetic on a record whose job is to carry numbers unmodified.
   */
  readonly raidersFielded: number;
  readonly raidersWithdrawn: number;
  readonly raidersStranded: number;
  /**
   * Nodes the attacking side carried out of the host universe, whichever side
   * this universe was on. Raid-relative, like the three counts above.
   *
   * The other half of a withdrawal tuning. A threshold early enough that every
   * raider comes home is also early enough that none of them takes anything,
   * and without this the first reads as a success — `localCasualties` falls,
   * `raidersWithdrawn` rises, and nothing says the raid accomplished nothing.
   */
  readonly nodesTakenByAttacker: number;
  /**
   * Every objective on the field and how it ended — `OBJECTIVE_KIND` and
   * `OBJECTIVE_STATUS` values, in the raid's own order. Raid-relative.
   *
   * The victor is decided by objective value taken, not by nodes, and not by
   * how the raid ended: an attacker who captures a university and walks home
   * with no new node has won. Without this a report could say only *that* the
   * attackers won, and two withdrawals with zero casualties and zero nodes
   * read as one raid won and one lost for no visible reason (playtest round 4).
   * Carried as the two enum values only; `value` is a tuning number.
   */
  readonly objectives: readonly { readonly kind: number; readonly status: number }[];
  /**
   * Mages each side lost for good, `[attacker, defender]` by `RAID_SIDE`.
   * Raid-relative, unlike {@link RaidRecord.localCasualties}: the record a
   * defender's page reads is the attacker's, and without the defender's half
   * it could only say "watch your population" (playtest round 4).
   */
  readonly casualtiesBySide: readonly [number, number];
  /** Nodes the defending universe no longer has any instance of. Raid-relative. */
  readonly nodesLostByDefender: number;
  /**
   * Knowledge instances that left the defender, by verb — a mind read
   * (`copied`), a grimoire carried off (`moved`), a book burned (`destroyed`) —
   * counting only thefts a raider brought home; burning needs no one to.
   */
  readonly knowledgeTaken: { readonly copied: number; readonly moved: number; readonly destroyed: number };
  /**
   * Mid-raid ruleset changes this god actually made, and the favor they cost.
   *
   * The seam's own instrument. Unmasking actions 1–4 and routing them to
   * `applyDirective` is unfalsifiable without a count: a run in which the god
   * submits a change and one in which it does not would otherwise differ only
   * in numbers that move for a dozen other reasons. `directivesApplied` counts
   * accepted changes — a refusal by side, phase, purse or lock is not one — and
   * `directiveFavorSpent` is what the raid purse was debited, settled at
   * resolution like every other raid consequence.
   */
  readonly directivesApplied: number;
  readonly directiveFavorSpent: number;
  /** Nodes that left this universe entirely — every instance destroyed. */
  readonly nodesLostLocally: number;
  /** Nodes this universe's raiders carried home. */
  readonly nodesGainedLocally: number;
  /** Favor the attacker paid for action 14, `fp`. Zero for an inbound raid. */
  readonly attackerFavorCost: number;
  /**
   * `permits()` refusals at the resolution choke point. The 0.7.0 zero-occurrence
   * claim; must read zero across every raid of every run.
   *
   * **A tripwire, not a measure of §3.** The legal-node mask removes forbidden
   * nodes before any combatant can choose one, so this is zero whenever that
   * mask works. What the host ruleset actually took away is
   * {@link raiderNodesForbiddenByHost}.
   */
  readonly forbiddenCastsBlocked: number;
  /**
   * **§3 at work:** nodes the raiders could cast at home that the host's frozen
   * ruleset forbids, summed over fielded raiders at portal open. They never
   * reach a raider's hand inside the host. Added 2026-10-09: the round-4
   * playtest read `forbiddenCastsBlocked`'s zeros as "the host rules never
   * mattered", while two lobby squares that differ masked about 84 % of a
   * warband's kit.
   */
  readonly raiderNodesForbiddenByHost: number;
  /**
   * **Why the victor is the victor.** `victorOf` gives the attacker the raid
   * iff the objective value she took reaches the victory threshold of the
   * total — no roll, no hit points. An attacker who captures the archmage and
   * walks home wins with nothing carried and nobody killed; one who walks home
   * having taken nothing loses. Round 4 saw identical-looking withdrawals
   * (2 fielded, 2 withdrew, 0 lost, 0 taken) go once each way. {@link objectives}
   * says which objectives fell; these two carry the values the rule compares,
   * so a reader can recompute the victor from the record alone. Added
   * 2026-10-09; report-only.
   */
  readonly objectiveValueTaken: number;
  readonly objectiveValueTotal: number;
  /**
   * **What happened inside the raid**, carried across the boundary rather than
   * recomputed on the far side of it.
   *
   * Until this field existed, a raid reported its *shape* — how long it ran,
   * what the portal cost, who won — and nothing at all about the combat in it.
   * The consequence was measured and is the reason this field is here: with
   * `portal-rush` fielding real combatants, **ablating six of the seven combat
   * primitives moved the raid log on none of four seeds**, because the log was
   * structurally incapable of showing it. The mask was live and the instrument
   * was blind, which is the worse of the two failures: a sweep arm ablating one
   * of those six reported a null for a working wire.
   *
   * `RaidOutcome` carries three things that could have closed it, and this is
   * the one with a written consumer:
   *
   * - `actionEconomy` — `RaidObservation` already declares `combatSources`,
   *   `totalCombatantTicks`, `worldScaleRemovals`, `summonsRemoved` and
   *   `unimplementedCombatChannels`, field for field, and
   *   `collectCombatActionEconomy` and `collectCombatThresholdEfficiency` are
   *   written against them. Two of §7's six unmeasured metrics are waiting on
   *   exactly this and nothing else.
   * - Opposing-side casualties — **subsumed**, not rejected on taste.
   *   {@link ActionEconomyReport.removals} is per side, so the number that
   *   would have justified a `remoteCasualties` field is already in here beside
   *   the local one.
   * - `primitiveApplication` — magnitude put on the field. Deliberately *not*
   *   carried: nothing downstream of this boundary reads it. `winRateByPrimitive`
   *   attributes wins to arms, not to these rows, and a second field with no
   *   consumer is how this project got four metrics that read as healthy
   *   constants while being incapable of moving.
   *
   * **Raid-relative, not local-relative.** Every other side-bearing field on
   * this record is oriented to this universe — `localCasualties` counts *our*
   * dead. This one is not: its pairs are indexed by `RAID_SIDE`, attacker first,
   * exactly as `rules-raid` computed them. Re-orienting it here would mean
   * arithmetic on a record whose whole job is to carry numbers unmodified, and
   * §7's two collectors pool both sides anyway.
   */
  readonly actionEconomy: ActionEconomyReport;
}

/** Everything {@link raidSystem} needs. */
export interface RaidSystemDeps {
  readonly content: ReferenceContent;
  readonly grid: MagicGrid;
  readonly tuning: RaidTuning;
  readonly constants: RivalConstants;
  /** The world schema rivals are built against. The same one this system runs in. */
  readonly schema: Parameters<typeof buildRival>[0]['schema'];
  /** Called once per resolved raid, in resolution order. */
  readonly onRaid: (record: RaidRecord) => void;
  /**
   * The raids this episode has resolved so far, in resolution order.
   *
   * The system's two pieces of memory — how many raids have happened, and when
   * the last one was — are read from here rather than kept in this closure, and
   * that is not a stylistic choice. A `Scenario.create` must be *"a pure
   * function of its two arguments"*; the system is built once per scenario and
   * a scenario may be reset more than once, so counters living here would carry
   * the previous episode's raid numbering and its cooldown into the next one.
   * The caller owns the log and clears it on reset, so deriving both from the
   * log makes one reset enough.
   */
  readonly raidsSoFar: () => readonly RaidRecord[];
  /**
   * §9's ablation mask for this run, or absent for the control arm.
   *
   * Threaded because without it **no combat primitive is ablatable**, and a
   * sweep arm that neutralizes `direct-damage` would report "no detected
   * effect" while every raid in the arm ran at full strength — a false negative
   * dressed as a measurement, which is worse than a missing one.
   *
   * Absent rather than `NO_ABLATION`, matching `world-step.ts`: every control
   * run and every committed baseline then takes the branch it was recorded on.
   */
  readonly ablation?: AblationMask | undefined;
  /**
   * A policy consulted on every engagement tick of every raid, or absent.
   *
   * Absent is the build before the seam existed: `runRaidWithPolicy` with no
   * policy steps, resolves and throws exactly as `runRaid` did, so every
   * committed baseline takes the branch it was recorded on. Installing one is
   * what makes `raid-engagement.md` §3's verbs reachable from outside
   * `rules-raid`'s own tests.
   */
  readonly engagementPolicy?: EngagementPolicy | undefined;
  /** The catalogue the mid-raid mask prices against. Absent means structure only. */
  readonly maskCatalogue?: ContentCatalogue | undefined;
  /**
   * Live universes on the other side of the portal, or absent for the headless
   * build. Absent is byte-identical to the build before the seam existed: every
   * branch below that reads this field is guarded on `=== undefined` first.
   */
  readonly peers?: PeerPortals | undefined;
}

/**
 * The other universes in a bubble, as portal seats (`vision.md` §8b).
 *
 * Present, it **replaces** the headless stand-in rather than adding to it:
 * a seat's raid builds no `buildRival` universe, and the inbound arrival roll is
 * off, because an inbound raid now arrives when a peer's god opens one. What
 * this does not give is replay: a peer's write-back lands in that universe's
 * state from outside its own step, so neither universe's action log alone
 * reproduces it. `pvp-server`'s snapshot exchange is what closes that.
 */
export interface PeerPortals {
  /** Seat ids action 14 may target. Fixed for the scenario's life. */
  readonly seats: readonly number[];
  /** The live universe in a seat, or `undefined` when the seat is empty or its universe ended. */
  participant(seat: number): RaidParticipant | undefined;
  /** An outbound raid against a seat resolved, so the host can tell the defender. */
  onOutbound?(seat: number, record: RaidRecord): void;
  /**
   * Interned ids of the species alive in a seat's universe, or `undefined` for
   * an empty or ended seat. Optional: absent, the scenario reads them from
   * {@link participant}'s world, which is correct and costs a knowledge-index
   * rebuild per seat per ask — a host that holds the states already should
   * answer directly. Action 16's roster is built from this
   * (`invitation.ts`): a second species arrives only from a seat that holds it.
   */
  speciesIn?(seat: number): readonly number[] | undefined;
}

/**
 * A universe's live state in the shape `openPortal` reads, or `undefined` when
 * it holds no universe or that universe has ended.
 */
export function participantOf(state: SimState, content: ReferenceContent): RaidParticipant | undefined {
  const universe = findUniverse(state);
  if (universe === 0) return undefined;
  if (readUniverse(state, universe).terminalReason !== TERMINAL_REASON.none) return undefined;
  const ruleset = captureRuleset(state, universe);
  return {
    world: state,
    // `fromState`, never the bare constructor: the constructor builds an
    // empty existence index, and a raid that destroyed an instance the index
    // had never seen would trip `NodeExistenceIndex.remove`'s divergence
    // guard on the first library it burned.
    // The exclusion resolver is passed here for the reason `rules-magic`'s
    // `exclusions.test.ts` names: theft writes straight into a thief's mind,
    // so a raid subsystem built without it would let a raider acquire the one
    // school her own holdings forbid (`vision.md` §4b).
    knowledge: KnowledgeSubsystem.fromState(state, content.deps.catalog.nodeCount, content.deps.cells),
    ruleset,
    // Host and home are the same tradition for the local side of an inbound
    // raid, and differ only if a rival ever holds another. Resolved through
    // the same split either way, so the one code path is the tested one.
    hooks: resolvePortalHooks(
      portalHookSet(ruleset.traditionId, ruleset.traditionId, traditionTableFrom(content.registry)),
    ),
    speciesOf: requiredSpeciesOf(content.registry),
  };
}

/**
 * The system that opens portals, runs raids, and writes their consequences back.
 *
 * Installed **last** in the world schema, after `coordination`'s god-outcome
 * system, so that the god's action 14 has already been resolved and paid for
 * when this reads it. `interventions.ts`'s `portalPlan` does everything up to
 * the moment the clock changes mode and says so in its own comment — *"the
 * engagement itself is `raid-engagement`'s and is not specified here"*. This is
 * that.
 */
export function raidSystem(deps: RaidSystemDeps): System {
  const { content, constants } = deps;
  const targets = deps.peers?.seats ?? portalTargetIds(constants);
  const portalCost = content.deps.god?.content.costs.byAction[OPEN_PORTAL_ACTION] ?? 0;

  return {
    name: 'raids',
    run(ctx) {
      // Unconditional, and it is load-bearing. `portalPlan` calls
      // `requestEngagement()` whenever it applies; if this system then declines
      // to open a raid — the two gates can disagree, and the outcome of a
      // disagreement must never be a hung run — the clock would enter engagement
      // with no raid in it, every world system would return early on
      // `ctx.mode !== world`, and the run would freeze until the harness's cap.
      // A system asking for the mode it is already in is explicitly not counted
      // as an illegal action; see `step.ts`.
      ctx.requestWorldTime();

      if (ctx.mode !== TIME_MODE.world) return;
      if (targets.length === 0) return;

      const universe = findUniverse(ctx.state);
      if (universe === 0) return;
      if (readUniverse(ctx.state, universe).terminalReason !== TERMINAL_REASON.none) return;

      const worldTick = ctx.tick;
      const stream = ctx.rng.stream(RNG_STREAM.objectives);

      // Outbound takes precedence over inbound, and only one raid opens per
      // world tick. Stated because it is precedence: the god chose to raid this
      // tick, and an arrival roll that pre-empted the choice would make action
      // 14 fail for a reason no agent could observe.
      const outboundTarget = submittedPortalTarget(ctx.actions, targets);
      let targetId = 0;
      let outbound = false;

      if (outboundTarget !== 0) {
        targetId = outboundTarget;
        outbound = true;
      } else if (
        deps.peers === undefined &&
        worldTick - lastRaidWorldTick(deps) >= constants.inboundCooldownWorldTicks
      ) {
        // The arrival process. One draw, always taken, whether or not it fires:
        // a draw taken conditionally would make the stream's position depend on
        // the cooldown, and two runs differing only in when they were last
        // raided would diverge in every later arrival.
        if (nextBounded(stream, FP_ONE) < constants.inboundChancePerWorldTick) {
          targetId = (targets[nextBounded(stream, targets.length)] ?? 0) as number;
        }
      }

      if (targetId === 0) return;

      const local = localParticipant(ctx.state, deps);

      if (outbound) {
        const gate = portalGate({
          attackerWorld: ctx.state,
          attackerRuleset: local.ruleset,
          registry: content.registry,
          grid: deps.grid,
          favor: readUniverse(ctx.state, universe).favor,
          // Zero, and not the action's price. Affordability was decided and
          // charged one system earlier by `portalPlan`, which debited the favor
          // this reads; re-charging it here would refuse every raid the god had
          // just paid for. The other three arms of the gate — the portal cell
          // being permitted, a living mage holding a `portal` node, and no raid
          // already in flight — are re-asked in full, because those are facts
          // about the world and this is the layer that acts on them.
          favorCost: 0,
          alreadyEngaged: ctx.state.clock.mode !== TIME_MODE.world,
          heldOf: (mage: EntityHandle) => heldInstancesOf(local, mage),
        });
        if (!gate.open) return;
      }

      // Derived, never drawn from a stream that another subsystem shares, and
      // mixed with the target so two rivals raided on one tick differ.
      const raidSeed = (nextBounded(stream, 0x1_0000_0000) ^ (targetId * 0x9e37)) >>> 0;

      const rival =
        deps.peers === undefined
          ? buildRival({
              runSeed: ctx.state.rootSeed,
              targetId,
              content,
              schema: deps.schema,
              // §4a splits the hooks across the portal: `cast` and `cost` follow the
              // host. For an inbound raid this universe is the host, so the rival's
              // hooks resolve against the tradition this universe currently holds —
              // which god action 13 may have changed since tick zero.
              hostTraditionId: outbound ? content.traditionId : local.ruleset.traditionId,
              // The loot shelf is keyed on what *this* universe's god forbids, which
              // is a fact about this universe and not about the rival — so it is
              // captured here, at the portal, alongside the tradition. It is the same
              // snapshot arbitration uses, so a shelf can never be stocked against a
              // ruleset the raid does not then enforce.
              localRuleset: local.ruleset,
              constants,
            }).participant
          : deps.peers.participant(targetId);
      if (rival === undefined) return;


      const record = resolveOneRaid({
        deps,
        local,
        rival,
        outbound,
        raidSeed,
        worldTick,
        raidId: deps.raidsSoFar().length + 1,
        attackerFavorCost: outbound ? portalCost : 0,
      });
      if (outbound) deps.peers?.onOutbound?.(targetId, record);
    },
  };

  /** This universe, in the shape `openPortal` reads. Its terminal state was checked above. */
  function localParticipant(
    state: SimState,
    input: RaidSystemDeps,
  ): RaidParticipant {
    return participantOf(state, input.content) as RaidParticipant;
  }
}

/**
 * The world tick of the last raid this episode resolved, or a tick far enough
 * below zero that the cooldown cannot bite on the first one.
 */
function lastRaidWorldTick(deps: RaidSystemDeps): number {
  const raids = deps.raidsSoFar();
  return raids.length === 0 ? Number.NEGATIVE_INFINITY : (raids[raids.length - 1] as RaidRecord).worldTick;
}

/** The target id of an admitted action 14, or `0`. */
function submittedPortalTarget(
  actions: readonly { readonly kind: number; readonly params?: readonly number[] }[],
  targets: readonly number[],
): number {
  for (const action of actions) {
    if (action.kind !== OPEN_PORTAL_ACTION) continue;
    const target = action.params?.[0] ?? 0;
    // `admit` rewrites a submitted slot index into the candidate's own params
    // before the action reaches a system, so this is already a target id. The
    // membership check is not defensive politeness: a system that trusted an
    // id nothing had validated would build a rival from an arbitrary integer.
    if (targets.includes(target)) return target;
  }
  return 0;
}

/**
 * Opens, runs, applies and closes one raid.
 *
 * The order is `raid-engine.ts`'s and is not negotiable: `applyRaidOutcome`
 * reads the rosters and draws stream 5 for grimoire burn-resistance, so it must
 * run before anything discards the raid, and `closePortal` must run after it or
 * the two worlds never return to world time.
 */
function resolveOneRaid(input: {
  readonly deps: RaidSystemDeps;
  readonly local: RaidParticipant;
  readonly rival: RaidParticipant;
  readonly outbound: boolean;
  readonly raidSeed: number;
  readonly worldTick: number;
  readonly raidId: number;
  readonly attackerFavorCost: number;
}): RaidRecord {
  const { deps, local, rival, outbound } = input;
  const attacker = outbound ? local : rival;
  const host = outbound ? rival : local;

  const raid = openPortal({
    attacker,
    host,
    registry: deps.content.registry,
    grid: deps.grid,
    // The composition root's fetch, not one built here. `worldDeps` asked the
    // content for every combat primitive's node effects and recorded that it
    // did; passing that object through is what makes the recording a fact about
    // the assembled simulation rather than about a function somebody wrote.
    combat: deps.content.deps.combat,
    tuning: deps.tuning,
    raidSeed: input.raidSeed,
    // §9's mask, per run rather than per content set — the same placement
    // `referenceScenario` uses and for the same reason: a `ReferenceContent` is
    // memoized for the life of a worker, and a mask folded into it would
    // neutralize every arm scheduled after the one that set it.
    ...(deps.ablation === undefined ? {} : { ablation: deps.ablation }),
  });
  deployRaid(raid);

  const initialPortalStabilityTicks = raid.maxTicks;
  let log: DirectiveLog = { directives: [], ticksOffered: 0 };
  try {
    // **Tick at a time, not `runRaid`.** `runRaid` drives `stepEngagement` to
    // completion in a `while` loop with no gap in it, which is why unmasking
    // actions 1–4 moved nothing on its own: the raid was over before any caller
    // could offer the god a mask, and the engagement branch of that mask had
    // been measured as evaluated *zero* times. `runRaidWithPolicy` is the same
    // loop with the gap open, and with no policy installed it steps, resolves
    // and throws exactly as `runRaid` does.
    //
    // The policy is asked **per engagement tick** rather than handed
    // `ctx.actions`, and that is a correction rather than a refinement: a
    // world-tick submission has already been consumed by `coordination`'s
    // world-scale resolver by the time a raid opens. Measured — submitting
    // `forbidTechnique` on every world tick drains every technique bit at world
    // scale by tick 100, after which the same action mid-raid is correctly
    // `not-a-change`. Replaying `ctx.actions` into the raid would double-apply
    // a world-scale action or apply a dead one.
    log = runRaidWithPolicy(raid, {
      defending: !outbound,
      ...(deps.engagementPolicy === undefined ? {} : { policy: deps.engagementPolicy }),
      ...(deps.maskCatalogue === undefined ? {} : { catalogue: deps.maskCatalogue }),
    });
  } catch (error) {
    // Resolution happens *before* the ceiling error is thrown, precisely so a
    // caller still holds a complete outcome. Anything else is a real fault and
    // must not be swallowed: a raid that failed halfway has already mutated
    // both worlds' clocks, and continuing would leave the run frozen.
    if (!(error instanceof EngagementCeilingReached)) throw error;
  }

  let directivesApplied = 0;
  let directiveFavorSpent = 0;
  for (const entry of log.directives) {
    if (!entry.result.applied) continue;
    directivesApplied += 1;
    directiveFavorSpent += entry.result.paid;
  }

  const outcome = raid.outcome;
  if (outcome === undefined) {
    throw new Error(
      `Raid ${String(input.raidId)} produced no outcome record. resolveRaid assigns one before ` +
        'every return path in rules-raid, so this is an engine change, not a wiring fault.',
    );
  }

  const applied = applyRaidOutcome(raid, outcome);
  // The half of a death `rules-raid` cannot reach: goal, lessons, workings and
  // affiliation are `coordination`'s. Both worlds, before anything reads them.
  settleRaidCasualties(
    attacker.world,
    outcome.casualties.filter((c) => c.side === ATTACKER).map((c) => c.mageId),
  );
  settleRaidCasualties(
    host.world,
    outcome.casualties.filter((c) => c.side === DEFENDER).map((c) => c.mageId),
  );
  closePortal(raid);

  const localSideValue = outbound ? ATTACKER : DEFENDER;
  let localCasualties = 0;
  for (const casualty of outcome.casualties) {
    if (casualty.side === localSideValue) localCasualties += 1;
  }

  const record: RaidRecord = {
    raidId: input.raidId,
    raidSeed: input.raidSeed,
    worldTick: input.worldTick,
    outbound,
    engagementTicks: outcome.resolutionTick,
    initialPortalStabilityTicks,
    victor: outcome.victor,
    reason: outcome.reason,
    localCasualties,
    directivesApplied,
    directiveFavorSpent,
    raidersFielded: outcome.raidersFielded,
    raidersWithdrawn: outcome.raidersWithdrawn,
    raidersStranded: outcome.raidersStranded,
    nodesTakenByAttacker: countOf(applied.nodesGainedByRaider),
    objectives: outcome.objectives.map((o) => ({ kind: o.kind, status: o.status })),
    casualtiesBySide: [
      outcome.casualties.filter((c) => c.side === ATTACKER).length,
      outcome.casualties.filter((c) => c.side === DEFENDER).length,
    ],
    nodesLostByDefender: countOf(applied.nodesLostByHost),
    knowledgeTaken: {
      copied: outcome.knowledgeMovements.filter((m) => m.verb === 'copied' && !m.forfeited).length,
      moved: outcome.knowledgeMovements.filter((m) => m.verb === 'moved' && !m.forfeited).length,
      destroyed: outcome.knowledgeMovements.filter((m) => m.verb === 'destroyed').length,
    },
    // `nodesLostByHost` is the host's loss and `nodesGainedByRaider` the
    // attacker's gain, both computed by the write-back rather than by
    // `resolveRaid`, which hardcodes both to `[]`.
    nodesLostLocally: outbound ? 0 : countOf(applied.nodesLostByHost),
    nodesGainedLocally: outbound ? countOf(applied.nodesGainedByRaider) : 0,
    attackerFavorCost: input.attackerFavorCost,
    forbiddenCastsBlocked: outcome.forbiddenCastsBlocked,
    raiderNodesForbiddenByHost: raid.arbiter.maskedByHost(ATTACKER),
    objectiveValueTaken: outcome.objectives
      .filter((o) => o.status !== OBJECTIVE_STATUS.held)
      .reduce((sum, o) => sum + o.value, 0),
    objectiveValueTotal: outcome.objectives.reduce((sum, o) => sum + o.value, 0),
    // Passed through untouched. `resolveRaid` froze it at resolution and this
    // layer neither normalises nor re-sides it; see the field's own note.
    actionEconomy: outcome.actionEconomy,
  };
  deps.onRaid(record);
  return record;
}

function countOf(nodes: readonly ContentId[]): number {
  return nodes.length;
}
