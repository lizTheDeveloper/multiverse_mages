/*
 * Multiverse Mages — two live universes, one portal, and what it did.
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
 * The instrument behind `scripts/peer-raid-survey.mjs` and the band test.
 *
 * It plays a seeded **pair** of live universes through `referenceScenario`'s
 * `peers` seam — each the other's only portal seat — under one attacker policy
 * and one defender policy, lets the attacker open exactly one portal, and
 * measures the raid from *both* worlds rather than from the attacker's
 * `RaidRecord` alone.
 *
 * ## Why it reads the defender's world directly
 *
 * `RaidRecord.nodesTakenByAttacker` counts nodes that did not exist in the
 * attacker's universe before the raid. Two reference universes found on the same
 * curriculum, so a library looted between them can move a dozen books and
 * report **zero** — every one of them is a node the thief's universe already
 * held. That is a correct answer to a question nobody playing was asking, and
 * it is the reading that made live raids look inert. So this counts what the
 * host lost from its shelves, and what the attacker carried home, as instances.
 *
 * ## Policies
 *
 * Every policy is something a player can do through the action space and the
 * candidate lists, with one concession: `armed` reads a mage's held nodes off
 * the world, which the client shows a player as the mage's detail card
 * (`candidate-detail.ts`). Nothing here writes to a world.
 *
 * - **Attacker, `fresh`** — name the first six raider candidates the list
 *   offers, open the portal as soon as it is legal. The reported case.
 * - **Attacker, `armed`** — name the six raider candidates holding the most
 *   castable combat, theft and portal nodes.
 * - **Attacker, `all-in`** — name every raider candidate offered, best-armed
 *   first, up to the side cap.
 * - **Preparation** — raiders are named at tick 12, then for `prep` world
 *   ticks the attacker encourages research (action 12) in the portal's cell and
 *   the combat cells, best first, whenever the action is legal, and only then
 *   opens the portal. Naming first is the reasonable order: a named raider
 *   spends her `raid-readiness` months drilling what she holds.
 * - **Defender, `idle`** — no-ops throughout.
 * - **Defender, `wardens`** — names up to six wardens (action 10) from tick 12,
 *   then encourages research in the same combat cells for the whole window.
 *
 * `standin` mode runs the same attacker against the headless stand-in rival
 * instead of a peer. It is the **positive control**: `armRaiders` and the
 * rival's foreign shelf are known to produce loot, so a survey whose stand-in
 * arm reads zero is a broken instrument, not a finding.
 */

import { GOD_ACTION, createSession, type AgentSession } from '@mm/agent-api';
import type { ContentId } from '@mm/content';
import type { SimState } from '@mm/sim-core';
import { CASTABLE_MASTERY, RAID_END_REASON, heldInstancesOf } from '@mm/rules-raid';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  RAID_SIDE,
  TERMINAL_REASON,
  collectRecords,
  findUniverse,
  readUniverse,
} from '@mm/state';

import { participantOf, type RaidRecord } from './raids.js';
import { referenceScenario, type ReferenceContent } from './reference-universe.js';

export const PEER_ATTACKER_POLICIES = ['fresh', 'armed', 'all-in'] as const;
export const PEER_DEFENDER_POLICIES = ['idle', 'wardens'] as const;
export type PeerAttackerPolicy = (typeof PEER_ATTACKER_POLICIES)[number];
export type PeerDefenderPolicy = (typeof PEER_DEFENDER_POLICIES)[number] | 'standin';

export interface PeerSurveyArm {
  readonly mode: 'peer' | 'standin';
  /** World ticks of combat-cell research encouragement before naming raiders. */
  readonly prep: number;
  readonly attacker: PeerAttackerPolicy;
  readonly defender: PeerDefenderPolicy;
  /** `foundingPortalMagic` for both universes. Default `1`: the portal starts known. */
  readonly portalMagic?: number;
  /** Raids the attacker opens, one after another as the mask allows. Default `1`. */
  readonly raids?: number;
  /**
   * `foundingMages` for the defender only, or absent for the reference count.
   * A small number is the "weak defender" the extinction band is about.
   */
  readonly defenderFoundingMages?: number;
}

