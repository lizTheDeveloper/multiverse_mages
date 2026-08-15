/*
 * Multiverse Mages — the primitive-consumption check: which primitives an
 * academic's knowledge can actually move.
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
 * ## The hole this exists to cover, and why `coverage.ts` does not cover it
 *
 * `checkPrimitiveCoverage` asks an **authorship** question: does at least one
 * v1 node declare an effect on this primitive? It loads the content registry
 * and counts. It passes today over 51 nodes and 14 primitives, and every word
 * of that output is true.
 *
 * It is also compatible with the effect pipeline being connected to nothing.
 * `gatherEffects` and `stackContributions` — the documented route from
 * `instances ──▶ contributions ──▶ outcomes` — have, at the time this file was
 * written, **zero production callers**: every reference to either is in `test/`
 * or in a build output. Content can therefore declare a `research-rate` effect
 * on forty nodes, the coverage check can report `research-rate 7 node(s)`, and
 * no mage anywhere researches one tick faster for knowing any of them. The
 * words *coverage* and *exercised* read as claims about a running simulation.
 * They are claims about a JSON file.
 *
 * This check asks the **consumption** question instead:
 *
 * > For each primitive, is there a path from an authored node effect to
 * > something the assembled simulation applies?
 *
 * Or, in the form that matters to the design: *can what the academics know
 * change it?*
 *
 * ## Why registration rather than searching for consumers
 *
 * Three mechanisms were considered and two were rejected on evidence.
 *
 * **Grepping production sources for primitive ids** over-counts so badly it
 * manufactures a green light. `ward` matches *toward* and *forward*; the id
 * appears in prose comments in files that consume nothing. A check that a
 * docstring can satisfy is not a check.
 *
 * **Tracing the call graph out of `gatherEffects`** is refuted by the content
 * of this repository. Two primitives reach the simulation *without* going
 * through that pipeline at all: `worship-yield` is read out of node effects by
 * `god/system.ts`'s `yieldSources`, which gates each node's authored magnitudes
 * on `knowledge.instanceCount(nodeId) > 0`, and `portal` gates `portalPlan` on
 * a living mage holding a node that carries it. Both are genuine
 * knowledge-to-simulation paths. A check anchored on `gatherEffects` would
 * report both as unconsumed, which is false, and false in the direction that
 * teaches a reader to distrust the check.
 *
 * **Registration at the point of access** is what is built here.
 * {@link nodeEffectMagnitudes} is the supported way to turn "this primitive"
 * into "these nodes' authored magnitudes", and it takes a
 * {@link ConsumptionRecorder} as a **required** argument. Registration is a
 * side effect of *fetching the data*, never a parallel declaration a
 * maintainer could write down and leave untrue. An absence in the recorder is
 * therefore a real absence: nobody asked for that primitive's node effects.
 *
 * ## The recorder is threaded from the composition root, and that is the point
 *
 * The recorder is an explicit parameter, not a module-level singleton — a
 * global would survive between tests and would be a mutable module in a package
 * whose whole discipline is that it has none.
 *
 * More importantly, it is created and threaded by **`packages/scenario`**, the
 * composition root that actually assembles a universe. So a registration means
 * something stronger than "code exists that reads this primitive": it means
 * *the code that builds a running simulation fetched this primitive's node
 * magnitudes and handed them to the world loop*. Reads in a package nothing
 * assembles never register, because nothing calls them.
 *
 * That distinction was not hypothetical, and the history is worth keeping
 * because it shows the mechanism working and then being overtaken. When this
 * file was written `@mm/rules-raid` held a complete, careful node-effect
 * consumption path — `arbitration.ts` dispatching `direct-damage`, `ward`,
 * `area-denial`, `blink`, `summon`, `concealment` and `knowledge-steal` — and
 * **no package depended on `@mm/rules-raid`**. Seven real consumers on an
 * orphaned branch of the graph, which the recorder correctly declined to count.
 *
 * `packages/scenario` then grew `raids.ts`, and the branch stopped being
 * orphaned: `@mm/rules-raid` is a dependency of the composition root and its
 * raid system is installed in the reference world loop by default. The seven
 * consumers stayed unregistered anyway, for a second and narrower reason —
 * arbitration read `node.effects` directly instead of asking through
 * {@link nodeEffectRecords}, so the fetch the recorder watches never happened.
 * w18-combat closed that: the index is built once at the composition root, by
 * `combatEffectIndex` in `arbitration.ts`, and handed to the arbiter as a
 * required constructor argument. The check now sees them.
 *
 * The green it produces is exactly as strong as `portal`'s, and no stronger:
 * both say *the assembled simulation fetched these node magnitudes and holds
 * them*. Neither opens a portal, so neither is evidence that a raid happened.
 * That evidence is a measurement, and it lives in
 * `packages/rules-raid/test/unit/combat-knowledge.test.ts`.
 *
 * ## Node-driven and non-node-driven are not the same coverage
 *
 * Several primitives are consumed today entirely by god interventions:
 * `godEffectHooks` stacks `research-rate` and `teach-rate` from blessing and
 * encouragement constants, and contributes `lifespan` months, with no node
 * contributing anything. Counting those as coverage reproduces the original
 * defect one layer up — the check would go green while the academics remained
 * unable to move a single rate.
 *
 * So registrations carry a {@link ConsumerKind}, only `'node'` registrations
 * count toward consumption, and the non-node ones are printed separately
 * because *"consumed, but never by knowledge"* is the most interesting line in
 * the report. It is the exact shape of the bug.
 *
 * ## Why this check does not repeat `coverage.ts`'s v1 filter
 *
 * `checkPrimitiveCoverage` counts **v1 nodes** — those in one of the twelve
 * enabled cells — because those are the only nodes a mage can legally learn.
 * This check counts **every** authored node, because that is what the wiring it
 * replaced did: `scenario`'s old `nodesCarrying` scanned the whole grid and
 * legality was decided later and per node by `permits()`. Filtering here would
 * be a silent behaviour change wearing a check's clothing.
 *
 * The two together are still tight, and this is the reason to keep both rather
 * than fold one into the other:
 *
 * - coverage says *at least one **v1** node declares primitive P*;
 * - consumption says *a consumer fetched P and received at least one node*.
 *
 * The consumer's fetch is over a superset of the v1 nodes, so if both checks
 * pass, the node the coverage check found is necessarily among those the
 * consumer received — a **learnable** node whose magnitude reaches a consumer.
 * Neither check establishes that alone. Run in `verify` they are adjacent on
 * purpose.
 *
 * The exclusions **used** to be shared despite the different scopes, on the
 * argument that `lifespan` is carried by seventeen non-v1 nodes and by no v1
 * node at all, so "no academic can move it" held in v1 either way. That is no
 * longer true: `coordination/knowledge-vitality.ts` is a node-driven consumer
 * of both `lifespan` and `fertility`, so this check's answer moved and
 * `coverage.ts`'s did not. See {@link PRIMITIVE_CONSUMPTION_EXCLUSIONS} for
 * what the split costs and what it does not.
 *
 * ## What a green here still does not establish: the magnitude may never bind
 *
 * **This check cannot tell a live wire from one whose magnitude never binds**,
 * and that is the same failure class it exists to catch, one layer up. It
 * proves a path from an authored node effect to something the assembled
 * simulation applies. It says nothing about whether applying it changes an
 * outcome.
 *
 * The worked example is `teach-rate`, which is wired, registered against
 * `coordination/academic-effects.academicRateBonuses` over twenty nodes, green
 * here — and behaviourally inert under v1 content. The suite's own numbers, from
 * `packages/coordination/test/unit/academic-effects.test.ts`, ablating each rate
 * against the same control:
 *
 * | ablated | measure | control | treatment | gain |
 * |---|---|--:|--:|--:|
 * | `research-rate` | completions | 4,278 | 5,508 | +28.8% |
 * | `research-rate` | `nodesKnown` | 29 | 46 | +58.6% |
 * | `scribe-rate` | grimoires | 141 | 185 | +31.2% |
 * | `teach-rate` | lessons | 3,174 | 3,271 | **+3.1%** |
 *
 * That last row is small for a structural reason rather than a tuning one, and
 * the test that produces it is named after the reason: *"finds no
 * completion-count gain for `teach-rate`, because a lesson already fits in a
 * month."* The rate divides a duration that is already under the tick, so
 * dividing it further buys nothing a completion count can see. Nineteen
 * `single`-target effects reach a consumer and move no outcome.
 *
 * **Do not add `teach-rate` to {@link PRIMITIVE_CONSUMPTION_EXCLUSIONS} over
 * this, and do not weaken the wire.** It is genuinely consumed; whether it
 * *binds* is a content and tuning question, answered by ablation runs and by
 * the balance gates, not by a registry walk. The honest statement of what a
 * green here buys is the one `portal` and `worship-yield` already get: *the
 * assembled simulation fetched these node magnitudes and applied them.* The
 * check that would catch an inert magnitude is an ablation whose arms differ,
 * and `§9`'s `winRateByPrimitive` mask is the instrument for it.
 *
 * ## It fails in both directions, like its sibling
 *
 * `coverage.ts` argues that a one-directional check rots: it passes forever
 * while the exclusion list quietly becomes a lie. The same argument applies
 * here and the same answer is given — an excluded primitive that *gains* a
 * node-driven consumer is a failure too, so closing the gap is a deliberate
 * diff a reviewer can read as the claim it is. The exclusions are imported from
 * `coverage.ts` rather than restated, so the two checks cannot drift apart.
 */

