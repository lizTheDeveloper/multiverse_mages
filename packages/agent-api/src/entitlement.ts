/*
 * Multiverse Mages — the observation-entitlement gates.
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
 * `docs/design/observation-entitlement.md`'s gates, steps 2 and 3.
 *
 * > A checklist maintained by hand forgets. The list of things a value function
 * > must account for should be **computed from the world state**, not written
 * > down.
 *
 * Both gates are the idiom `@mm/state`'s `worldComponentsWithPosition` /
 * `assertNoWorldPositions` pair already established: a pure function returning
 * `string[]` of problems, an `assert*` that throws, and a test asserting the
 * list is empty. Nothing architecturally new — the same shape applied to
 * observability instead of to coordinates.
 *
 * ## Why these live in `agent-api` and not in `components.ts` beside the idiom
 *
 * The classification names observation blocks, and `@mm/state` is a rules-path
 * package: §5 rule 4 forbids it importing `agent-api`, and `check-purity` and
 * the `RULES_SRC` lint block both enforce it. Putting the table there would mean
 * either a banned import or block names as bare strings that can drift from
 * `OBSERVATION_BLOCK_NAMES` with nothing to catch it. `agent-api` already
 * imports `@mm/state`, so the dependency runs the way §5 requires. The idiom is
 * the *shape*, not the file.
 *
 * ## What these gates do and do not enforce
 *
 * They enforce that a **decision was made**, never that it was wise. A reason
 * string is prose and unenforceable, deliberately — the same standing as
 * `disprovedBy` on a metric. `not-yet-decided` is a legal, honest classification
 * and 70 of the 108 traits carry it today; what would be illegal is a trait
 * carrying nothing at all, because that is indistinguishable from nobody having
 * looked.
 */

import type { ComponentFields, ComponentSpec } from '@mm/sim-core';
import { ENGAGEMENT_COMPONENTS, WORLD_COMPONENTS } from '@mm/state';

import type { PlayerState } from './player-state.js';
import { playerStateFields } from './player-state.js';

// ---------------------------------------------------------------------------
// Step 2: every component field is classified.
// ---------------------------------------------------------------------------

/**
 * The three states a trait can be in, plus the one the encoder forced.
 *
 * Three is load-bearing and two would not do. Most of the vector is histograms —
 * `knowledgeSlot` is 210 slots, `mageTierSlot` 48, `cohortSlot` 30 — so
 * `mage.speciesId` is neither observable nor withheld: it is observable *in
 * aggregate* and withheld *per entity*. A gate demanding a two-way answer would
 * force a false one on nearly every field in the registry.
 *
 * `ambiguous` is the fourth, and it exists because one row needed it rather than
 * because the scheme wanted it. `objective.capturedBy` reaches the player as
 * `capturedBy === 0 ? 0 : 1` — the fact of a capture and never the captor — which
 * is neither its own value nor a histogram. Recording that honestly is worth
 * more than forcing it into `observable` and quietly overstating what a player
 * can see.
 */
export const TRAIT_CLASSES = ['observable', 'aggregated', 'withheld', 'ambiguous'] as const;

export type TraitClass = (typeof TRAIT_CLASSES)[number];

/**
 * Why a trait does not reach the player.
 *
 * `hidden-from-opponent` is declared and **unused at 0.3.0**, which is a finding
 * rather than dead code: today the observation is always of the agent's own
 * universe, so there is no opponent-facing projection for anything to be hidden
 * from. It becomes live with `pvp-server`, and every `not-yet-decided` row will
 * have to be re-read then.
 */
export const WITHHOLDING_REASONS = [
  'hidden-from-opponent',
  'internal-bookkeeping',
  'derived-from-observable',
  'not-yet-decided',
] as const;

export type WithholdingReason = (typeof WITHHOLDING_REASONS)[number];