/** One raid, measured from both sides. Absent fields are `-1` when unmeasurable in a mode. */
export interface PeerRaidMeasurement {
  readonly seedA: number;
  readonly seedB: number;
  /** World tick the portal opened, or `-1` if the attacker never got there. */
  readonly openedTick: number;
  readonly victor: number;
  readonly reason: number;
  readonly engagementTicks: number;
  readonly raidersFielded: number;
  readonly raidersWithdrawn: number;
  readonly raidersStranded: number;
  /** World-scale combatants removed, per raid side — mages and detachments. */
  readonly casualtiesAttacker: number;
  readonly casualtiesDefender: number;
  /** Cast and intrinsic attack attempts, both sides — zero means nobody fought. */
  readonly attackAttempts: number;
  /** Nodes new to the attacker's universe (the `RaidRecord` reading). */
  readonly nodesTakenByAttacker: number;
  /** Grimoires that arrived in the attacker's universe as loot. */
  readonly grimoiresCarried: number;
  /** Library-held instances the host no longer has. `-1` in `standin` mode. */
  readonly libraryInstancesLost: number;
  /** Nodes that ceased to exist in the host. `-1` in `standin` mode. */
  readonly hostNodesLost: number;
  /** Host mages alive after the raid. `-1` in `standin` mode. */
  readonly hostMagesAfter: number;
  readonly hostMagesBefore: number;
  /** Favor the attacker paid to open the portal. */
  readonly favorCost: number;
  /** Raider candidates the attacker named. */
  readonly named: number;
  /** Presses of a legal action 14 that opened no raid since the previous raid, and the favor they cost. */
  readonly portalRefusals: number;
  readonly favorLostToRefusals: number;
  /** Stand-in arrivals against the attacker during the window (`standin` mode only). */
  readonly inboundRaids: number;
  /** Nodes those arrivals took from, or destroyed in, the attacker. The control's reading. */
  readonly inboundTaken: number;
  /** 1 for the first raid of a pair, 2 for the second, and so on. */
  readonly raidOrdinal: number;
  /** Castable combat, theft and portal nodes held by the attacker's living raiders at the press. */
  readonly raiderKit: number;
  /** Whether the host universe had ended when this raid resolved. */
  readonly hostEndedAfter: boolean;
}

const COMBAT_PRIMITIVES = new Set(['direct-damage', 'area-denial', 'summon', 'knowledge-steal', 'knowledge-corrupt', 'blink']);
/** What `armed` ranks a candidate raider by: her combat kit, and whether she holds the way through. */
const KIT_PRIMITIVES = new Set([...COMBAT_PRIMITIVES, 'portal']);

/**
 * The cells a raiding god would push research toward: the ones holding nodes
 * that hurt, deny, summon or steal, ranked by how many such nodes they hold at
 * tier three or shallower. Derived from content, never listed by hand.
 */
function combatCells(content: ReferenceContent): readonly number[] {
  const score = new Map<number, number>();
  for (const node of content.catalogue.nodes) {
    const record = content.registry.node(node.nodeId);
    if (record === undefined || record.tier > 3) continue;
    if (!record.effects.some((effect) => COMBAT_PRIMITIVES.has(effect.primitive))) continue;
    score.set(node.cellId, (score.get(node.cellId) ?? 0) + 1);
  }
  // The portal's own cell first: a god who means to raid has to keep the way
  // open, and portal knowledge decays like any other.
  const portal = new Set<number>();
  for (const node of content.catalogue.nodes) {
    const record = content.registry.node(node.nodeId);
    if (record?.effects.some((effect) => effect.primitive === 'portal') === true) portal.add(node.cellId);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([cellId]) => cellId);
  return [...[...portal].sort((a, b) => a - b), ...ranked.filter((cellId) => !portal.has(cellId))];
}

