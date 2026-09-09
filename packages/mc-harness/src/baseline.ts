/*
 * Multiverse Mages — the committed balance baseline: its format, its integrity
 * hash, and everything that makes one malformed.
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
 * Tasks 8.1, 8.2 and 8.3, and the file the gate in `gate.ts` compares against.
 *
 * ## The format is JSON that a human reads in a diff
 *
 * The capability spec asks for "stable key order, one metric per line, so that a
 * diff shows exactly which metrics moved", which rules out both ends of the
 * obvious range. `canonicalJson` alone puts the whole baseline on one line, so
 * every change is one enormous diff hunk. `JSON.stringify(value, null, 2)`
 * spreads each metric over ten lines, so a reviewer counting what moved is
 * counting indentation.
 *
 * {@link encodeBaseline} is therefore a small deliberate printer: top-level keys
 * in sorted order, one per line; objects expanded one key per line; arrays
 * expanded one **element** per line, each element serialized through
 * `canonicalJson`. A metric that moved is exactly one changed line, and it names
 * itself.
 *
 * ## `contentHash` is what makes a hand edit visible
 *
 * `contentHash` is the SHA-256 of the canonical form of everything else in the
 * file. It exists for one scenario in the capability spec: *"a tolerance is
 * edited directly in a baseline file without the command — the gate rejects the
 * baseline as malformed"*. Widening a tolerance by hand is equivalent to
 * regenerating a baseline without a rationale, and the only way to make that
 * mechanically detectable is for the file to carry a hash it cannot have been
 * hand-recomputed by accident. It also gives `supersedes` something to name: a
 * regenerated baseline records the hash of the one it replaced.
 *
 * ## What a baseline is *not*
 *
 * It is not a claim that the numbers in it are good. `release-plan.md` forbids a
 * balance claim before 0.5.0, and a baseline committed under that rule is a
 * *measurement* — "this is what the build did on this date, and here is how far
 * it may move before someone must look". `rationale` and `notes` are the fields
 * that keep that distinction on the page, and both are inside the hash.
 */

import type { JsonValue } from './canonical.js';
import { canonicalHash, canonicalJson } from './canonical.js';
import type { AggregationRule } from './metrics.js';
import type { Provenance } from './protocol.js';
import { provenanceProblems } from './records.js';
import type { StandardErrorMethod } from './standard-error.js';
import { STANDARD_ERROR_METHOD } from './standard-error.js';

/** The baseline format's own version, so a reader knows what shape to expect. */
export const BASELINE_FORMAT_VERSION = 1;

/** One metric's committed line: a measurement, or an explicit absence. */
export type BaselineMetric =
  | {
      readonly metricId: string;
      readonly status: 'measured';
      readonly definitionVersion: number;
      readonly aggregation: AggregationRule;
      readonly unit: string;
      /** The aggregate the gate sweep produced. */
      readonly value: number;
      /** At {@link sampleSize}, by {@link standardErrorMethod}. */
      readonly standardError: number;
      readonly standardErrorMethod: StandardErrorMethod;
      /** Measurements behind the estimate, not the sweep's run count. */
      readonly sampleSize: number;
      /** How far the metric may move. `toleranceK` standard errors. */
      readonly tolerance: number;
    }
  | {
      readonly metricId: string;
      readonly status: 'unavailable';
      readonly definitionVersion: number;
      readonly aggregation: AggregationRule;
      readonly unit: string;
      /** Every reason code the sweep's runs gave, sorted. Compared as a set. */
      readonly reasons: readonly string[];
    };

/** One metric's movement from the baseline this one supersedes. */
export interface SupersededDelta {
  readonly metricId: string;
  /** `null` when the metric was unavailable on that side. */
  readonly previousValue: number | null;
  readonly value: number | null;
  readonly delta: number | null;
  /** In the units the gate reports. `null` when the previous error was zero. */
  readonly deltaInStandardErrors: number | null;
}

