/*
 * Multiverse Mages — two universes, built by hand, ready to fight.
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
 * A raid fixture over the **shipped** content set rather than a hand-built one.
 *
 * The shipped grid is what the game is; a two-node fixture universe would let a
 * rule pass here and fail in every real run. What is hand-built is the *world* —
 * mages, cohorts, universities, instances — because that is a starting position
 * and `packages/scenario` owns the real one.
 */

import type { ContentRegistry, SpeciesRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, createState } from '@mm/sim-core';
import type { Handle, RulesetSnapshot } from '@mm/state';
import {
  GRIMOIRE,
  HOLDER_KIND,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  LIBRARY,
  attachRecord,
  createUniverse,
  defineWorldStateSchema,
} from '@mm/state';
import type { PortalHooks } from '@mm/rules-magic';
import {
  KnowledgeSubsystem,
  MagicGrid,
  portalHookSet,
  resolvePortalHooks,
  traditionTable,
} from '@mm/rules-magic';
import type { RaidParticipant, RaidTuning } from '@mm/rules-raid';
import { deployRaid, openPortal, readRaidTuning } from '@mm/rules-raid';

export const registry: ContentRegistry = loadContent(shippedContentSource());
export const grid: MagicGrid = MagicGrid.from(registry);
export const tuning: RaidTuning = readRaidTuning(registry);

const traditions = traditionTable(
  registry.traditions.map((entry) => [entry.contentId, entry.record] as const),
);

/** Every technique and form bit set: a universe that permits everything. */
export const ALL_TECHNIQUES = 0b11111;
export const ALL_FORMS = 0b11111111111111;

export function speciesOf(speciesId: number): SpeciesRecord {
  const found = registry.species.find((entry) => entry.contentId === speciesId);
  if (found === undefined) throw new Error(`no species interned as ${String(speciesId)}`);
  return found.record;
}

/** The interned id of a species by name, so fixtures read as prose. */
export function speciesId(id: string): number {
  return registry.intern('species', id);
}

/** The interned id of a tradition by name. */
export function traditionId(id: string): number {
  return registry.intern('tradition', id);
}

/** The interned id of a node by name. */
export function nodeId(id: string): number {
  return registry.intern('node', id);
}

/** A ruleset snapshot, built without a universe row so a test can be explicit. */
export function ruleset(options: {
  readonly permittedTechniques?: number;
  readonly permittedForms?: number;
  readonly edicts?: readonly { readonly cellId: number; readonly kind: number }[];
  readonly traditionId?: number;
}): RulesetSnapshot {
  return Object.freeze({
    permittedTechniques: options.permittedTechniques ?? ALL_TECHNIQUES,
    permittedForms: options.permittedForms ?? ALL_FORMS,
    edicts: Object.freeze(options.edicts ?? []),
    traditionId: options.traditionId ?? traditionId('vancian-memorization'),
    contentRevision: registry.contentRevision,
  });
}

/** An empty world at tick zero, with the shipped content revision. */
export function emptyWorld(): SimState {
  return createState({
    rootSeed: 1,
    schema: defineWorldStateSchema(),
    contentRevision: registry.contentRevision,
  });
}

export interface MageSpec {
  readonly species?: string;
  readonly role?: number;
  readonly nodes?: readonly string[];
  readonly mastery?: number;
  readonly vigor?: number;
  readonly alive?: boolean;
}

/** Adds a mage and everything she knows. Returns her handle. */
export function addMage(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  spec: MageSpec = {},
): EntityHandle {
  const handle = world.entities.create();
  attachRecord(world, MAGE, handle, {
    speciesId: speciesId(spec.species ?? 'human'),
    birthTick: 0,
    roleId: spec.role ?? MAGE_ROLE.raider,
    universityId: 0,
    curiosity: FP_ONE,
    ambition: FP_ONE,
    caution: FP_ONE,
    vigor: spec.vigor ?? 64 * FP_ONE,
    maxVigor: spec.vigor ?? 64 * FP_ONE,
    alive: spec.alive === false ? 0 : 1,
  });
  for (const node of spec.nodes ?? []) {
    knowledge.createInstance({
      nodeId: nodeId(node),
      locationKind: LOCATION_KIND.mind,
      locationId: handle,
      acquiredTick: 0,
      mastery: spec.mastery ?? FP_ONE,
    });
  }
  return handle;
}

/** Adds a soldier cohort. */
export function addSoldiers(world: SimState, count: number): EntityHandle {
  const handle = world.entities.create();
  attachRecord(world, POPULACE_COHORT, handle, {
    speciesId: speciesId('human'),
    occupation: OCCUPATION.soldier,
    count,
    birthTickBucket: 0,
  });
  return handle;
}

