/*
 * Multiverse Mages — the two checks that keep the metric registry honest:
 * equality with contracts.md §7, and definitionVersion covering its constants.
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
 * Tasks 6.2 and 6.13.
 *
 * ## Why equality, and not "the registry covers §7"
 *
 * §7 says *"a CI check asserts the implemented registry's keys equal this list
 * exactly"*, and both halves of that do work:
 *
 * - A registry **missing** a §7 metric produces sweeps whose records have no
 *   entry for it. Baselines are keyed on §7's names, so the gate would find a
 *   metric it cannot compare and — depending on how forgiving it was written —
 *   either fail confusingly or pass it silently.
 * - A registry with an **extra** metric produces a number that gets baselined,
 *   gated, and defended, without a definition in the document anyone reads.
 *   Nobody deletes a green gated metric.
 *
 * The list is parsed out of the document rather than restated in code, so this
 * check cannot pass against a stale copy of the thing it is checking.
 *
 * ## Why a digest over pinned constants
 *
 * `definitionVersion` is only meaningful if changing a definition changes it.
 * Nothing in a type system connects `KNOWLEDGE_CENSUS_INTERVAL_TICKS = 12` to
 * `knowledgeHalfLife.definitionVersion = 1`: an editor changes the 12 to a 6,
 * every test still passes, and the gate compares two different quantities under
 * one name while reporting a delta that looks like a balance change.
 *
 * So each metric's pinned constants are hashed with its formula, and the pair
 * `(definitionVersion, digest)` is committed in a test fixture. Change a
 * constant without bumping the version and the digest moves while the version
 * does not — {@link definitionVersionConformance} names the metric and says so.
 * Bump the version and the fixture has to be updated, which is a line in a diff
 * a reviewer sees.
 */

import { canonicalHash } from './canonical.js';
import type { BalanceMetricDefinition, BalanceMetricRegistry } from './metrics-registry.js';

/** The result of a conformance check. Problems, not a bare boolean. */
export interface ConformanceReport {
  readonly conforms: boolean;
  /** One line per difference, sorted, each naming what differs. */
  readonly problems: readonly string[];
}

const SECTION_7_HEADING = '## 7. Balance Metrics';

/**
 * Extracts §7's metric names from `contracts.md`, sorted.
 *
 * Scans **only the table rows** of §7 — a line beginning `| \`name\` |`. §7's
 * prose is full of backticked identifiers (`mechanic-absent`,
 * `definitionVersion`, `winRateByPrimitive` in the ownership paragraph), and a
 * parser that scraped every code span would report a dozen metrics that are not
 * metrics, then fail the equality check in a way that looked like a registry bug.
 *
 * @throws Error when the document has no §7 at all. Returning an empty list
 * would make the equality check fail with "the registry has twelve extras",
 * which is a true statement and a useless one.
 */
export function contractSection7MetricIds(markdown: string): string[] {
  const start = markdown.indexOf(SECTION_7_HEADING);
  if (start < 0) {
    throw new Error(
      `docs/design/contracts.md has no "${SECTION_7_HEADING}" heading. The metric registry is ` +
        'checked for equality against that section; without it there is nothing to check against, ' +
        'and an empty list would read as a registry full of inventions.',
    );
  }
  const rest = markdown.slice(start + SECTION_7_HEADING.length);
  const end = rest.indexOf('\n## ');
  const section = end < 0 ? rest : rest.slice(0, end);

  const ids = new Set<string>();
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|/.exec(line);
    if (match !== null) ids.add(match[1] as string);
  }
  if (ids.size === 0) {
    throw new Error(
      'docs/design/contracts.md §7 was found but its metric table parsed to nothing. Either the ' +
        'table format changed or the section is empty; both need a human, not a passing check.',
    );
  }
  return [...ids].sort();
}

/**
 * Task 6.2: the registry's identifier set **equals** §7's, and names any
 * difference in both directions.
 */
export function registryConformance(
  registry: BalanceMetricRegistry,
  contractsMarkdown: string,
): ConformanceReport {
  const contractIds = new Set(contractSection7MetricIds(contractsMarkdown));
  const registered = new Set(registry.ids);

  const problems: string[] = [];
  for (const id of [...contractIds].sort()) {
    if (!registered.has(id)) {
      problems.push(
        `contracts.md §7 names ${id}, which the registry does not implement. Baselines are keyed ` +
          'on §7 names, so this metric would have no entry in any run record.',
      );
    }
  }
  for (const id of [...registered].sort()) {
    if (!contractIds.has(id)) {
      problems.push(
        `the registry implements ${id}, which contracts.md §7 does not name. An unnamed metric ` +
          'gets baselined and gated with no definition in the document anyone reads.',
      );
    }
  }
  return { conforms: problems.length === 0, problems: problems.sort() };
}

