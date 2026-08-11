/*
 * Multiverse Mages — the observation contract a handshake pins, and what a
 * mismatch means.
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
 * `agent-api/src/digest.ts` exists so that *"a baseline [can] refuse to compare
 * itself against a build whose observation means something else."* A trained
 * policy is the same kind of consumer with a worse failure mode: a baseline
 * that silently compares produces a wrong number, and a checkpoint that
 * silently loads produces a policy whose inputs mean something else while every
 * array shape still matches and nothing anywhere fails.
 *
 * So the digest is not merely reported here — it is *checked*, before the first
 * observation exists.
 *
 * ## The two halves, and why the line is drawn where it is
 *
 * **Structural** — protocol version, schema version, layout digest, observation
 * size, action space size, candidate slot counts. These are the quantities a
 * policy's *shape and index semantics* depend on. A disagreement is fatal: one
 * error frame, no observation, non-zero exit.
 *
 * **Advisory** — scenario id, content hash, build version. `proposal.md` asks
 * whether the identifier should hash the content set too, *"so that a retuned
 * universe is visibly a different environment"*, and immediately answers: *"That
 * may be too strict to be usable during balance tuning, which retunes
 * constantly."* It is too strict. A bridge that refused to start after every
 * primitive tweak is a bridge people run with the check disabled, which is
 * strictly worse than one that reports. So these ride in every `ready` frame's
 * advisories and in every episode record's header, and the researcher decides.
 *
 * ## Comparison is over rendered text, not over values
 *
 * Every field compares as a string. Two reasons, and the second is the load-
 * bearing one:
 *
 * 1. The fields are heterogeneous — integers, hex strings, and a map of integers
 *    — and a per-type comparison is a per-type opportunity to get one wrong.
 * 2. A client declaring `observationSize: "400"` because its JSON came from a
 *    YAML file that quotes numbers should *match*, not fail. A JavaScript `===`
 *    would refuse it, and the refusal would be about the client's serializer
 *    rather than about the environment.
 */

import {
  ACTION_SPACE_SIZE,
  CANDIDATE_SLOTS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIZE,
  PARAMETERIZED_ACTIONS,
} from '@mm/agent-api';

import type { ContractMismatch, ObservationContract } from './protocol.js';
import {
  ADVISORY_CONTRACT_FIELDS,
  PROTOCOL_VERSION,
  STRUCTURAL_CONTRACT_FIELDS,
} from './protocol.js';

/** What a caller must tell the bridge about the build it is serving. */
export interface ContractInput {
  readonly scenarioId: string;
  /** §0's content revision. `unknown` when the scenario declares none. */
  readonly contentHash?: string;
  readonly buildVersion: string;
}

/** When a scenario module declares no content revision. Recorded, never faked. */
export const UNKNOWN_CONTENT_HASH = 'unknown';

/**
 * §4.4's pinned `k` per parameterized action, keyed by the action id as text.
 *
 * Read from `agent-api`'s own table rather than transcribed. A second copy of
 * these numbers would be a second thing to keep in step with §4.4, and the
 * symptom of drift would be a client sampling slot 20 of a list that is 16 wide
 * — an ordinary illegal action, absorbed silently, forever.
 */
export function candidateSlotTable(): Readonly<Record<string, number>> {
  const table: Record<string, number> = {};
  for (const action of PARAMETERIZED_ACTIONS) {
    table[String(action)] = CANDIDATE_SLOTS[action] as number;
  }
  return Object.freeze(table);
}

/** What this build publishes about the environment it serves. */
export function publishedContract(input: ContractInput): ObservationContract {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    observationSize: OBSERVATION_SIZE,
    actionSpaceSize: ACTION_SPACE_SIZE,
    candidateSlots: candidateSlotTable(),
    scenarioId: input.scenarioId,
    contentHash: input.contentHash ?? UNKNOWN_CONTENT_HASH,
    buildVersion: input.buildVersion,
  });
}

/**
 * One field's value as the comparison sees it.
 *
 * The candidate-slot map renders as sorted `id:k` pairs so that two maps built
 * in different key orders compare equal — an object's key order is a property
 * of how it was built and not of what it says.
 */
export function renderField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, held]) => `${key}:${String(held)}`)
      .sort();
    return `{${entries.join(',')}}`;
  }
  return String(value);
}

function compare(
  fields: readonly (keyof ObservationContract)[],
  bridge: ObservationContract,
  client: Partial<ObservationContract> | undefined,
): ContractMismatch[] {
  if (client === undefined) return [];
  const found: ContractMismatch[] = [];
  for (const field of fields) {
    if (!(field in client)) continue;
    const declared = renderField(client[field]);
    const published = renderField(bridge[field]);
    if (declared !== published) {
      found.push({ field: String(field), bridge: published, client: declared });
    }
  }
  return found;
}

/**
 * Every structural disagreement, all at once.
 *
 * All at once rather than first-wins, for the reason `agent-api`'s
 * `layoutProblems` gives for the same choice: a check that reports one fault
 * per run turns a client three fields out of date into three cycles, and the
 * third is where somebody passes `--no-check`.
 */
export function structuralMismatches(
  bridge: ObservationContract,
  client: Partial<ObservationContract> | undefined,
): ContractMismatch[] {
  return compare(STRUCTURAL_CONTRACT_FIELDS, bridge, client);
}

/** Every advisory disagreement. Reported in `ready`, never fatal. */
export function advisoryMismatches(
  bridge: ObservationContract,
  client: Partial<ObservationContract> | undefined,
): ContractMismatch[] {
  return compare(ADVISORY_CONTRACT_FIELDS, bridge, client);
}

/** A mismatch list as the refusal message renders it. */
export function describeMismatches(mismatches: readonly ContractMismatch[]): string {
  return mismatches
    .map((one) => `${one.field}: bridge has ${one.bridge}, client expects ${one.client}`)
    .join('; ');
}
