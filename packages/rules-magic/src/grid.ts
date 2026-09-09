/*
 * Multiverse Mages — the technique × form grid and the node graph over it.
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
 * The grid, as the rules see it: seventy addressable cells, the nodes authored
 * into twelve of them, and the prerequisite edges between those nodes.
 *
 * ## Addressing is total over 5 × 14, and that is not a convenience
 *
 * `contracts.md` §2.1 fixes the grid at exactly 5 techniques × 14 forms, and
 * §2.2 says 70 cells exist *in schema* while 12 carry v1 content. Those are two
 * different statements and this class keeps them apart: every one of the 70
 * positions resolves to a {@link CellView}, and a position with no content
 * resolves to an **empty** one rather than to nothing.
 *
 * A partial grid would push a null check into every caller — and the callers are
 * the legality mask, the observation projection (§4.1 reserves 70 × 3 slots for
 * knowledge regardless of what is authored), and the god's permit/forbid UI,
 * none of which have anything sensible to do with "that cell does not exist."
 * The one they would actually do is treat it as forbidden, which is a *rule*
 * invented by an absent record. Content is what decides whether a cell has
 * nodes; nothing but the ruleset decides whether it is available.
 *
 * ## Where the arithmetic comes from
 *
 * Cell ids are grid coordinates — `@mm/content` interns a cell as
 * `techniqueBit × 14 + formBit + 1` — and this file does **not** re-derive that.
 * It calls `@mm/state`'s {@link cellIdAt}, {@link techniqueBitOf} and
 * {@link formBitOf}, which are already pinned against `@mm/content`'s own
 * interning for all 70 cells by `packages/state/test/unit/grid-agrees-with-content.test.ts`.
 * A third copy would be a third thing to keep in agreement, and the one that
 * drifts is always the one nobody has a test for.
 *
 * ## One source of truth for "which cell is this node in"
 *
 * A cell record lists its `nodes`, and every node record names its `cell`. Both
 * are authored, so they can disagree. This class reads **only the node's `cell`
 * field** and builds the per-cell node lists from it, so {@link MagicGrid.cellOf}
 * and {@link CellView.nodeIds} cannot contradict each other no matter what the
 * data says. Dormancy is derived from `cellOf` (see `dormancy.ts`); a node that
 * appeared in one cell's list while claiming another would otherwise be dormant
 * and usable at the same time, depending on which way the caller asked.
 *
 * ## Content arrives from the caller
 *
 * {@link GridContent} is a structural subset of `@mm/content`'s `ContentRegistry`
 * — the four record arrays and nothing else. The registry satisfies it, and so
 * does a hand-built fixture. `@mm/content` is imported for types only: its
 * public surface re-exports a loader that reads the filesystem, and this package
 * has to run unchanged in a browser (`contracts.md` §5, the same reasoning
 * `@mm/primitives` and `@mm/agent-api` record).
 */

import type { CellRecord, FormRecord, Interned, NodeRecord, TechniqueRecord } from '@mm/content';
import type { ContentId } from '@mm/state';

import type { ExclusionEdge } from './instances/catalog.js';
import {
  GRID_CELL_COUNT,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  cellIdAt,
  formBitOf,
  isCellId,
  techniqueBitOf,
} from '@mm/state';

/**
 * The content a grid is built from: `@mm/content`'s four record arrays.
 *
 * Deliberately not the whole `ContentRegistry`. Narrowing the parameter is what
 * lets a test build a two-node universe without a filesystem, and it documents
 * exactly which content this package reads — a reviewer can see that
 * `classicalLabels` is not in the list of things anything here could use, which
 * is a requirement of `magic-grid` rather than an accident.
 */
export interface GridContent {
  readonly techniques: readonly Interned<TechniqueRecord>[];
  readonly forms: readonly Interned<FormRecord>[];
  readonly cells: readonly Interned<CellRecord>[];
  readonly nodes: readonly Interned<NodeRecord>[];
}

/**
 * One of the seventy cells.
 *
 * Frozen and precomputed at construction: `cell()` is asked once per legality
 * question per tick, and an allocation there would be an allocation in the
 * innermost loop of the observation projection.
 */
/** Shared empty result, so the common "excludes nothing" case allocates nothing. */
const EMPTY_EXCLUSIONS: readonly ExclusionEdge[] = Object.freeze([]);

