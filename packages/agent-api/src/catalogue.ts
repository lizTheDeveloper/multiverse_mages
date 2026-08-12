/*
 * Multiverse Mages — the content facts the observation needs, as plain data.
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
 * The observation needs three facts that live in content rather than in state:
 * which cell a node belongs to, what tier it is, and which traditions exist.
 * §4.1's knowledge block is *per cell*, and state stores knowledge per *node*,
 * so without a node→cell map there is no knowledge block at all.
 *
 * ## Why this is an argument and not an import
 *
 * `contracts.md` §5 does grant `agent-api → content`, so importing it would be
 * legal. It would also be a mistake, for the reason `@mm/state` records in
 * `grid.ts`: `@mm/content`'s public surface re-exports a loader that reads the
 * filesystem, so a value import drags `node:fs` into everything that imports
 * `agent-api` — and §5 puts `client-electron` (a renderer) and `gym-bridge`
 * downstream of this package. The observation layer has to run in a browser.
 *
 * So the caller — the Monte Carlo harness, the server, a test — loads content
 * where loading is legal and hands the result across as integers. That also
 * means a test can build a two-node catalogue in four lines instead of
 * authoring content to exercise an encoder.
 *
 * ## It is a projection, not a second source of truth
 *
 * Nothing here may hold anything `@mm/content` does not already say, and
 * nothing may *decide* anything. If a field is wanted that content does not
 * have, it belongs in content.
 */

/** One node, reduced to what §4.1's knowledge and mage blocks need. */
export interface CatalogueNode {
  /** Interned node id; `0` is the reserved null and is not a node. */
  readonly nodeId: number;
  /** The cell this node hangs from (`contracts.md` §2.3), `1..70`. */
  readonly cellId: number;
  /** `1..7` (§2.3). Depth ceilings are per species; the tier itself is not. */
  readonly tier: number;
}

/**
 * What each action in §4.2 costs, projected out of `god-agency`'s content.
 *
 * Here so that the legality mask can answer *"can this god afford this"*, which
 * the favor-economy spec makes a mask condition rather than a failure: *"an
 * action whose cost exceeds the current favor pool MUST have its legality mask
 * entry set false"*. Without it the mask says yes and the rules say no, and the
 * disagreement lands in `illegalActionRate` as noise that looks like a confused
 * agent.
 *
 * A projection, like everything else here — the numbers come from
 * `god-cost.json` and `god-constant.json` and are decided nowhere in this
 * package. The one thing this table has to carry beyond the prices is
 * `hysteresisStep`, because the price of flipping an axis depends on how
 * recently it was flipped, and that counter is in state where the mask can read
 * it.
 */
export interface ActionCostTable {
  /** Base favor price per §4.2 action id, ascending, all sixteen. */
  readonly byAction: readonly number[];
  /** Action 11 with a target of 0 — §4.2 gives founding and funding one id. */
  readonly foundUniversity: number;
  /** What one recent flip of an axis adds to its multiplier, `fp`. */
  readonly hysteresisStep: number;
  /**
   * `raid-engagement.md` §1's revert surcharge, `fp`. Absent reads as `fp(1)`.
   *
   * Optional for the reason the whole table is: a catalogue built for a test or
   * a renderer should not have to carry every price to produce a mask. Absent
   * means "no surcharge", which prices a revert exactly as builds before the
   * mark existed did.
   */
  readonly midRaidRevertMultiplier?: number;
}

/** Everything the observation needs from content, indexed for lookup. */
export interface ContentCatalogue {
  /** Every node, in ascending node id. */
  readonly nodes: readonly CatalogueNode[];
  /** Tradition ids that exist, ascending. §1.1: exactly one is held, never 0. */
  readonly traditionIds: readonly number[];
  /**
   * The favor prices, or `undefined` for a catalogue built without them.
   *
   * Optional because a caller that only wants an observation encoded — a test
   * building a two-node catalogue, a client rendering a snapshot — should not
   * have to supply a cost table to get one. Absent means the mask reports
   * structural legality only, which is what it did before `god-agency` shipped
   * and is an honest answer rather than a wrong one: it says *"this action is
   * well formed"*, and stays silent on a price it was not told.
   */
  readonly costs?: ActionCostTable | undefined;
  /** A node by id, or `undefined` if the catalogue does not name it. */
  node(nodeId: number): CatalogueNode | undefined;
}

/**
 * Builds the lookup index over a set of nodes.
 *
 * @throws Error on a duplicate node id, on the reserved null id, or on a tier
 * outside `1..7`. Rejected at construction rather than at lookup because a
 * catalogue is built once and read hundreds of thousands of times: a bad entry
 * that surfaced at read time would surface inside a Monte Carlo worker, hours
 * in, as a wrong knowledge channel rather than as a content error.
 */
export function buildCatalogue(
  nodes: readonly CatalogueNode[],
  traditionIds: readonly number[],
  costs?: ActionCostTable,
): ContentCatalogue {
  const byId = new Map<number, CatalogueNode>();
  for (const node of nodes) {
    if (!Number.isInteger(node.nodeId) || node.nodeId < 1) {
      throw new Error(
        `Catalogue node id ${String(node.nodeId)} is not a node. Ids are interned positive ` +
          'integers and 0 is the reserved null (contracts.md §0).',
      );
    }
    if (!Number.isInteger(node.tier) || node.tier < 1 || node.tier > 7) {
      throw new Error(
        `Catalogue node ${String(node.nodeId)} has tier ${String(node.tier)}; contracts.md §2.3 ` +
          'numbers tiers 1..7.',
      );
    }
    if (byId.has(node.nodeId)) {
      throw new Error(
        `Catalogue names node ${String(node.nodeId)} twice. Two entries for one id means the ` +
          'knowledge block would count it in whichever cell happened to win.',
      );
    }
    byId.set(node.nodeId, Object.freeze({ ...node }));
  }

  const ordered = Object.freeze([...byId.values()].sort((a, b) => a.nodeId - b.nodeId));
  const traditions = Object.freeze([...new Set(traditionIds)].sort((a, b) => a - b));

  return Object.freeze({
    nodes: ordered,
    traditionIds: traditions,
    costs: costs === undefined ? undefined : Object.freeze({ ...costs, byAction: Object.freeze([...costs.byAction]) }),
    node: (nodeId: number) => byId.get(nodeId),
  });
}

/** An empty catalogue, for a world whose content carries no nodes yet. */
export const EMPTY_CATALOGUE: ContentCatalogue = buildCatalogue([], []);