/** One `(component, field)` trait's classification. */
export interface TraitClassification {
  readonly cls: TraitClass;
  /**
   * For `aggregated`, which aggregate it reaches — `mages.mageTierSlot`,
   * `knowledge.knowledgeSlot`, `population.cohortSlot`, and so on. For
   * `observable` and `ambiguous`, which slots. Unused by `withheld`.
   */
  readonly via?: string;
  /** Required on `withheld`, and meaningless on anything else. */
  readonly reason?: WithholdingReason;
}

const observable = (via: string): TraitClassification => ({ cls: 'observable', via });
const aggregated = (via: string): TraitClassification => ({ cls: 'aggregated', via });
const withheld = (reason: WithholdingReason): TraitClassification => ({ cls: 'withheld', reason });
/** Every trait nobody has yet decided about. By far the commonest row. */
const undecided = (): TraitClassification => withheld('not-yet-decided');
const bookkeeping = (): TraitClassification => withheld('internal-bookkeeping');

/**
 * Every `(component, field)` trait in the world, classified.
 *
 * Seeded from `docs/design/observable-trait-inventory.md`, which was taken at
 * `be446a6` on 2026-08-14 by reading `./observation.ts` row by row rather than
 * by inferring from field names. That document is the prose; this is the
 * machine-checkable half, and the two are meant to be read together.
 *
 * **A component or field added to `@mm/state` and not added here turns
 * {@link unclassifiedTraits} red.** That is the entire mechanism: forgetting
 * stops being possible, and excluding stays cheap — one line saying
 * `undecided()`.
 */
export const TRAIT_CLASSIFICATION: Readonly<
  Record<string, Readonly<Record<string, TraitClassification>>>
