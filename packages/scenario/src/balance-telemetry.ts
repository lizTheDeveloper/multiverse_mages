/*
 * Multiverse Mages — the §7 per-run telemetry a reference run records about
 * itself, and the read-only system that records it.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `mc-harness` declared `RunTelemetry`, wrote seven per-run collectors against
 * it, exported `collectRunMetrics`, and **nothing ever constructed one**. The
 * per-arm half of `contracts.md` §7 was wired by `armContributionOf` in
 * `executor.ts`; the per-run half was not, so seven of the twelve §7 metrics
 * were structurally incapable of moving in a sweep. This file is the missing
 * input side.
 *
 * ## Why this reads `SimState` when `census.ts` refuses to
 *
 * `census.ts` argues that a **vital sign** must come through §4.1's observation,
 * because a measurement the observation cannot express is a finding about the
 * observation rather than a licence to read around it. That argument is kept and
 * is not weakened here. `reference-universe.ts` already states the boundary of
 * it, beside `lastGodReport`:
 *
 * > *"It does not extend to §7's balance metrics, which `RunTelemetry` already
 * > defines in terms of per-node and per-`(species, tier)` quantities the
 * > observation was never meant to carry."*
 *
 * That is exactly the case here, and it is not a preference. §4.1's knowledge
 * block is **per cell** — seventy cells, three channels each — while
 * `knowledgeHalfLife` and `libraryDependence` are defined per *node*, over three
 * hundred of them, and `libraryDependence` needs the count of nodes surviving on
 * exactly one instance, which no channel carries at any granularity.
 * `timeToTierBySpecies` needs the tier of a node held **in a mind by a mage of a
 * given species**, and the observation's mage block carries a mage's deepest
 * tier per species, which is a `≥` and not the `=` §7 pins. Deriving §7 from the
 * observation would therefore mean reporting different quantities under §7's
 * names — the one failure `metrics-registry.ts` exists to prevent.
 *
 * ## Everything here is read-only, and that is a property with a test
 *
 * The recorder is driven by a `System`, because a system is the only thing that
 * sees state each tick — but it is a system that writes nothing, requests no
 * clock transition, and **draws no randomness**. `step()` keys every stream on
 * `(subsystemId, stepOrdinal)` rather than on a system's position in the schema,
 * so a system that never calls `ctx.rng` displaces no other subsystem's
 * sequence; and a `WorldSchema`'s system list is not part of a snapshot, so
 * installing this one cannot move a snapshot hash. `balance-telemetry.test.ts`
 * asserts the byte-identity directly rather than leaving it as a claim.
 *
 * `KnowledgeSubsystem.fromState` is deliberately **not** used, though it exposes
 * exactly `knownNodes()` and `singleInstanceNodes()`. Its constructor calls
 * `rebuild()`, which relinks shelved grimoires and *discards contentless ones* —
 * it repairs the state it is handed. That is right for the load path and
 * disqualifying for a measurement: an instrument that edits the universe it
 * measures is the thing this whole file is trying not to be. The component rows
 * are read directly instead.
 */

import { TIME_MODE } from '@mm/sim-core';
import type { SimState, System } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, MATERIAL_GRADE, componentOf, findUniverse } from '@mm/state';
import { KnowledgeCensus, isCensusTick } from '@mm/mc-harness';
import type { CensusSample, MaterialGradeSample, TierReach } from '@mm/mc-harness';

import type { ReferenceContent } from './reference-universe.js';

/** `contracts.md` §2.3 numbers node tiers 1..7. */
const TIER_MAX = 7;

/** The §7 per-run inputs one reference run produced. */
export interface BalanceRunTelemetry {
  /** Knowledge census samples, ascending by world tick. */
  readonly census: readonly CensusSample[];
  /** First reach per `(species, tier)`. Pairs never reached are absent. */
  readonly tierFirstReached: readonly TierReach[];
  /** The species the loaded content declares, in content order. */
  readonly speciesIds: readonly string[];
  /**
   * Refined material at each census tick, ascending.
   *
   * Sampled on the census lattice rather than every tick, for the reason the
   * census is: a per-tick series over a 2,400-tick run is a large object to
   * carry through a worker boundary to answer a question about levels. Always
   * an array here — this build *has* the ladder, so `[]` would mean "no sample"
   * and never "no mechanic", and `RunTelemetry.materialGrades` keeps
   * `undefined` for the second.
   */
  readonly materialGrades: readonly MaterialGradeSample[];
}

/**
 * Accumulates one run's §7 per-run telemetry.
 *
 * **One per run.** The census, the reach table and the stashed state are all
 * per-run measurements, and a recorder shared across the runs a worker executes
 * would report whichever run finished last — the shared-mutable-state defect the
 * harness's second capability scenario names, and the same reason
 * `referenceScenario` is built once per run rather than once per process.
 */
