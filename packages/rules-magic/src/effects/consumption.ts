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
 * That distinction is not hypothetical. `@mm/rules-raid` contains a complete,
 * careful node-effect consumption path — `arbitration.ts` dispatches
 * `direct-damage`, `ward`, `area-denial`, `blink`, `summon`, `concealment` and
 * `knowledge-steal` straight off `requireRegistryNode(...).effects` — and **no
 * package depends on `@mm/rules-raid`**. Not `scenario`, not `coordination`,
 * not the harness. Those seven consumers are real code on an orphaned branch of
 * the graph, and counting them would report seven primitives as reachable by
 * knowledge in a simulation that cannot reach them at all. The recorder gets
 * this right for free, by construction rather than by a rule someone wrote.
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
 * This is also why the exclusions can be shared despite the different scopes.
 * `lifespan` is carried by seventeen non-v1 nodes and by no v1 node at all, so
 * "no academic can move it" holds in v1 either way.
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

import type { ContentId, ContentRegistry, Fp } from '@mm/content';

import { PRIMITIVE_COVERAGE_EXCLUSIONS } from './coverage.js';

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
  for (const entry of registry.nodes) {
    const magnitudes = entry.record.effects
      .filter((effect) => effect.primitive === primitiveId)
      .map((effect) => effect.magnitude);
    if (magnitudes.length > 0) found.set(entry.contentId, Object.freeze(magnitudes));
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
 * @param exclusions - Defaults to `coverage.ts`'s
 * {@link PRIMITIVE_COVERAGE_EXCLUSIONS}, imported rather than restated so the
 * two checks cannot come to disagree about which gaps are accepted. Passed in
 * so a test can watch the check fail on a bad list, which is the only way to
 * know the list is checked at all.
 */
export function checkPrimitiveConsumption(
  registry: ContentRegistry,
  recorder: ConsumptionRecorder,
  exclusions: readonly string[] = PRIMITIVE_COVERAGE_EXCLUSIONS,
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