/** Adds a university with a library, and shelves grimoires of the named nodes. */
export function addUniversity(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  shelved: readonly string[] = [],
  durability = 512,
): { university: EntityHandle; library: EntityHandle } {
  const library = world.entities.create();
  attachRecord(world, LIBRARY, library, { foundedTick: 0 });
  const university = world.entities.create();
  attachRecord(world, UNIVERSITY, university, {
    libraryId: library,
    capacity: 10,
    buildProgress: FP_ONE,
  });

  for (const node of shelved) {
    const grimoire = world.entities.create();
    attachRecord(world, GRIMOIRE, grimoire, {
      nodeId: nodeId(node),
      durability,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    // §1.5 keeps exactly one instance per written copy, and a shelved book's
    // instance is at the *library*. The grimoire is named at creation because
    // the pairing is the invariant, not an association added afterwards.
    knowledge.createInstance({
      nodeId: nodeId(node),
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: 0,
      mastery: FP_ONE,
      grimoire,
    });
  }

  return { university, library };
}

/** Resolves the four hooks for one participant against one host tradition. */
export function hooksFor(homeTraditionId: number, hostTraditionId: number): PortalHooks {
  return resolvePortalHooks(portalHookSet(homeTraditionId, hostTraditionId, traditions));
}

/** A participant, ready to be handed to `openPortal`. */
export function participant(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  snapshot: RulesetSnapshot,
  hostTraditionId: number,
): RaidParticipant {
  return {
    world,
    knowledge,
    ruleset: snapshot,
    hooks: hooksFor(snapshot.traditionId, hostTraditionId),
    speciesOf,
  };
}

/** A knowledge subsystem sized for the shipped node catalogue. */
export function knowledgeFor(world: SimState): KnowledgeSubsystem {
  return new KnowledgeSubsystem(world, registry.nodes.length + 1);
}

/** Every node the shipped content set gives a primitive to, for fixtures. */
export function nodesCarrying(primitiveId: string): string[] {
  return registry.nodes
    .filter((entry) => entry.record.effects.some((effect) => effect.primitive === primitiveId))
    .map((entry) => entry.record.id);
}

/** The cell a node belongs to, by name. */
export function cellNameOf(node: string): string {
  const cellId = grid.cellOf(nodeId(node));
  return grid.cell(cellId).name;
}

/** Handle type alias so fixtures read the same as the rules do. */
export type FixtureHandle = Handle;

/**
 * Two universes and a portal between them, deployed and ready to step.
 *
 * Hoisted out of `raid-engine.test.ts`'s local `build` so that the phase, lock
 * and verb suites fight over the same battlefield rather than three subtly
 * different ones. The host is deliberately the richer side: a raid against a
 * universe with nothing to take is a legitimate case, but a bad default,
 * because every objective assertion would then pass vacuously.
 */
export interface BuiltRaid {
  readonly raid: RaidHandle;
  readonly attackerWorld: SimState;
  readonly hostWorld: SimState;
  readonly attackerKnowledge: KnowledgeSubsystem;
  readonly hostKnowledge: KnowledgeSubsystem;
  readonly raider: EntityHandle;
  readonly warden: EntityHandle;
}

/** Structural alias so this module does not have to name `Raid`'s whole shape. */
type RaidHandle = ReturnType<typeof openPortal>;

/**
 * A universe row on a fixture world, so that a test can watch a rule change
 * land on the constitution rather than only on the raid.
 *
 * `emptyWorld` deliberately has no universe: most raid tests do not need one and
 * `findUniverse` returns the null handle, which every reader treats as absence.
 * A test about `raid-engagement.md` §1's mark is one of the few that does.
 */
export function addUniverse(
  world: SimState,
  options: { readonly permittedTechniques?: number; readonly permittedForms?: number } = {},
): EntityHandle {
  return createUniverse(world, {
    permittedTechniques: options.permittedTechniques ?? ALL_TECHNIQUES,
    permittedForms: options.permittedForms ?? ALL_FORMS,
    edictBudget: 4,
    traditionId: traditionId('vancian-memorization'),
    favor: 64 * FP_ONE,
    worship: FP_ONE,
    worshipTier: 1,
    materials: 0,
    prestige: 0,
    prestigeEarned: 0,
    terminalReason: 0,
    favorCap: 1024 * FP_ONE,
    ascended: 0,
  });
}

export interface BuildRaidOptions {
  readonly hostRuleset?: RulesetSnapshot;
  readonly raiderRuleset?: RulesetSnapshot;
  readonly raiderNodes?: readonly string[];
  readonly hostNodes?: readonly string[];
  readonly seed?: number;
  readonly hostTradition?: string;
  readonly withSoldiers?: boolean;
  readonly extraWardens?: number;
  /** Give the host world a universe row, so constitutional writes are visible. */
  readonly withHostUniverse?: boolean;
  readonly tuningOverride?: Partial<RaidTuning>;
}

export function buildRaid(options: BuildRaidOptions = {}): BuiltRaid {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  const hostSnapshot =
    options.hostRuleset ??
    ruleset({ traditionId: traditionId(options.hostTradition ?? 'vancian-memorization') });
  const raiderSnapshot = options.raiderRuleset ?? ruleset({});

  const raider = addMage(attackerWorld, attackerKnowledge, {
    role: MAGE_ROLE.raider,
    nodes: options.raiderNodes ?? ['cig-the-uncontained-hour', 'im-read-the-surface'],
  });
  const warden = addMage(hostWorld, hostKnowledge, {
    role: MAGE_ROLE.warden,
    nodes: options.hostNodes ?? ['cig-the-uncontained-hour'],
  });
  for (let extra = 0; extra < (options.extraWardens ?? 0); extra += 1) {
    addMage(hostWorld, hostKnowledge, {
      role: MAGE_ROLE.warden,
      nodes: options.hostNodes ?? ['cig-the-uncontained-hour'],
    });
  }
  if (options.withHostUniverse === true) addUniverse(hostWorld);
  addUniversity(hostWorld, hostKnowledge, ['rl-open-the-portal', 'cig-the-uncontained-hour']);
  if (options.withSoldiers === true) {
    addSoldiers(hostWorld, 300);
    addSoldiers(attackerWorld, 300);
  }

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      raiderSnapshot,
      hostSnapshot.traditionId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    registry,
    grid,
    tuning: { ...tuning, ...options.tuningOverride },
    raidSeed: options.seed ?? 0x5eed_1234,
  });
  deployRaid(raid);

  return { raid, attackerWorld, hostWorld, attackerKnowledge, hostKnowledge, raider, warden };
}