> = {
  universe: {
    permittedTechniques: observable('ruleset[0..4]'),
    permittedForms: observable('ruleset[5..18]'),
    edictBudget: undecided(),
    traditionId: observable('tradition[35]'),
    favor: observable('resources[36]'),
    worship: observable('resources[37]'),
    worshipTier: observable('resources[38]'),
    prestige: observable('resources[40]'),
    prestigeEarned: undecided(),
    // Reaches the caller through `OutcomeRecord`; the episode ends when it is
    // set, so no observation follows it.
    terminalReason: bookkeeping(),
    // Favor is observable and its ceiling is not: an agent cannot tell how near
    // it is to the overflow `god-state.favorWasted` counts.
    favorCap: undecided(),
    ascended: bookkeeping(),
  },
  edict: {
    cellId: observable('ruleset[19,21,..,33]'),
    kind: observable('ruleset[20,22,..,34]'),
  },
  // God action 12 leaves no trace at all: an agent cannot see its own
  // encouragements.
  'encouraged-cell': { cellId: undecided(), expiryTick: undecided() },
  // `changeCount` drives the hysteresis multiplier the agent pays and cannot
  // read — the same blindness as action cost, one level down.
  'axis-change-counter': { axisKind: undecided(), axisBit: undecided(), changeCount: undecided() },
  mage: {
    speciesId: aggregated('mages.mageTierSlot'),
    birthTick: undecided(),
    roleId: undecided(),
    universityId: undecided(),
    curiosity: undecided(),
    ambition: undecided(),
    caution: undecided(),
    vigor: undecided(),
    maxVigor: undecided(),
    // A filter rather than a key or a value: `alive === 0` is left out of the
    // histogram entirely.
    alive: aggregated('mages.mageTierSlot'),
  },
  'populace-cohort': {
    speciesId: aggregated('population.cohortSlot'),
    occupation: aggregated('population.cohortSlot'),
    count: aggregated('population.cohortSlot'),
    birthTickBucket: undecided(),
  },
  university: {
    libraryId: undecided(),
    capacity: aggregated('institutions[330]'),
    // An unfinished university counts in `institutions[329]` exactly as a
    // finished one does.
    buildProgress: undecided(),
  },
  'university-staff': { universityId: undecided(), cohortId: undecided() },
  // `LIBRARY` is never imported by `agent-api`. `institutions[331]` is derived
  // from `knowledge-instance.locationKind`, so how many libraries exist is not
  // observable while a quantity named after them is.
  library: { foundedTick: undecided() },
  grimoire: {
    nodeId: undecided(),
    durability: undecided(),
    holderKind: undecided(),
    holderId: undecided(),
  },
  'knowledge-instance': {
    nodeId: aggregated('knowledge.knowledgeSlot, institutions[331], mages.mageTierSlot'),
    locationKind: aggregated('institutions[331], mages.mageTierSlot, knowledge.knowledgeSlot'),
    locationId: aggregated('mages.mageTierSlot'),
    acquiredTick: undecided(),
    // The quantity the whole decay-and-loss model turns on. No channel carries
    // it: an instance about to decay out of existence counts exactly as much as
    // a fully mastered one.
    mastery: undecided(),
  },
  // The entire rediscovery signal. An agent cannot distinguish a node never
  // discovered from one discovered and lost, which are the two states with the
  // most different expected value in the knowledge model.
  'ever-known': { nodeId: undecided() },
  'goal-commitment': {
    goalId: undecided(),
    targetNodeId: undecided(),
    adoptedTick: undecided(),
    score: undecided(),
  },
  'effort-progress': {
    subject: undecided(),
    kind: undecided(),
    nodeId: undecided(),
    counterparty: undecided(),
    progress: undecided(),
  },
  'god-state': {
    favorWasted: undecided(),
    magelessTicks: undecided(),
    lowWorshipTicks: undecided(),
    stasisTicks: undecided(),
    // Cached previous values, kept so a new node or a rediscovery is detectable.
    // A previous reading, not a state of the world.
    lastEverKnown: bookkeeping(),
    lastExisting: bookkeeping(),
    ascensionFirstMetTick: undecided(),
    ascensionPath: undecided(),
    // The current tier is observable; the high-water mark is not.
    peakWorshipTier: undecided(),
    // Deepest tier *ever* held in a mind. The knowledge block carries deepest
    // *currently* known per cell, which is a different number.
    deepestTier: undecided(),
    lastEraRecorded: bookkeeping(),
    eraNodesLost: undecided(),
    goodEraRun: undecided(),
    overBudgetEdicts: undecided(),
    terminalTick: bookkeeping(),
  },
  blessing: { mageId: undecided(), expiryTick: undecided() },
  upheaval: { factor: undecided(), expiryTick: undecided() },
  'era-evaluation': {
    era: undecided(),
    libraryDependence: undecided(),
    nodesLost: undecided(),
    passed: undecided(),
  },
  // **All seven are `observable` since `material-economy` task 5.1**, and the
  // change is the one the previous row here predicted in as many words: *"That
  // is task 5.1's to change, by adding a named per-kind block to `PlayerState`,
  // which is not the vector and carries no digest; until then
  // `not-yet-decided` is the honest reading."* The block exists now —
  // `PlayerResources.stocks`, a `MaterialStockRecord` — so every kind reaches
  // the player under its own name and the reading has changed with it.
  //
  // The criterion is this scheme's own, from `observation-entitlement.md`'s
  // reducer: **OBSERVABLE means projected into `PlayerState`**, and whether the
  // projection then reaches a slot is the *second* stage of that diagram, not
  // this one.
  //
  // **`food`, `stone` and `vellum` moved too, from `aggregated`, and that is
  // more than task 5.3 asked for.** It is required by consistency rather than
  // chosen: `aggregated` is defined as *"reaches the player **only** inside an
  // aggregate"*, and once all seven sit in `resources.stocks` under their own
  // names, that word is false for the three exactly as it is for the four.
  // Leaving them `aggregated` would say the projection carries `labor` by name
  // and not `food`, which no reader of this file could act on.
  //
  // **What has *not* changed is what an agent sees, and that is the point worth
  // not blurring.** `resources[39]` still carries `food + stone + vellum` and
  // nothing else; `OBSERVATION_SIZE` is 400 and `OBSERVATION_LAYOUT_DIGEST` is
  // unchanged. A *policy* still cannot tell a food shortage from a vellum one
  // and cannot see the other four at all. A *client* now can. The `via` below
  // names the projection path rather than a slot for that reason, and says so.
  'material-stock': {
    food: observable('resources.stocks.food (projection; summed into resources[39])'),
    stone: observable('resources.stocks.stone (projection; summed into resources[39])'),
    vellum: observable('resources.stocks.vellum (projection; summed into resources[39])'),
    labor: observable('resources.stocks.labor (projection; reaches no slot)'),
    essence: observable('resources.stocks.essence (projection; reaches no slot)'),
    insight: observable('resources.stocks.insight (projection; reaches no slot)'),
    passage: observable('resources.stocks.passage (projection; reaches no slot)'),
  },
  // God action 8's budget: a second bound in exactly the shape of action cost,
  // one the agent is subject to and cannot see.
  'grant-budget': {
    startingGrants: undecided(),
    accrualNodes: undecided(),
    cap: undecided(),
    grantsUsed: undecided(),
    seededNodes: undecided(),
  },
  combatant: {
    sourceKind: undecided(),
    sourceId: undecided(),
    side: aggregated('engagement own/enemy side summaries'),
    // The observation carries no engagement geometry at all — and the
    // engagement is the only scale that has coordinates.
    x: undecided(),
    y: undecided(),
    hp: aggregated('engagement own/enemy ch 1'),
    maxHp: aggregated('engagement own/enemy ch 2'),
    vigor: aggregated('engagement own/enemy ch 3'),
    maxVigor: aggregated('engagement own/enemy ch 4'),
    // Summed for the enemy side too, which is the one aggregate crossing the
    // line PvP will have to draw.
    concealment: aggregated('engagement own/enemy ch 5'),
  },
  'prepared-spell': {
    combatantId: aggregated('engagement own/enemy ch 6'),
    // Withheld from your own side as well: a player sees how many spells are
    // prepared, never which.
    nodeId: undecided(),
  },
  objective: {
    kind: observable('engagement objective slot ch 0'),
    targetId: undecided(),
    x: undecided(),
    y: undecided(),
    valueFp: observable('engagement objective slot ch 2'),
    statusKind: observable('engagement objective slot ch 1'),
    // The fact of a capture, never the captor. See TRAIT_CLASSES.
    capturedBy: { cls: 'ambiguous', via: 'engagement objective slot ch 3' },
  },
};

