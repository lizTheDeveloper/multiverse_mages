/*
 * Multiverse Mages — the whole causal chain for one primitive, at one seed.
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
 * ## One primitive proven, not sixteen wired
 *
 * Every other test of this change asserts a *link*: that the aggregator gates on
 * mastery, that production splits by territory, that consumption cannot
 * overdraw. This file asserts the **chain**, because a chain of individually
 * correct links is exactly the thing that has failed this project repeatedly —
 * six mechanics were built inside a loop whose middle was never connected, and
 * every one of them measured a null against a bot that does nothing.
 *
 * The primitive is **`build-rate`**, and it is chosen because vision §4 names it
 * as the worked example of the whole design: *"Rego Terram letting universities
 * go up faster is not a special case in code — it is a node weighted toward
 * `build-rate`."* If that sentence is not true in the program, the grid is a
 * taxonomy with no mechanism under it.
 *
 * The five links, in the order a claim needs them:
 *
 * 1. **Legalizing the cell increases its use.** Mages hold more Terram knowledge
 *    when Terram is permitted than when it is forbidden.
 * 2. **Use produces an attributable contribution.** `build-rate` magnitudes reach
 *    construction, and every one of them is a magnitude some Terram node in the
 *    shipped content actually declares — not a number this test invented.
 * 3. **The contribution mutates simulation state.** `buildProgress` on a site
 *    advances further per month.
 * 4. **The mutation changes a visible outcome.** The university is finished
 *    sooner, in months a player would count.
 * 5. **Removing the cause removes the outcome.** Twice, because once is not a
 *    counterfactual:
 *
 *    - **Forbid the cell.** The god's actual verb. The speed-up disappears.
 *    - **Neutralize the primitive.** `neutralizing('build-rate')` from
 *      `@mm/primitives`, with the ruleset left exactly as it is. This is the
 *      sharper of the two and the reason the ablation machinery exists:
 *      forbidding Terram removes `build-rate` *and* that form's `resource-yield`
 *      *and* stops mages researching in the cell at all, so three explanations
 *      survive it. Neutralizing the primitive leaves one — the magic is
 *      researched, taught, paid for, and does nothing.
 *
 * ## The instrument, and what is honest about it
 *
 * The reference universe seeds one academy and seeds it **complete**, on the
 * argument that a half-built one would teach nobody for years. So a passive run
 * has nothing to build, and this file seeds an unfinished site by hand. That is
 * an instrument, not a rule change: it stands in for the god's `fundUniversity`,
 * which is the only thing that founds a site, so that the test does not also
 * have to model a god's favor budget to ask a question about construction.
 *
 * Every arm gets the identical site at the identical handle on the identical
 * tick, from the identical seed. The **only** difference between arms is the one
 * named in the arm.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  UNIVERSE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';
import type { AblationMask, WorldStepReport } from '@mm/coordination';
import { defineWorldSimulation, neutralizing } from '@mm/coordination';

import {
  LONG_RUN_OPTIONS,
  LONG_RUN_SEED,
  buildReferenceState,
  referenceContent,
} from '../../src/index.js';

/**
 * Months to run each arm.
 *
 * Long enough that the slowest arm finishes its site — a test whose control arm
 * never completes cannot say the treatment finished *sooner*, only that one of
 * them finished — and short enough that four arms run inside a unit test.
 */
const TICKS = 180;

/** Designed seats on the seeded site. Any value; it is not what is measured. */
const SITE_CAPACITY = 40;

const content = referenceContent();

/**
 * Terram's bit in the `permittedForms` mask, found rather than hardcoded.
 *
 * The discipline the rest of the suite follows: a form whose bit moved in a
 * content change should fail here with a message naming what went missing,
 * rather than silently forbidding whichever form now sits at position eight.
 */
function terramBit(): number {
  const form = content.registry.forms.find((entry) => entry.record.id === 'terram');
  if (form === undefined) {
    throw new Error('the shipped registry declares no "terram" form; this test names it by id');
  }
  return form.record.bit;
}

