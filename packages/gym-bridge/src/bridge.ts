/*
 * Multiverse Mages — the frame dispatcher: a handshake, a verb table, and no I/O.
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
 * Lines in, lines out. Nothing here reads a descriptor, spawns a process, or
 * knows that stdin exists.
 *
 * That is the same split `mc-harness/src/cli.ts` makes and for the same reason
 * it gives: *"a CLI whose logic is in the shell is a CLI nobody unit tests, and
 * the branches that matter … are exactly the ones that only run on a bad day."*
 * Here the bad-day branches are the whole point — a malformed line, a stale
 * digest, a step against an env that died — so every one of them is reachable
 * from a test that passes a string and reads a string.
 *
 * `bin/serve.mjs` owns the two things this file cannot: `process.argv`, and the
 * dynamic `import()` of the caller's scenario module.
 *
 * ## The handshake is a state machine with one door
 *
 * Nothing but `hello` is answered before `hello`. A client that opens with
 * `reset` gets `handshake-required` and no episode, because the entire value of
 * the contract check is that it happens *before the first observation exists* —
 * a policy handed one differently-meaning vector has already been contaminated,
 * and the run that produces it looks exactly like a run that did not.
 */

import { OBSERVATION_SLOTS, layoutEncoding } from '@mm/agent-api';

import type { ContractInput } from './contract.js';
import {
  advisoryMismatches,
  describeMismatches,
  publishedContract,
  structuralMismatches,
} from './contract.js';
import { FrameDecodeError, decodeFrame, encodeFrame } from './codec.js';
import type {
  ContractMismatch,
  ErrorCode,
  ErrorFrame,
  ObservationContract,
  Response,
  StepView,
  Verb,
} from './protocol.js';
import { ALL_VERBS, ERROR_CODE, VERB, isFatal } from './protocol.js';
import type { VectorOptions } from './vector.js';
import { EnvVector } from './vector.js';

/** How a bridge is built. */
export interface BridgeOptions extends VectorOptions, Omit<ContractInput, 'scenarioId'> {
  /**
   * The scenario id published in the contract.
   *
   * Defaults to the scenario's own. Overridable so a caller running a variant
   * can say which variant it was, rather than every run recording the same id.
   */
  readonly scenarioId?: string;
}

/** What one line of input produced. */
export interface BridgeReply {
  /** Frame lines to write to stdout, in order. Each ends in one `\n`. */
  readonly lines: readonly string[];
  /** Whether the bridge is refusing to continue. The caller exits non-zero. */
  readonly fatal: boolean;
  /** Whether the client asked to close. The caller exits zero. */
  readonly closed: boolean;
}

/** The lines-in, lines-out boundary a shell wraps. */
export interface Bridge {
  /** What this build publishes. Available before any frame arrives. */
  readonly contract: ObservationContract;
  readonly envCount: number;
  /** Handles one input line. */
  handleLine(line: string): BridgeReply;
  /** The env vector, for a caller recording an episode in-process. */
  readonly vector: EnvVector;
}

const CONTINUE = { fatal: false, closed: false } as const;