/** Castable combat and theft nodes a mage holds — what her detail card shows a player. */
function armament(state: SimState, content: ReferenceContent, mage: number): number {
  const participant = participantOf(state, content);
  if (participant === undefined) return 0;
  let count = 0;
  for (const held of heldInstancesOf(participant, mage)) {
    if (held.mastery < CASTABLE_MASTERY) continue;
    const node = content.registry.node(held.nodeId);
    if (node?.effects.some((effect) => KIT_PRIMITIVES.has(effect.primitive)) === true) count += 1;
  }
  return count;
}

function favorOf(state: SimState): number {
  const universe = findUniverse(state);
  return universe === 0 ? 0 : readUniverse(state, universe).favor;
}

function raiderKit(state: SimState, content: ReferenceContent): number {
  let total = 0;
  for (const entry of collectRecords(state, MAGE)) {
    if (entry.row.alive !== 1 || entry.row.roleId !== MAGE_ROLE.raider) continue;
    total += armament(state, content, entry.handle);
  }
  return total;
}

function aliveMages(state: SimState): number {
  let n = 0;
  for (const entry of collectRecords(state, MAGE)) if (entry.row.alive === 1) n += 1;
  return n;
}

function libraryInstances(state: SimState): number {
  let n = 0;
  for (const entry of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (entry.row.locationKind === LOCATION_KIND.library) n += 1;
  }
  return n;
}

function existing(state: SimState): Set<ContentId> {
  const found = new Set<ContentId>();
  for (const entry of collectRecords(state, KNOWLEDGE_INSTANCE)) found.add(entry.row.nodeId as ContentId);
  return found;
}

function unownedGrimoires(state: SimState): number {
  let n = 0;
  for (const entry of collectRecords(state, GRIMOIRE)) if (entry.row.holderKind === HOLDER_KIND.unowned) n += 1;
  return n;
}


const NAME_FROM_TICK = 12;
const MAX_WAIT_TICKS = 600;
const SIDE_CAP = 32;

interface Live {
  a?: SimState;
  b?: SimState;
}

/**
 * Plays one pair and returns its outbound raids, in order — at most
 * `arm.raids` (default one), and none if the attacker never opened a portal
 * inside the window.
 */