/** Every component the two registries hold, world then engagement. */
function allComponents(): readonly ComponentSpec<ComponentFields>[] {
  return [...WORLD_COMPONENTS, ...ENGAGEMENT_COMPONENTS];
}

/**
 * Every trait the classification does not answer for. Must always be empty.
 *
 * Reports in both directions. A field present in the registry and absent from
 * {@link TRAIT_CLASSIFICATION} is the failure the gate exists for — something
 * was added to the world and nobody said whether a player may see it. A row
 * present in the classification and absent from the registry is the *other*
 * rot, and it matters just as much: a stale row is a decision about a field that
 * no longer exists, and it makes the table's row count a lie about coverage.
 */
export function unclassifiedTraits(
  components: readonly ComponentSpec<ComponentFields>[] = allComponents(),
  classification: Readonly<
    Record<string, Readonly<Record<string, TraitClassification>>>
  > = TRAIT_CLASSIFICATION,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const spec of components) {
    const rows = classification[spec.name];
    if (rows === undefined) {
      problems.push(`component "${spec.name}" has no classification at all`);
      continue;
    }
    for (const field of Object.keys(spec.fields)) {
      seen.add(`${spec.name}.${field}`);
      const entry = rows[field];
      if (entry === undefined) {
        problems.push(`${spec.name}.${field} is unclassified`);
        continue;
      }
      if (entry.cls === 'withheld' && entry.reason === undefined) {
        problems.push(`${spec.name}.${field} is withheld with no reason`);
      }
      if (entry.cls !== 'withheld' && entry.via === undefined) {
        problems.push(`${spec.name}.${field} is ${entry.cls} but names no slot or aggregate`);
      }
    }
  }

  const known = new Set(components.map((spec) => spec.name));
  for (const [component, rows] of Object.entries(classification)) {
    if (!known.has(component)) {
      problems.push(`classification names "${component}", which is not a component`);
      continue;
    }
    for (const field of Object.keys(rows)) {
      if (!seen.has(`${component}.${field}`)) {
        problems.push(`classification names ${component}.${field}, which is not a field`);
      }
    }
  }

  return problems;
}