export function createBridge(options: BridgeOptions): Bridge {
  const vector = new EnvVector(options);
  const contract = publishedContract({
    scenarioId: options.scenarioId ?? vector.scenarioId,
    ...(options.contentHash === undefined ? {} : { contentHash: options.contentHash }),
    buildVersion: options.buildVersion,
  });

  let greeted = false;

  const fail = (
    id: unknown,
    code: ErrorCode,
    message: string,
    mismatches?: readonly ContractMismatch[],
  ): BridgeReply => {
    const frame: ErrorFrame = {
      type: 'error',
      ...idField(id),
      code,
      message,
      ...(mismatches === undefined ? {} : { mismatches }),
      fatal: isFatal(code),
    };
    return { lines: [encodeFrame(frame)], fatal: isFatal(code), closed: false };
  };

  const reply = (frame: Response): BridgeReply => ({
    lines: [encodeFrame(frame)],
    ...CONTINUE,
  });

  const handleHello = (frame: Record<string, unknown>): BridgeReply => {
    const expect = frame['expect'] as Partial<ObservationContract> | undefined;
    if (expect !== undefined && (typeof expect !== 'object' || Array.isArray(expect))) {
      return fail(frame['id'], ERROR_CODE.badRequest, 'hello.expect must be an object.');
    }
    const structural = structuralMismatches(contract, expect);
    if (structural.length > 0) {
      return fail(
        frame['id'],
        ERROR_CODE.contractMismatch,
        'This build does not serve the environment the client expects, so no observation will be ' +
          `emitted. ${describeMismatches(structural)}. A policy trained against one observation ` +
          'layout loaded against another produces a plausible number rather than a failure, which ' +
          'is why this refuses rather than warns.',
        structural,
      );
    }
    greeted = true;
    return reply({
      type: 'ready',
      ...idField(frame['id']),
      contract,
      envCount: vector.envCount,
      advisories: advisoryMismatches(contract, expect),
    });
  };

  const handleDescribe = (frame: Record<string, unknown>): BridgeReply =>
    reply({
      type: 'layout',
      ...idField(frame['id']),
      // `agent-api`'s own encoding, transported verbatim. `digest.ts` exports it
      // because *"a digest whose input cannot be inspected is a digest nobody
      // can debug"*, and argues FNV-1a was chosen so a second implementation can
      // follow it *"from the document rather than from the source"*. This is
      // that second implementation being given the document.
      encoding: layoutEncoding(OBSERVATION_SLOTS),
      observationLayoutDigest: contract.observationLayoutDigest,
      observationSchemaVersion: contract.observationSchemaVersion,
    });

  const handleReset = (frame: Record<string, unknown>): BridgeReply => {
    const entries = frame['envs'];
    if (!Array.isArray(entries) || entries.length === 0) {
      return fail(
        frame['id'],
        ERROR_CODE.badRequest,
        'reset.envs must be a non-empty array of {env, runSeed, worldTickCap}.',
      );
    }
    // Validated wholesale before anything is reset, so a frame naming one bad
    // env leaves every other env exactly as it was rather than half-restarted.
    for (const entry of entries as Record<string, unknown>[]) {
      const env = entry['env'];
      if (typeof env !== 'number' || !vector.has(env)) {
        return fail(
          frame['id'],
          ERROR_CODE.unknownEnv,
          `Env ${String(env)} is outside 0..${String(vector.envCount - 1)}. No env was reset.`,
        );
      }
      if (typeof entry['runSeed'] !== 'number' || typeof entry['worldTickCap'] !== 'number') {
        return fail(
          frame['id'],
          ERROR_CODE.badRequest,
          `Env ${String(env)} names runSeed ${String(entry['runSeed'])} and worldTickCap ` +
            `${String(entry['worldTickCap'])}; both must be numbers. The seed is the client's — ` +
            'this bridge derives none - so an absent one cannot be filled in.',
        );
      }
    }

    const views = (entries as Record<string, unknown>[]).map((entry) => {
      const options_ = entry['options'] as
        | Readonly<Record<string, number | string | boolean>>
        | undefined;
      return vector.reset(entry['env'] as number, entry['runSeed'] as number, {
        worldTickCap: entry['worldTickCap'] as number,
        ...(options_ === undefined ? {} : { options: options_ }),
      });
    });
    return reply({ type: 'observation', ...idField(frame['id']), envs: views });
  };

  const handleStep = (frame: Record<string, unknown>): BridgeReply => {
    const entries = frame['envs'];
    if (!Array.isArray(entries) || entries.length === 0) {
      return fail(
        frame['id'],
        ERROR_CODE.badRequest,
        'step.envs must be a non-empty array of {env, action, slot?}.',
      );
    }
    for (const entry of entries as Record<string, unknown>[]) {
      const env = entry['env'];
      if (typeof env !== 'number' || !vector.has(env)) {
        return fail(
          frame['id'],
          ERROR_CODE.unknownEnv,
          `Env ${String(env)} is outside 0..${String(vector.envCount - 1)}. No env advanced.`,
        );
      }
      if (typeof entry['action'] !== 'number') {
        return fail(
          frame['id'],
          ERROR_CODE.badRequest,
          `Env ${String(env)} names action ${String(entry['action'])}, which is not a number. An ` +
            'action id outside §4.2’s table is an ordinary illegal action; an action that is ' +
            'not a number at all is a client bug, and conflating the two would hide it inside ' +
            'illegalActionRate.',
        );
      }
      const fault = vector.faultOf(env);
      if (fault === 'no-episode') {
        return fail(
          frame['id'],
          ERROR_CODE.noEpisode,
          `Env ${String(env)} has no episode. Call reset first; no env advanced.`,
        );
      }
      if (fault === 'episode-over') {
        return fail(
          frame['id'],
          ERROR_CODE.episodeOver,
          `Env ${String(env)} is ${vector.sessionAt(env).status()} and cannot be advanced. Reset ` +
            'it to start another episode. No env advanced.',
        );
      }
    }

    const views: StepView[] = (entries as Record<string, unknown>[]).map((entry) => {
      const slot = entry['slot'];
      return vector.step(
        entry['env'] as number,
        entry['action'] as number,
        typeof slot === 'number' ? slot : undefined,
      );
    });
    return reply({ type: 'step', ...idField(frame['id']), envs: views });
  };

  return {
    contract,
    envCount: vector.envCount,
    vector,

    handleLine(line: string): BridgeReply {
      let frame: Record<string, unknown>;
      try {
        frame = decodeFrame(line);
      } catch (error) {
        const detail = error instanceof FrameDecodeError ? error.message : String(error);
        return fail(undefined, ERROR_CODE.malformedFrame, detail);
      }

      const type = frame['type'];
      if (typeof type !== 'string' || !(ALL_VERBS as readonly string[]).includes(type)) {
        return fail(
          frame['id'],
          ERROR_CODE.unknownVerb,
          `No verb named ${JSON.stringify(type)}. This bridge accepts: ${ALL_VERBS.join(', ')}.`,
        );
      }

      if (!greeted && type !== VERB.hello) {
        return fail(
          frame['id'],
          ERROR_CODE.handshakeRequired,
          `A ${type} frame arrived before hello. The observation contract is checked before the ` +
            'first observation exists, because a policy handed one differently-meaning vector has ' +
            'already been contaminated and the run looks exactly like a run that was not.',
        );
      }

      switch (type as Verb) {
        case VERB.hello:
          return handleHello(frame);
        case VERB.describe:
          return handleDescribe(frame);
        case VERB.reset:
          return handleReset(frame);
        case VERB.step:
          return handleStep(frame);
        case VERB.close:
          return {
            lines: [encodeFrame({ type: 'closed', ...idField(frame['id']) })],
            fatal: false,
            closed: true,
          };
      }
    },
  };
}

/** The request id, present only when the request carried one. */
function idField(id: unknown): { id?: number | string } {
  return typeof id === 'number' || typeof id === 'string' ? { id } : {};
}