import type { ContentId, ContentRegistry, EffectRecord, Fp } from '@mm/content';

/**
 * Primitives this check accepts as having no node-driven consumer.
 *
 * **Empty, and that is the point of the campaign this file was written for.**
 * `.github/workflows/ci.yml` states the exit condition in the repo's own words
 * — *"every primitive has a node-driven consumer, or the remaining ones are
 * declared exclusions"* — and warns in the same breath that adding a primitive
 * here to make the job green is the exact failure the check exists to catch. An
 * entry is a claim that no academic can move a number the content says they
 * can, and it should be as hard to write as this comment makes it.
 *
 * ## Why this is not `coverage.ts`'s list any more
 *
 * It was, imported rather than restated, and the argument for sharing was that
 * the two scopes agreed on the only two entries. They no longer do.
 * `lifespan` and `fertility` have a node-driven consumer as of
 * `coordination/knowledge-vitality.ts` — this check's question, answered yes —
 * and still no **v1** node declares either, which is `coverage.ts`'s question,
 * answered no. One list cannot hold two answers, and the failure direction each
 * check owns is what forced the split: a shared list would make this check fail
 * on `consumedExclusions` and that one fail on `unexercised`, whichever way it
 * was written.
 *
 * The two checks are still adjacent in `verify` and still tighter together than
 * apart. What is lost is the composed claim for these two primitives
 * specifically: coverage no longer certifies that the node whose magnitude
 * reaches the consumer is one a mage could legally learn. For `lifespan` and
 * `fertility` it is not — every authored node sits outside the twelve enabled
 * cells — and `knowledge-vitality.ts` says so in its own module note rather
 * than leaving a reader to infer it from a green check.
 */