/**
 * The twelve-cell ruleset this chain was originally measured against, and why it
 * is still here now that content enables all seventy.
 *
 * Links 3, 4 and 5a compare *permitted* against *forbid the Terram form*, and
 * that comparison is only a counterfactual for `build-rate` while Terram is where
 * most of the reachable `build-rate` is. Under the twelve it was: 5 of the
 * enabled nodes carrying `build-rate` were Terram nodes, out of 5 in the subset —
 * all of them. Under all seventy, 33 nodes carry `build-rate` and only 9 are
 * Terram, so forbidding the form leaves 61 of 74 sources standing and the arm
 * stops isolating anything. Measured, not argued: see the seventy-cell
 * describe block at the bottom of this file.
 *
 * So the chain's three middle links are asserted against a *stated* ruleset
 * rather than against whatever content happens to enable, which is what they
 * always meant. Written as axis names and resolved through the registry, in the
 * discipline {@link terramBit} follows.
 */
const HISTORIC_TECHNIQUES: readonly string[] = ['intellego', 'perdo', 'rego'];
const HISTORIC_FORMS: readonly string[] = ['limen', 'mentem', 'nomen', 'terram'];

function maskOf(
  axis: readonly { readonly record: { readonly id: string; readonly bit: number } }[],
  chosen: readonly string[],
): number {
  let mask = 0;
  for (const id of chosen) {
    const entry = axis.find((candidate) => candidate.record.id === id);
    if (entry === undefined) {
      throw new Error(`the shipped registry declares no axis "${id}"; this test names it by id`);
    }
    mask |= 1 << entry.record.bit;
  }
  return mask;
}

/**
 * Every `build-rate` magnitude the shipped content declares on a Terram node at
 * `target: "universe"`.
 *
 * Read from content so that link 2 can assert **attribution** rather than mere
 * presence: a bonus list whose every entry is one of these is a list that came
 * from Terram nodes, and a test that only checked the list was non-empty would
 * pass against a wire that invented its own numbers.
 */
function terramBuildRateMagnitudes(): ReadonlySet<number> {
  const terramCells = new Set(
    content.registry.cells
      .filter((entry) => entry.record.form === 'terram')
      .map((entry) => entry.record.id),
  );
  const magnitudes = new Set<number>();
  for (const node of content.registry.nodes) {
    if (!terramCells.has(node.record.cell)) continue;
    for (const effect of node.record.effects) {
      if (effect.primitive === 'build-rate' && effect.target === 'universe') {
        magnitudes.add(effect.magnitude);
      }
    }
  }
  if (magnitudes.size === 0) {
    throw new Error(
      'no Terram node in the shipped content declares a universe-scoped build-rate effect. ' +
        'Vision §4 uses "Rego Terram letting universities go up faster" as its worked example, ' +
        'so this is a content regression rather than a test that needs relaxing.',
    );
  }
  return magnitudes;
}

/** Knowledge instances whose node sits in a Terram cell. */
function terramKnowledgeCount(state: SimState): number {
  const terramNodes = new Set<number>();
  const terramCells = new Set(
    content.registry.cells
      .filter((entry) => entry.record.form === 'terram')
      .map((entry) => entry.record.id),
  );
  for (const node of content.registry.nodes) {
    if (terramCells.has(node.record.cell)) terramNodes.add(node.contentId);
  }
  let held = 0;
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (terramNodes.has(row.nodeId)) held += 1;
  }
  return held;
}

interface ArmResult {
  /** Months until the seeded site reached `buildProgress` of `fp(1024)`, or `-1`. */
  readonly ticksToComplete: number;
  /** `buildProgress` credited by laborers across the run, `fp`. */
  readonly progressAdded: number;
  /** Stone construction asked for across the run, `fp`. */
  readonly stoneOwed: number;
  /** The largest `build-rate` source count seen in any tick. */
  readonly peakBuildRateSources: number;
  /** Terram knowledge instances at the end of the run. */
  readonly terramKnowledge: number;
  /** Every `build-rate` magnitude that reached construction, deduplicated. */
  readonly magnitudesSeen: ReadonlySet<number>;
}

