/*
 * Multiverse Mages — the rival universes a headless run raids and is raided by.
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
 * ## Why this file exists, stated plainly, because it is the one invented thing
 *
 * `contracts.md` §1.1: *"One simulation instance holds one universe. A raid does
 * **not** load a second universe into the same instance: it captures an
 * immutable **ruleset snapshot** from each participant at portal open."* That
 * clause is about **legality** and nothing else, and `rules-raid` implements it
 * exactly — `permits()` is called against a frozen `RulesetSnapshot` and never
 * against a live `Universe` entity.
 *
 * Everything *else* a raid needs of a participant is live: `RaidParticipant`
 * carries a whole `SimState`, its `KnowledgeSubsystem`, its tradition hooks and
 * its species table, because combatants are derived from real mages, objectives
 * are read off the defender's real libraries, and consequences are written back
 * into real component rows. `raid-engagement`'s own proposal calls a raid *"a
 * reproducible function of `(attacker snapshot, host snapshot, raidSeed)`"* and
 * hands the job of **obtaining** the second snapshot to `pvp-server`, which is
 * held at proposal depth and has no tasks.
 *
 * So §1.1 does not block a live raid: the *stepping* instance still holds one
 * universe, and the raid is a pure computation above the step loop over two
 * participants. What is missing is the party that supplies the second
 * participant. In live PvP that is a peer's persisted snapshot. In a headless
 * Monte Carlo worker there is no peer, and this file is the stand-in: a rival
 * universe built from the **same content registry** — so `contentRevision`
 * matches, as §0 requires of any two universes that interact — with a seed
 * derived from the run's own.
 *
 * **This is invented, and it is the only invented thing in this change.**
 * Everything below is either a `raid-constant.json` magnitude with a gloss and
 * `tuningStatus: "untuned"`, or a mechanical reuse of the reference universe
 * builder. Nothing here decides a rule; it decides who is on the other end of
 * the portal, which is a question the specs deliberately leave to a layer that
 * does not exist yet.
 *
 * ## Two things a rival needs that a tick-zero universe does not have
 *
 * 1. **Raiders.** `RAIDING_ROLES` is `{raider}` alone and `createMage` defaults
 *    every mage to `researcher`, so a universe nobody has ever assigned a role
 *    in fields *zero* attackers. A rival that arrived with an empty warband
 *    would resolve every inbound raid instantly as a defender victory, and the
 *    resulting "raids do nothing" reading would be about a role field rather
 *    than about the game.
 * 2. **Castable nodes.** A raider deploys with a legal-node mask computed from
 *    what she holds at or above `CASTABLE_MASTERY`. A tick-zero rival has
 *    researched nothing, and its founding grant is tier-1 nodes chosen for
 *    breadth, not for combat. Grants below the activation threshold deploy
 *    inert, which is the same walkover wearing a different hat.
 *
 * Both are fixed here, by content-counted grant, and both are reported as
 * choices rather than buried.
 */