export function playPeerPair(
  content: ReferenceContent,
  arm: PeerSurveyArm,
  seedA: number,
  seedB: number,
): PeerPairResult {
  const live: Live = {};
  const peered = arm.mode === 'peer';
  const runA = referenceScenario(content, {
    onState: (s) => {
      live.a = s;
    },
    ...(peered
      ? {
          peers: {
            seats: [1],
            participant: () => (live.b === undefined ? undefined : participantOf(live.b, content)),
          },
        }
      : {}),
  });
  const a = createSession({ scenario: runA.scenario, strategyId: `survey-a-${arm.attacker}` });
  const config = { worldTickCap: 4000, options: { foundingPortalMagic: arm.portalMagic ?? 1 } };
  a.reset(seedA, config);

  let b: AgentSession | undefined;
  if (peered) {
    const runB = referenceScenario(content, {
      onState: (s) => {
        live.b = s;
      },
      peers: {
        seats: [1],
        participant: () => (live.a === undefined ? undefined : participantOf(live.a, content)),
      },
    });
    b = createSession({ scenario: runB.scenario, strategyId: `survey-b-${arm.defender}` });
    b.reset(
      seedB,
      arm.defenderFoundingMages === undefined
        ? config
        : { ...config, options: { ...config.options, foundingMages: arm.defenderFoundingMages } },
    );
  }

  const cells = combatCells(content);
  let tick = 0;
  let wardens = 0;

  const encourage = (session: AgentSession): { kind: number; params: number[] } => {
    if (session.legalActions()[GOD_ACTION.encourageResearch] !== 1) return { kind: GOD_ACTION.noop, params: [] };
    const offered = session.candidates().get(GOD_ACTION.encourageResearch) ?? [];
    for (const cellId of cells) {
      const slot = offered.findIndex((c) => c.params[0] === cellId);
      if (slot >= 0) return { kind: GOD_ACTION.encourageResearch, params: [slot] };
    }
    return { kind: GOD_ACTION.noop, params: [] };
  };

  const defenderMove = (): { kind: number; params: number[] } => {
    if (b === undefined || arm.defender !== 'wardens' || tick < NAME_FROM_TICK) {
      return { kind: GOD_ACTION.noop, params: [] };
    }
    if (wardens < 6 && b.legalActions()[GOD_ACTION.assignRole] === 1) {
      const slot = (b.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex(
        (c) => c.params[1] === MAGE_ROLE.warden,
      );
      if (slot >= 0) {
        wardens += 1;
        return { kind: GOD_ACTION.assignRole, params: [slot] };
      }
    }
    return encourage(b);
  };

  // A universe that has ended — stagnated, ascended, hit its cap — takes no
  // more actions; a session refuses them, rightly. The attacker's ending ends
  // the pair; the defender's ends only its own moves.
  const running = (session: AgentSession | undefined): boolean => session?.status() === 'running';
  const step = (action: { kind: number; params: number[] }): void => {
    if (running(a)) a.submit(action);
    if (running(b)) b?.submit(defenderMove());
    tick += 1;
  };

  // Idle until raiders can be named.
  while (tick < NAME_FROM_TICK) step({ kind: GOD_ACTION.noop, params: [] });

  // Naming, first: a raider named early has the preparation window to drill.
  const want = arm.attacker === 'all-in' ? SIDE_CAP : 6;
  let named = 0;
  for (let i = 0; i < 120 && named < want; i += 1) {
    const offered = (a.candidates().get(GOD_ACTION.assignRole) ?? [])
      .map((c, slot) => ({ c, slot }))
      .filter(({ c }) => c.params[1] === MAGE_ROLE.raider);
    if (offered.length === 0 || a.legalActions()[GOD_ACTION.assignRole] !== 1) {
      if (offered.length === 0 && named > 0) break;
      step({ kind: GOD_ACTION.noop, params: [] });
      continue;
    }
    let pick = offered[0];
    if (arm.attacker !== 'fresh' && live.a !== undefined) {
      const state = live.a;
      pick = offered
        .map((o) => ({ ...o, score: armament(state, content, o.c.params[0] ?? 0) }))
        .sort((x, y) => y.score - x.score || x.slot - y.slot)[0];
    }
    step({ kind: GOD_ACTION.assignRole, params: [pick?.slot ?? 0] });
    named += 1;
  }

  // Preparation: research encouraged in the portal's cell and the combat cells.
  for (let i = 0; i < arm.prep; i += 1) step(encourage(a));

  // Waiting for the gate, and pressing it — `arm.raids` times, the god raiding
  // again whenever the mask allows. A press the mask allowed that opened
  // nothing is counted rather than retried silently: the mask and the raid
  // system's own gate can disagree, and that disagreement is a finding.
  const measured: PeerRaidMeasurement[] = [];
  let portalRefusals = 0;
  let favorLostToRefusals = 0;
  let refusalsInPair = 0;
  let favorLostInPair = 0;
  const raidsWanted = arm.raids ?? 1;
  for (let i = 0; i < MAX_WAIT_TICKS * raidsWanted && measured.length < raidsWanted; i += 1) {
    if (!running(a)) break;
    if (live.b !== undefined && hostEnded(live.b)) break;
    const portalSlot = (a.candidates().get(GOD_ACTION.openPortal) ?? []).findIndex((c) => c.params[0] === 1);
    if (a.legalActions()[GOD_ACTION.openPortal] !== 1 || portalSlot < 0 || live.a === undefined) {
      step({ kind: GOD_ACTION.noop, params: [] });
      continue;
    }
    const before = {
      hostMages: live.b === undefined ? -1 : aliveMages(live.b),
      hostLibrary: live.b === undefined ? -1 : libraryInstances(live.b),
      hostNodes: live.b === undefined ? undefined : existing(live.b),
      loot: unownedGrimoires(live.a),
      kit: raiderKit(live.a, content),
    };
    const favorBefore = favorOf(live.a);
    const outboundBefore = runA.raids().filter((r) => r.outbound).length;
    // Only A moves on the raid tick, and B is measured before it next steps,
    // so every host column is the raid's doing and nothing else's.
    a.submit({ kind: GOD_ACTION.openPortal, params: [portalSlot] });
    const outbound = runA.raids().filter((r) => r.outbound);
    if (outbound.length === outboundBefore) {
      portalRefusals += 1;
      favorLostToRefusals += Math.max(0, favorBefore - favorOf(live.a));
      refusalsInPair += 1;
      favorLostInPair += Math.max(0, favorBefore - favorOf(live.a));
    } else {
      const record = outbound[outbound.length - 1] as RaidRecord;
      const hostAfter = live.b === undefined ? undefined : existing(live.b);
      let hostNodesLost = -1;
      if (before.hostNodes !== undefined && hostAfter !== undefined) {
        hostNodesLost = 0;
        for (const node of before.hostNodes) if (!hostAfter.has(node)) hostNodesLost += 1;
      }
      let attackAttempts = 0;
      for (const [, counts] of record.actionEconomy.attempts) {
        for (const value of Object.values(counts)) if (typeof value === 'number') attackAttempts += value;
      }
      measured.push({
        seedA,
        seedB,
        openedTick: tick,
        victor: record.victor,
        reason: record.reason,
        engagementTicks: record.engagementTicks,
        raidersFielded: record.raidersFielded,
        raidersWithdrawn: record.raidersWithdrawn,
        raidersStranded: record.raidersStranded,
        casualtiesAttacker: record.actionEconomy.removals[RAID_SIDE.attacker],
        casualtiesDefender: record.actionEconomy.removals[RAID_SIDE.defender],
        attackAttempts,
        nodesTakenByAttacker: record.nodesTakenByAttacker,
        grimoiresCarried: unownedGrimoires(live.a) - before.loot,
        libraryInstancesLost: live.b === undefined ? -1 : before.hostLibrary - libraryInstances(live.b),
        hostNodesLost,
        hostMagesBefore: before.hostMages,
        hostMagesAfter: live.b === undefined ? -1 : aliveMages(live.b),
        favorCost: record.attackerFavorCost,
        named,
        portalRefusals,
        favorLostToRefusals,
        inboundRaids: runA.raids().filter((r) => !r.outbound).length,
        inboundTaken: runA
          .raids()
          .filter((r) => !r.outbound)
          .reduce((n, r) => n + r.nodesTakenByAttacker + r.nodesLostLocally, 0),
        raidOrdinal: measured.length + 1,
        raiderKit: before.kit,
        hostEndedAfter: live.b !== undefined && hostEnded(live.b),
      });
      // Per raid: refusals since the previous one.
      portalRefusals = 0;
      favorLostToRefusals = 0;
    }
    if (running(b)) b?.submit(defenderMove());
    tick += 1;
  }
  return { raids: measured, portalRefusals: refusalsInPair, favorLostToRefusals: favorLostInPair };
}

/**
 * One pair's raids, plus what the pair spent on presses that opened nothing —
 * counted here as well as per raid, because a pair whose every press was
 * refused has no raid to carry the count, and that pair is the finding.
 */
export interface PeerPairResult {
  readonly raids: readonly PeerRaidMeasurement[];
  readonly portalRefusals: number;
  readonly favorLostToRefusals: number;
}

/** Whether a host universe is still running, for the extinction band. */
export function hostEnded(state: SimState): boolean {
  const universe = findUniverse(state);
  return universe === 0 || readUniverse(state, universe).terminalReason !== TERMINAL_REASON.none;
}

/** Every pair of one arm. Seeds are `seed0 + 2i` and `seed0 + 2i + 1`. */
export function surveyPeerArm(
  content: ReferenceContent,
  arm: PeerSurveyArm,
  options: { readonly pairs: number; readonly seed0: number },
): PeerPairResult[] {
  const out: PeerPairResult[] = [];
  for (let i = 0; i < options.pairs; i += 1) {
    out.push(playPeerPair(content, arm, options.seed0 + 2 * i, options.seed0 + 2 * i + 1));
  }
  return out;
}

/** Integer percent, rounded down. */
function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.floor((part * 100) / whole);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return -1;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[(sorted.length - 1) >> 1] as number;
}