/**
 * Resolves authored exclusions from cell *names* to interned cell ids.
 *
 * Content authors `excludes: [{ cell: "creo-umbra", ... }]` by name, and every
 * rule downstream addresses a cell by its interned id. Doing the translation
 * once here is what lets {@link MagicGrid.excludedBy} be a map lookup on the
 * acquisition path.
 *
 * An exclusion naming a cell this content set does not declare is dropped
 * rather than thrown on: `content`'s loader already rejects that as an
 * `unknown-reference` hard failure, so reaching this line means the check ran
 * and passed, and a second throw here could only fire for a registry that
 * bypassed validation entirely.
 */
function buildExclusions(
  authored: ReadonlyMap<number, CellRecord>,
  cellIdByName: ReadonlyMap<string, number>,
): ReadonlyMap<number, readonly ExclusionEdge[]> {
  const out = new Map<number, readonly ExclusionEdge[]>();
  for (const [cellId, record] of authored) {
    const excludes = record.excludes ?? [];
    if (excludes.length === 0) continue;
    const edges: ExclusionEdge[] = [];
    for (const exclusion of excludes) {
      const target = cellIdByName.get(exclusion.cell);
      if (target === undefined) continue;
      edges.push({ cell: target, resolution: exclusion.resolution });
    }
    if (edges.length > 0) out.set(cellId, Object.freeze(edges));
  }
  return out;
}

export interface CellView {
  /** Interned cell id, `1..70`. */
  readonly cellId: number;
  /** Interned technique id (`bit + 1`). */
  readonly techniqueId: ContentId;
  /** Interned form id (`bit + 1`). */
  readonly formId: ContentId;
  /** The authored cell id, or `''` for a position content never authored. */
  readonly name: string;
  /** Whether content authored a record for this position at all. */
  readonly authored: boolean;
  /** `contracts.md` §2.2's `"v1": true`. Content membership, not availability. */
  readonly v1: boolean;
  /** Nodes authored into this cell, ascending. Empty for a non-v1 cell. */
  readonly nodeIds: readonly ContentId[];
}

/**
 * What a subject knows, as far as the grid needs to care.
 *
 * The knowledge instances themselves — their location, mastery, and decay — are
 * `knowledge-instances`' business. Prerequisite satisfaction needs one bit per
 * node, so that is all this asks for, and it is why prerequisite checking does
 * not drag the instance store into the grid.
 */
export interface HeldKnowledge {
  /** Whether the subject holds at least one instance of a node. */
  holds(nodeId: ContentId): boolean;
}

/** Prerequisites, evaluated. `missing` is ascending, so failures read the same twice. */
export interface PrerequisiteStatus {
  readonly satisfied: boolean;
  /** Prerequisite nodes the subject cannot currently use, ascending. */
  readonly missing: readonly ContentId[];
}

/** A {@link HeldKnowledge} over a fixed set of node ids. */
export function heldNodes(nodeIds: Iterable<ContentId>): HeldKnowledge {
  const held = new Set(nodeIds);
  return { holds: (nodeId) => held.has(nodeId) };
}

interface NodeEntry {
  readonly name: string;
  readonly cellId: number;
  readonly tier: number;
  readonly prerequisites: readonly ContentId[];
}

/** Blank view for a position content never authored. Ids filled in per cell. */
const EMPTY_NODE_IDS: readonly ContentId[] = Object.freeze([]);

/**
 * The grid and node graph of one loaded content set.
 *
 * Immutable once built. Every method is a lookup; nothing here consults a
 * universe, so a grid can be shared by every universe running against the same
 * `contentRevision` — which is what `contracts.md` §0 means by content being the
 * thing two universes must agree on before they may interact at all.
 */
export class MagicGrid {
  /** Indexed by cell id; index 0 is the reserved null and stays undefined. */
  readonly #cells: readonly (CellView | undefined)[];
  readonly #cellIdByName: ReadonlyMap<string, number>;
  /** Indexed by node id; index 0 is the reserved null. */
  readonly #nodes: readonly (NodeEntry | undefined)[];
  readonly #nodeIdByName: ReadonlyMap<string, ContentId>;
  readonly #techniqueBitById: ReadonlyMap<ContentId, number>;
  readonly #formBitById: ReadonlyMap<ContentId, number>;
  readonly #v1CellIds: readonly number[];
  readonly #exclusionsByCell: ReadonlyMap<number, readonly ExclusionEdge[]>;