/**
 * Throws if any component field is none of observable / aggregated / withheld.
 *
 * The failure this prevents is not a crash. It is a trait that was added to the
 * world, never encoded, never declared, and therefore silently absent from every
 * value function — which surfaces months later as a measurement that answered a
 * narrower question than the one asked. The pricing sweep is the worked example:
 * it concluded *"no price binds"* when what it had measured was *"a price-blind
 * agent is not deterred by price"*.
 */
export function assertAllTraitsClassified(
  components: readonly ComponentSpec<ComponentFields>[] = allComponents(),
  classification: Readonly<
    Record<string, Readonly<Record<string, TraitClassification>>>
  > = TRAIT_CLASSIFICATION,
): void {
  const problems = unclassifiedTraits(components, classification);
  if (problems.length > 0) {
    throw new Error(
      `Every (component, field) trait must be classified observable / aggregated / withheld, but: ` +
        `${problems.join('; ')}. Add a row to TRAIT_CLASSIFICATION in agent-api's entitlement.ts. ` +
        '"not-yet-decided" is an honest and sufficient answer — what is not permitted is silence, ' +
        'because silence is indistinguishable from nobody having looked. See ' +
        'docs/design/observation-entitlement.md.',
    );
  }
}

// ---------------------------------------------------------------------------
// Step 3: every entitled field reaches a slot, or is declared as not doing so.
// ---------------------------------------------------------------------------

/** A thing a player is subject to that reaches no observation slot. */
export interface UnencodedGap {
  /** Dotted path, in {@link playerStateFields}' vocabulary, or a named quantity. */
  readonly field: string;
  /** Prose. Read by humans in review; the machine enforces only that it exists. */
  readonly because: string;
}

/**
 * Gaps declared rather than encoded.
 *
 * **Action cost lands here, and that is the design's stated outcome for it**:
 * *"Either it becomes a `PlayerState` field with slots, or it is declared
 * unencoded with a reason. It cannot stay unnamed."* Encoding it is a later,
 * separately measured change — sixteen new slots would move `OBSERVATION_SIZE`
 * and `OBSERVATION_LAYOUT_DIGEST` and invalidate every committed balance
 * baseline, which is a claim about behaviour that this change does not make.
 *
 * These are not `PlayerState` fields. They are the opposite: quantities that
 * *would* be entitled traits if anyone had decided they were, sitting in a
 * declared list so that the absence is a statement instead of an oversight.
 */
export const DECLARED_UNENCODED: readonly UnencodedGap[] = Object.freeze([
  Object.freeze({
    field: 'catalogue.costs.byAction',
    because:
      "god-cost.json prices all sixteen §4.2 actions and no strategy can see any of them. " +
      'Unaffordability reaches an agent only as a legality bit, so an unaffordable action is a ' +
      'substitution it never notices — illegalActionRate records zero for arms where the god can ' +
      'afford nothing. Encoding it widens OBSERVATION_SIZE and moves OBSERVATION_LAYOUT_DIGEST, ' +
      'which invalidates every committed balance baseline; that is a separately measured change ' +
      'and this one does not make it.',
  }),
  Object.freeze({
    field: 'catalogue.costs.foundUniversity',
    because:
      'The one action id (11) whose price depends on its target — §4.2 gives founding and funding ' +
      'one id. Same reason as byAction, and it would be the seventeenth slot.',
  }),
  Object.freeze({
    field: 'catalogue.costs.hysteresisStep',
    because:
      'What one recent flip of an axis adds to its multiplier. The agent can read neither half of ' +
      'the price it pays for changing its mind: this constant is unencoded and so is the ' +
      'axis-change-counter.changeCount it multiplies, which the trait classification records as ' +
      'not-yet-decided.',
  }),
]);