export const PRIMITIVE_CONSUMPTION_EXCLUSIONS: readonly string[] = [];

/**
 * Where a consumer's magnitudes come from.
 *
 * - `'node'` — from authored node effects. What an academic knows moves it.
 * - `'non-node'` — from anywhere else: god constants, species records, world
 *   state. Real consumption, but not the kind this check is counting.
 *
 * There is no third value on purpose. The question is binary — *can what the
 * academics know change it* — and a taxonomy with a middle is a taxonomy in
 * which a borderline case gets argued into the passing bucket.
 */
export type ConsumerKind = 'node' | 'non-node';

/** One production consumer of one primitive, recorded when it fetched its data. */
export interface ConsumerRegistration {
  readonly primitiveId: string;
  /**
   * Where the magnitudes are applied, as `package/file.symbol`. Written for a
   * reader who has to go and look: `god/system.yieldSources` is an address, and
   * `"the worship loop"` is not.
   */
  readonly consumer: string;
  readonly kind: ConsumerKind;
  /**
   * How many authored nodes carried this primitive when the consumer asked.
   * Always `0` for a `'non-node'` registration, which by definition read none.
   *
   * A `'node'` registration with a count of `0` is a wire with no content
   * behind it — see {@link PrimitiveConsumptionReport.starved}.
   */
  readonly nodeCount: number;
}