  private constructor(parts: {
    cells: readonly (CellView | undefined)[];
    cellIdByName: ReadonlyMap<string, number>;
    nodes: readonly (NodeEntry | undefined)[];
    nodeIdByName: ReadonlyMap<string, ContentId>;
    techniqueBitById: ReadonlyMap<ContentId, number>;
    formBitById: ReadonlyMap<ContentId, number>;
    v1CellIds: readonly number[];
    exclusionsByCell: ReadonlyMap<number, readonly ExclusionEdge[]>;
  }) {
    this.#cells = parts.cells;
    this.#cellIdByName = parts.cellIdByName;
    this.#nodes = parts.nodes;
    this.#nodeIdByName = parts.nodeIdByName;
    this.#techniqueBitById = parts.techniqueBitById;
    this.#formBitById = parts.formBitById;
    this.#v1CellIds = parts.v1CellIds;
    this.#exclusionsByCell = parts.exclusionsByCell;
  }

  /**
   * Builds a grid from loaded content.
   *
   * Throws on content the grid cannot be total over — a missing axis, a node in
   * a cell that does not exist, a prerequisite naming no node. The loader
   * rejects all three first (`contracts.md` §2: *"Invalid content is a hard load
   * failure, never a warning"*), and this checks anyway, because the registry is
   * a **parameter**: a caller may hand over a fixture, a mod's registry, or a
   * partially rebuilt one, and a grid that quietly tolerated a node with no cell
   * would answer "not dormant" for it forever. That is a mage casting a spell
   * their universe forbids, reported by nothing.
   */
  static from(content: GridContent): MagicGrid {
    const techniqueBitById = axisBits(content.techniques, 'technique', GRID_TECHNIQUE_COUNT);
    const formBitById = axisBits(content.forms, 'form', GRID_FORM_COUNT);
    const techniqueIdByBit = invert(techniqueBitById);
    const formIdByBit = invert(formBitById);

    const cellIdByName = new Map<string, number>();
    const authored = new Map<number, CellRecord>();
    for (const cell of content.cells) {
      if (!isCellId(cell.contentId)) {
        throw new RangeError(
          `Cell ${cell.record.id} was interned to ${String(cell.contentId)}, which is not a cell ` +
            `id. Cell ids are 1..${String(GRID_CELL_COUNT)}; 0 is the reserved null ` +
            '(contracts.md §0).',
        );
      }
      cellIdByName.set(cell.record.id, cell.contentId);
      authored.set(cell.contentId, cell.record);
    }

    // Nodes first, so the per-cell lists are built from the node's own `cell`
    // field and there is exactly one answer to "which cell is this node in".
    const nodeIdByName = new Map<string, ContentId>();
    for (const node of content.nodes) nodeIdByName.set(node.record.id, node.contentId);

    const nodeIdsByCell = new Map<number, ContentId[]>();
    const nodes: (NodeEntry | undefined)[] = [];
    for (const node of content.nodes) {
      const cellId = cellIdByName.get(node.record.cell);
      if (cellId === undefined) {
        throw new RangeError(
          `Node ${node.record.id} names cell ${node.record.cell}, which content does not ` +
            'declare. A node with no cell has no dormancy answer, and defaulting one would ' +
            'decide legality from an absent record.',
        );
      }
      const prerequisites = node.record.prerequisites.map((id) => {
        const prerequisiteId = nodeIdByName.get(id);
        if (prerequisiteId === undefined) {
          throw new RangeError(
            `Node ${node.record.id} declares prerequisite ${id}, which names no node. An ` +
              'unresolvable prerequisite would silently read as satisfied, which is the one ' +
              'way a mage reaches a node they never earned.',
          );
        }
        return prerequisiteId;
      });
      prerequisites.sort((a, b) => a - b);
      nodes[node.contentId] = {
        name: node.record.id,
        cellId,
        tier: node.record.tier,
        prerequisites: Object.freeze(prerequisites),
      };
      const list = nodeIdsByCell.get(cellId);
      if (list === undefined) nodeIdsByCell.set(cellId, [node.contentId]);
      else list.push(node.contentId);
    }

    const cells: (CellView | undefined)[] = [];
    const v1CellIds: number[] = [];
    for (let techniqueBit = 0; techniqueBit < GRID_TECHNIQUE_COUNT; techniqueBit += 1) {
      for (let formBit = 0; formBit < GRID_FORM_COUNT; formBit += 1) {
        const cellId = cellIdAt(techniqueBit, formBit);
        const record = authored.get(cellId);
        const nodeIds = nodeIdsByCell.get(cellId);
        if (nodeIds !== undefined) nodeIds.sort((a, b) => a - b);
        const v1 = record?.v1 === true;
        if (v1) v1CellIds.push(cellId);
        cells[cellId] = Object.freeze({
          cellId,
          techniqueId: techniqueIdByBit.get(techniqueBit) as ContentId,
          formId: formIdByBit.get(formBit) as ContentId,
          name: record?.id ?? '',
          authored: record !== undefined,
          v1,
          nodeIds: nodeIds === undefined ? EMPTY_NODE_IDS : Object.freeze(nodeIds),
        });
      }
    }

    return new MagicGrid({
      cells,
      cellIdByName,
      nodes,
      nodeIdByName,
      techniqueBitById,
      formBitById,
      v1CellIds: Object.freeze(v1CellIds),
      exclusionsByCell: buildExclusions(authored, cellIdByName),
    });
  }