/**
 * The digest a `definitionVersion` is a promise about.
 *
 * Covers the normative definition text, the pinned constants, the scope, the
 * aggregation rule and the unit — everything that changes what the number
 * *means*. It deliberately does **not** cover the collector's implementation: a
 * bug fix that makes the collector compute the stated definition correctly is
 * not a redefinition, and forcing a version bump for it would make every fix
 * invalidate every baseline whether or not the numbers moved.
 */
export function definitionDigest(definition: BalanceMetricDefinition): string {
  return canonicalHash(
    {
      id: definition.id,
      definition: definition.definition,
      scope: definition.scope,
      aggregation: definition.aggregation,
      unit: definition.unit,
      pinnedConstants: definition.pinnedConstants,
    },
    `metric:${definition.id}`,
  );
}

/** Every metric's `(definitionVersion, digest)` pair, keyed by id. */
export interface DefinitionPin {
  readonly definitionVersion: number;
  readonly digest: string;
}

/** The committed pins, keyed by metric id. */
export type DefinitionPins = Readonly<Record<string, DefinitionPin>>;

/** The registry's current pins, for writing a fixture after a reviewed bump. */
export function currentDefinitionPins(registry: BalanceMetricRegistry): DefinitionPins {
  const pins: Record<string, DefinitionPin> = {};
  for (const id of registry.ids) {
    const definition = registry.balance(id) as BalanceMetricDefinition;
    pins[id] = { definitionVersion: definition.definitionVersion, digest: definitionDigest(definition) };
  }
  return pins;
}

/**
 * Task 6.13: fails when a pinned constant changed without a `definitionVersion`
 * bump.
 *
 * Four outcomes per metric, and only the first two are silent:
 *
 * - digest same, version same — nothing changed. Fine.
 * - digest changed, version bumped — a deliberate redefinition. Fine, and the
 *   pin fixture must be updated, which is the reviewed act.
 * - **digest changed, version unchanged — the failure this exists for.** The
 *   metric now measures something else under the same version, so the gate would
 *   compare a 12-tick census against a 6-tick one and report the difference as a
 *   balance movement.
 * - version bumped, digest unchanged — a version bump with nothing behind it.
 *   Reported too: it invalidates every baseline for that metric and buys
 *   nothing, and it is usually a bump applied to the wrong line.
 *
 * A metric in the registry with no pin, or a pin for a metric no longer
 * registered, is reported as well — the pins are a committed artifact and
 * silently ignoring either half would let one drift from the other.
 */
export function definitionVersionConformance(
  registry: BalanceMetricRegistry,
  pins: DefinitionPins,
): ConformanceReport {
  const problems: string[] = [];

  for (const id of registry.ids) {
    const definition = registry.balance(id) as BalanceMetricDefinition;
    const pin = pins[id];
    if (pin === undefined) {
      problems.push(
        `${id} is registered but has no committed definition pin. A metric with no pin is a metric ` +
          'whose constants nothing is guarding.',
      );
      continue;
    }
    const digest = definitionDigest(definition);
    const versionMoved = definition.definitionVersion !== pin.definitionVersion;
    const digestMoved = digest !== pin.digest;

    if (digestMoved && !versionMoved) {
      problems.push(
        `${id}: a pinned constant or the normative definition changed, but definitionVersion is ` +
          `still ${String(definition.definitionVersion)}. The metric now measures something else ` +
          'under the same version, so the gate would compare two different quantities and report ' +
          `the difference as a balance movement. Bump definitionVersion to ` +
          `${String(definition.definitionVersion + 1)} and update the pin to ${digest}.`,
      );
    }
    if (versionMoved && !digestMoved) {
      problems.push(
        `${id}: definitionVersion moved from ${String(pin.definitionVersion)} to ` +
          `${String(definition.definitionVersion)} but nothing about the definition changed. That ` +
          'invalidates every baseline for this metric and buys nothing; it is usually a bump ' +
          'applied to the wrong line.',
      );
    }
    if (versionMoved && digestMoved && definition.definitionVersion <= pin.definitionVersion) {
      problems.push(
        `${id}: the definition changed but definitionVersion went backwards, from ` +
          `${String(pin.definitionVersion)} to ${String(definition.definitionVersion)}.`,
      );
    }
  }

  for (const id of Object.keys(pins).sort()) {
    if (!registry.has(id)) {
      problems.push(
        `${id} has a committed definition pin but is not in the registry. Either the metric was ` +
          'removed without removing its pin, or it was renamed and the baselines keyed on the old ' +
          'name are now unreachable.',
      );
    }
  }

  return { conforms: problems.length === 0, problems: problems.sort() };
}
