/*
 * Multiverse Mages — the primitive-coverage check over the v1 content subset.
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
 * ## Why coverage is asserted over primitives rather than over nodes
 *
 * Balance assertions are made over primitives, because that is where Monte
 * Carlo has enough samples to be truthful: a hundred nodes declaring
 * `research-rate` give one primitive a hundred observations, while any single
 * node gives one node one. A primitive no content exercises therefore has *no*
 * samples, and every statement the harness makes about it at 0.5.0 will be
 * about code nothing has ever run.
 *
 * The design accepted exactly two such gaps — `lifespan` and `fertility` — and
 * recorded them as *asserted rather than discovered*. This check is that
 * assertion. One of the two has since closed: widening the v1 rectangle to 4×5
 * brought `creo-animal` inside it and with it three `fertility` carriers, so
 * the list below names `lifespan` alone.
 *
 * ## It fails in both directions, and that is the whole point
 *
 * A one-directional check ("nothing became unexercised") passes forever while
 * the exclusion list quietly becomes a lie: someone authors a `lifespan` node,
 * the gap closes, and the document still says the gap is there. Nobody notices,
 * because nothing went red. So an exclusion that becomes covered is a failure
 * too, and the fix is to delete the exclusion deliberately — which is a diff a
 * reviewer can read as the claim it is.
 *
 * Three further failures are the same idea:
 *
 * - an exclusion naming a primitive the registry does not declare, which is how
 *   a list survives a rename while meaning nothing;
 * - a `portal` effect outside `rego-limen`, since `contracts.md` §8 mandates
 *   that cell and the whole raid entry point hangs off it;
 * - nothing at all, which would mean the check found no v1 content and passed
 *   vacuously.
 *
 * ## Nothing here is hardcoded
 *
 * The required set is *every primitive the registry declares* minus the
 * exclusions, and the exercised set is read from the loaded nodes. There is no
 * list of primitive names in this file except the two exclusions, which are the
 * claim. Content is authored in this same change and will keep moving; a check
 * written against a transcribed list would go stale the first time it did.
 */

import type { ContentRegistry, NodeRecord } from '@mm/content';

/**
 * The one primitive no v1 node exercises, and the reason.
 *
 * `lifespan` has seventeen authored carriers and **not one of them is in the
 * rectangle**. Enumerated from `node.json` rather than inherited from the
 * comment this replaces, which said "Corpus-bound" and was wrong: the carriers
 * sit across four forms — `aquam`, `corpus`, `fatum`, `herbam` — in nine cells
 * (`creo-corpus`, `intellego-aquam`, `intellego-corpus`, `intellego-fatum`,
 * `intellego-herbam`, `muto-corpus`, `muto-fatum`, `rego-corpus`,
 * `rego-fatum`). So this gap is closable by more than one widening, and a
 * future author should not read it as "admit Corpus or nothing".
 *
 * Sorted, and asserted to be exactly this list by test. Adding an entry is a
 * claim that another primitive is unmeasurable at 0.5.0, and should be as hard
 * to do quietly as this list makes it.
 *
 * ## `fertility` was the second entry, and content closed it
 *
 * The old note said the gap was *"an authoring gap … closed by content — an
 * authored effect on a v1 node, or a v1 rectangle that includes Corpus — not by
 * wiring"*, and named Corpus because `fertility` was read as Corpus-bound
 * alongside `lifespan`. It is not: **Animal** carries it. Widening the v1
 * rectangle from 3×4 to 4×5 — adding `creo` and `animal` — put three
 * `fertility` carriers inside it, all in `creo-animal`: `Quicken the Herd`
 * (128), `The Fat Year` (256) and `The Made Beast` (192). The check fails in
 * both directions precisely so that this diff had to be written by hand.
 *
 * `lifespan` did **not** close. None of its seventeen carriers falls inside the
 * 4x5 rectangle — so the widening is a real test of the two-directional rule
 * rather than a blanket amnesty: one exclusion died, one survived, and each for
 * a reason a reader can check against `node.json`.
 *
 * ## This list is no longer the consumption check's
 *
 * It was, and `consumption.ts` argued at length that sharing was safe because
 * the two scopes agreed: *"`lifespan` is carried by seventeen non-v1 nodes and
 * by no v1 node at all, so 'no academic can move it' holds in v1 either way."*
 * Both halves of that sentence were true and the second one is now false.
 * `coordination/knowledge-vitality.ts` fetches both primitives' authored
 * magnitudes and the world loop applies them, so a **node-driven consumer
 * exists** — while no v1 node still declares `lifespan`, which is the only
 * question this file asks.
 *
 * So the exclusion here has narrowed rather than lapsed. It no longer says
 * *"knowledge cannot move this"*; it says *"no learnable node authors this
 * yet"*. {@link PRIMITIVE_CONSUMPTION_EXCLUSIONS} in `consumption.ts` is now
 * the other list, and it is empty.
 */