export class BalanceTelemetryRecorder {
  /** Node tier by interned node id; index 0 is the reserved null. */
  readonly #tierOfNode: Uint8Array;
  /** Interned species id to the `species.json` id a metric reports. */
  readonly #speciesName: ReadonlyMap<number, string>;
  readonly #speciesIds: readonly string[];
  /** Every `(species, tier)` pair, so the scan can stop once all are reached. */
  readonly #pairCount: number;

  #census = new KnowledgeCensus();
  #materialGrades: MaterialGradeSample[] = [];
  #reaches: TierReach[] = [];
  #reached = new Set<string>();
  #lastObservedTick = -1;
  #last: SimState | undefined;

  constructor(content: ReferenceContent) {
    let maxNodeId = 0;
    for (const node of content.catalogue.nodes) {
      if (node.nodeId > maxNodeId) maxNodeId = node.nodeId;
    }
    const tiers = new Uint8Array(maxNodeId + 1);
    for (const node of content.catalogue.nodes) tiers[node.nodeId] = node.tier;
    this.#tierOfNode = tiers;

    // Ascending by interned id, which is the order `speciesTable` enumerates and
    // therefore the order the universe seeds its cohorts in. Sorting by name
    // instead would make the reported species order a fact about the alphabet.
    const entries = [...content.registry.species].sort((a, b) => a.contentId - b.contentId);
    this.#speciesName = new Map(entries.map((entry) => [entry.contentId, entry.record.id]));
    this.#speciesIds = Object.freeze(entries.map((entry) => entry.record.id));
    this.#pairCount = this.#speciesIds.length * TIER_MAX;
  }

  /**
   * Starts a run over a freshly created state.
   *
   * Called from the scenario's `create`, for the reason the raid log is cleared
   * there: a new episode is a new run, and a recorder carrying the previous
   * run's census would put one universe's knowledge in another's half-life.
   *
   * The state is stashed rather than sampled. A run that advances no ticks never
   * reaches a system, and {@link finish} is what gives it its tick-zero census.
   */
  begin(state: SimState): void {
    this.#census = new KnowledgeCensus();
    this.#materialGrades = [];
    this.#reaches = [];
    this.#reached = new Set();
    this.#lastObservedTick = -1;
    this.#last = state;
  }

