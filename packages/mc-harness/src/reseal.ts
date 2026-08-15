/*
 * Multiverse Mages — provenance-only re-seal of a committed balance baseline.
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
 * A **re-seal** is the other half of `regenerate.ts`, and it exists because the
 * two things a baseline carries — *what this build measured* and *which build
 * that was* — could only be changed together, and they are not the same claim.
 *
 * The gate refuses `baseline-invalid` on a `provenance` mismatch **before it
 * reads a single metric**. So a change that moves the content revision without
 * moving any behaviour — new authored prose, a node the enabled cells cannot
 * reach, a comment inside the hashed preimage — makes every content-touching
 * branch fail a required check, with no expressible remedy short of
 * re-recording numbers that did not move. Re-recording is the more dangerous
 * act: it costs a merge conflict to every other branch, and it silently banks
 * whatever else has drifted in the meantime.
 *
 * ## What this is allowed to do, and what it must never do
 *
 * It replaces `provenance`, appends one note, and recomputes `contentHash`.
 * **Every metric line passes through byte for byte.** `resealCommand` in
 * `balance-cli.ts` asserts that against the encoded file text before it writes,
 * and refuses if the assertion fails.
 *
 * ## Why it runs a sweep anyway
 *
 * *"Update the provenance without re-measuring"* is a statement about what gets
 * **written**, not about what gets **checked**. A content hash is opaque: nothing
 * in it says whether behaviour moved. So the only sound way to know that a
 * re-seal is the right tool is to measure and then throw the measurement away.
 *
 * That is what this does. The verification sweep is the same sweep the gate
 * runs, at the same cost — four seconds, twenty-seven, and ten for the three
 * gates inside the required check — and **not one of its numbers is written**.
 * If any gated metric has left its committed tolerance, or become available, or
 * stopped being available, or changed its `definitionVersion`, this refuses and
 * says which. A re-seal over a real movement would hide a regression behind a
 * fresh seal, which is the one outcome worse than the blocked merge it fixes.
 *
 * There is deliberately **no `--force`, no `--skip-verify` and no dry variant
 * that writes**. `reachability:pin` is the cautionary case: a tool that writes a
 * whole file from the current report banks every unpinned finding, the author's
 * and everyone else's, in one undifferentiated write. The instrument that stops
 * this being the same failure is {@link ResealResult.drift} — every gated
 * metric's observed movement, reported on every run including the passing ones,
 * and the largest of them written into the note where it stays in the file. The
 * author sees exactly what they are sealing over.
 */

import type { Baseline, BaselineMetric, UnhashedBaseline } from './baseline.js';
import { sealBaseline } from './baseline.js';
import { canonicalJson } from './canonical.js';
import type { GateComparison } from './gate.js';
import { GATE_STATUS, compareToBaseline, provenanceMismatches } from './gate.js';
import type { Provenance } from './protocol.js';
import type { SweepSummary } from './records.js';

/** Everything {@link resealBaseline} needs. */
export interface ResealInput {
  /** The committed baseline, as parsed from its file. */
  readonly baseline: Baseline;
  /** A verification sweep of this build. Its numbers are read and discarded. */
  readonly summary: SweepSummary;
  /** The calendar date the re-seal was taken, `YYYY-MM-DD`. Goes in the note. */
  readonly sealedOn: string;
  /** Extra context, appended after the mandatory note rather than replacing it. */
  readonly notes?: readonly string[];
}

/** One gated metric's observed movement. Reported always; written never. */
export interface ResealDrift {
  readonly metricId: string;
  /** The value committed in the baseline, which the re-seal preserves. */
  readonly baselineValue: number | null;
  /** What the verification sweep measured. Discarded after this line is printed. */
  readonly observedValue: number | null;
  readonly delta: number | null;
  readonly deltaInStandardErrors: number | null;
  readonly tolerance: number | null;
}

/** A re-sealed baseline, or every reason the command refused to write one. */
export type ResealResult =
  | {
      readonly baseline: Baseline;
      /** The provenance keys that moved, oldest form first. For the report. */
      readonly movedKeys: readonly string[];
      /** Every gated metric's observed movement, including the zero ones. */
      readonly drift: readonly ResealDrift[];
    }
  | { readonly problems: readonly string[] };

/** The provenance keys, in the order a reader wants them. */
const PROVENANCE_KEYS = [
  'buildVersion',
  'contentHash',
  'rngRegistryHash',
  'observationSchemaVersion',
  'observationLayoutDigest',
  'metricDefinitionVersions',
] as const;