/**
 * Collects registrations for one composition of one universe.
 *
 * Deliberately append-only and order-preserving: the check sorts its own output
 * and never depends on insertion order, but a recorder that deduplicated would
 * hide a second consumer of the same primitive, and two consumers is a fact a
 * reviewer may want.
 */
export interface ConsumptionRecorder {
  register(registration: ConsumerRegistration): void;
  registrations(): readonly ConsumerRegistration[];
}

/** A fresh recorder. One per composition; never shared, never module-global. */
export function createConsumptionRecorder(): ConsumptionRecorder {
  const entries: ConsumerRegistration[] = [];
  return {
    register(registration: ConsumerRegistration): void {
      entries.push(registration);
    },
    registrations(): readonly ConsumerRegistration[] {
      return entries;
    },
  };
}

/**
 * The authored magnitudes of one primitive, by node — and the only supported
 * way to ask for them.
 *
 * The `recorder` is required rather than optional, which is the whole
 * mechanism. An optional recorder would make registration something a caller
 * could forget, and a consumption check whose input a caller can forget to
 * produce measures how careful people were, not what the code does.
 *
 * ## The magnitudes come back unstacked, one list per node
 *
 * Summing them here would be inline stacking by another spelling — the lint
 * rule says so in as many words — and it would be the wrong arithmetic besides:
 * how several sources of one primitive combine is the registry's declared
 * `stacking` rule, and `stackMagnitudes` in `@mm/primitives` is the only thing
 * permitted to apply it. Callers that want one number ask that function.
 *
 * @param registry - Loaded, validated content.
 * @param primitiveId - The primitive whose effects are wanted. Not checked
 * against the registry here; {@link checkPrimitiveConsumption} reports a
 * registration naming an undeclared primitive as a failure, which is how a
 * rename gets caught instead of silently returning an empty map forever.
 * @param consumer - Where these magnitudes are applied, as `package/file.symbol`.
 * @param recorder - Records the fetch. Required.
 */
export function nodeEffectMagnitudes(
  registry: ContentRegistry,
  primitiveId: string,
  consumer: string,
  recorder: ConsumptionRecorder,
): Map<ContentId, readonly Fp[]> {
  const found = new Map<ContentId, readonly Fp[]>();
  for (const [nodeId, effects] of nodeEffectRecords(registry, primitiveId, consumer, recorder)) {
    found.set(
      nodeId,
      Object.freeze(effects.map((effect) => effect.magnitude)),
    );
  }
  return found;
}

/**
 * The same fetch, and the same registration, keeping the **whole** authored
 * effect rather than its magnitude.
 *
 * Exists because one primitive needs a second field. `area-denial` is authored
 * with a `durationTicks` — *"a field with no declared duration lasts the tick it
 * was cast in"* is `rules-raid`'s reading of a zero, and how many engagement
 * ticks a field persists is not recoverable from its magnitude. A consumer of
 * `area-denial` therefore cannot be built over {@link nodeEffectMagnitudes}, and
 * the two ways out of that were both worse than adding this:
 *
 * - fetch the magnitudes through the recorded call and read the durations
 *   straight off `registry.nodes` beside it — two reads of one authored effect,
 *   which is exactly the drift `rules-raid`'s conformance test exists to catch;
 * - drop the duration and give every field one tick — a silent content change
 *   wearing a refactor's clothes.
 *
 * {@link nodeEffectMagnitudes} is implemented over this one, so there is a
 * single walk of the registry and a single registration shape. A caller that
 * wants magnitudes should still use that function: narrower is better, and the
 * effect record carries a `target` this project deliberately reads in very few
 * places.
 *
 * @param registry - Loaded, validated content.
 * @param primitiveId - The primitive whose effects are wanted.
 * @param consumer - Where these effects are applied, as `package/file.symbol`.
 * @param recorder - Records the fetch. Required, for the reason above.
 */