/** A committed baseline, as parsed from its file. */
export interface Baseline {
  readonly baselineFormatVersion: number;
  readonly sweepId: string;
  readonly kind: string;
  readonly rootSeed: number;
  /** The gate sweep's configuration hash. A different sweep cannot satisfy it. */
  readonly configurationHash: string;
  /** Runs the sweep dispatched. Sample sizes are per metric and may be smaller. */
  readonly runCount: number;
  /** The *k* of the k-standard-error tolerance rule (task 8.4). */
  readonly toleranceK: number;
  readonly provenance: Provenance;
  /** Why this baseline exists. Required; the regeneration command refuses without one. */
  readonly rationale: string;
  /** Everything a reader must know before believing the numbers. */
  readonly notes: readonly string[];
  /** The superseded baseline's `contentHash`, or `null` for a first baseline. */
  readonly supersedes: string | null;
  /** Per-metric movement from the superseded baseline. Empty for a first one. */
  readonly supersededDeltas: readonly SupersededDelta[];
  /** One per line, sorted by `metricId`. */
  readonly metrics: readonly BaselineMetric[];
  /** SHA-256 over the canonical form of every other field. */
  readonly contentHash: string;
}

/** A baseline with its integrity hash not yet taken. */
export type UnhashedBaseline = Omit<Baseline, 'contentHash'>;

/**
 * The hash a baseline's `contentHash` must equal.
 *
 * Taken over the canonical form of every field *except* `contentHash` itself,
 * which is the only construction that lets the file carry its own hash.
 */
export function baselineContentHash(baseline: UnhashedBaseline | Baseline): string {
  const body: Record<string, unknown> = { ...baseline };
  delete body['contentHash'];
  return canonicalHash(body as unknown as JsonValue, 'baseline');
}