export const PRIMITIVE_COVERAGE_EXCLUSIONS: readonly string[] = ['lifespan'];

/** The primitive whose cell `contracts.md` §8 mandates. */
export const PORTAL_PRIMITIVE_ID = 'portal';

/** The one cell `portal` may be declared in. */
export const PORTAL_HOME_CELL_ID = 'rego-limen';

/** One exercised primitive, and how many v1 nodes declare it. */
export interface PrimitiveCoverageEntry {
  readonly primitiveId: string;
  readonly nodeCount: number;
}

export interface PrimitiveCoverageReport {
  /** Exercised primitives with their node counts, sorted by primitive id. */
  readonly exercised: readonly PrimitiveCoverageEntry[];
  /** Required but unexercised primitives, sorted. The first failure direction. */
  readonly unexercised: readonly string[];
  /** Exclusions that v1 content now covers, sorted. The second failure direction. */
  readonly coveredExclusions: readonly string[];
  /** Exclusions naming a primitive the registry does not declare, sorted. */
  readonly unknownExclusions: readonly string[];
  /** Node ids declaring `portal` outside `rego-limen`, sorted. */
  readonly misplacedPortalNodes: readonly string[];
  /** How many v1 nodes were examined. Zero is a failure, not a pass. */
  readonly v1NodeCount: number;
  /** The exclusions this run was given, sorted. */
  readonly exclusions: readonly string[];
  readonly ok: boolean;
}

function sorted(values: Iterable<string>): readonly string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** The v1 nodes of a loaded content set. */
function v1Nodes(registry: ContentRegistry): readonly NodeRecord[] {
  const v1Cells = new Set<string>();
  for (const cell of registry.cells) {
    if (cell.record.v1 === true) v1Cells.add(cell.record.id);
  }
  return registry.nodes
    .map((node) => node.record)
    .filter((node) => v1Cells.has(node.cell));
}

/**
 * Checks that v1 content exercises every registry primitive but the exclusions.
 *
 * @param registry - Loaded, validated content. The required set and the
 * exercised set both come from here.
 * @param exclusions - Defaults to {@link PRIMITIVE_COVERAGE_EXCLUSIONS}. Passed
 * in so a test can watch the check fail on a bad list, which is the only way to
 * know the list is checked at all.
 */