/**
 * A provenance value as prose. **Never elided.**
 *
 * An earlier draft shortened long hashes to `abcdef12…9f3c`, which collapsed the
 * two fixture revisions to one string and would have made every real note
 * unverifiable: a reader who cannot check the revision a note names is being
 * asked to take the note's word for it, which is the whole failure mode the note
 * exists to prevent.
 */
function full(value: unknown): string {
  return typeof value === 'string' ? value : canonicalJson(value as never, 'provenance');
}

/** Names every provenance key on which the two blocks differ, as `key was → now`. */
function movedProvenanceKeys(was: Provenance, now: Provenance): string[] {
  const moved: string[] = [];
  for (const key of PROVENANCE_KEYS) {
    const before = canonicalJson(was[key] as never, `provenance.${key}`);
    const after = canonicalJson(now[key] as never, `provenance.${key}`);
    if (before === after) continue;
    moved.push(
      key === 'metricDefinitionVersions'
        ? 'provenance.metricDefinitionVersions moved (the metric registry changed)'
        : `provenance.${key} ${full(was[key])} → ${full(now[key])}`,
    );
  }
  return moved;
}

/** The drift line for one comparison. */
function driftOf(comparison: GateComparison): ResealDrift {
  return {
    metricId: comparison.metricId,
    baselineValue: comparison.baselineValue,
    observedValue: comparison.currentValue,
    delta: comparison.delta,
    deltaInStandardErrors: comparison.deltaInStandardErrors,
    tolerance: comparison.tolerance,
  };
}

/** `+0.41 SE`, or a dash when the baseline had no scale to express a move in. */
export function describeDrift(drift: ResealDrift): string {
  if (drift.deltaInStandardErrors === null) {
    return drift.delta === null || drift.delta === 0
      ? `${drift.metricId}: unmoved`
      : `${drift.metricId}: ${drift.delta > 0 ? '+' : ''}${String(drift.delta)} (no scale)`;
  }
  const sigma = drift.deltaInStandardErrors;
  return `${drift.metricId}: ${sigma > 0 ? '+' : ''}${sigma.toFixed(2)} SE`;
}

/** The single largest observed movement, for the note. */
function largestDrift(drift: readonly ResealDrift[]): string {
  let worst: ResealDrift | undefined;
  for (const entry of drift) {
    const magnitude = Math.abs(entry.deltaInStandardErrors ?? 0);
    const incumbent = Math.abs(worst?.deltaInStandardErrors ?? 0);
    if (worst === undefined || magnitude > incumbent) worst = entry;
  }
  if (worst === undefined) return 'no gated metric was compared';
  if ((worst.deltaInStandardErrors ?? 0) === 0) {
    return 'every gated metric read exactly its committed value';
  }
  return describeDrift(worst);
}

/**
 * The note a re-seal appends. Never replaces the existing notes.
 *
 * `regenerate.ts` defaults `notes` to `[]`, so a regeneration that forgets the
 * flag drops every note the previous baseline carried — and a file that lost
 * four caveats is indistinguishable from one that never had them. A re-seal
 * appends, and says in plain words that nothing here was measured, so that a
 * later reader cannot mistake the fresh seal for a fresh measurement.
 */
export function resealNote(input: {
  readonly sealedOn: string;
  readonly previousContentHash: string;
  readonly movedKeys: readonly string[];
  readonly runCount: number;
  readonly toleranceK: number;
  readonly drift: readonly ResealDrift[];
}): string {
  return (
    `Re-sealed ${input.sealedOn}: PROVENANCE ONLY. No metric in this file was re-measured and no ` +
    `metric value changed — every metric line below is the one sealed under contentHash ` +
    `${input.previousContentHash}, byte for byte. ` +
    `${input.movedKeys.join('; ')}. ` +
    `A verification sweep of ${String(input.runCount)} runs was executed for the sole purpose of ` +
    `establishing that every gated metric was still inside the tolerance committed here ` +
    `(k = ${String(input.toleranceK)}); its numbers were read and discarded, and the largest ` +
    `movement it saw was ${largestDrift(input.drift)}. ` +
    `So read these values as a measurement of the build the PREVIOUS provenance names, re-sealed ` +
    `against the current one — not as a measurement taken against the current one.`
  );
}

