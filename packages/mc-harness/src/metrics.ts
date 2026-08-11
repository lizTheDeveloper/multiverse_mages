/*
 * Multiverse Mages — the metric entry shape and the registry the harness
 * validates a sweep against.
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
 * **Scope note.** Task group 6 owns the metric registry proper — the collectors,
 * the Kaplan–Meier estimator, the Gini checkpoints, the conformance check
 * against `contracts.md` §7. What lives here is only what task groups 3 and 4
 * cannot do without: the *shape* of a metric entry, the *aggregation rule* a
 * fold needs to know, and a registry interface the sweep validator can reject an
 * unknown metric against (task 3.4).
 *
 * It is deliberately an interface plus a trivial implementation rather than a
 * populated table. A table with twelve metric names and no collectors behind
 * them would be a registry that reports every metric as present while measuring
 * nothing, which `design.md` calls the worst failure mode available to a
 * measurement layer.
 *
 * ## Why `unavailable` is a status and not an absence
 *
 * Half the mechanics §7 names do not exist at 0.5.0. An entry is therefore
 * either a measurement or `{status: 'unavailable', reason}`, never a missing
 * key: "the collector broke" and "the feature does not exist yet" must not look
 * the same in a file that will be read years from now. Unavailable entries never
 * fold into an aggregate — see `aggregate.ts`, which counts them instead.
 */

/** Why a metric could not be measured. `contracts.md` §7 and the capability spec. */
export const UNAVAILABLE_REASON = {
  /** The mechanic the metric describes has not shipped. */
  mechanicAbsent: 'mechanic-absent',
  /** The mechanic exists but this run produced no sample of it. */
  noObservations: 'no-observations',
  /** The estimator's event never occurred before the run ended. */
  censored: 'censored',
  /** The metric is defined per arm and this record is a single run. */
  perArmScope: 'per-arm-scope',
} as const;

/** Any reason code from {@link UNAVAILABLE_REASON}. */
export type UnavailableReason = (typeof UNAVAILABLE_REASON)[keyof typeof UNAVAILABLE_REASON];

/** One metric's entry in one run record. */
export type MetricEntry =
  | { readonly status: 'measured'; readonly value: number }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason };

/** Every registered metric's entry for one run. Complete, or the run is a failure. */
export type MetricEntries = Readonly<Record<string, MetricEntry>>;

/**
 * How a metric's per-run values fold into a sweep aggregate.
 *
 * `mean` is the common case. `sum`, `min` and `max` exist because a count and a
 * worst case are not means of anything. The list is short on purpose: an
 * aggregation rule that only one metric uses belongs in that metric's collector,
 * where its argument can be written down, not in a shared enum where it becomes
 * a menu.
 */
export type AggregationRule = 'mean' | 'sum' | 'min' | 'max';

/** What the harness needs to know about a metric in order to carry and fold it. */
export interface MetricDefinition {
  readonly id: string;
  /**
   * Covers the metric's formula *and* its pinned constants. Recorded in every
   * run record's provenance block; the gate refuses to compare across a change.
   */
  readonly definitionVersion: number;
  readonly aggregation: AggregationRule;
  /** Human-readable unit, carried into the summary so a number is interpretable. */
  readonly unit: string;
}

/** The set of metrics a sweep may name. Task group 6 supplies the real one. */
export interface MetricRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
  get(id: string): MetricDefinition | undefined;
}

/**
 * Builds a registry from an explicit list.
 *
 * Rejects duplicate ids rather than letting the later one win. A registry with
 * two entries for one name silently picks an aggregation rule, and the one it
 * picks depends on declaration order in a file nobody re-reads.
 */
export function metricRegistry(definitions: readonly MetricDefinition[]): MetricRegistry {
  const byId = new Map<string, MetricDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate metric id ${definition.id} in the registry.`);
    }
    byId.set(definition.id, definition);
  }
  const ids = [...byId.keys()].sort();
  return {
    ids,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
  };
}

/** The empty registry. A sweep validated against it may name no metrics at all. */
export const EMPTY_METRIC_REGISTRY: MetricRegistry = metricRegistry([]);

/**
 * The strategies a sweep may assign to an agent slot.
 *
 * Same shape and same reasoning as {@link MetricRegistry}: task group 5 owns the
 * pool, task group 3 owns rejecting a sweep that names a strategy the pool does
 * not contain.
 */
export interface StrategyRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
}

/** Builds a strategy registry from a list of ids, rejecting duplicates. */
export function strategyRegistry(ids: readonly string[]): StrategyRegistry {
  const set = new Set<string>();
  for (const id of ids) {
    if (set.has(id)) throw new Error(`Duplicate strategy id ${id} in the registry.`);
    set.add(id);
  }
  const sorted = [...set].sort();
  return { ids: sorted, has: (id) => set.has(id) };
}

/** The empty strategy registry. */
export const EMPTY_STRATEGY_REGISTRY: StrategyRegistry = strategyRegistry([]);

/**
 * The parameter factors a scenario knows how to consume.
 *
 * Without this, a sweep file could name `growthRate` where the scenario reads
 * `growth`, and the sweep would run to completion: every cell would receive a
 * level nothing looked at, every replicate in every cell would be identical, and
 * the result would be a perfectly reproducible measurement of one configuration
 * reported as a measurement of six. A typo'd factor is the one sweep-file
 * mistake that produces plausible numbers rather than an error, which is exactly
 * why the validator has to know the names.
 */
export interface FactorRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
}

/** Builds a factor registry from a list of ids, rejecting duplicates. */
export function factorRegistry(ids: readonly string[]): FactorRegistry {
  const set = new Set<string>();
  for (const id of ids) {
    if (set.has(id)) throw new Error(`Duplicate factor id ${id} in the registry.`);
    set.add(id);
  }
  const sorted = [...set].sort();
  return { ids: sorted, has: (id) => set.has(id) };
}

/** The empty factor registry. A sweep validated against it may declare no factor. */
export const EMPTY_FACTOR_REGISTRY: FactorRegistry = factorRegistry([]);

/** Narrowing helper — reads better than the discriminant at every call site. */
export function isMeasured(
  entry: MetricEntry,
): entry is { readonly status: 'measured'; readonly value: number } {
  return entry.status === 'measured';
}