export function checkPrimitiveCoverage(
  registry: ContentRegistry,
  exclusions: readonly string[] = PRIMITIVE_COVERAGE_EXCLUSIONS,
): PrimitiveCoverageReport {
  const declared = new Set(registry.primitives.map((entry) => entry.record.id));
  const excluded = new Set(exclusions);

  const nodes = v1Nodes(registry);
  const counts = new Map<string, number>();
  const misplacedPortalNodes: string[] = [];

  for (const node of nodes) {
    const seenInNode = new Set<string>();
    for (const effect of node.effects) {
      if (effect.primitive === PORTAL_PRIMITIVE_ID && node.cell !== PORTAL_HOME_CELL_ID) {
        if (!misplacedPortalNodes.includes(node.id)) misplacedPortalNodes.push(node.id);
      }
      // Counted per node, not per effect: "how many nodes exercise this" is the
      // number that says whether the harness will have distinct sources.
      if (seenInNode.has(effect.primitive)) continue;
      seenInNode.add(effect.primitive);
      counts.set(effect.primitive, (counts.get(effect.primitive) ?? 0) + 1);
    }
  }

  const exercised = sorted(counts.keys()).map((primitiveId) => ({
    primitiveId,
    nodeCount: counts.get(primitiveId) ?? 0,
  }));

  const unexercised = sorted(
    [...declared].filter((primitiveId) => !excluded.has(primitiveId) && !counts.has(primitiveId)),
  );
  const coveredExclusions = sorted([...excluded].filter((primitiveId) => counts.has(primitiveId)));
  const unknownExclusions = sorted([...excluded].filter((primitiveId) => !declared.has(primitiveId)));

  return {
    exercised,
    unexercised,
    coveredExclusions,
    unknownExclusions,
    misplacedPortalNodes: sorted(misplacedPortalNodes),
    v1NodeCount: nodes.length,
    exclusions: sorted(excluded),
    ok:
      nodes.length > 0 &&
      unexercised.length === 0 &&
      coveredExclusions.length === 0 &&
      unknownExclusions.length === 0 &&
      misplacedPortalNodes.length === 0,
  };
}

/**
 * The report as text, for CI output and for a failing test's message.
 *
 * It lists what *is* exercised even when it passes. A check that prints only
 * failures gives a reader no way to see the coverage shrinking one primitive at
 * a time, and the exercised list with node counts is the thing a reviewer can
 * compare against the content diff in front of them.
 */
export function formatPrimitiveCoverageReport(report: PrimitiveCoverageReport): string {
  const lines: string[] = [];
  lines.push(
    `Primitive coverage over ${String(report.v1NodeCount)} v1 nodes ` +
      `(${String(report.exercised.length)} primitives exercised):`,
  );
  for (const entry of report.exercised) {
    lines.push(`  ${entry.primitiveId.padEnd(18)} ${String(entry.nodeCount)} node(s)`);
  }
  lines.push(`Declared exclusions: ${report.exclusions.join(', ')}`);

  if (report.v1NodeCount === 0) {
    lines.push('');
    lines.push('  FAIL: no v1 nodes were found at all, so this check would have passed vacuously.');
  }
  if (report.unexercised.length > 0) {
    lines.push('');
    lines.push(`  FAIL: unexercised primitive(s): ${report.unexercised.join(', ')}`);
    lines.push(
      '        Every primitive outside the exclusion list must be declared by at least one v1',
      );
    lines.push(
      '        node, or the balance harness will report on a primitive nothing has ever run.',
    );
  }
  if (report.coveredExclusions.length > 0) {
    lines.push('');
    lines.push(`  FAIL: excluded primitive(s) now covered: ${report.coveredExclusions.join(', ')}`);
    lines.push(
      '        This is not automatically a mistake — but the exclusion list must be updated',
    );
    lines.push(
      '        deliberately, because it is a claim about what v1 content does not exercise.',
    );
  }
  if (report.unknownExclusions.length > 0) {
    lines.push('');
    lines.push(`  FAIL: exclusion(s) naming no registry primitive: ${report.unknownExclusions.join(', ')}`);
  }
  if (report.misplacedPortalNodes.length > 0) {
    lines.push('');
    lines.push(
      `  FAIL: node(s) declaring "${PORTAL_PRIMITIVE_ID}" outside ${PORTAL_HOME_CELL_ID}: ` +
        report.misplacedPortalNodes.join(', '),
    );
  }

  lines.push('');
  lines.push(report.ok ? 'Primitive coverage check PASSED.' : 'Primitive coverage check FAILED.');
  return lines.join('\n');
}
