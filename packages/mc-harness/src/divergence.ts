/*
 * Multiverse Mages — reporting which observation blocks two runs disagree about.
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
 * The `mc-harness` capability spec, *"Strategies differ observably"*:
 *
 * > **WHEN** the passive control, the archivist, and the portal-rush strategy
 * > each run a 200-world-year universe on the same run seed
 * > **THEN** their final observations differ, and the harness reports **which
 * > observation blocks differ**
 *
 * The second half is what this file is for, and it is the half that is easy to
 * skip. "The vectors differ" is a boolean, and a boolean is exactly as
 * informative about a pool's diversity as `expect(a).not.toEqual(b)` — it says
 * two strategies are not the same without saying what they did differently. A
 * block name says it: two strategies that differ only in `ruleset` edited the
 * rules and changed nothing about the world; two that differ in `knowledge`
 * moved the thing §6a says the game is about.
 *
 * ## Exact equality, deliberately
 *
 * No tolerance. §4.1 puts the one permitted floating-point operation on the
 * export path — a division by a pinned integer constant — so two identical
 * integer states export bit-identical doubles, and any difference at all is a
 * difference in the state. A tolerance here would be a tolerance on the
 * question "did these two strategies do the same thing", which is the question.
 */

import type { ObservationBlockName } from '@mm/agent-api';
import { OBSERVATION_BLOCKS, OBSERVATION_SIZE } from '@mm/agent-api';

/** How two observations differ within one §4.1 block. */
export interface BlockDivergence {
  readonly block: ObservationBlockName;
  /** Channels in the block whose values are not exactly equal. */
  readonly differingChannels: number;
  /**
   * The block-relative index of the first differing channel.
   *
   * Block-relative rather than absolute, because a reader chasing it has the
   * block's own channel list in front of them — `layout.ts` names the five
   * `resources` channels in order — and would otherwise have to subtract the
   * offset by hand every time.
   */
  readonly firstChannel: number;
  /** The two values at {@link firstChannel}. */
  readonly left: number;
  readonly right: number;
}

/** The full comparison of two observations. */
export interface ObservationDivergence {
  /** `true` when the two vectors are element-wise identical. */
  readonly identical: boolean;
  /** Blocks that differ, in §4.1's block order. Empty when identical. */
  readonly blocks: readonly BlockDivergence[];
  /** Every differing block's name, for a one-line report. */
  readonly blockNames: readonly ObservationBlockName[];
}

/**
 * Compares two observations block by block.
 *
 * @throws RangeError if either vector is not {@link OBSERVATION_SIZE} long. A
 * short vector compared channel-by-channel would silently report the missing
 * tail as identical — §4.1's *"shape must be constant across a run and across
 * universes"* is precisely the property that makes this comparison meaningful,
 * so a violation of it is an error and not a shrug.
 */
export function observationDivergence(
  left: Float64Array,
  right: Float64Array,
): ObservationDivergence {
  for (const [label, vector] of [
    ['left', left],
    ['right', right],
  ] as const) {
    if (vector.length !== OBSERVATION_SIZE) {
      throw new RangeError(
        `The ${label} observation is ${String(vector.length)} wide, not ${String(OBSERVATION_SIZE)}. ` +
          'contracts.md §4.1 fixes the shape; two vectors of different widths are not two ' +
          'observations of the same interface.',
      );
    }
  }

  const blocks: BlockDivergence[] = [];
  for (const block of OBSERVATION_BLOCKS) {
    let differingChannels = 0;
    let firstChannel = -1;
    for (let index = 0; index < block.size; index += 1) {
      const position = block.offset + index;
      if (left[position] === right[position]) continue;
      differingChannels += 1;
      if (firstChannel < 0) firstChannel = index;
    }
    if (differingChannels === 0) continue;
    blocks.push({
      block: block.name,
      differingChannels,
      firstChannel,
      left: left[block.offset + firstChannel] as number,
      right: right[block.offset + firstChannel] as number,
    });
  }

  return {
    identical: blocks.length === 0,
    blocks: Object.freeze(blocks),
    blockNames: Object.freeze(blocks.map((entry) => entry.block)),
  };
}

/** One line per differing block, for a test failure message or a log. */
export function describeDivergence(divergence: ObservationDivergence): string {
  if (divergence.identical) return 'identical in every observation block';
  return divergence.blocks
    .map(
      (entry) =>
        `${entry.block}: ${String(entry.differingChannels)} channel(s) differ, first at ` +
        `+${String(entry.firstChannel)} (${String(entry.left)} vs ${String(entry.right)})`,
    )
    .join('; ');
}