  /**
   * Reads one world tick.
   *
   * Called by {@link balanceTelemetrySystem} with the state **as it arrived**,
   * before any rules system has run — which is what makes the sample labelled
   * tick *t* a description of the universe at tick *t* rather than of a tick
   * halfway resolved.
   */
  observe(state: SimState, worldTick: number): void {
    this.#last = state;
    if (worldTick <= this.#lastObservedTick) return;

    const wantCensus = isCensusTick(worldTick);
    const wantReach = this.#reached.size < this.#pairCount;
    if (!wantCensus && !wantReach) return;

    this.#lastObservedTick = worldTick;
    this.#scan(state, worldTick, wantCensus, wantReach);
  }

  /**
   * Reads the terminal state, after the last step.
   *
   * The census `metrics-census.ts` defines is *"inclusive of `ticksRun` when it
   * lands on the lattice"* — *"a run that stopped at tick 24 was at tick 24, and
   * the census taken there is the one that observes whatever the final step
   * destroyed"*. A system cannot take that sample: systems run inside a step and
   * see the tick the state arrived with, so the last thing a system ever sees is
   * tick `ticksRun − 1`. The recorder keeps the state each tick instead, and the
   * object it holds after the final step **is** the state the session finished
   * with — `step` mutates the clone it returns, so the stash is never a copy
   * that could disagree.
   */
  finish(): void {
    const state = this.#last;
    if (state === undefined) return;
    const worldTick = state.clock.worldTick;
    if (worldTick <= this.#lastObservedTick) return;
    this.#lastObservedTick = worldTick;
    this.#scan(state, worldTick, isCensusTick(worldTick), this.#reached.size < this.#pairCount);
  }

  /** What this run reports to §7's per-run collectors. */
  telemetry(): BalanceRunTelemetry {
    return {
      census: this.#census.samples(),
      tierFirstReached: this.#reaches,
      speciesIds: this.#speciesIds,
      materialGrades: this.#materialGrades,
    };
  }

  /**
   * One pass over the knowledge instances, answering both questions.
   *
   * One pass rather than two because it is the only per-tick cost this file
   * adds and a two-hundred-year run holds thousands of instances: counting
   * instances per node and noting mind-held tiers are both functions of the same
   * row, and reading the row twice would double the price of the instrument.
   */
  #scan(state: SimState, worldTick: number, wantCensus: boolean, wantReach: boolean): void {
    // Sampled on the census lattice, beside the census, because both are
    // *levels* read off the same state at the same instant — a grade level
    // taken at a different moment from the knowledge census could not be
    // correlated with it, which is the whole reason `worshipByClass` sits
    // beside its checkpoint rather than in its own series.
    //
    // **Zero is recorded, absence is not.** A universe with no `material-grade`
    // row samples as `0/0` rather than being skipped: "held nothing at tick 60"
    // is a measurement, and dropping the sample would make a run that never
    // refined indistinguishable from a run nobody sampled — which is the
    // distinction `RunTelemetry.materialGrades` exists to keep.
    if (wantCensus) {
      const grades = componentOf(state, MATERIAL_GRADE);
      const universe = findUniverse(state);
      const held =
        universe !== undefined && grades.has(universe)
          ? {
              stoneWorked: grades.get(universe, 'stoneWorked'),
              stoneFine: grades.get(universe, 'stoneFine'),
            }
          : { stoneWorked: 0, stoneFine: 0 };
      this.#materialGrades.push({ worldTick, ...held });
    }

    const store = componentOf(state, KNOWLEDGE_INSTANCE);
    const nodeIds = store.field('nodeId');
    const locationKinds = store.field('locationKind');
    const locationIds = store.field('locationId');

    const counts = wantCensus ? new Map<number, number>() : undefined;
    const speciesOfMage = wantReach ? this.#livingMageSpecies(state) : undefined;

    store.forEach((row) => {
      const nodeId = nodeIds[row] as number;
      if (counts !== undefined) counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
      if (speciesOfMage === undefined) return;
      // §7 pins `locationKind: mind`. The Art of Memory tradition's `store` hook
      // parks instances in a `palace` instead, and those are deliberately **not**
      // counted: widening the location set would change what the metric measures
      // under an unchanged name, which is a `definitionVersion` decision and not
      // this file's to make. It is recorded here because it means the reach
      // table under that one tradition is a lower bound, not because it is a
      // defect to be quietly patched.
      if ((locationKinds[row] as number) !== LOCATION_KIND.mind) return;
      const speciesId = speciesOfMage.get(locationIds[row] as number);
      if (speciesId === undefined) return;
      const tier = this.#tierOfNode[nodeId] ?? 0;
      if (tier < 1 || tier > TIER_MAX) return;
      this.#noteReach(speciesId, tier, worldTick);
    });

    if (counts === undefined) return;
    const existingNodeIds: number[] = [];
    const singleInstanceNodeIds: number[] = [];
    for (const nodeId of [...counts.keys()].sort((a, b) => a - b)) {
      existingNodeIds.push(nodeId);
      if (counts.get(nodeId) === 1) singleInstanceNodeIds.push(nodeId);
    }
    this.#census.offer(worldTick, existingNodeIds, singleInstanceNodeIds);
  }

  /**
   * Living mages by entity handle, as species ids.
   *
   * Dead mages are excluded because §7 says *"any **living** mage of a
   * species"*, and §1.2 keeps a dead mage's row so that handles held elsewhere
   * stay valid — so "the row exists" is not "she is alive", and a reach credited
   * to a corpse would be a first-reach tick that the species never had.
   */
  #livingMageSpecies(state: SimState): Map<number, number> {
    const store = componentOf(state, MAGE);
    const speciesIds = store.field('speciesId');
    const alive = store.field('alive');
    const living = new Map<number, number>();
    store.forEach((row, handle) => {
      if ((alive[row] as number) === 0) return;
      living.set(handle, speciesIds[row] as number);
    });
    return living;
  }

  #noteReach(speciesId: number, tier: number, worldTick: number): void {
    const name = this.#speciesName.get(speciesId);
    if (name === undefined) return;
    const key = `${name}:${String(tier)}`;
    if (this.#reached.has(key)) return;
    this.#reached.add(key);
    this.#reaches.push({ speciesId: name, tier, worldTick });
  }
}

/**
 * The system that drives a recorder.
 *
 * Installed **first** in the schema, and that is the whole of its ordering
 * requirement: a system runs against the state the tick arrived with only if
 * nothing has yet written to it, so a census taken last would be labelled tick
 * *t* while describing a universe that had already lived through most of *t*.
 * Being first is safe precisely because it does nothing — it writes no
 * component, requests no clock transition, and never touches `ctx.rng`.
 *
 * Engagement ticks are skipped. §7's census interval is in **world** ticks, and
 * a raid resolving inside one world tick would otherwise offer the census the
 * same world tick twice, which `KnowledgeCensus.offer` refuses by design.
 */
export function balanceTelemetrySystem(recorder: BalanceTelemetryRecorder): System {
  return {
    name: 'balance-telemetry',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      // `ctx.tick`, not a fresh clock read: it is `step`'s own record of the
      // tick the state arrived with, and a second derivation of one number is a
      // second chance for the two to disagree.
      recorder.observe(ctx.state, ctx.tick);
    },
  };
}