import { KnowledgeSubsystem, MASTERY_MAX, portalHookSet, resolvePortalHooks, traditionTable } from '@mm/rules-magic';
import type { ContentId, ContentRegistry, SpeciesRecord } from '@mm/content';
import type { RaidParticipant } from '@mm/rules-raid';
import type { EntityHandle, SimState, WorldSchema } from '@mm/sim-core';
import {
  GRIMOIRE,
  HOLDER_KIND,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  UNIVERSE,
  attachRecord,
  captureRuleset,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';

import { speciesTable } from './content-set.js';

import type { ReferenceContent } from './reference-universe.js';
import { buildReferenceState } from './reference-universe.js';

/**
 * `speciesTable`'s lookup, narrowed to total.
 *
 * `RaidParticipant.speciesOf` is declared total because every combatant derived
 * from a world carries a species id that world's content interned, so an absent
 * record is a corrupted state rather than a case to handle. Throwing here says
 * that out loud; returning `undefined` into the raid would surface as a
 * combatant with zero hit points.
 */
export function requiredSpeciesOf(registry: ContentRegistry): (speciesId: number) => SpeciesRecord {
  const { speciesOf } = speciesTable(registry);
  return (speciesId: number): SpeciesRecord => {
    const found = speciesOf(speciesId);
    if (found === undefined) {
      throw new Error(
        `No species is interned as ${String(speciesId)} in this content set. A combatant carries ` +
          'the species id of the world it was derived from, so this is a state that does not ' +
          'match its own registry.',
      );
    }
    return found;
  };
}

/**
 * The primitives a raider has to carry to be worth deploying.
 *
 * Read as primitive *ids* against the shipped registry rather than as node ids,
 * for the reason `CLAUDE.md` gives for all content: a node list here would be
 * five string literals that a content edit could silently invalidate, and the
 * failure would be a warband that deploys holding nothing.
 *
 * `portal` is not in the list. A rival opens its portal by fiat — the arrival
 * process below *is* the decision, and `portalGate` is the attacker-side gate
 * for the god's action 14, not for an inbound raid this universe does not
 * choose. Vision §3's rule that the host's ruleset governs is unaffected: it
 * governs what the raiders may *cast* once inside, which arbitration enforces
 * against this universe's frozen snapshot exactly as it does for a defender.
 */
/**
 * Durability a rival's foreign books are shelved at, `fp`.
 *
 * The dwarven end of the species table — `scribeAffinity` runs 384 to 1792 —
 * because these are an archive's prize copies rather than a working note, and
 * because a raid on a rival should be the place `grimoire-burn-resist-cap`
 * actually bites: at `fp(1792)` clamped to the cap, roughly nine books in ten
 * survive whatever the warband could not carry. Untuned, and it belongs beside
 * the other rival magnitudes in `raid-constant.json` the moment a sweep wants
 * to move it.
 */
const FOREIGN_BOOK_DURABILITY = 1792;

const RAIDER_PRIMITIVES: readonly string[] = Object.freeze([
  'direct-damage',
  'knowledge-steal',
  'ward',
  'concealment',
  'blink',
]);

/** The magnitudes this file reads out of `raid-constant.json`. */
export interface RivalConstants {
  /** How many rivals hang in the sky. Also the length of the portal-target list. */
  readonly universeCount: number;
  /** Mages a rival re-roles to `raider`. */
  readonly raiderCount: number;
  /** Combat nodes granted to each raider, at full mastery. */
  readonly raiderNodeCount: number;
  /** `fp` probability per world tick that a rival opens a portal inbound. */
  readonly inboundChancePerWorldTick: number;
  /** World ticks after any raid during which no inbound raid may open. */
  readonly inboundCooldownWorldTicks: number;
  /** Books a rival shelves from cells this universe's own ruleset forbids. */
  readonly foreignBookCount: number;
}

/** Reads the rival magnitudes once. Every one is `untuned`; see the data file. */
export function readRivalConstants(registry: ContentRegistry): RivalConstants {
  return {
    universeCount: registry.raidConstant('rival-universe-count'),
    raiderCount: registry.raidConstant('rival-raider-count'),
    raiderNodeCount: registry.raidConstant('rival-raider-node-count'),
    inboundChancePerWorldTick: registry.raidConstant('inbound-raid-chance-per-world-tick'),
    inboundCooldownWorldTicks: registry.raidConstant('inbound-raid-cooldown-world-ticks'),
    foreignBookCount: registry.raidConstant('rival-foreign-book-count'),
  };
}

/**
 * The portal targets a run offers, ascending, `1..universeCount`.
 *
 * Small dense integers rather than handles, because `candidates.ts` takes
 * *"universes this one could open a portal to"* as opaque caller-supplied ids
 * and `0` is reserved by §0's null rule. The id is also the only thing that
 * distinguishes one rival from another: it is folded into the rival's seed, so
 * target 2 is a different universe from target 1 for every run and the same
 * universe across two replays of one run.
 */
export function portalTargetIds(constants: RivalConstants): readonly number[] {
  return Object.freeze(Array.from({ length: constants.universeCount }, (_, index) => index + 1));
}

/**
 * The seed a rival universe is built from.
 *
 * A pure mix of the run seed and the target id, and **not** a draw from any
 * stream: a rival must be the same universe every time this run reaches for it,
 * including across a replay, and a draw would make it a function of how many
 * times something else rolled first.
 *
 * The multiplier is the 32-bit golden-ratio odd constant `sim-core`'s mixer
 * uses, so consecutive target ids do not produce seeds that differ in their low
 * bits alone.
 */
export function rivalSeed(runSeed: number, targetId: number): number {
  return (Math.imul(runSeed ^ 0x9e37_79b1, 0x85eb_ca6b) ^ Math.imul(targetId, 0xc2b2_ae35)) >>> 0;
}

/**
 * Node ids whose effects carry any of {@link RAIDER_PRIMITIVES}, ascending.
 *
 * Restricted to cells the *shipped v1 axes* permit. A raider holding a node
 * outside them would still be masked by arbitration in any universe built from
 * this content, so granting one is a grant of nothing, and the warband would be
 * quietly smaller than `rival-raider-node-count` claims.
 */
export function raiderNodeCandidates(content: ReferenceContent): readonly ContentId[] {
  const v1Cells = new Set(
    content.registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
  );
  return Object.freeze(
    content.registry.nodes
      .filter(
        (entry) =>
          v1Cells.has(entry.record.cell) &&
          entry.record.effects.some((effect) => RAIDER_PRIMITIVES.includes(effect.primitive)),
      )
      .map((entry) => entry.contentId)
      .sort((a, b) => a - b),
  );
}

/** A rival universe, and everything `openPortal` reads of it. */
export interface Rival {
  readonly targetId: number;
  readonly participant: RaidParticipant;
}

/**
 * Builds one rival universe.
 *
 * **A pure function of `(runSeed, targetId, content, schema)`.** Called at the
 * moment a portal opens rather than at run start, because a rival that was
 * built once and mutated by every raid would accumulate its own history — and
 * a history nothing steps is a universe that only ever gets worse, which would
 * make the tenth raid of a run a different mechanic from the first. Each raid
 * meets a rival at the same standing strength, which is the honest reading of
 * "another universe, which is also being tended by its own god".
 *
 * @param hostTraditionId - The tradition of whichever universe hosts the raid.
 * §4a splits the hooks across the portal: `store` and `acquire` follow the
 * combatant's home tradition, `cast` and `cost` follow the host's.
 */
export function buildRival(input: {
  readonly runSeed: number;
  readonly targetId: number;
  readonly content: ReferenceContent;
  readonly schema: WorldSchema;
  readonly hostTraditionId: number;
  readonly constants: RivalConstants;
}): Rival {
  const { content, constants } = input;
  const world = buildReferenceState({
    runSeed: rivalSeed(input.runSeed, input.targetId),
    // The rival's founding options are the scenario's defaults. A rival sized
    // by the *player's* factor levels would make an ablation on `cohortSize`
    // silently also an ablation on the opposition.
    //
    // `foundingSpeciesMask: 0` is "every species", and it is pinned here for the
    // same reason the other three are pinned: W15 added the mask so that D7 could
    // vary the *host's* founding mix, and a rival that inherited that variation
    // would confound "which species founded my universe" with "which species I am
    // fighting". Zero is also what this builder did before the field existed, so
    // no raid measured before it moves.
    //
    // The opening-square counts are zero — the v1 rectangle — for that same
    // reason and one more: a rival drawn onto a *different* square from its host
    // would make the arbitration a test of which grid the two happened to be
    // dealt. `rival-universe.ts` permits every technique and form a few lines
    // below anyway, so the rival's opening is not the lever here.
    options: {
      cohortSize: 64,
      foundingMages: 2,
      foundingNodes: 6,
      foundingSpeciesMask: 0,
      openingTechniqueCount: 0,
      openingFormCount: 0,
    },
    content,
    schema: input.schema,
  });

  // `fromState`: `buildReferenceState` has already written the founding grant
  // through its own subsystem, so a fresh index would start blind to it.
  const knowledge = KnowledgeSubsystem.fromState(world, content.deps.catalog.nodeCount);
  armRaiders(world, knowledge, content, constants);
  shelveForeignBooks(world, knowledge, content, constants, input.targetId);

  const universe = findUniverse(world);
  const ruleset = captureRuleset(world, universe);
  const traditions = traditionTable(
    content.registry.traditions.map((entry) => [entry.contentId, entry.record] as const),
  );
  const speciesOf = requiredSpeciesOf(content.registry);

  return {
    targetId: input.targetId,
    participant: {
      world,
      knowledge,
      ruleset,
      hooks: resolvePortalHooks(portalHookSet(ruleset.traditionId, input.hostTraditionId, traditions)),
      speciesOf,
    },
  };
}

/**
 * Re-roles the rival's first mages to `raider` and grants each a warband's
 * worth of combat knowledge at full mastery.
 *
 * Full mastery, not the research default, for the reason `reference-universe.ts`
 * gives about founding grants: `CASTABLE_MASTERY` is the activation threshold,
 * and an instance below it is held but never castable — a raider who arrives
 * unable to do anything at all.
 */
/**
 * Shelves books the raiding universe's own god could never have permitted.
 *
 * **This is the answer to content exhaustion, and it is the reason looting
 * matters more than burning.** Seventy cells are authored and twelve are
 * enabled, and those twelve hold 51 of the 300 nodes — so an undisturbed
 * universe learns all 51 and stops, and the plateau every strategy hits is the
 * end of the content rather than a balance result. Vision §3 makes a god's
 * ruleset the thing that decides what *can exist* at home; §8 makes a raid the
 * thing that reaches what cannot. A book taken from a universe that permitted
 * other cells is knowledge no amount of domestic research could reach, and
 * `raid-engagement`'s own task 8.14 already anticipates the end of that
 * journey: a raider returning with a node her universe forbids *"gains a real
 * but inert instance"*.
 *
 * The rival's permitted axes are widened to everything the registry declares,
 * which is what makes those cells legal *there*. Arbitration is unaffected and
 * that is the whole of §3 working: an inbound raider standing in this universe
 * is masked to this universe's twelve cells however much her home permits, and
 * a raider of ours standing in the rival's sky may cast whatever the rival
 * allows and she happens to know.
 *
 * The books are drawn in content order from nodes in **non-v1 cells**, rotated
 * by target id so the three rivals do not shelve the same twelve books, and
 * shelved at the durability the dwarf's line gives a well-made archive — so a
 * raid on a rival is also the place `grimoire-burn-resist-cap` bites.
 */
function shelveForeignBooks(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  content: ReferenceContent,
  constants: RivalConstants,
  targetId: number,
): void {
  const library = firstLibrary(world);
  if (library === 0) return;

  const v1Cells = new Set(
    content.registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
  );
  const foreign = content.registry.nodes
    .filter((entry) => !v1Cells.has(entry.record.cell))
    .map((entry) => entry.contentId)
    .sort((a, b) => a - b);
  if (foreign.length === 0) return;

  // Every technique and every form the registry declares. A rival that
  // permitted only what this universe permits would have nothing worth the trip.
  const universe = findUniverse(world);
  const universes = componentOf(world, UNIVERSE);
  universes.set(universe, 'permittedTechniques', (1 << content.registry.techniques.length) - 1);
  universes.set(universe, 'permittedForms', (1 << content.registry.forms.length) - 1);

  for (let index = 0; index < constants.foreignBookCount; index += 1) {
    const nodeId = foreign[(targetId * constants.foreignBookCount + index) % foreign.length] as ContentId;
    const grimoire = world.entities.create();
    attachRecord(world, GRIMOIRE, grimoire, {
      nodeId,
      durability: FOREIGN_BOOK_DURABILITY,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    // §1.5 keeps exactly one instance per written copy, and a shelved book's
    // instance is at the *library*. The grimoire is named at creation because
    // the pairing is the invariant, not an association added afterwards.
    knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
      grimoire,
    });
  }
}

/** The rival's own library handle, or `0`. `buildReferenceState` founds exactly one. */
function firstLibrary(world: SimState): EntityHandle {
  const found = collectRecords(world, LIBRARY)
    .map(({ handle }) => handle)
    .sort((a, b) => a - b);
  return (found[0] ?? 0) as EntityHandle;
}

function armRaiders(
  world: SimState,
  knowledge: KnowledgeSubsystem,
  content: ReferenceContent,
  constants: RivalConstants,
): void {
  const nodeIds = raiderNodeCandidates(content);
  if (nodeIds.length === 0) return;

  const mages = componentOf(world, MAGE);
  const living: EntityHandle[] = collectRecords(world, MAGE)
    .filter(({ row }) => row.alive !== 0)
    .map(({ handle }) => handle)
    .sort((a, b) => a - b);

  const armed = Math.min(constants.raiderCount, living.length);
  for (let index = 0; index < armed; index += 1) {
    const mage = living[index] as EntityHandle;
    mages.set(mage, 'roleId', MAGE_ROLE.raider);
    for (let slot = 0; slot < constants.raiderNodeCount; slot += 1) {
      // Rotated by raider so the warband is not six copies of one loadout: a
      // side whose every member holds the same node makes every ablation on a
      // combat primitive an ablation on the whole warband.
      const nodeId = nodeIds[(index * constants.raiderNodeCount + slot) % nodeIds.length] as ContentId;
      knowledge.createInstance({
        nodeId,
        locationKind: LOCATION_KIND.mind,
        locationId: mage,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
    }
  }
}