/**
 * Every entitled field that reaches no slot and is not declared as a gap.
 * Must always be empty.
 *
 * Also reports the reverse — a declared gap that has quietly become encoded, or
 * that names nothing recognizable. A stale declaration is worse than no
 * declaration: it asserts that a hole exists, and a reviewer reading it will not
 * re-check.
 *
 * @param player - The projection to check. Pass one taken during an engagement;
 * see {@link playerStateFields}.
 */
export function unencodedObservables(
  player: PlayerState,
  declared: readonly UnencodedGap[] = DECLARED_UNENCODED,
): string[] {
  const problems: string[] = [];
  const encoded = new Set(playerStateFields(player));

  // The direction that earns its place is the reverse one: a declared gap that
  // is not in fact a gap. See the note on the forward check below for what it
  // does and does not cover.
  for (const gap of declared) {
    if (encoded.has(gap.field)) {
      problems.push(
        `${gap.field} is declared unencoded but is a PlayerState field, and so reaches a slot`,
      );
    }
    if (gap.because.trim() === '') {
      problems.push(`${gap.field} is declared unencoded with an empty reason`);
    }
  }

  const seen = new Set<string>();
  for (const gap of declared) {
    if (seen.has(gap.field)) problems.push(`${gap.field} is declared unencoded twice`);
    seen.add(gap.field);
  }

  // And the forward direction, at **block** granularity and no finer. Be exact
  // about the reach, because a gate is read by the next person as covering
  // whatever its name suggests:
  //
  // - A new top-level block on `PlayerState` that `encodePlayerState` does not
  //   place is caught here. That is the case worth catching and the one this
  //   loop exists for.
  // - A new *leaf* under an existing block — say `resources.favorCap`, added to
  //   `PlayerResources` and to `project` and forgotten in `encodePlayerState` —
  //   is **not** caught. `encodePlayerState` writes `resources[0..4]` by name,
  //   and nothing here notices a sixth leaf.
  //
  // The round-trip test is not a backstop for that either: `rawObservation` is
  // the reference and does not know about the new field, so the vectors stay
  // byte-identical while the entitlement has grown a trait reaching nobody.
  // Closing it properly means instrumenting the encoder to report which indices
  // it wrote and attributing them back to leaves — step-4-sized machinery, and
  // deliberately not built here. Recorded as a known gap rather than implied
  // away.
  for (const field of encoded) {
    if (!PLACED_FIELD_PREFIXES.some((prefix) => field === prefix || field.startsWith(`${prefix}.`))) {
      problems.push(`${field} is a PlayerState field that encodePlayerState does not place`);
    }
  }

  return problems;
}

/**
 * The `PlayerState` paths `encodePlayerState` writes, as prefixes.
 *
 * Prefixes rather than exact paths because the blocks are what the encoder
 * places: it writes all of `resources`, all of `engagement.own`. A new leaf
 * under an existing block is genuinely placed, and a new *block* is not — which
 * is the case worth catching, and the one this list catches.
 */
const PLACED_FIELD_PREFIXES: readonly string[] = Object.freeze([
  'ruleset',
  'traditionId',
  'resources',
  'population',
  'mages',
  'knowledge',
  'institutions',
  'clock',
  'engagement',
]);

/** Throws if an entitled field reaches no slot without saying why. */
export function assertNoUndeclaredGaps(
  player: PlayerState,
  declared: readonly UnencodedGap[] = DECLARED_UNENCODED,
): void {
  const problems = unencodedObservables(player, declared);
  if (problems.length > 0) {
    throw new Error(
      `Every entitled field must reach an observation slot or be declared unencoded, but: ` +
        `${problems.join('; ')}. Either encode it — which moves OBSERVATION_LAYOUT_DIGEST and is a ` +
        'reviewable contract change — or add it to DECLARED_UNENCODED with a reason. See ' +
        'docs/design/observation-entitlement.md.',
    );
  }
}