export function nodeEffectRecords(
  registry: ContentRegistry,
  primitiveId: string,
  consumer: string,
  recorder: ConsumptionRecorder,
): Map<ContentId, readonly EffectRecord[]> {
  const found = new Map<ContentId, readonly EffectRecord[]>();
  for (const entry of registry.nodes) {
    const effects = entry.record.effects.filter((effect) => effect.primitive === primitiveId);
    if (effects.length > 0) found.set(entry.contentId, Object.freeze(effects));
  }
  recorder.register({ primitiveId, consumer, kind: 'node', nodeCount: found.size });
  return found;
}

/**
 * Records a consumer whose magnitudes do **not** come from node effects.
 *
 * There is no data to hand back, so unlike {@link nodeEffectMagnitudes} this is
 * a bare declaration, and a declaration is exactly as trustworthy as the person
 * who wrote it. That is tolerable only because a `'non-node'` registration
 * cannot make this check greener — it never counts toward consumption. It can
 * only add a line to the report explaining *why* a primitive that is plainly
 * being used is nonetheless reported as unreachable by knowledge, which is the
 * question a reader of the failure will otherwise ask out loud.
 */
export function registerNonNodeConsumer(
  recorder: ConsumptionRecorder,
  primitiveId: string,
  consumer: string,
): void {
  recorder.register({ primitiveId, consumer, kind: 'non-node', nodeCount: 0 });
}

/** One primitive and the consumers registered against it. */
export interface PrimitiveConsumptionEntry {
  readonly primitiveId: string;
  /** Consumer addresses, sorted and deduplicated. */
  readonly consumers: readonly string[];
  /** The largest node count any of those consumers saw. */
  readonly nodeCount: number;
}

export interface PrimitiveConsumptionReport {
  /**
   * Primitives with at least one `'node'` consumer that found authored nodes,
   * sorted. The thing this check is counting.
   */
  readonly consumed: readonly PrimitiveConsumptionEntry[];
  /**
   * Primitives consumed only from non-node sources, sorted. Informational, and
   * pointedly so: these are being used by the simulation and are still not
   * reachable by anything an academic learns.
   */
  readonly nonNode: readonly PrimitiveConsumptionEntry[];
  /**
   * `'node'` consumers that found zero authored nodes, sorted by primitive. A
   * wire with no content behind it, which is the opposite failure to the usual
   * one and worth naming separately so the fix is obvious.
   */
  readonly starved: readonly PrimitiveConsumptionEntry[];
  /** Required primitives with no node-driven consumer, sorted. Failure one. */
  readonly unconsumed: readonly string[];
  /** Exclusions that now have a node-driven consumer, sorted. Failure two. */
  readonly consumedExclusions: readonly string[];
  /** Exclusions naming a primitive the registry does not declare, sorted. Failure three. */
  readonly unknownExclusions: readonly string[];
  /** Registrations naming a primitive the registry does not declare, sorted. Failure four. */
  readonly unknownPrimitives: readonly string[];
  /** How many registrations were seen. Zero is a failure, not a pass. Failure five. */
  readonly registrationCount: number;
  /** The exclusions this run was given, sorted. */
  readonly exclusions: readonly string[];
  readonly ok: boolean;
}