  /** Cells in the grid. Always 70 — §2.1 fixes the axes. */
  get cellCount(): number {
    return GRID_CELL_COUNT;
  }

  /**
   * The cell at a grid position, by interned technique and form id.
   *
   * @throws RangeError if either id names no axis. A null cell id would be
   * worse: the caller's next move is to ask whether the universe permits it,
   * and `permits()` would then throw a frame later, in a stack that no longer
   * mentions which axis was wrong.
   */
  cellAt(techniqueId: ContentId, formId: ContentId): number {
    const techniqueBit = this.#techniqueBitById.get(techniqueId);
    if (techniqueBit === undefined) {
      throw new RangeError(
        `Technique id ${String(techniqueId)} names no technique. Content ids are interned from ` +
          'the authored bit as `bit + 1`; 0 is the reserved null (contracts.md §0).',
      );
    }
    const formBit = this.#formBitById.get(formId);
    if (formBit === undefined) {
      throw new RangeError(
        `Form id ${String(formId)} names no form. Content ids are interned from the authored ` +
          'bit as `bit + 1`; 0 is the reserved null (contracts.md §0).',
      );
    }
    return cellIdAt(techniqueBit, formBit);
  }

  /**
   * The cell with an id. Total over `1..70`, whatever content authored.
   *
   * @throws RangeError if `cellId` does not name a cell — the same choice
   * `permits()` makes, and for the same reason: silently answering for a
   * mis-derived id turns a bug into a balance change nobody can see.
   */
  cell(cellId: number): CellView {
    const view = this.#cells[cellId];
    if (view === undefined) {
      throw new RangeError(
        `Cell id ${String(cellId)} is not a cell. Cell ids are 1..${String(GRID_CELL_COUNT)}; 0 ` +
          'is the reserved null (contracts.md §0).',
      );
    }
    return view;
  }

  /** The cell with an authored id, e.g. `rego-limen`. */
  cellByName(name: string): CellView {
    const cellId = this.#cellIdByName.get(name);
    if (cellId === undefined) {
      throw new RangeError(`Content declares no cell ${name}.`);
    }
    return this.cell(cellId);
  }

  /** Cells flagged `"v1": true`, ascending. */
  v1CellIds(): readonly number[] {
    return this.#v1CellIds;
  }

  /** Whether a cell carries v1 content. Says nothing about availability. */
  isV1(cellId: number): boolean {
    return this.cell(cellId).v1;
  }

  /** Whether a node id names a node in this content set. */
  hasNode(nodeId: ContentId): boolean {
    return this.#nodes[nodeId] !== undefined;
  }

  /**
   * The cell a node was authored into — the input to every dormancy question.
   *
   * @throws RangeError for a node this content set does not declare.
   */
  cellOf(nodeId: ContentId): number {
    return this.#node(nodeId, 'cellOf').cellId;
  }

  /**
   * The cells this one excludes (`vision.md` §4b), as interned ids.
   *
   * Empty for every cell that excludes nothing, which is all but two of the
   * seventy as of this revision. Resolved once at construction rather than per
   * call: the acquisition path asks this question every time an instance is
   * created, and a string lookup per acquisition would put a map miss on the
   * hot path for a set that is almost always empty.
   *
   * The authored `reason` is deliberately dropped here. It is load-bearing at
   * validation time, where §4b derives symmetry from it, and it is not a rule
   * input — carrying it further would invite a rule to branch on prose.
   */
  excludedBy(cellId: number): readonly ExclusionEdge[] {
    return this.#exclusionsByCell.get(cellId) ?? EMPTY_EXCLUSIONS;
  }

  /** A node's authored string id, for diagnostics. */
  nodeName(nodeId: ContentId): string {
    return this.#node(nodeId, 'nodeName').name;
  }

  /** A node's tier, `1..7`. Never consulted for prerequisite satisfaction. */
  tierOf(nodeId: ContentId): number {
    return this.#node(nodeId, 'tierOf').tier;
  }