export interface PeerSurveySummary {
  readonly raids: number;
  readonly attackerWinPct: number;
  /** `reason:count` pairs, ascending reason. */
  readonly reasons: string;
  readonly medianTicks: number;
  readonly fielded: number;
  readonly withdrawn: number;
  readonly stranded: number;
  readonly casualtiesAttacker: number;
  readonly casualtiesDefender: number;
  readonly anyCasualtyPct: number;
  readonly nodesNew: number;
  readonly grimoiresCarried: number;
  readonly libraryInstancesLost: number;
  readonly hostNodesLost: number;
  /** Of attacker wins, the percent that took or destroyed at least one instance. */
  readonly attackerWinsThatTookPct: number;
  readonly casts: number;
  /** Raids after which the host had no living mage. */
  readonly extinguished: number;
  readonly medianReadyTick: number;
  /** Castable kit nodes per fielded raider, ×100, across the arm. */
  readonly kitPerRaiderX100: number;
  readonly ceilingReached: number;
  readonly portalCollapsed: number;
  /** Raids the defender won with the portal collapsing on the raiders — §8's "holding". */
  readonly heldToCollapse: number;
  /** Pairs whose host universe had ended by the last raid. */
  readonly hostsEnded: number;
}

/** Totals over one arm. Integer arithmetic only, so a summary is reproducible to the byte. */
export function summarisePeerRaids(records: readonly PeerRaidMeasurement[]): PeerSurveySummary {
  const sum = (f: (r: PeerRaidMeasurement) => number): number => records.reduce((n, r) => n + Math.max(0, f(r)), 0);
  const reasons = new Map<number, number>();
  for (const r of records) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  const took = (r: PeerRaidMeasurement): boolean =>
    r.grimoiresCarried > 0 || r.nodesTakenByAttacker > 0 || r.libraryInstancesLost > 0;
  const wins = records.filter((r) => r.victor === RAID_SIDE.attacker);
  return {
    raids: records.length,
    attackerWinPct: pct(wins.length, records.length),
    reasons: [...reasons.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${String(k)}:${String(v)}`).join(' '),
    medianTicks: median(records.map((r) => r.engagementTicks)),
    fielded: sum((r) => r.raidersFielded),
    withdrawn: sum((r) => r.raidersWithdrawn),
    stranded: sum((r) => r.raidersStranded),
    casualtiesAttacker: sum((r) => r.casualtiesAttacker),
    casualtiesDefender: sum((r) => r.casualtiesDefender),
    anyCasualtyPct: pct(records.filter((r) => r.casualtiesAttacker + r.casualtiesDefender > 0).length, records.length),
    nodesNew: sum((r) => r.nodesTakenByAttacker),
    grimoiresCarried: sum((r) => r.grimoiresCarried),
    libraryInstancesLost: sum((r) => r.libraryInstancesLost),
    hostNodesLost: sum((r) => r.hostNodesLost),
    attackerWinsThatTookPct: pct(wins.filter(took).length, wins.length),
    casts: sum((r) => r.attackAttempts),
    extinguished: records.filter((r) => r.hostMagesAfter === 0).length,
    medianReadyTick: median(records.map((r) => r.openedTick)),
    kitPerRaiderX100: Math.floor((sum((r) => r.raiderKit) * 100) / Math.max(1, sum((r) => r.raidersFielded))),
    ceilingReached: records.filter((r) => r.reason === RAID_END_REASON.ceilingReached).length,
    portalCollapsed: records.filter((r) => r.reason === RAID_END_REASON.portalCollapsed).length,
    heldToCollapse: records.filter(
      (r) => r.reason === RAID_END_REASON.portalCollapsed && r.victor === RAID_SIDE.defender,
    ).length,
    hostsEnded: records.filter((r) => r.hostEndedAfter).length,
  };
}