interface Arm {
  /** Clear Terram's bit from `permittedForms`. */
  readonly forbidTerram?: boolean;
  /** Neutralize one primitive across the world loop. */
  readonly ablation?: AblationMask;
  /**
   * Narrow the ruleset to {@link HISTORIC_TECHNIQUES} × {@link HISTORIC_FORMS}
   * before anything else. Applied first, so `forbidTerram` still subtracts from
   * whatever this leaves.
   */
  readonly historicRectangle?: boolean;
}

function runArm(arm: Arm): ArmResult {
  const deps = arm.ablation === undefined
    ? content.deps
    : { ...content.deps, ablation: arm.ablation };
  const simulation = defineWorldSimulation(deps);
  let state = buildReferenceState({
    runSeed: LONG_RUN_SEED,
    options: LONG_RUN_OPTIONS,
    content,
    schema: simulation.schema,
  });

  const universes = componentOf(state, UNIVERSE);
  const universe = findUniverse(state);
  if (arm.historicRectangle === true) {
    universes.set(universe, 'permittedTechniques', maskOf(content.registry.techniques, HISTORIC_TECHNIQUES));
    universes.set(universe, 'permittedForms', maskOf(content.registry.forms, HISTORIC_FORMS));
  }
  if (arm.forbidTerram === true) {
    const permitted = universes.get(universe, 'permittedForms');
    universes.set(universe, 'permittedForms', permitted & ~(1 << terramBit()));
  }

  // The instrument: one unfinished site, identical in every arm.
  const site = state.entities.create();
  attachRecord(state, UNIVERSITY, site, {
    libraryId: 0,
    capacity: SITE_CAPACITY,
    buildProgress: 0,
  });

  let ticksToComplete = -1;
  let progressAdded = 0;
  let stoneOwed = 0;
  let peakBuildRateSources = 0;
  const magnitudesSeen = new Set<number>();

  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report: WorldStepReport | undefined = simulation.lastReport();
    if (report === undefined) continue;
    progressAdded += report.buildProgressAdded;
    stoneOwed += report.constructionStoneOwed;
    peakBuildRateSources = Math.max(peakBuildRateSources, report.buildRateSources);
    for (const magnitude of report.buildRateMagnitudes) magnitudesSeen.add(magnitude);
    if (ticksToComplete < 0 && report.universitiesCompleted > 0) ticksToComplete = tick + 1;
  }

  return {
    ticksToComplete,
    progressAdded,
    stoneOwed,
    peakBuildRateSources,
    terramKnowledge: terramKnowledgeCount(state),
    magnitudesSeen,
  };
}

// ---------------------------------------------------------------------------
// The arms. Computed once: each is a 180-tick run of the full world loop.
// ---------------------------------------------------------------------------

const permitted = runArm({ historicRectangle: true });
const forbidden = runArm({ forbidTerram: true, historicRectangle: true });
const ablated = runArm({ ablation: neutralizing('build-rate'), historicRectangle: true });

// The same three arms with the ruleset content now implies — all seventy cells —
// so that what widening the grid did to this chain is a measurement in this file
// rather than a surprise in someone's next run.
const widePermitted = runArm({});
const wideForbidden = runArm({ forbidTerram: true });
const wideAblated = runArm({ ablation: neutralizing('build-rate') });