  /** The interned id of an authored node id. */
  nodeIdOf(name: string): ContentId {
    const nodeId = this.#nodeIdByName.get(name);
    if (nodeId === undefined) throw new RangeError(`Content declares no node ${name}.`);
    return nodeId;
  }

  /** A node's declared prerequisites, ascending. May cross cells. */
  prerequisitesOf(nodeId: ContentId): readonly ContentId[] {
    return this.#node(nodeId, 'prerequisitesOf').prerequisites;
  }

  /**
   * Whether a subject may treat a node's prerequisites as met.
   *
   * Evaluated against the declared graph, node by node. **Tier is never
   * consulted** — `contracts.md` §2.3 lets prerequisites cross cells and the
   * loader only guarantees a prerequisite's tier is no higher, which is not the
   * same thing as implying satisfaction. A tier-4 node in a cell says nothing
   * about the tier-2 chain beside it, and inferring otherwise would let a mage
   * skip an entire chain by learning its end.
   *
   * The subject's *usable* holdings are the caller's to supply: dormancy needs a
   * ruleset and the grid has none. `prerequisiteStatusFor` in `dormancy.ts` is
   * the ruleset-aware wrapper, and it is what an acquisition operation calls.
   */
  prerequisiteStatus(nodeId: ContentId, held: HeldKnowledge): PrerequisiteStatus {
    const required = this.prerequisitesOf(nodeId);
    const missing: ContentId[] = [];
    for (const prerequisiteId of required) {
      if (!held.holds(prerequisiteId)) missing.push(prerequisiteId);
    }
    return { satisfied: missing.length === 0, missing };
  }

  #node(nodeId: ContentId, operation: string): NodeEntry {
    const entry = this.#nodes[nodeId];
    if (entry === undefined) {
      throw new RangeError(
        `MagicGrid.${operation}() received node id ${String(nodeId)}, which this content set does ` +
          'not declare. Node id 0 is the reserved null (contracts.md §0) and never names a node.',
      );
    }
    return entry;
  }
}

/**
 * Bit position per interned axis id, checked dense and unique.
 *
 * Density is what makes cell interning a bijection onto `1..70`; the loader
 * asserts it, and so does this, because the alternative to checking is a grid
 * with a hole in it that reports as an empty cell rather than as a defect.
 */
function axisBits(
  axis: readonly Interned<{ id: string; bit: number }>[],
  kind: string,
  expected: number,
): ReadonlyMap<ContentId, number> {
  const bits = new Map<ContentId, number>();
  const seen = new Set<number>();
  for (const entry of axis) {
    const { bit } = entry.record;
    if (!Number.isInteger(bit) || bit < 0 || bit >= expected) {
      throw new RangeError(
        `${kind} ${entry.record.id} declares bit ${String(bit)}, outside 0..${String(expected - 1)}. ` +
          'contracts.md §2.1 fixes the axis width, and cell ids are serialized grid coordinates ' +
          'over it.',
      );
    }
    if (seen.has(bit)) {
      throw new RangeError(
        `${kind} ${entry.record.id} reuses bit ${String(bit)}. Two axes sharing a bit collapse two ` +
          'columns of the grid onto one cell id.',
      );
    }
    seen.add(bit);
    bits.set(entry.contentId, bit);
  }
  if (seen.size !== expected) {
    throw new RangeError(
      `Content declares ${String(seen.size)} ${kind}s; contracts.md §2.1 fixes the count at ` +
        `${String(expected)}. The grid cannot be total over 5 × 14 with an axis missing.`,
    );
  }
  return bits;
}

/** Bit → interned id, for turning a cell id back into the pair that made it. */
function invert(bits: ReadonlyMap<ContentId, number>): ReadonlyMap<number, ContentId> {
  const inverted = new Map<number, ContentId>();
  for (const [contentId, bit] of bits) inverted.set(bit, contentId);
  return inverted;
}

/**
 * The axes of a cell, for callers that have an id and want the pair.
 *
 * Re-exported shape rather than re-derived arithmetic: both helpers come from
 * `@mm/state`, which owns the one copy.
 */
export function cellAxes(cellId: number): { techniqueBit: number; formBit: number } {
  if (!isCellId(cellId)) {
    throw new RangeError(
      `Cell id ${String(cellId)} is not a cell. Cell ids are 1..${String(GRID_CELL_COUNT)}.`,
    );
  }
  return { techniqueBit: techniqueBitOf(cellId), formBit: formBitOf(cellId) };
}