function sorted(values: Iterable<string>): readonly string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function entriesFrom(
  grouped: ReadonlyMap<string, { consumers: Set<string>; nodeCount: number }>,
): readonly PrimitiveConsumptionEntry[] {
  return sorted(grouped.keys()).map((primitiveId) => {
    // Non-null: every key came from this same map.
    const group = grouped.get(primitiveId) as { consumers: Set<string>; nodeCount: number };
    return {
      primitiveId,
      consumers: sorted(group.consumers),
      nodeCount: group.nodeCount,
    };
  });
}

/**
 * Checks that every registry primitive but the exclusions has a node-driven
 * consumer in the assembled simulation.
 *
 * @param registry - Loaded, validated content. The required set comes from
 * here, so there is no transcribed list of primitive names in this file.
 * @param recorder - The recorder the composition root threaded through its
 * wiring. What it collected *is* the answer.
 * @param exclusions - Defaults to {@link PRIMITIVE_CONSUMPTION_EXCLUSIONS},
 * which is empty. Passed in so a test can watch the check fail on a bad list,
 * which is the only way to know the list is checked at all.
 */
export function checkPrimitiveConsumption(
  registry: ContentRegistry,
  recorder: ConsumptionRecorder,
  exclusions: readonly string[] = PRIMITIVE_CONSUMPTION_EXCLUSIONS,
): PrimitiveConsumptionReport {
  const declared = new Set(registry.primitives.map((entry) => entry.record.id));
  const excluded = new Set(exclusions);
  const registrations = recorder.registrations();

  const consumedGroups = new Map<string, { consumers: Set<string>; nodeCount: number }>();
  const starvedGroups = new Map<string, { consumers: Set<string>; nodeCount: number }>();
  const nonNodeGroups = new Map<string, { consumers: Set<string>; nodeCount: number }>();
  const unknownPrimitives = new Set<string>();

  const addTo = (
    groups: Map<string, { consumers: Set<string>; nodeCount: number }>,
    registration: ConsumerRegistration,
  ): void => {
    const existing = groups.get(registration.primitiveId);
    if (existing === undefined) {
      groups.set(registration.primitiveId, {
        consumers: new Set([registration.consumer]),
        nodeCount: registration.nodeCount,
      });
      return;
    }
    existing.consumers.add(registration.consumer);
    if (registration.nodeCount > existing.nodeCount) existing.nodeCount = registration.nodeCount;
  };

  for (const registration of registrations) {
    if (!declared.has(registration.primitiveId)) unknownPrimitives.add(registration.primitiveId);
    if (registration.kind === 'non-node') {
      addTo(nonNodeGroups, registration);
      continue;
    }
    // A node consumer that found nothing is not consumption: the wire exists,
    // the content does not, and an academic still cannot move the number.
    addTo(registration.nodeCount > 0 ? consumedGroups : starvedGroups, registration);
  }

  const consumed = entriesFrom(consumedGroups);
  const consumedIds = new Set(consumed.map((entry) => entry.primitiveId));

  // Reported only where nothing node-driven succeeded, so a primitive with one
  // live consumer and one starved one reads as consumed, which it is.
  const nonNode = entriesFrom(nonNodeGroups).filter((entry) => !consumedIds.has(entry.primitiveId));
  const starved = entriesFrom(starvedGroups).filter((entry) => !consumedIds.has(entry.primitiveId));

  const unconsumed = sorted(
    [...declared].filter(
      (primitiveId) => !excluded.has(primitiveId) && !consumedIds.has(primitiveId),
    ),
  );
  const consumedExclusions = sorted([...excluded].filter((id) => consumedIds.has(id)));
  const unknownExclusions = sorted([...excluded].filter((id) => !declared.has(id)));

  return {
    consumed,
    nonNode,
    starved,
    unconsumed,
    consumedExclusions,
    unknownExclusions,
    unknownPrimitives: sorted(unknownPrimitives),
    registrationCount: registrations.length,
    exclusions: sorted(excluded),
    ok:
      registrations.length > 0 &&
      unconsumed.length === 0 &&
      consumedExclusions.length === 0 &&
      unknownExclusions.length === 0 &&
      unknownPrimitives.size === 0,
  };
}