describe('the causal chain for build-rate, end to end at one seed', () => {
  // Measured on the twelve-cell rectangle. See HISTORIC_TECHNIQUES for why the
  // ruleset is stated here rather than read from whatever content enables, and the
  // last describe block in this file for what the seventy-cell ruleset does to
  // links 3, 4 and 5a.
  it('link 1 — legalizing Terram increases how much Terram magic the academics hold', () => {
    // The first link, and the one most often assumed rather than checked. If
    // forbidding a form did not change what mages *learn*, then everything
    // downstream would be measuring the ruleset's effect on the economy alone
    // and the phrase "the player's authority" would be doing no work.
    expect(permitted.terramKnowledge).toBeGreaterThan(forbidden.terramKnowledge);
  });

  it('link 2 — that use produces build-rate contributions, and every one is attributable', () => {
    expect(permitted.peakBuildRateSources).toBeGreaterThan(0);
    expect(permitted.magnitudesSeen.size).toBeGreaterThan(0);

    // Attribution, not presence. Every magnitude that reached construction must
    // be a magnitude some node in the shipped content declares — otherwise the
    // wire is producing numbers of its own and "the god's choice caused this"
    // would be unfalsifiable.
    const authored = authoredBuildRateMagnitudes();
    for (const magnitude of permitted.magnitudesSeen) {
      expect(authored.has(magnitude)).toBe(true);
    }

    // And at least one of them is specifically a Terram magnitude, which is the
    // cell vision §4 names.
    const terram = terramBuildRateMagnitudes();
    expect([...permitted.magnitudesSeen].some((magnitude) => terram.has(magnitude))).toBe(true);
  });

  it('link 3 — the contributions mutate simulation state: more progress per month of labour', () => {
    // Progress per unit of stone, rather than progress outright: both arms build
    // the same 1024 `fp` of university, so the *total* progress is the same
    // number in every arm and cannot show anything. What `build-rate` changes is
    // how much labour and stone that 1024 costs.
    expect(permitted.stoneOwed).toBeLessThan(forbidden.stoneOwed);
    expect(permitted.stoneOwed).toBeLessThan(ablated.stoneOwed);
  });

  it('link 4 — the mutation changes a visible outcome: the university opens sooner', () => {
    // Every arm must actually finish, or "sooner" is a comparison against a
    // universe that never got there.
    expect(permitted.ticksToComplete).toBeGreaterThan(0);
    expect(forbidden.ticksToComplete).toBeGreaterThan(0);
    expect(ablated.ticksToComplete).toBeGreaterThan(0);

    expect(permitted.ticksToComplete).toBeLessThan(forbidden.ticksToComplete);
  });

  it('link 5a — forbidding the cell removes the speed-up', () => {
    // The god's actual verb, and the counterfactual the claim is about.
    expect(forbidden.ticksToComplete).toBeGreaterThan(permitted.ticksToComplete);
  });

  it('link 5b — neutralizing build-rate alone removes it, with the ruleset untouched', () => {
    // The sharper counterfactual. Terram is permitted in this arm, mages research
    // it, hold it and teach it — `terramKnowledge` says so — and the buildings
    // still go up at the unaided rate, because the one primitive that would have
    // made them go faster contributes nothing.
    //
    // This is what separates "permitting Terram changed the outcome" from
    // "`build-rate` changed the outcome". Forbidding a form removes three things
    // at once; neutralizing a primitive removes one.
    expect(ablated.terramKnowledge).toBe(permitted.terramKnowledge);
    expect(ablated.ticksToComplete).toBeGreaterThan(permitted.ticksToComplete);
  });

  it('link 5b, continued — and the contributions were still gathered, just not applied', () => {
    // The distinction `ablation.ts` exists to make: a neutralized primitive is
    // *present in content, researched, taught, and paid for* and contributes
    // nothing. If this arm had simply stopped gathering, it would be the
    // "never learned it" arm wearing the ablation's name, and the isolation
    // would be fake.
    expect(ablated.peakBuildRateSources).toBe(permitted.peakBuildRateSources);
  });

  it('is a deterministic function of its seed', () => {
    // The whole file is a claim about one seed. A claim about one seed that does
    // not reproduce is a claim about nothing.
    const again = runArm({ historicRectangle: true });
    expect(again.ticksToComplete).toBe(permitted.ticksToComplete);
    expect(again.stoneOwed).toBe(permitted.stoneOwed);
    expect(again.terramKnowledge).toBe(permitted.terramKnowledge);

    // Both rulesets, because the file now measures two and a determinism claim
    // about one of them is a claim about half the file.
    const wideAgain = runArm({});
    expect(wideAgain.ticksToComplete).toBe(widePermitted.ticksToComplete);
    expect(wideAgain.stoneOwed).toBe(widePermitted.stoneOwed);
    expect(wideAgain.terramKnowledge).toBe(widePermitted.terramKnowledge);
  });
});

