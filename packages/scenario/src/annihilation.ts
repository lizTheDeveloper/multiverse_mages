/*
 * Multiverse Mages — attribution for the fixed-point annihilation sentinel.
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
 * Turns the raw events {@link installAnnihilationSentinel} emits into the thing
 * a reader can act on: which *function* floors a non-zero quantity to zero, and
 * on what fraction of ticks it does so.
 *
 * `sim-core` reports operands and nothing else, on purpose — it performs no I/O
 * and cannot afford a stack capture on a hot path. Attribution therefore lives
 * here, in the composition root, where a stack is affordable because the
 * sentinel is only ever installed by a diagnostic or a test.
 *
 * ## Why the key is a function name and not a line
 *
 * The obvious key is `file:line:column`, and it is the wrong one: it moves
 * whenever anything above it in the file moves, so a registry built on it
 * would fail on an unrelated edit and be re-blessed until it meant nothing.
 * A function name moves only when the function is renamed, which is a change
 * worth a reviewer's attention anyway.
 */

import type { FixedPointAnnihilation } from '@mm/sim-core';
import { installAnnihilationSentinel } from '@mm/sim-core';

/** How deep to look for the rules-path frame that asked for the scaling. */
const STACK_DEPTH = 8;

/** One function that annihilated, and how persistently. */
export interface AnnihilationSite {
  /** `module:functionName`, or `module:<anonymous>`. */
  readonly site: string;
  /** Fraction of observed ticks on which this site annihilated at all. */
  readonly persistence: number;
  /** Ticks on which it annihilated at least once. */
  readonly ticks: number;
  /** Total annihilating operations. */
  readonly events: number;
  /** The first event seen, for a report that can show operands. */
  readonly sample: FixedPointAnnihilation;
}

/** Records annihilations while `body` runs, attributing each to a function. */
export class AnnihilationRecorder {
  readonly #sites = new Map<
    string,
    { ticks: Set<number>; events: number; sample: FixedPointAnnihilation }
  >();
  #tick = 0;
  #observed = 0;

  /**
   * Declares which tick subsequent events belong to.
   *
   * Persistence is a per-tick measure because a stall is a site that fires
   * *again and again*, and a site that fires a thousand times inside one tick
   * and never again is a different thing entirely.
   */
  atTick(tick: number): void {
    this.#tick = tick;
    this.#observed = Math.max(this.#observed, tick + 1);
  }

  /** Installs the sentinel, runs `body`, and always restores what was there. */
  record<T>(body: () => T): T {
    const previous = installAnnihilationSentinel((event) => {
      this.#note(event);
    });
    try {
      return body();
    } finally {
      installAnnihilationSentinel(previous);
    }
  }

  #note(event: FixedPointAnnihilation): void {
    const site = attributeToCaller();
    const existing = this.#sites.get(site);
    if (existing === undefined) {
      this.#sites.set(site, { ticks: new Set([this.#tick]), events: 1, sample: event });
      return;
    }
    existing.events += 1;
    existing.ticks.add(this.#tick);
  }

  /** Every site seen, most persistent first. */
  sites(): readonly AnnihilationSite[] {
    const denominator = Math.max(this.#observed, 1);
    return [...this.#sites.entries()]
      .map(([site, entry]) => ({
        site,
        persistence: entry.ticks.size / denominator,
        ticks: entry.ticks.size,
        events: entry.events,
        sample: entry.sample,
      }))
      .sort((a, b) => b.persistence - a.persistence || b.events - a.events);
  }

  /** Just the names, sorted, which is what a registry test compares. */
  siteNames(): readonly string[] {
    return [...this.#sites.keys()].sort();
  }
}

/**
 * The first stack frame below the fixed-point module and this file: the
 * rules-path function that asked for the scaling.
 */
function attributeToCaller(): string {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = STACK_DEPTH;
  const stack = new Error('annihilation').stack ?? '';
  Error.stackTraceLimit = limit;

  for (const raw of stack.split('\n').slice(1)) {
    const line = raw.trim();
    if (!line.startsWith('at ')) continue;

    const named = /^at ([^\s(]+) \(([^)]+)\)$/.exec(line);
    const file = named === null ? /^at (.+)$/.exec(line)?.[1] : named[2];
    if (file === undefined) continue;

    // Skip only the two modules that are part of the instrument itself, matched
    // on the file name rather than the whole frame. Matching a substring of the
    // frame would also skip any caller whose *own* file happened to be named
    // for what it tests — which is exactly what this module's test is called.
    const module = basename(file);
    if (module === 'fixed-point' || module === 'annihilation') continue;

    return `${module}:${named === null ? '<anonymous>' : (named[1] ?? '<anonymous>')}`;
  }
  return '(unattributed)';
}

/**
 * `.../god/worship.js:174:18` -> `worship`.
 *
 * The extension is dropped because it is not a property of the code: vitest
 * transforms TypeScript and reports `worship.ts`, while a script loading
 * `dist/` reports `worship.js`. A registry keyed on either would pass under one
 * runner and fail under the other.
 */
function basename(location: string): string {
  const withoutPosition = location.replace(/:\d+:\d+$/, '');
  const cut = withoutPosition.lastIndexOf('/');
  const file = cut === -1 ? withoutPosition : withoutPosition.slice(cut + 1);
  return file.replace(/\.(?:js|ts|mjs|cjs|mts|cts)$/, '');
}