function appendEntries(
  lines: string[],
  heading: string,
  entries: readonly PrimitiveConsumptionEntry[],
): void {
  if (entries.length === 0) return;
  lines.push('');
  lines.push(heading);
  for (const entry of entries) {
    lines.push(
      `  ${entry.primitiveId.padEnd(18)} ${String(entry.nodeCount)} node(s) -> ` +
        entry.consumers.join(', '),
    );
  }
}

/**
 * The report as text, for CI output and for a failing test's message.
 *
 * It names the consumer of every consumed primitive **on success as well as on
 * failure**, for the reason `coverage.ts` gives about its node counts: the list
 * is the thing a reviewer compares against the diff in front of them, and a
 * check that speaks only when angry gives nobody a way to watch consumption
 * erode one primitive at a time. A consumer disappearing from this list in a
 * refactor is a visible line in a diff; a silent green is not.
 */
export function formatPrimitiveConsumptionReport(report: PrimitiveConsumptionReport): string {
  const lines: string[] = [];
  lines.push(
    `Primitive consumption over ${String(report.registrationCount)} registered consumer(s) ` +
      `(${String(report.consumed.length)} primitive(s) reachable from authored nodes):`,
  );
  if (report.consumed.length === 0) {
    lines.push('  (none)');
  }
  for (const entry of report.consumed) {
    lines.push(
      `  ${entry.primitiveId.padEnd(18)} ${String(entry.nodeCount)} node(s) -> ` +
        entry.consumers.join(', '),
    );
  }
  lines.push(`Declared exclusions: ${report.exclusions.join(', ')}`);

  appendEntries(
    lines,
    'Consumed, but never from node effects — knowledge cannot move these:',
    report.nonNode,
  );
  appendEntries(
    lines,
    'Node consumers that found no authored node — a wire with nothing behind it:',
    report.starved,
  );

  if (report.registrationCount === 0) {
    lines.push('');
    lines.push('  FAIL: no consumers registered at all, so this check would have passed vacuously.');
    lines.push(
      '        The composition root must thread a recorder through its wiring; without one',
    );
    lines.push('        this check measures nothing and says so rather than going green.');
  }
  if (report.unconsumed.length > 0) {
    lines.push('');
    lines.push(`  FAIL: primitive(s) with no node-driven consumer: ${report.unconsumed.join(', ')}`);
    lines.push(
      '        Authoring an effect on a primitive nothing consumes produces content that reads',
    );
    lines.push(
      '        as a rule and behaves as a comment. The question this check asks is not "does',
    );
    lines.push(
      '        anything read this primitive" but "can what the academics know change it", so a',
    );
    lines.push(
      '        primitive moved only by god interventions is listed here on purpose.',
    );
  }
  if (report.consumedExclusions.length > 0) {
    lines.push('');
    lines.push(
      `  FAIL: excluded primitive(s) now node-driven: ${report.consumedExclusions.join(', ')}`,
    );
    lines.push(
      '        Not automatically a mistake — but the exclusion list is a claim about what v1',
    );
    lines.push('        cannot reach, and closing the gap must be a deliberate diff.');
  }
  if (report.unknownExclusions.length > 0) {
    lines.push('');
    lines.push(
      `  FAIL: exclusion(s) naming no registry primitive: ${report.unknownExclusions.join(', ')}`,
    );
  }
  if (report.unknownPrimitives.length > 0) {
    lines.push('');
    lines.push(
      `  FAIL: consumer(s) registered against no registry primitive: ${report.unknownPrimitives.join(', ')}`,
    );
    lines.push(
      '        A consumer asking for a primitive id the registry does not declare gets an empty',
    );
    lines.push(
      '        answer forever, which is how a rename survives as a silent no-op. Named here so',
    );
    lines.push('        it cannot.');
  }

  lines.push('');
  lines.push(report.ok ? 'Primitive consumption check PASSED.' : 'Primitive consumption check FAILED.');
  return lines.join('\n');
}