/** Seals an unhashed baseline by computing and attaching its `contentHash`. */
export function sealBaseline(baseline: UnhashedBaseline): Baseline {
  return { ...baseline, contentHash: baselineContentHash(baseline) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serializes a baseline for commit: sorted top-level keys, one metric per line.
 *
 * Objects are expanded one key per line and arrays one element per line, both at
 * a single level of nesting; anything deeper is serialized inline by
 * `canonicalJson`. That is enough for every field here and stops the printer
 * from growing into a general pretty-printer nobody can predict the output of.
 */
export function encodeBaseline(baseline: Baseline): string {
  const lines: string[] = ['{'];
  const keys = Object.keys(baseline).sort();
  const entries: string[] = [];

  for (const key of keys) {
    const value = (baseline as unknown as Record<string, unknown>)[key];
    const label = `  ${JSON.stringify(key)}: `;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        entries.push(`${label}[]`);
        continue;
      }
      const items = value.map((item) => `    ${canonicalJson(item, `${key}[]`)}`);
      entries.push(`${label}[\n${items.join(',\n')}\n  ]`);
      continue;
    }
    if (isPlainObject(value)) {
      const inner = Object.keys(value).sort();
      if (inner.length === 0) {
        entries.push(`${label}{}`);
        continue;
      }
      const items = inner.map(
        (name) => `    ${JSON.stringify(name)}: ${canonicalJson(value[name], `${key}.${name}`)}`,
      );
      entries.push(`${label}{\n${items.join(',\n')}\n  }`);
      continue;
    }
    entries.push(`${label}${canonicalJson(value, key)}`);
  }

  lines.push(entries.join(',\n'));
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/** The aggregation rules a baseline metric may declare. */
const AGGREGATIONS: readonly string[] = ['mean', 'sum', 'min', 'max'];
const METHODS: readonly string[] = Object.values(STANDARD_ERROR_METHOD);

function metricProblems(entry: unknown, position: number): string[] {
  const at = `metrics[${String(position)}]`;
  if (!isPlainObject(entry)) return [`${at} is not an object.`];
  const metricId = entry['metricId'];
  if (typeof metricId !== 'string' || metricId.length === 0) {
    return [`${at}.metricId must be a non-empty string.`];
  }
  const where = `metric ${metricId}`;
  const problems: string[] = [];

  if (!Number.isInteger(entry['definitionVersion'])) {
    problems.push(`${where} has no integer definitionVersion.`);
  }
  if (!AGGREGATIONS.includes(entry['aggregation'] as string)) {
    problems.push(`${where} declares aggregation ${String(entry['aggregation'])}.`);
  }
  if (typeof entry['unit'] !== 'string' || (entry['unit'] as string).length === 0) {
    problems.push(`${where} has no unit.`);
  }

  const status = entry['status'];
  if (status === 'measured') {
    for (const key of ['value', 'standardError', 'tolerance']) {
      const value = entry[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        problems.push(`${where} has no finite ${key}.`);
      }
    }
    if (typeof entry['standardError'] === 'number' && (entry['standardError'] as number) < 0) {
      problems.push(`${where} has a negative standardError.`);
    }
    if (typeof entry['tolerance'] === 'number' && (entry['tolerance'] as number) < 0) {
      problems.push(`${where} has a negative tolerance.`);
    }
    if (!METHODS.includes(entry['standardErrorMethod'] as string)) {
      problems.push(
        `${where} declares standardErrorMethod ${String(entry['standardErrorMethod'])}, which is ` +
          `not one of ${METHODS.join(', ')}. A tolerance whose estimator is unnamed is a number ` +
          'nobody can check.',
      );
    }
    const sampleSize = entry['sampleSize'];
    if (!Number.isInteger(sampleSize) || (sampleSize as number) < 0) {
      problems.push(`${where} has no non-negative integer sampleSize.`);
    }
  } else if (status === 'unavailable') {
    const reasons = entry['reasons'];
    if (!Array.isArray(reasons) || reasons.some((reason) => typeof reason !== 'string')) {
      problems.push(`${where} is unavailable and must list its reason codes as strings.`);
    } else if (reasons.length === 0) {
      problems.push(
        `${where} is unavailable and names no reason. "Unavailable" without a reason code is the ` +
          'ambiguity the reason codes exist to end.',
      );
    }
  } else {
    problems.push(`${where} has status ${String(status)}; expected "measured" or "unavailable".`);
  }

  return problems;
}

/**
 * Every way `value` fails to be a usable baseline, as sorted lines.
 *
 * Returns lines rather than throwing, and returns *all* of them, so that a
 * baseline broken in three ways costs one round trip. An empty array is the only
 * thing the gate accepts.
 */
export function baselineProblems(value: unknown): string[] {
  if (!isPlainObject(value)) return ['the baseline is not a JSON object.'];
  const problems: string[] = [];

  if (value['baselineFormatVersion'] !== BASELINE_FORMAT_VERSION) {
    problems.push(
      `baselineFormatVersion is ${String(value['baselineFormatVersion'])}, and this build reads ` +
        `${String(BASELINE_FORMAT_VERSION)}.`,
    );
  }
  for (const key of ['sweepId', 'kind', 'configurationHash', 'rationale', 'contentHash']) {
    const field = value[key];
    if (typeof field !== 'string' || field.length === 0) {
      problems.push(`${key} must be a non-empty string.`);
    }
  }
  if (typeof value['rationale'] === 'string' && (value['rationale'] as string).trim().length === 0) {
    problems.push('rationale is blank. A baseline with no stated reason is a silent regeneration.');
  }
  for (const key of ['rootSeed', 'runCount']) {
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0) {
      problems.push(`${key} must be a non-negative integer.`);
    }
  }
  const toleranceK = value['toleranceK'];
  if (typeof toleranceK !== 'number' || !Number.isFinite(toleranceK) || toleranceK <= 0) {
    problems.push(
      'toleranceK must be a positive number. It is the k of the k-standard-error rule and the ' +
        'baseline is where it is recorded, not the code.',
    );
  }
  const supersedes = value['supersedes'];
  if (supersedes !== null && (typeof supersedes !== 'string' || supersedes.length === 0)) {
    problems.push('supersedes must be the superseded baseline\'s contentHash, or null.');
  }
  if (!Array.isArray(value['supersededDeltas'])) {
    problems.push('supersededDeltas must be an array, empty for a first baseline.');
  }
  const notes = value['notes'];
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    problems.push('notes must be an array of strings.');
  }

  for (const line of provenanceProblems(value['provenance'] as Provenance | undefined)) {
    problems.push(line);
  }

  const metrics = value['metrics'];
  if (!Array.isArray(metrics)) {
    problems.push('metrics must be an array with one entry per gated metric.');
  } else if (metrics.length === 0) {
    problems.push('metrics is empty, so this baseline gates nothing and would pass forever.');
  } else {
    const seen = new Set<string>();
    let previous = '';
    for (let index = 0; index < metrics.length; index += 1) {
      for (const line of metricProblems(metrics[index], index)) problems.push(line);
      const id = (metrics[index] as Record<string, unknown>)['metricId'];
      if (typeof id !== 'string') continue;
      if (seen.has(id)) problems.push(`metric ${id} appears twice.`);
      seen.add(id);
      if (id < previous) {
        problems.push(
          `metric ${id} follows ${previous}, so the metric lines are not sorted. Sorted order is ` +
            'what makes a diff of two baselines readable.',
        );
      }
      previous = id;
    }
  }

  // Last, because a hash mismatch on an already-malformed file is noise.
  if (problems.length === 0) {
    const expected = baselineContentHash(value as unknown as Baseline);
    if (expected !== value['contentHash']) {
      problems.push(
        `contentHash is ${String(value['contentHash'])} and the file's contents hash to ` +
          `${expected}. A baseline is written by the regeneration command, which is the only ` +
          'thing that recomputes this hash. A mismatch means the file was edited by hand — ' +
          'widening a tolerance that way is a baseline regeneration without a rationale, which ' +
          'is the one thing the command exists to prevent.',
      );
    }
  }

  return problems.sort();
}