// ---------------------------------------------------------------------------
// What enabling all seventy cells does to this chain.
// ---------------------------------------------------------------------------

describe('under the ruleset content now implies, forbidding a form stops being an ablation', () => {
  it('still proves the chain: neutralizing build-rate alone still slows the build', () => {
    // **Vision §4 survives.** "Rego Terram letting universities go up faster is
    // not a special case in code — it is a node weighted toward `build-rate`" is
    // still true of the program with every cell open: neutralize the one
    // primitive, leave the ruleset alone, and the site takes 98 months instead of
    // 82. That is link 5b, the sharper of the two counterfactuals, and it is the
    // one that carries the claim.
    expect(widePermitted.ticksToComplete).toBe(82);
    expect(wideAblated.ticksToComplete).toBe(98);
    expect(wideAblated.ticksToComplete).toBeGreaterThan(widePermitted.ticksToComplete);
    expect(wideAblated.terramKnowledge).toBe(widePermitted.terramKnowledge);
  });

  it('but forbidding the Terram form no longer removes build-rate — it leaves most of it', () => {
    // **The finding.** Forbidding a form was the god's actual verb and the
    // counterfactual links 3, 4 and 5a are written against. It worked while the
    // enabled subset was the twelve, where every reachable `build-rate` node was a
    // Terram node. It does not work now:
    //
    //     ruleset            permitted   forbid Terram   neutralize build-rate
    //     historic twelve    51 months    98 months       98 months
    //     all seventy        82 months    69 months       98 months
    //
    // 33 nodes in the grid carry `build-rate` and only 9 of them are Terram, so
    // forbidding the form leaves 61 of 74 sources standing — and it *helps*, by
    // 13 months, because the research the ban displaces goes somewhere that pays
    // better. A god can no longer ablate a primitive by closing one form.
    //
    // This is recorded rather than repaired. Which counterfactual the god's verb
    // is supposed to be is a design question, and the two honest answers — forbid
    // every cell carrying the primitive, or accept that forbidding is not an
    // ablation — are both someone else's call.
    expect(wideForbidden.ticksToComplete).toBe(69);
    expect(wideForbidden.ticksToComplete).toBeLessThan(widePermitted.ticksToComplete);

    // Not zero sources, which is what the twelve-cell arm saw. That is the whole
    // mechanism of the inversion, so it is asserted rather than described.
    expect(forbidden.peakBuildRateSources).toBe(0);
    expect(wideForbidden.peakBuildRateSources).toBeGreaterThan(0);
    expect(wideForbidden.magnitudesSeen.size).toBeGreaterThan(0);

    // And the content fact underneath it, read from the registry so that authoring
    // more `build-rate` outside Terram keeps this comment true.
    const terramCells = new Set(
      content.registry.cells
        .filter((entry) => entry.record.form === 'terram')
        .map((entry) => entry.record.id),
    );
    const carriers = content.registry.nodes.filter((entry) =>
      entry.record.effects.some((effect) => effect.primitive === 'build-rate'),
    );
    expect(carriers).toHaveLength(33);
    expect(carriers.filter((entry) => terramCells.has(entry.record.cell))).toHaveLength(9);
  });
});

/** Every universe-scoped `build-rate` magnitude in the shipped content. */
function authoredBuildRateMagnitudes(): ReadonlySet<number> {
  const magnitudes = new Set<number>();
  for (const node of content.registry.nodes) {
    for (const effect of node.record.effects) {
      if (effect.primitive === 'build-rate' && effect.target === 'universe') {
        magnitudes.add(effect.magnitude);
      }
    }
  }
  return magnitudes;
}