/** The refusal text for one metric the re-seal will not seal over. */
function metricRefusal(comparison: GateComparison): string {
  const moved =
    comparison.deltaInStandardErrors === null
      ? comparison.reason ?? 'it could not be compared'
      : `it moved ${comparison.deltaInStandardErrors > 0 ? '+' : ''}` +
        `${comparison.deltaInStandardErrors.toFixed(2)} SE, from ` +
        `${String(comparison.baselineValue)} to ${String(comparison.currentValue)}, past a ` +
        `tolerance of ${String(comparison.tolerance)}`;
  return (
    `${comparison.metricId} is ${comparison.status}: ${moved}. A re-seal claims that only the ` +
    'content revision moved. This metric moved too, so re-sealing would hide a real change ' +
    'behind a fresh seal — which is the failure this command exists to avoid, not to commit. ' +
    'Regenerate the baseline with a rationale, or find out why the number moved.'
  );
}

/**
 * Re-seals a baseline against the build a verification sweep just described, or
 * refuses and says why.
 *
 * Pure: it reads no file and writes none. The write, and the byte-identity
 * assertion over the encoded metric block, live in `balance-cli.ts`.
 */
export function resealBaseline(input: ResealInput): ResealResult {
  const { baseline, summary } = input;
  const problems: string[] = [];

  if (typeof input.sealedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.sealedOn)) {
    problems.push(
      `sealedOn is ${String(input.sealedOn)} and must be a YYYY-MM-DD calendar date. An undated ` +
        'note in the present tense will be read as current for as long as it survives.',
    );
  }

  const report = compareToBaseline({ baseline, summary });

  // The *only* invalidations a re-seal is licensed to clear are the provenance
  // ones. Everything else compared here — a different sweep, a different root
  // seed, a disqualified sweep — is a statement that these numbers describe a
  // different experiment, and no seal makes that true.
  const clearable = new Set(provenanceMismatches(baseline.provenance, summary.provenance));
  for (const invalidation of report.invalidations) {
    if (clearable.has(invalidation)) continue;
    problems.push(
      `${invalidation} This is not a provenance mismatch, so a re-seal cannot clear it.`,
    );
  }

  if (baseline.runCount !== summary.runCount) {
    problems.push(
      `the baseline was recorded over ${String(baseline.runCount)} runs and the verification sweep ` +
        `dispatched ${String(summary.runCount)}. A re-seal preserves the committed sample, so the ` +
        'two must be the same experiment.',
    );
  }

  const drift: ResealDrift[] = [];
  for (const comparison of report.comparisons) {
    if (comparison.status === GATE_STATUS.pass || comparison.status === GATE_STATUS.notGated) {
      drift.push(driftOf(comparison));
      continue;
    }
    problems.push(metricRefusal(comparison));
  }

  const movedKeys = movedProvenanceKeys(baseline.provenance, summary.provenance);
  if (movedKeys.length === 0) {
    problems.push(
      'the baseline already carries this build\'s provenance, so there is nothing to re-seal and ' +
        'nothing was written. A re-seal that changed only the file\'s hash would be a commit that ' +
        'claims something happened when nothing did.',
    );
  }

  if (problems.length > 0) return { problems: problems.sort() };

  const metrics: readonly BaselineMetric[] = baseline.metrics;
  const note = resealNote({
    sealedOn: input.sealedOn,
    previousContentHash: baseline.contentHash,
    movedKeys,
    runCount: summary.runCount,
    toleranceK: baseline.toleranceK,
    drift,
  });

  const unhashed: UnhashedBaseline = {
    baselineFormatVersion: baseline.baselineFormatVersion,
    sweepId: baseline.sweepId,
    kind: baseline.kind,
    rootSeed: baseline.rootSeed,
    configurationHash: baseline.configurationHash,
    runCount: baseline.runCount,
    toleranceK: baseline.toleranceK,
    // The one substantive change.
    provenance: summary.provenance,
    rationale: baseline.rationale,
    notes: [...baseline.notes, note, ...(input.notes ?? [])],
    // Untouched on purpose: a re-seal supersedes no numbers, so it must not
    // claim to. The hash it replaces is named in the note instead, which keeps
    // it in the diff and inside the new hash without minting a format change.
    supersedes: baseline.supersedes,
    supersededDeltas: baseline.supersededDeltas,
    metrics,
  };

  return { baseline: sealBaseline(unhashed), movedKeys, drift };
}