/**
 * Parses baseline text.
 *
 * @returns the baseline, or the reasons it is unusable. Never both.
 */
export function parseBaseline(
  text: string,
): { readonly baseline: Baseline } | { readonly problems: readonly string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    return { problems: [`the baseline is not valid JSON: ${(error as Error).message}`] };
  }
  const problems = baselineProblems(parsed);
  if (problems.length > 0) return { problems };
  return { baseline: parsed as Baseline };
}

/** A baseline's metric lines, keyed by id. */
export function baselineMetrics(baseline: Baseline): Map<string, BaselineMetric> {
  return new Map(baseline.metrics.map((metric) => [metric.metricId, metric]));
}

/**
 * One top-level field's exact bytes inside {@link encodeBaseline}'s output.
 *
 * Exists so that "the metric block did not change" can be asserted on the
 * **file text** rather than on two in-memory arrays. The re-seal command's whole
 * claim is that it touched no metric, and an object comparison would still pass
 * if the printer's output had moved underneath it — which is the same class of
 * mistake as a checker that answers about the wrong input.
 *
 * The parse is trivial because the printer is: top-level keys are the only lines
 * that begin with exactly two spaces and a quote, so the field runs from its own
 * label to the next such line, or to the closing brace.
 *
 * @returns the span, or `undefined` when the text carries no such field.
 */
export function encodedFieldSpan(text: string, key: string): string | undefined {
  const label = `\n  ${JSON.stringify(key)}: `;
  const start = text.indexOf(label);
  if (start < 0) return undefined;
  const rest = text.slice(start + 1);
  const nextKey = /\n {2}"/.exec(rest);
  const nextClose = rest.indexOf('\n}');
  const ends = [nextKey === null ? -1 : nextKey.index, nextClose].filter((at) => at >= 0);
  const end = ends.length === 0 ? rest.length : Math.min(...ends);
  return rest.slice(0, end);
}
