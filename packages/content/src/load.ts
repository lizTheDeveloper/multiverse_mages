/*
 * Multiverse Mages — the content loader.
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
 * Loads, validates, and interns a content set.
 *
 * **Invalid content is a hard load failure, never a warning, and never a
 * skipped record** (`docs/design/contracts.md` §2). There is no code path in
 * this file that returns a registry alongside a diagnostic: a partially
 * populated registry is the exact defect the rule exists to prevent, because a
 * silently-dropped node shows up weeks later as an unexplained shift in a Monte
 * Carlo baseline and nothing points at the content.
 *
 * **Validation runs in three phases, and a phase reports everything it finds
 * before the next is attempted.** Phase 1 reads and parses; phase 2 checks each
 * document against its JSON Schema; phase 3 checks the content *graph* — the
 * things a schema cannot express. Phases are ordered because each assumes the
 * previous one held: running reference checks over records that failed their
 * schema produces a page of derived noise around one real defect. Within a
 * phase, nothing stops at the first error.
 */

import type { ContentDiagnostic, ContentDiagnosticCode } from './diagnostics.js';
import { ContentValidationError, pointerAppend, sortDiagnostics } from './diagnostics.js';
import { checkAutonomyWeights, isRoleAppeal } from './autonomy.js';
import { checkGodConstants, checkGodCosts } from './god.js';
import { checkRaidConstants } from './raid.js';
import { HOOK_KINDS, HOOK_POINTS, checkHookParams, hookPointOwning, permittedKinds } from './hooks.js';
import {
  CELL_COUNT,
  FORM_COUNT,
  TECHNIQUE_COUNT,
  internCell,
  internFromBit,
  internSorted,
} from './intern.js';
import { CompiledSchema } from './json-schema.js';
import { computeContentRevision } from './revision.js';
import type { RevisionEntry } from './revision.js';
import type { ContentFileName, ContentSource } from './source.js';
import { CONTENT_FILES, directorySource, shippedSchemaDirectory } from './source.js';
import type {
  AutonomyWeightRecord,
  CellRecord,
  ContentCounts,
  ContentId,
  ContentNamespace,
  ContentRegistry,
  EffectMode,
  FormRecord,
  GodConstantRecord,
  RaidConstantRecord,
  GodCostRecord,
  Interned,
  NodeRecord,
  PrimitiveRecord,
  SpeciesRecord,
  TechniqueRecord,
  TerritoryRecord,
  TraditionRecord,
  TrackRecord,
  RitualRecord,
} from './types.js';

/**
 * The cell every v1 build must contain (`contracts.md` §8). Without it there is
 * no `portal` primitive anywhere in v1 content and raiding is unreachable.
 */
export const REQUIRED_V1_CELL = 'rego-limen';

/** The v1 subset is a rectangle of this many cells (`contracts.md` §2.2). */
export const V1_CELL_COUNT = 12;

/** Techniques in the v1 rectangle. */
export const V1_TECHNIQUE_COUNT = 3;

/** Forms in the v1 rectangle. */
export const V1_FORM_COUNT = 4;

/**
 * The most nodes a content set may declare, because every one of them is
 * potentially on a mage's research frontier.
 *
 * `@mm/coordination`'s `researchFrontier` walks the nodes of the cells the
 * ruleset permits, once per mage per tick. A god may permit all seventy cells,
 * so the worst case over all rulesets is *the whole catalog*, and the node count
 * is therefore a per-tick cost that content controls and the AI layer cannot.
 *
 * That scan used to be bounded instead by a constant over interned node id —
 * walk `1..min(nodeCount, 256)` and stop — and the shipped catalog has held 300
 * nodes since the grid was authored, so 44 of them were silently unreachable:
 * the whole `rego` technique, four of the twelve v1 cells, a third of the
 * playable content. Nothing failed. Nothing warned. The universe simply had less
 * magic in it than the content said, for the life of every run, and it took a
 * plateau in a fifty-year sweep to notice.
 *
 * So the bound moved here, where crossing it is **loud**. This is a content
 * decision that fails `npm run verify` with a message, not a runtime truncation
 * that deletes whatever sorts last. One thousand and twenty-four is an arbitrary
 * budget — a little over three times what v1 authors — chosen to be roomy enough
 * that ordinary content growth never meets it and small enough that meeting it
 * is a conversation. **The response to hitting it is to measure the frontier
 * scan and raise this number on purpose, or to author fewer nodes. It is never
 * to cap the scan again.**
 *
 * ## Raised from 1024 to 2048 by W20, on purpose
 *
 * W20 replaced the twelve v1 cells' 51 ladder nodes with 108 compositional ones,
 * taking the catalog from 300 to 357. That is comfortably inside the old bound —
 * what it crossed was the **headroom canary** in `shipped-content.test.ts`,
 * which asserts `nodes × 3 < MAX_CONTENT_NODES` so that content arriving at the
 * ceiling is noticed by a test that can explain it rather than by a build
 * failure a month later. 357 × 3 = 1071. The canary did its job.
 *
 * 2048 is chosen against a stated target rather than doubled for comfort: the
 * grid is seventy cells, v1 now authors nine nodes per cell, and seventy cells
 * at that density is 630 nodes — so 630 × 3 = 1890 keeps the same threefold
 * headroom for **the whole grid authored to v1's new standard**, which is the
 * largest catalog this design implies. Meeting *this* number would mean the grid
 * had grown past what `vision.md` §4 describes.
 *
 * The cost this bounds is unchanged in shape and larger in fact: the frontier
 * scan is O(nodes) per mage per tick, and the catalog grew 19%. That is a real
 * per-tick cost increase and it has not been benchmarked here — `npm run bench`
 * does not yet reach this layer, and `world-step.ts` records the same gap about
 * `KnowledgeSubsystem.fromState`. **Measuring it is the first thing owed if the
 * throughput target is missed.**
 */
export const MAX_CONTENT_NODES = 2048;

/**
 * Authoring floor for `rediscoveryMultiplier` in v1 content.
 *
 * `contracts.md` §2.3 sets the hard invariant at `fp(3072)` and then asks v1 to
 * author at or above `fp(5376)`, because species `rediscoveryAffinity` is
 * applied *before* the `fp(3072)` floor: a node authored at the floor has every
 * species clamped to the same effective cost, and the trait stops existing.
 * Enforcing the guidance is what keeps that from happening by accident.
 *
 * The number is `fp(5376)` and not the `fp(4096)` this constant originally held.
 * §2.3 now rejects `fp(4096)` by name, because it does not achieve its own
 * purpose: the best rediscoverer in v1 species content is the gnome at affinity
 * `fp(1792)`, and `4096 × 1024 / 1792 = 2340` lands *below* the hard floor, so
 * the strongest instance of the trait is clamped flat and does nothing at all.
 * Break-even is `3072 × 1792 / 1024 = 5376`.
 *
 * It is a literal rather than a value derived from the loaded species records,
 * deliberately. Deriving it would make whether `node.json` loads depend on
 * whoever last edited `species.json`, so a species change would surface as a
 * node rejection. The coupling is instead asserted from
 * `test/unit/shipped-content.test.ts`, which recomputes break-even from the
 * actual best affinity and fails if the species side moves out from under this
 * number — a test failure that names the real cause.
 */
export const V1_REDISCOVERY_AUTHORING_FLOOR = 5376;

/**
 * Fixed-point scale and ceiling, restated here because `content` carries no
 * runtime dependencies — not even on `sim-core`, which owns the real ones.
 * Asserted equal to `sim-core`'s from `test/unit/shipped-content.test.ts`.
 */
const FP_SCALE = 1024;
const FP_CEILING = 2147483647;

/**
 * The least `rediscoveryAffinity` any species may carry, as a divisor.
 *
 * Affinity divides, so the *smallest* affinity produces the *largest* effective
 * rediscovery multiplier and therefore the largest requirement. v1 species
 * content bottoms out at the orc's `fp(512)`, which doubles the authored
 * multiplier — that is the worst case the rules path must survive.
 *
 * A literal rather than a value derived from `species.json`, for the same
 * reason `V1_REDISCOVERY_AUTHORING_FLOOR` is one: deriving it would make
 * whether `node.json` loads depend on whoever last edited the species records.
 * `test/unit/shipped-content.test.ts` asserts the coupling and fails naming the
 * real cause if a species is ever authored below this.
 */
export const WORST_REDISCOVERY_AFFINITY = 512;

/** `contracts.md` §2.3's hard floor, below which the effective multiplier clamps. */
const REDISCOVERY_HARD_FLOOR = 3072;

/**
 * Whether the rules path can actually compute this node's rediscovery cost.
 *
 * `researchRequirement` evaluates `mul(researchCost, effectiveMultiplier)`, and
 * `mul` throws `RangeError` rather than saturating — deliberately, because a
 * silently saturated cost is a balance change nobody authored. The schema
 * admits `researchCost` and `rediscoveryMultiplier` up to `fp(1073741823)`
 * each, and their product overflows long before that, so without this check
 * content validation accepts a node that makes the simulation throw the first
 * time anyone tries to rediscover it.
 *
 * Checked at the worst affinity rather than at `fp(1024)`: the requirement is
 * computed per-species, so a node that only overflows for orcs is still a node
 * that overflows.
 */
function rediscoveryRequirementOverflows(researchCost: number, multiplier: number): boolean {
  const scaled = Math.floor((multiplier * FP_SCALE) / WORST_REDISCOVERY_AFFINITY);
  const effective = Math.max(scaled, REDISCOVERY_HARD_FLOOR);
  return researchCost * effective > FP_CEILING * FP_SCALE;
}

/** Result of a validation pass that is allowed to fail without throwing. */
export interface ValidationResult {
  readonly diagnostics: readonly ContentDiagnostic[];
  /** Present only when `diagnostics` is empty. */
  readonly registry?: ContentRegistry;
}

interface ParsedDocuments {
  readonly technique: readonly TechniqueRecord[];
  readonly form: readonly FormRecord[];
  readonly cell: readonly CellRecord[];
  readonly node: readonly NodeRecord[];
  readonly species: readonly SpeciesRecord[];
  readonly tradition: readonly TraditionRecord[];
  readonly primitive: readonly PrimitiveRecord[];
  readonly territory: readonly TerritoryRecord[];
  readonly godCost: readonly GodCostRecord[];
  readonly godConstant: readonly GodConstantRecord[];
  readonly raidConstant: readonly RaidConstantRecord[];
  readonly autonomyWeight: readonly AutonomyWeightRecord[];
  readonly track: readonly TrackRecord[];
  readonly ritual: readonly RitualRecord[];
}

let cachedSchemas: ReadonlyMap<ContentFileName, CompiledSchema> | undefined;

/**
 * Compiles the eight schema documents once per process.
 *
 * Compilation throws on any keyword the interpreter does not implement, so a
 * schema cannot outgrow its validator without the very first load saying so.
 */
export function contentSchemas(): ReadonlyMap<ContentFileName, CompiledSchema> {
  if (cachedSchemas !== undefined) return cachedSchemas;
  const source = directorySource(shippedSchemaDirectory(), 'schema');
  const compiled = new Map<ContentFileName, CompiledSchema>();
  for (const fileName of CONTENT_FILES) {
    const schemaName = fileName.replace(/\.json$/u, '.schema.json');
    const text = source.read(schemaName);
    if (text === undefined) {
      throw new Error(`content schema ${schemaName} is missing from ${source.origin}`);
    }
    compiled.set(fileName, new CompiledSchema(JSON.parse(text), `schema/${schemaName}`));
  }
  cachedSchemas = compiled;
  return compiled;
}

/**
 * Validates a content set, returning every problem found.
 *
 * Use this from the CLI, which wants a report. Use {@link loadContent} from the
 * simulation, which wants a registry or a crash.
 */
export function validateContent(source: ContentSource): ValidationResult {
  const diagnostics: ContentDiagnostic[] = [];

  // ---- Phase 1: read and parse. ----
  const raw = new Map<ContentFileName, unknown>();
  for (const fileName of CONTENT_FILES) {
    const text = source.read(fileName);
    if (text === undefined) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        code: 'file-missing',
        message: `content file is missing from ${source.origin}`,
      });
      continue;
    }
    try {
      raw.set(fileName, JSON.parse(text));
    } catch (error) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        code: 'file-unparsable',
        message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  if (diagnostics.length > 0) return { diagnostics: sortDiagnostics(diagnostics) };

  // ---- Phase 2: schema conformance. ----
  const schemas = contentSchemas();
  for (const fileName of CONTENT_FILES) {
    const schema = schemas.get(fileName);
    if (schema === undefined) continue;
    const document = raw.get(fileName);
    for (const problem of schema.validate(document, fileName)) {
      diagnostics.push(nameTheRecord(problem, document));
    }
  }
  if (diagnostics.length > 0) return { diagnostics: sortDiagnostics(diagnostics) };

  const documents: ParsedDocuments = {
    technique: raw.get('technique.json') as readonly TechniqueRecord[],
    form: raw.get('form.json') as readonly FormRecord[],
    cell: raw.get('cell.json') as readonly CellRecord[],
    node: raw.get('node.json') as readonly NodeRecord[],
    species: raw.get('species.json') as readonly SpeciesRecord[],
    tradition: raw.get('tradition.json') as readonly TraditionRecord[],
    primitive: raw.get('primitive.json') as readonly PrimitiveRecord[],
    territory: raw.get('territory.json') as readonly TerritoryRecord[],
    godCost: raw.get('god-cost.json') as readonly GodCostRecord[],
    godConstant: raw.get('god-constant.json') as readonly GodConstantRecord[],
    raidConstant: raw.get('raid-constant.json') as readonly RaidConstantRecord[],
    autonomyWeight: raw.get('autonomy-weight.json') as readonly AutonomyWeightRecord[],
    track: raw.get('track.json') as readonly TrackRecord[],
    ritual: raw.get('ritual.json') as readonly RitualRecord[],
  };

  // ---- Phase 3: graph integrity. ----
  diagnostics.push(...checkGraph(documents));
  if (diagnostics.length > 0) return { diagnostics: sortDiagnostics(diagnostics) };

  return { diagnostics: [], registry: buildRegistry(documents) };
}

/**
 * Loads a content set or throws {@link ContentValidationError} carrying every
 * diagnostic. This is the entry point the simulation uses.
 */
export function loadContent(source: ContentSource): ContentRegistry {
  const result = validateContent(source);
  if (result.registry === undefined) throw new ContentValidationError(result.diagnostics);
  return result.registry;
}

// ---------------------------------------------------------------------------
// Phase 3
// ---------------------------------------------------------------------------

function diagnostic(
  file: string,
  pointer: string,
  code: ContentDiagnosticCode,
  message: string,
): ContentDiagnostic {
  return { file, pointer, code, message };
}

/**
 * Adds the offending record's own id to a schema diagnostic.
 *
 * A JSON pointer of `/38` is precise and unusable: content files are edited by
 * id, searched by id, and discussed by id, so an error that says only "index 38"
 * makes the author count records. The id is recovered from the raw document
 * rather than the parsed one, because at this point the record is exactly what
 * failed to parse into a valid record.
 */
function nameTheRecord(problem: ContentDiagnostic, document: unknown): ContentDiagnostic {
  if (!Array.isArray(document)) return problem;
  const match = /^\/(\d+)(\/|$)/u.exec(problem.pointer);
  if (match === null) return problem;

  const record: unknown = document[Number(match[1])];
  if (typeof record !== 'object' || record === null) return problem;
  const id: unknown = (record as Record<string, unknown>)['id'];
  if (typeof id !== 'string') return problem;
  if (problem.message.includes(`"${id}"`)) return problem;

  return { ...problem, message: `record "${id}": ${problem.message}` };
}

function checkGraph(documents: ParsedDocuments): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];

  const techniqueById = indexById(documents.technique, 'technique.json', out);
  const formById = indexById(documents.form, 'form.json', out);
  const cellById = indexById(documents.cell, 'cell.json', out);
  const nodeById = indexById(documents.node, 'node.json', out);
  indexById(documents.species, 'species.json', out);
  indexById(documents.tradition, 'tradition.json', out);
  const primitiveById = indexById(documents.primitive, 'primitive.json', out);
  indexById(documents.territory, 'territory.json', out);
  indexById(documents.godCost, 'god-cost.json', out);
  indexById(documents.godConstant, 'god-constant.json', out);
  indexById(documents.raidConstant, 'raid-constant.json', out);
  indexById(documents.autonomyWeight, 'autonomy-weight.json', out);
  const trackById = indexById(documents.track, 'track.json', out);
  indexById(documents.ritual, 'ritual.json', out);

  checkBits(documents.technique, 'technique.json', TECHNIQUE_COUNT, out);
  checkBits(documents.form, 'form.json', FORM_COUNT, out);

  checkCells(documents.cell, techniqueById, formById, nodeById, out);
  checkNodes(documents.node, cellById, nodeById, primitiveById, out);
  checkTracks(documents.track, trackById, documents.node, nodeById, out);
  checkRituals(documents.ritual, documents.track, trackById, primitiveById, out);
  checkSpecies(documents.species, formById, cellById, out);
  checkTraditions(documents.tradition, out);
  // `god-agency`'s two tables. Their coverings and identities are checks a JSON
  // Schema cannot express — see `god.ts`.
  out.push(...checkGodCosts(documents.godCost));
  out.push(...checkGodConstants(documents.godConstant));
  // `raid-engagement`'s table. Two of its checks are not tuning hygiene but the
  // termination proof — see `raid.ts`.
  out.push(...checkRaidConstants(documents.raidConstant, documents.primitive));
  // `mage-autonomy`'s target-appeal table. Its dominance check is the §7 pillar
  // rather than tuning hygiene — see `autonomy.ts`.
  out.push(...checkAutonomyWeights(documents.autonomyWeight, documents.primitive));

  return out;
}

/** Builds an id index, reporting duplicates rather than silently overwriting. */
function indexById<T extends { readonly id: string }>(
  records: readonly T[],
  file: string,
  out: ContentDiagnostic[],
): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (let position = 0; position < records.length; position += 1) {
    const record = records[position];
    if (record === undefined) continue;
    if (index.has(record.id)) {
      out.push(
        diagnostic(
          file,
          pointerAppend('', position),
          'duplicate-id',
          `duplicate id "${record.id}" — content ids are unique within their file`,
        ),
      );
      continue;
    }
    index.set(record.id, record);
  }
  return index;
}

/**
 * Asserts bit assignments are dense and unique over `0..count-1`.
 *
 * This is what makes `cellId = techniqueBit × 14 + formBit + 1` a bijection onto
 * `1..70`, so it is checked rather than assumed.
 */
function checkBits(
  records: readonly { readonly id: string; readonly bit: number }[],
  file: string,
  count: number,
  out: ContentDiagnostic[],
): void {
  const seen = new Map<number, string>();
  for (let position = 0; position < records.length; position += 1) {
    const record = records[position];
    if (record === undefined) continue;
    const previous = seen.get(record.bit);
    if (previous !== undefined) {
      out.push(
        diagnostic(
          file,
          `${pointerAppend('', position)}/bit`,
          'bit-assignment',
          `bit ${String(record.bit)} is claimed by both "${previous}" and "${record.id}" — ` +
            'bits are serialized into snapshots and must be dense and unique',
        ),
      );
      continue;
    }
    seen.set(record.bit, record.id);
  }
  for (let bit = 0; bit < count; bit += 1) {
    if (!seen.has(bit)) {
      out.push(
        diagnostic(
          file,
          '',
          'bit-assignment',
          `bit ${String(bit)} is unassigned — bit assignments must be dense over 0..${String(count - 1)}`,
        ),
      );
    }
  }
}

function checkCells(
  cells: readonly CellRecord[],
  techniqueById: ReadonlyMap<string, TechniqueRecord>,
  formById: ReadonlyMap<string, FormRecord>,
  nodeById: ReadonlyMap<string, NodeRecord>,
  out: ContentDiagnostic[],
): void {
  const file = 'cell.json';
  const pairSeen = new Map<string, string>();
  const v1Cells: CellRecord[] = [];

  for (let position = 0; position < cells.length; position += 1) {
    const cell = cells[position];
    if (cell === undefined) continue;
    const at = pointerAppend('', position);

    const technique = techniqueById.get(cell.technique);
    if (technique === undefined) {
      out.push(
        diagnostic(
          file,
          `${at}/technique`,
          'unknown-reference',
          `cell "${cell.id}" names technique "${cell.technique}", which no technique.json record defines`,
        ),
      );
    }
    const form = formById.get(cell.form);
    if (form === undefined) {
      out.push(
        diagnostic(
          file,
          `${at}/form`,
          'unknown-reference',
          `cell "${cell.id}" names form "${cell.form}", which no form.json record defines`,
        ),
      );
    }

    const expectedId = `${cell.technique}-${cell.form}`;
    if (cell.id !== expectedId) {
      out.push(
        diagnostic(
          file,
          `${at}/id`,
          'grid-coverage',
          `cell id "${cell.id}" must be "${expectedId}" — a cell is addressed by its axes`,
        ),
      );
    }

    if (technique !== undefined && form !== undefined) {
      const pairKey = `${String(technique.bit)}:${String(form.bit)}`;
      const previous = pairSeen.get(pairKey);
      if (previous !== undefined) {
        out.push(
          diagnostic(
            file,
            at,
            'grid-coverage',
            `cells "${previous}" and "${cell.id}" both occupy grid position (${cell.technique}, ${cell.form})`,
          ),
        );
      } else {
        pairSeen.set(pairKey, cell.id);
      }
    }

    const edicts = cell.edicts ?? [];
    if (edicts.includes('dispensation') && edicts.includes('interdiction')) {
      out.push(
        diagnostic(
          file,
          `${at}/edicts`,
          'edict-conflict',
          `cell "${cell.id}" carries both an interdiction and a dispensation. Interdiction beats ` +
            'dispensation (contracts.md §1.1), so a cell carrying both states a precedence the ' +
            'arbitration function has already decided — the content is expressing an intent it cannot have',
        ),
      );
    }

    for (let nodeIndex = 0; nodeIndex < cell.nodes.length; nodeIndex += 1) {
      const nodeId = cell.nodes[nodeIndex];
      if (nodeId === undefined) continue;
      const node = nodeById.get(nodeId);
      if (node === undefined) {
        out.push(
          diagnostic(
            file,
            `${at}/nodes/${String(nodeIndex)}`,
            'unknown-reference',
            `cell "${cell.id}" lists node "${nodeId}", which no node.json record defines`,
          ),
        );
        continue;
      }
      if (node.cell !== cell.id) {
        out.push(
          diagnostic(
            file,
            `${at}/nodes/${String(nodeIndex)}`,
            'cell-node-mismatch',
            `cell "${cell.id}" lists node "${nodeId}", but that node declares cell "${node.cell}"`,
          ),
        );
      }
    }

    if (cell.v1 === true) v1Cells.push(cell);
  }

  if (cells.length === CELL_COUNT && pairSeen.size !== CELL_COUNT) {
    out.push(
      diagnostic(
        file,
        '',
        'grid-coverage',
        `the grid must address all ${String(CELL_COUNT)} technique×form pairs, but only ` +
          `${String(pairSeen.size)} distinct pairs are covered`,
      ),
    );
  }

  checkV1Subset(v1Cells, out);
}

/**
 * The v1 subset must be exactly twelve cells forming a 3-technique × 4-form
 * rectangle, and must include `rego-limen` (`contracts.md` §2.2 and §8;
 * `knowledge-model` owns which twelve, and chose
 * `{intellego, perdo, rego} × {limen, mentem, nomen, terram}`).
 */
function checkV1Subset(v1Cells: readonly CellRecord[], out: ContentDiagnostic[]): void {
  const file = 'cell.json';

  if (v1Cells.length !== V1_CELL_COUNT) {
    out.push(
      diagnostic(
        file,
        '',
        'v1-subset',
        `expected exactly ${String(V1_CELL_COUNT)} cells flagged "v1": true, found ` +
          `${String(v1Cells.length)}: ${v1Cells.map((c) => c.id).join(', ')}`,
      ),
    );
  }

  if (!v1Cells.some((cell) => cell.id === REQUIRED_V1_CELL)) {
    out.push(
      diagnostic(
        file,
        '',
        'v1-subset',
        `the v1 subset must include "${REQUIRED_V1_CELL}" — without it no v1 content declares the ` +
          '"portal" primitive and raiding is unreachable (contracts.md §8)',
      ),
    );
  }

  const techniques = new Map<string, string[]>();
  const forms = new Map<string, string[]>();
  for (const cell of v1Cells) {
    let techniqueCells = techniques.get(cell.technique);
    if (techniqueCells === undefined) {
      techniqueCells = [];
      techniques.set(cell.technique, techniqueCells);
    }
    techniqueCells.push(cell.id);

    let formCells = forms.get(cell.form);
    if (formCells === undefined) {
      formCells = [];
      forms.set(cell.form, formCells);
    }
    formCells.push(cell.id);
  }

  // Each uneven axis names the cells sitting on it. The axis alone identifies
  // the shape of the defect but not the record to edit, and an author reading
  // `technique "creo" covers 1 forms` still has to grep cell.json for the flag
  // that put it there. Only the *uneven* axes are expanded, so the message stays
  // a pointer at the defect rather than the whole subset listed back.
  const uneven: string[] = [];
  for (const [technique, ids] of [...techniques].sort(byKey)) {
    if (ids.length !== V1_FORM_COUNT) {
      uneven.push(
        `technique "${technique}" covers ${String(ids.length)} forms, expected ` +
          `${String(V1_FORM_COUNT)} (${[...ids].sort(byString).join(', ')})`,
      );
    }
  }
  for (const [form, ids] of [...forms].sort(byKey)) {
    if (ids.length !== V1_TECHNIQUE_COUNT) {
      uneven.push(
        `form "${form}" covers ${String(ids.length)} techniques, expected ` +
          `${String(V1_TECHNIQUE_COUNT)} (${[...ids].sort(byString).join(', ')})`,
      );
    }
  }
  if (
    uneven.length > 0 ||
    techniques.size !== V1_TECHNIQUE_COUNT ||
    forms.size !== V1_FORM_COUNT
  ) {
    out.push(
      diagnostic(
        file,
        '',
        'v1-subset',
        `the v1 subset must be a ${String(V1_TECHNIQUE_COUNT)}-technique × ${String(V1_FORM_COUNT)}-form ` +
          `rectangle; it spans techniques [${[...techniques.keys()].sort(byString).join(', ')}] and ` +
          `forms [${[...forms.keys()].sort(byString).join(', ')}]` +
          (uneven.length > 0 ? `. Unevenly covered: ${uneven.join('; ')}` : ''),
      ),
    );
  }
}

/**
 * `sound-design.md` §4.1's five envelopes, made mechanical
 * (`compositional-content.md` §3.3): each technique has exactly one coherent
 * effect mode.
 */
const TECHNIQUE_TO_MODE: Readonly<Record<string, EffectMode>> = {
  creo: 'create',
  intellego: 'reveal',
  muto: 'transform',
  perdo: 'remove',
  rego: 'control',
};

type EffectPayloadKey = 'reveals' | 'control' | 'transformTo';

/** Which payload each `mode` requires and which it forbids (`compositional-content.md` §3.3, §5). */
const MODE_PAYLOADS: Readonly<Record<EffectMode, { requires: readonly EffectPayloadKey[]; forbids: readonly EffectPayloadKey[] }>> = {
  create: { requires: [], forbids: ['reveals', 'control', 'transformTo'] },
  remove: { requires: [], forbids: ['reveals', 'control', 'transformTo'] },
  reveal: { requires: ['reveals'], forbids: ['control', 'transformTo'] },
  control: { requires: ['control'], forbids: ['reveals', 'transformTo'] },
  transform: { requires: ['transformTo'], forbids: ['reveals', 'control'] },
};

function checkNodes(
  nodes: readonly NodeRecord[],
  cellById: ReadonlyMap<string, CellRecord>,
  nodeById: ReadonlyMap<string, NodeRecord>,
  primitiveById: ReadonlyMap<string, PrimitiveRecord>,
  out: ContentDiagnostic[],
): void {
  const file = 'node.json';

  if (nodes.length > MAX_CONTENT_NODES) {
    out.push(
      diagnostic(
        file,
        '',
        'content-invariant',
        `node.json declares ${String(nodes.length)} nodes, above the frontier-scan budget of ` +
          `${String(MAX_CONTENT_NODES)}. A god may permit all seventy cells, so every declared node ` +
          "is potentially on every mage's research frontier every tick, and the node count is a " +
          'per-tick cost content controls. Raise the budget deliberately, having measured the ' +
          'scan, or author fewer nodes — do not bound the scan by node id again, which is what ' +
          'made a third of the v1 content unreachable for the life of every run',
      ),
    );
  }

  for (let position = 0; position < nodes.length; position += 1) {
    const node = nodes[position];
    if (node === undefined) continue;
    const at = pointerAppend('', position);

    const cell = cellById.get(node.cell);
    if (cell === undefined) {
      out.push(
        diagnostic(
          file,
          `${at}/cell`,
          'unknown-reference',
          `node "${node.id}" names cell "${node.cell}", which no cell.json record defines`,
        ),
      );
    } else {
      if (!cell.nodes.includes(node.id)) {
        out.push(
          diagnostic(
            file,
            `${at}/cell`,
            'cell-node-mismatch',
            `node "${node.id}" declares cell "${node.cell}", but that cell does not list it in "nodes"`,
          ),
        );
      }
      if (node.rediscoveryMultiplier < V1_REDISCOVERY_AUTHORING_FLOOR) {
        out.push(
          diagnostic(
            file,
            `${at}/rediscoveryMultiplier`,
            'content-invariant',
            `node "${node.id}" authors rediscoveryMultiplier ${String(node.rediscoveryMultiplier)}, below the ` +
              `rediscovery authoring floor of fp(${String(V1_REDISCOVERY_AUTHORING_FLOOR)}). Species rediscoveryAffinity is ` +
              'applied before the hard fp(3072) floor, so a node authored at the floor clamps every species ' +
              'to the same effective cost and the trait stops differentiating (contracts.md §2.3)',
          ),
        );
      }
      if (rediscoveryRequirementOverflows(node.researchCost, node.rediscoveryMultiplier)) {
        out.push(
          diagnostic(
            file,
            `${at}/researchCost`,
            'content-invariant',
            `node "${node.id}" authors researchCost ${String(node.researchCost)} against ` +
              `rediscoveryMultiplier ${String(node.rediscoveryMultiplier)}, whose rediscovery ` +
              `requirement overflows fixed point at the worst species affinity of ` +
              `fp(${String(WORST_REDISCOVERY_AFFINITY)}). The rules path throws rather than ` +
              'saturating, so this node would fail the first time anyone rediscovered it',
          ),
        );
      }
    }

    for (let index = 0; index < node.prerequisites.length; index += 1) {
      const prerequisiteId = node.prerequisites[index];
      if (prerequisiteId === undefined) continue;
      if (prerequisiteId === node.id) {
        out.push(
          diagnostic(
            file,
            `${at}/prerequisites/${String(index)}`,
            'prerequisite-cycle',
            `node "${node.id}" lists itself as a prerequisite`,
          ),
        );
        continue;
      }
      const prerequisite = nodeById.get(prerequisiteId);
      if (prerequisite === undefined) {
        out.push(
          diagnostic(
            file,
            `${at}/prerequisites/${String(index)}`,
            'unknown-reference',
            `node "${node.id}" names prerequisite "${prerequisiteId}", which no node.json record defines`,
          ),
        );
        continue;
      }
      const prerequisiteCell = cellById.get(prerequisite.cell);
      if (cell?.v1 === true && prerequisiteCell !== undefined && prerequisiteCell.v1 !== true) {
        out.push(
          diagnostic(
            file,
            `${at}/prerequisites/${String(index)}`,
            'v1-unreachable-prerequisite',
            `node "${node.id}" is in the v1 cell "${node.cell}" but requires "${prerequisiteId}" from ` +
              `"${prerequisite.cell}", which is not flagged "v1": true. A playable node may never sit ` +
              'behind content the release does not enable — it would be permanently unreachable',
          ),
        );
      }

      if (prerequisite.tier > node.tier) {
        out.push(
          diagnostic(
            file,
            `${at}/prerequisites/${String(index)}`,
            'inverted-tier',
            `node "${node.id}" is tier ${String(node.tier)} but its prerequisite "${prerequisiteId}" is ` +
              `tier ${String(prerequisite.tier)} — a prerequisite may never sit deeper than the node it gates`,
          ),
        );
      }
    }

    for (let index = 0; index < node.effects.length; index += 1) {
      const effect = node.effects[index];
      if (effect === undefined) continue;
      const effectAt = `${at}/effects/${String(index)}`;

      if (!primitiveById.has(effect.primitive)) {
        out.push(
          diagnostic(
            file,
            `${effectAt}/primitive`,
            'unknown-reference',
            `node "${node.id}" declares effect primitive "${effect.primitive}", which primitive.json ` +
              'does not define. The primitive set is closed: content may not invent one — which is also ' +
              'what forbids a primitive that would modify portalStability (contracts.md §1.6)',
          ),
        );
      }

      // `mode-technique-incoherent` is enforced only where the cell is flagged
      // v1 (contracts.md §2.3's schema description, compositional-content.md
      // §3.3): the 58 unenabled cells stay loadable while it is impossible to
      // enable one without authoring it to this standard. The message says so
      // explicitly, because the check extends the moment a cell is flagged.
      if (cell?.v1 === true) {
        const expectedMode = TECHNIQUE_TO_MODE[cell.technique];
        if (expectedMode !== undefined && effect.mode !== expectedMode) {
          out.push(
            diagnostic(
              file,
              `${effectAt}/mode`,
              'mode-technique-incoherent',
              `node "${node.id}" is in v1 cell "${cell.id}", whose technique "${cell.technique}" requires ` +
                `effect mode "${expectedMode}" (sound-design.md §4.1); effect ${String(index)} declares mode ` +
                `"${effect.mode}" instead. This check extends to any cell the moment it is flagged "v1": true`,
            ),
          );
        }
      }

      // `mode-payload-missing` / `mode-payload-extraneous` bind the mode to the
      // payload it takes (compositional-content.md §3.3, §5) — enforced in
      // every cell, v1 or not, because it is a statement about the mode rather
      // than about what the release enables.
      const payloadRule = MODE_PAYLOADS[effect.mode];
      if (payloadRule !== undefined) {
        for (const key of payloadRule.requires) {
          if (effect[key] === undefined) {
            out.push(
              diagnostic(
                file,
                effectAt,
                'mode-payload-missing',
                `node "${node.id}" effect ${String(index)} has mode "${effect.mode}", which requires "${key}", ` +
                  'but the effect does not declare it',
              ),
            );
          }
        }
        for (const key of payloadRule.forbids) {
          if (effect[key] !== undefined) {
            out.push(
              diagnostic(
                file,
                `${effectAt}/${key}`,
                'mode-payload-extraneous',
                `node "${node.id}" effect ${String(index)} has mode "${effect.mode}", which does not take ` +
                  `"${key}", but the effect declares it anyway`,
              ),
            );
          }
        }
      }

      if (effect.transformTo !== undefined && !primitiveById.has(effect.transformTo)) {
        out.push(
          diagnostic(
            file,
            `${effectAt}/transformTo`,
            'unknown-reference',
            `node "${node.id}" effect ${String(index)} names transformTo primitive "${effect.transformTo}", ` +
              'which primitive.json does not define',
          ),
        );
      }
      if (effect.reveals?.cell !== undefined && !cellById.has(effect.reveals.cell)) {
        out.push(
          diagnostic(
            file,
            `${effectAt}/reveals/cell`,
            'unknown-reference',
            `node "${node.id}" effect ${String(index)} names reveals.cell "${effect.reveals.cell}", ` +
              'which no cell.json record defines',
          ),
        );
      }
      if (effect.reveals?.primitive !== undefined && !primitiveById.has(effect.reveals.primitive)) {
        out.push(
          diagnostic(
            file,
            `${effectAt}/reveals/primitive`,
            'unknown-reference',
            `node "${node.id}" effect ${String(index)} names reveals.primitive "${effect.reveals.primitive}", ` +
              'which primitive.json does not define',
          ),
        );
      }
      if (effect.when?.kind === 'holds-cell' && !cellById.has(effect.when.cell)) {
        out.push(
          diagnostic(
            file,
            `${effectAt}/when/cell`,
            'unknown-reference',
            `node "${node.id}" effect ${String(index)} names when.cell "${effect.when.cell}", which no ` +
              'cell.json record defines',
          ),
        );
      }

      // `mentem-is-not-in-the-world` — sound-design.md §4.2: Mentem is "the
      // only form with no reverb at all… happening inside the listener's head
      // rather than in the world". Enforced for every cell of that form, v1 or
      // not, because it is a statement about the form.
      if (cell?.form === 'mentem' && effect.target === 'universe') {
        out.push(
          diagnostic(
            file,
            `${effectAt}/target`,
            'mentem-is-not-in-the-world',
            `node "${node.id}" is in Mentem cell "${cell.id}" but effect ${String(index)} declares ` +
              'target "universe". Mentem happens inside a mind, not in the world (sound-design.md §4.2), ' +
              'so none of its effects may target the whole universe',
          ),
        );
      }

      // `effect-gloss-missing` — enforced in v1 cells only, the same scope as
      // `mode-technique-incoherent`: an ungloosed effect in playable content
      // has none of sound-design.md's envelope semantics in prose either.
      if (cell?.v1 === true && effect.gloss === undefined) {
        out.push(
          diagnostic(
            file,
            effectAt,
            'effect-gloss-missing',
            `node "${node.id}" is in v1 cell "${cell.id}" but effect ${String(index)} carries no gloss`,
          ),
        );
      }
    }

    for (let index = 0; index < (node.antirequisites ?? []).length; index += 1) {
      const antirequisiteId = (node.antirequisites ?? [])[index];
      if (antirequisiteId === undefined) continue;
      const antirequisiteAt = `${at}/antirequisites/${String(index)}`;
      if (antirequisiteId === node.id) {
        out.push(
          diagnostic(
            file,
            antirequisiteAt,
            'antirequisite-self',
            `node "${node.id}" lists itself as an antirequisite`,
          ),
        );
        continue;
      }
      if (!nodeById.has(antirequisiteId)) {
        out.push(
          diagnostic(
            file,
            antirequisiteAt,
            'antirequisite-unknown',
            `node "${node.id}" names antirequisite "${antirequisiteId}", which no node.json record defines`,
          ),
        );
      }
    }
  }

  out.push(...checkAntirequisiteContradictions(nodes, nodeById));
  out.push(...checkResearchCostVariation(nodes, cellById));

  out.push(...findPrerequisiteCycles(nodes, nodeById));
}

/**
 * The symmetric closure of `node.antirequisites`.
 *
 * **Always symmetric, and not an open question.** Unlike a track exclusion
 * (`normaliseTrackExclusions`, below), a node-level antirequisite carries no
 * field to declare a one-way reason: every antirequisite authored in v1 is an
 * opposed-in-kind pair (compositional-content.md §3.2), and there is nowhere
 * on the record to say otherwise. Declaring the relation on one side is
 * enough — holding either member blocks the other, whichever a mage reaches
 * first — and declaring it on both sides is not an error.
 *
 * The one exported entry point for this normalisation, so a caller reaches
 * for `ContentRegistry.antirequisitesOf` or this function rather than
 * re-deriving the closure ad hoc.
 */
export function normaliseAntirequisites(
  nodes: readonly NodeRecord[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const closure = new Map<string, Set<string>>();
  const ensure = (id: string): Set<string> => {
    let set = closure.get(id);
    if (set === undefined) {
      set = new Set();
      closure.set(id, set);
    }
    return set;
  };
  for (const node of nodes) {
    for (const otherId of node.antirequisites ?? []) {
      if (otherId === node.id) continue;
      ensure(node.id).add(otherId);
      ensure(otherId).add(node.id);
    }
  }
  return closure;
}

/**
 * Walks every transitive prerequisite of one node, iteratively.
 *
 * An explicit stack rather than recursion, for the reason
 * `findPrerequisiteCycles` gives: a long prerequisite chain should report the
 * chain, not a `RangeError` from the JavaScript call stack. `visited` also
 * makes this safe over a graph that turns out to contain a cycle — each id is
 * pushed at most once, so a cycle here terminates instead of looping forever.
 */
function transitivePrerequisitesOf(
  nodeId: string,
  nodeById: ReadonlyMap<string, NodeRecord>,
): ReadonlySet<string> {
  const visited = new Set<string>();
  const stack: string[] = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    const node = nodeById.get(current);
    if (node === undefined) continue;
    for (const prerequisiteId of node.prerequisites) {
      if (!visited.has(prerequisiteId)) {
        visited.add(prerequisiteId);
        stack.push(prerequisiteId);
      }
    }
  }
  return visited;
}

/**
 * `antirequisite-contradicts-prerequisite`: a node that is both a transitive
 * prerequisite and an antirequisite of the same node is unreachable — holding
 * it is what researching the node requires, and holding it is exactly what
 * researching the node forbids.
 */
function checkAntirequisiteContradictions(
  nodes: readonly NodeRecord[],
  nodeById: ReadonlyMap<string, NodeRecord>,
): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];
  const closure = normaliseAntirequisites(nodes);

  for (let position = 0; position < nodes.length; position += 1) {
    const node = nodes[position];
    if (node === undefined) continue;
    const antirequisites = closure.get(node.id);
    if (antirequisites === undefined || antirequisites.size === 0) continue;

    const prerequisites = transitivePrerequisitesOf(node.id, nodeById);
    for (const antirequisiteId of [...antirequisites].sort(byString)) {
      if (prerequisites.has(antirequisiteId)) {
        out.push(
          diagnostic(
            'node.json',
            pointerAppend('', position),
            'antirequisite-contradicts-prerequisite',
            `node "${node.id}" can never be researched: "${antirequisiteId}" is both a transitive ` +
              `prerequisite of "${node.id}" and its antirequisite, so researching "${node.id}" would ` +
              `require already holding the one thing holding it forbids`,
          ),
        );
      }
    }
  }
  return out;
}

/**
 * `research-cost-is-tier-alone`: a v1 tier with two or more nodes that all
 * share one `researchCost` is `strategy-dimensionality.md`'s original defect
 * — acquisition order that is a pure function of tier — reintroduced
 * (compositional-content.md §3.5). A tier with exactly one node cannot fail
 * this: there is nothing for its cost to vary *from*.
 */
function checkResearchCostVariation(
  nodes: readonly NodeRecord[],
  cellById: ReadonlyMap<string, CellRecord>,
): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];
  const byTier = new Map<number, NodeRecord[]>();
  for (const node of nodes) {
    if (cellById.get(node.cell)?.v1 !== true) continue;
    let group = byTier.get(node.tier);
    if (group === undefined) {
      group = [];
      byTier.set(node.tier, group);
    }
    group.push(node);
  }

  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const group = byTier.get(tier);
    if (group === undefined || group.length < 2) continue;
    const costs = new Set(group.map((node) => node.researchCost));
    if (costs.size === 1) {
      const ids = [...group.map((node) => node.id)].sort(byString);
      out.push(
        diagnostic(
          'node.json',
          '',
          'research-cost-is-tier-alone',
          `v1 tier ${String(tier)} has ${String(group.length)} nodes (${ids.join(', ')}) that all share ` +
            `researchCost ${String(group[0]?.researchCost)} — acquisition order must not be a pure ` +
            'function of tier (compositional-content.md §3.5)',
        ),
      );
    }
  }
  return out;
}

/**
 * Reports every prerequisite cycle, naming the ring.
 *
 * Iterative depth-first search with an explicit stack: a content set with a long
 * prerequisite chain should not be able to blow the JavaScript stack and report
 * a `RangeError` instead of the cycle it actually found.
 */
function findPrerequisiteCycles(
  nodes: readonly NodeRecord[],
  nodeById: ReadonlyMap<string, NodeRecord>,
): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];
  const positionOf = new Map<string, number>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node !== undefined && !positionOf.has(node.id)) positionOf.set(node.id, index);
  }

  const UNVISITED = 0;
  const ON_STACK = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const reported = new Set<string>();

  for (const root of nodes) {
    if (root === undefined) continue;
    if ((state.get(root.id) ?? UNVISITED) !== UNVISITED) continue;

    const path: string[] = [];
    const frames: { id: string; next: number }[] = [{ id: root.id, next: 0 }];
    state.set(root.id, ON_STACK);
    path.push(root.id);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) break;
      const node = nodeById.get(frame.id);
      const prerequisites = node?.prerequisites ?? [];

      if (frame.next >= prerequisites.length) {
        state.set(frame.id, DONE);
        frames.pop();
        path.pop();
        continue;
      }

      const childId = prerequisites[frame.next];
      frame.next += 1;
      if (childId === undefined || !nodeById.has(childId)) continue;

      const childState = state.get(childId) ?? UNVISITED;
      if (childState === ON_STACK) {
        const start = path.indexOf(childId);
        const ring = path.slice(start === -1 ? 0 : start);
        const key = canonicalRing(ring);
        if (!reported.has(key)) {
          reported.add(key);
          out.push(
            diagnostic(
              'node.json',
              pointerAppend('', positionOf.get(frame.id) ?? 0),
              'prerequisite-cycle',
              `prerequisite cycle: ${[...ring, childId].join(' -> ')}. A cycle means no node in the ring ` +
                'is ever researchable, so it is a hard load failure rather than an unreachable branch',
            ),
          );
        }
        continue;
      }
      if (childState === DONE) continue;

      state.set(childId, ON_STACK);
      path.push(childId);
      frames.push({ id: childId, next: 0 });
    }
  }

  return out;
}

/** A cycle's identity, independent of which member the walk entered it at. */
function canonicalRing(ring: readonly string[]): string {
  if (ring.length === 0) return '';
  let best = 0;
  for (let index = 1; index < ring.length; index += 1) {
    if ((ring[index] ?? '') < (ring[best] ?? '')) best = index;
  }
  return [...ring.slice(best), ...ring.slice(0, best)].join('>');
}

function checkSpecies(
  species: readonly SpeciesRecord[],
  formById: ReadonlyMap<string, FormRecord>,
  cellById: ReadonlyMap<string, CellRecord>,
  out: ContentDiagnostic[],
): void {
  const file = 'species.json';

  for (let position = 0; position < species.length; position += 1) {
    const record = species[position];
    if (record === undefined) continue;
    const at = pointerAppend('', position);

    if (record.maturityMonths >= record.lifespanMonths) {
      out.push(
        diagnostic(
          file,
          `${at}/maturityMonths`,
          'species-invariant',
          `species "${record.id}" matures at ${String(record.maturityMonths)} months but lives ` +
            `${String(record.lifespanMonths)} — no member of it could ever become a mage`,
        ),
      );
    }

    for (const key of Object.keys(record.affinities).sort(byString)) {
      if (!formById.has(key) && !cellById.has(key)) {
        out.push(
          diagnostic(
            file,
            `${at}/affinities/${key}`,
            'unknown-reference',
            `species "${record.id}" declares an affinity for "${key}", which is neither a form nor a cell id`,
          ),
        );
      }
    }
  }
}

function checkTraditions(traditions: readonly TraditionRecord[], out: ContentDiagnostic[]): void {
  const file = 'tradition.json';

  for (let position = 0; position < traditions.length; position += 1) {
    const tradition = traditions[position];
    if (tradition === undefined) continue;
    const at = pointerAppend('', position);

    for (const point of HOOK_POINTS) {
      const hook = tradition.hooks[point];
      const hookPointer = `${at}/hooks/${point}`;

      if (!Object.hasOwn(HOOK_KINDS[point], hook.kind)) {
        const owner = hookPointOwning(hook.kind);
        const explanation =
          owner === undefined
            ? `no implementation exists for it. Permitted kinds for "${point}": ${permittedKinds(point).join(', ')}`
            : `"${hook.kind}" is a "${owner}" kind, not a "${point}" kind. Permitted kinds for ` +
              `"${point}": ${permittedKinds(point).join(', ')}`;
        out.push(
          diagnostic(
            file,
            `${hookPointer}/kind`,
            'hook-kind',
            `tradition "${tradition.id}" declares hook "${point}" of kind "${hook.kind}", but ${explanation}`,
          ),
        );
        continue;
      }

      for (const problem of checkHookParams(point, hook.kind, hook.params)) {
        out.push(
          diagnostic(
            file,
            problem.param === '' ? `${hookPointer}/params` : `${hookPointer}/params/${problem.param}`,
            'hook-params',
            `tradition "${tradition.id}", hook "${point}": ${problem.message}`,
          ),
        );
      }
    }
  }
}

/**
 * The shared trunk every mage acquires early (`compositional-content.md`
 * §3.1's "shared body of magic"): tiers 1 and 2. `track-excluded-by-trunk`
 * reads this as the boundary below which a track is effectively universal.
 */
const TRUNK_MAX_TIER = 2;

/**
 * `exclusion-reason-missing`'s floor. The schema's own `minLength` is 1 — it
 * cannot reject a placeholder without also rejecting every genuine one-word
 * gloss no author would write — so the graph phase enforces the length a
 * one-sentence justification actually needs.
 */
const MIN_EXCLUSION_GLOSS_LENGTH = 16;

/**
 * `ritual-too-few-roles`' floor (`contracts.md` §2.13). `ritual.schema.json`'s
 * own `roles.minItems` is 1, deliberately below this, so a single-role record
 * fails here with the diagnostic that explains *why* two is the minimum
 * — "one caster role is just an expensive spell" — rather than being
 * foreclosed by the schema before that reasoning ever runs.
 */
const MIN_RITUAL_ROLES = 2;

/**
 * The closure `track.excludes` resolves to, honouring each exclusion's own
 * `symmetric` flag rather than imposing one direction on every entry.
 *
 * **Symmetry is derived from the exclusion's stated reason, not a free
 * choice** — the author's ruling: two things opposed *in kind* (light and
 * dark, making and unmaking) exclude each other mutually, while a one-way
 * reason gives a one-way lock. The data declares which it is with
 * `symmetric`, and this function honours whatever it declares: a
 * `symmetric: true` entry adds both directed edges, a `symmetric: false`
 * entry adds only the authored one. Contrast `normaliseAntirequisites`, whose
 * node-level relation has no field to say otherwise and is always symmetric.
 */
export function normaliseTrackExclusions(
  tracks: readonly TrackRecord[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const closure = new Map<string, Set<string>>();
  const ensure = (id: string): Set<string> => {
    let set = closure.get(id);
    if (set === undefined) {
      set = new Set();
      closure.set(id, set);
    }
    return set;
  };
  for (const track of tracks) {
    for (const exclusion of track.excludes) {
      ensure(track.id).add(exclusion.track);
      if (exclusion.symmetric) ensure(exclusion.track).add(track.id);
    }
  }
  return closure;
}

function checkTracks(
  tracks: readonly TrackRecord[],
  trackById: ReadonlyMap<string, TrackRecord>,
  nodes: readonly NodeRecord[],
  nodeById: ReadonlyMap<string, NodeRecord>,
  out: ContentDiagnostic[],
): void {
  const file = 'track.json';

  for (let position = 0; position < tracks.length; position += 1) {
    const track = tracks[position];
    if (track === undefined) continue;
    const at = pointerAppend('', position);

    for (let index = 0; index < track.excludes.length; index += 1) {
      const exclusion = track.excludes[index];
      if (exclusion === undefined) continue;
      const exclusionAt = `${at}/excludes/${String(index)}`;

      if (exclusion.track === track.id) {
        out.push(
          diagnostic(file, exclusionAt, 'track-exclusion-self', `track "${track.id}" excludes itself`),
        );
        continue;
      }

      const excludedTrack = trackById.get(exclusion.track);
      if (excludedTrack === undefined) {
        out.push(
          diagnostic(
            file,
            `${exclusionAt}/track`,
            'track-unknown',
            `track "${track.id}" names excluded track "${exclusion.track}", which no track.json record defines`,
          ),
        );
        continue;
      }

      if (exclusion.gloss.length < MIN_EXCLUSION_GLOSS_LENGTH) {
        out.push(
          diagnostic(
            file,
            `${exclusionAt}/gloss`,
            'exclusion-reason-missing',
            `track "${track.id}" excludes "${exclusion.track}" with a gloss of only ` +
              `${String(exclusion.gloss.length)} character(s). An exclusion's shape is derived from its ` +
              `reason (contracts.md §2.12), and a reason too short to be a sentence is a placeholder — ` +
              `the loader requires at least ${String(MIN_EXCLUSION_GLOSS_LENGTH)}`,
          ),
        );
      }

      // `track-excluded-by-trunk`: tiers 1-2 are the shared trunk every mage
      // acquires early. If the excluded track carries any node that shallow,
      // essentially every mage touches it before she could ever choose this
      // one, and this track becomes dead content — excluded by knowledge
      // nobody avoids.
      const trunkNode = nodes.find(
        (node) => node.track === excludedTrack.id && node.tier <= TRUNK_MAX_TIER,
      );
      if (trunkNode !== undefined) {
        out.push(
          diagnostic(
            file,
            exclusionAt,
            'track-excluded-by-trunk',
            `track "${track.id}" excludes "${excludedTrack.id}", but "${excludedTrack.id}" contains tier-` +
              `${String(trunkNode.tier)} node "${trunkNode.id}". Tiers 1-2 are the shared trunk every mage ` +
              `acquires early, so a track excluded by trunk knowledge is a track nobody can ever enter`,
          ),
        );
      }
    }
  }

  // A node's `track` field, checked here rather than in checkNodes so every
  // track-shaped diagnostic lives beside the rest of them.
  for (let position = 0; position < nodes.length; position += 1) {
    const node = nodes[position];
    if (node === undefined || node.track === undefined) continue;
    if (!trackById.has(node.track)) {
      out.push(
        diagnostic(
          'node.json',
          `${pointerAppend('', position)}/track`,
          'track-unknown',
          `node "${node.id}" names track "${node.track}", which no track.json record defines`,
        ),
      );
    }
  }

  const exclusionClosure = normaliseTrackExclusions(tracks);

  // `track-exclusion-unsatisfiable`: a node on track T with a prerequisite on
  // a track T' the exclusion closure puts on the other side of T is content
  // nobody can ever reach — researching it requires already holding a node
  // whose track closes the door T's exclusion just opened.
  for (let position = 0; position < nodes.length; position += 1) {
    const node = nodes[position];
    if (node === undefined || node.track === undefined) continue;
    if (!trackById.has(node.track)) continue; // already reported track-unknown
    const excluded = exclusionClosure.get(node.track);
    if (excluded === undefined || excluded.size === 0) continue;

    for (let index = 0; index < node.prerequisites.length; index += 1) {
      const prerequisiteId = node.prerequisites[index];
      if (prerequisiteId === undefined) continue;
      const prerequisite = nodeById.get(prerequisiteId);
      if (prerequisite?.track === undefined || !excluded.has(prerequisite.track)) continue;

      out.push(
        diagnostic(
          'node.json',
          `${pointerAppend('', position)}/prerequisites/${String(index)}`,
          'track-exclusion-unsatisfiable',
          `node "${node.id}" is on track "${node.track}", which excludes track "${prerequisite.track}", ` +
            `but its prerequisite "${prerequisiteId}" is on that excluded track — "${node.id}" could never ` +
            'be researched',
        ),
      );
    }
  }

  // `track-unreachable-from-trunk`: a track with no node whose prerequisites
  // lie entirely outside the tracks it excludes has no door in — every path
  // onto it first requires crossing a track it cannot coexist with.
  const nodesByTrack = new Map<string, NodeRecord[]>();
  for (const node of nodes) {
    if (node.track === undefined) continue;
    let members = nodesByTrack.get(node.track);
    if (members === undefined) {
      members = [];
      nodesByTrack.set(node.track, members);
    }
    members.push(node);
  }

  for (let position = 0; position < tracks.length; position += 1) {
    const track = tracks[position];
    if (track === undefined) continue;
    const members = nodesByTrack.get(track.id);
    if (members === undefined || members.length === 0) continue;

    const excluded = exclusionClosure.get(track.id) ?? new Set<string>();
    const hasEntryPoint = members.some((node) =>
      node.prerequisites.every((prerequisiteId) => {
        const prerequisite = nodeById.get(prerequisiteId);
        return prerequisite?.track === undefined || !excluded.has(prerequisite.track);
      }),
    );
    if (!hasEntryPoint) {
      out.push(
        diagnostic(
          file,
          pointerAppend('', position),
          'track-unreachable-from-trunk',
          `track "${track.id}" has no node whose prerequisites lie entirely outside the tracks it ` +
            'excludes — every node on it requires a prerequisite from an excluded track, so it can never ' +
            'be entered',
        ),
      );
    }
  }
}

/**
 * Like {@link normaliseTrackExclusions}, but keeps the `threshold` each edge
 * carries instead of collapsing it to membership in a `Set`.
 *
 * `ritual-castable-by-one` needs the number: the loader's own `TrackExclusion`
 * doc says it precisely — *"a mage holding `threshold` nodes of the named
 * track may not learn anything on this one"* — and a ritual role satisfiable
 * on fewer nodes than that is a role a mage could fill without the exclusion
 * ever engaging. This is a second, ritual-only pass over the same `excludes`
 * declarations rather than a change to `normaliseTrackExclusions`'s return
 * shape, which every other track check in this file still calls and which
 * has no use for the number.
 *
 * The result reads as `closure.get(trackId)?.get(otherTrackId)` = the fewest
 * nodes of `otherTrackId` one mind may hold before `trackId` closes to it —
 * i.e. the edge `acquisitionExclusion` (`@mm/rules-magic`) enforces at
 * acquisition time. Honours `symmetric` exactly as `normaliseTrackExclusions`
 * does: a `symmetric: true` entry adds both directed edges, a `symmetric:
 * false` entry adds only the authored one. Where more than one declaration
 * would produce the same directed edge, the smaller threshold wins, because
 * that is the one that actually fires first at runtime — `acquisitionExclusion`
 * refuses as soon as *any* matching exclusion's threshold is met.
 */
function trackExclusionThresholds(
  tracks: readonly TrackRecord[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const closure = new Map<string, Map<string, number>>();
  const record = (from: string, to: string, threshold: number): void => {
    let edges = closure.get(from);
    if (edges === undefined) {
      edges = new Map();
      closure.set(from, edges);
    }
    const existing = edges.get(to);
    if (existing === undefined || threshold < existing) edges.set(to, threshold);
  };

  for (const track of tracks) {
    for (const exclusion of track.excludes) {
      record(track.id, exclusion.track, exclusion.threshold);
      if (exclusion.symmetric) record(exclusion.track, track.id, exclusion.threshold);
    }
  }
  return closure;
}

/**
 * `contracts.md` §2.13's self-enforcing gate: a ritual whose caster roles are
 * not mutually exclusive is refused at load, because such a "ritual" is
 * satisfiable by one sufficiently patient mage and is just an expensive spell
 * wearing this shape for no reason.
 *
 * **Every check here is a load failure, never a warning** — the same rule
 * `compositional-content.md` §5 states for the track graph, extended to the
 * construct built on top of it.
 */
function checkRituals(
  rituals: readonly RitualRecord[],
  tracks: readonly TrackRecord[],
  trackById: ReadonlyMap<string, TrackRecord>,
  primitiveById: ReadonlyMap<string, PrimitiveRecord>,
  out: ContentDiagnostic[],
): void {
  const file = 'ritual.json';
  const thresholds = trackExclusionThresholds(tracks);

  for (let position = 0; position < rituals.length; position += 1) {
    const ritual = rituals[position];
    if (ritual === undefined) continue;
    const at = pointerAppend('', position);

    if (ritual.roles.length < MIN_RITUAL_ROLES) {
      out.push(
        diagnostic(
          file,
          `${at}/roles`,
          'ritual-too-few-roles',
          `ritual "${ritual.id}" declares ${String(ritual.roles.length)} caster role(s); a ritual needs ` +
            `at least ${String(MIN_RITUAL_ROLES)} — one caster role is just an expensive spell, and the ` +
            'whole point of this construct is that no one mage can fill every role herself',
        ),
      );
    }

    // Resolve each role's track, reporting a name no track.json record
    // defines. `undefined` stands in for "already reported" below, so the
    // mutual-exclusion and duplicate-track passes never re-report the same
    // defect a second way.
    const roleTracks: (string | undefined)[] = [];
    for (let index = 0; index < ritual.roles.length; index += 1) {
      const role = ritual.roles[index];
      if (role === undefined) {
        roleTracks.push(undefined);
        continue;
      }
      if (trackById.has(role.track)) {
        roleTracks.push(role.track);
      } else {
        out.push(
          diagnostic(
            file,
            `${at}/roles/${String(index)}/track`,
            'ritual-role-track-unknown',
            `ritual "${ritual.id}" role ${String(index)} names track "${role.track}", which no track.json ` +
              'record defines',
          ),
        );
        roleTracks.push(undefined);
      }
    }

    // `ritual-duplicate-role-track`: two roles on one track are one role,
    // authored twice, not two casters — a track cannot exclude itself
    // (`track-exclusion-self`), so the mutual-exclusion pass below could
    // never make sense of this pair and does not try.
    const firstRoleForTrack = new Map<string, number>();
    for (let index = 0; index < roleTracks.length; index += 1) {
      const trackId = roleTracks[index];
      if (trackId === undefined) continue;
      const firstIndex = firstRoleForTrack.get(trackId);
      if (firstIndex === undefined) {
        firstRoleForTrack.set(trackId, index);
        continue;
      }
      out.push(
        diagnostic(
          file,
          `${at}/roles/${String(index)}/track`,
          'ritual-duplicate-role-track',
          `ritual "${ritual.id}" names track "${trackId}" in both role ${String(firstIndex)} and role ` +
            `${String(index)} — two roles on the same track are one role authored twice, not two casters`,
        ),
      );
    }

    // `ritual-castable-by-one`: for every ordered pair of distinct-track
    // roles (i, j), track i must be closed by holding role j's track — and
    // role j's own `minNodes` must reach the threshold that closes it, or a
    // mage below that threshold could dabble in both roles' tracks at once
    // and the exclusion never engages for her. Proven once per ordered pair
    // (`compositional-content.md` §3.2's "a mage holding `threshold` nodes of
    // the named track may not learn anything on this one" run forward and
    // backward), which is what makes the ritual uncastable by one mage
    // *however long she lives* rather than merely inconvenient for her.
    for (let i = 0; i < ritual.roles.length; i += 1) {
      const trackI = roleTracks[i];
      if (trackI === undefined) continue;

      for (let j = 0; j < ritual.roles.length; j += 1) {
        if (i === j) continue;
        const trackJ = roleTracks[j];
        if (trackJ === undefined || trackJ === trackI) continue; // already reported

        const roleJ = ritual.roles[j];
        if (roleJ === undefined) continue;

        const closingThreshold = thresholds.get(trackI)?.get(trackJ);
        if (closingThreshold === undefined) {
          out.push(
            diagnostic(
              file,
              `${at}/roles/${String(i)}`,
              'ritual-castable-by-one',
              `ritual "${ritual.id}": role ${String(i)}'s track "${trackI}" declares no exclusion — direct ` +
                `or symmetric — that closes once a mage holds enough of role ${String(j)}'s track "${trackJ}". ` +
                'Without one, a single sufficiently patient mage could eventually hold both, and this ' +
                '"ritual" is just an expensive spell',
            ),
          );
          continue;
        }

        if (roleJ.minNodes < closingThreshold) {
          out.push(
            diagnostic(
              file,
              `${at}/roles/${String(j)}/minNodes`,
              'ritual-castable-by-one',
              `ritual "${ritual.id}": role ${String(j)} requires only ${String(roleJ.minNodes)} node(s) of ` +
                `track "${trackJ}", below the ${String(closingThreshold)} needed to close track "${trackI}" ` +
                `to a mage who holds them. A mage could hold ${String(roleJ.minNodes)} of "${trackJ}" without ` +
                `ever closing role ${String(i)}'s track, so one mage could fill both roles at once`,
            ),
          );
        }
      }
    }

    for (let index = 0; index < ritual.effects.length; index += 1) {
      const effect = ritual.effects[index];
      if (effect === undefined) continue;
      if (!primitiveById.has(effect.primitive)) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/primitive`,
            'unknown-reference',
            `ritual "${ritual.id}" declares effect primitive "${effect.primitive}", which primitive.json ` +
              'does not define',
          ),
        );
      }
    }
  }
}

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byKey(a: readonly [string, unknown], b: readonly [string, unknown]): number {
  return byString(a[0], b[0]);
}

// ---------------------------------------------------------------------------
// Interning
// ---------------------------------------------------------------------------

function buildRegistry(documents: ParsedDocuments): ContentRegistry {
  const techniqueBit = new Map<string, number>();
  for (const record of documents.technique) techniqueBit.set(record.id, record.bit);
  const formBit = new Map<string, number>();
  for (const record of documents.form) formBit.set(record.id, record.bit);

  const techniques = documents.technique
    .map((record) => ({ contentId: internFromBit(record.bit), record }))
    .sort(byContentId);
  const forms = documents.form
    .map((record) => ({ contentId: internFromBit(record.bit), record }))
    .sort(byContentId);
  const cells = documents.cell
    .map((record) => ({
      contentId: internCell(techniqueBit.get(record.technique) ?? 0, formBit.get(record.form) ?? 0),
      record,
    }))
    .sort(byContentId);

  const nodes = internNamespace(documents.node);
  const species = internNamespace(documents.species);
  const traditions = internNamespace(documents.tradition);
  const primitives = internNamespace(documents.primitive);
  const territories = internNamespace(documents.territory);
  const godCosts = internNamespace(documents.godCost);
  const godConstants = internNamespace(documents.godConstant);
  const raidConstants = internNamespace(documents.raidConstant);
  const autonomyWeights = internNamespace(documents.autonomyWeight);
  const tracks = internNamespace(documents.track);
  const rituals = internNamespace(documents.ritual);

  const tables = new Map<ContentNamespace, ReadonlyMap<string, ContentId>>([
    ['technique', tableOf(techniques)],
    ['form', tableOf(forms)],
    ['cell', tableOf(cells)],
    ['node', tableOf(nodes)],
    ['species', tableOf(species)],
    ['tradition', tableOf(traditions)],
    ['primitive', tableOf(primitives)],
    ['territory', tableOf(territories)],
    ['god-cost', tableOf(godCosts)],
    ['god-constant', tableOf(godConstants)],
    ['raid-constant', tableOf(raidConstants)],
    ['autonomy-weight', tableOf(autonomyWeights)],
    ['track', tableOf(tracks)],
    ['ritual', tableOf(rituals)],
  ]);
  const reverse = new Map<ContentNamespace, ReadonlyMap<ContentId, string>>();
  for (const [namespace, table] of tables) {
    reverse.set(namespace, new Map([...table].map(([id, contentId]) => [contentId, id])));
  }

  const cellByContentId = new Map(cells.map((entry) => [entry.contentId, entry.record]));
  const nodeByContentId = new Map(nodes.map((entry) => [entry.contentId, entry.record]));
  // Keyed on the §4.2 action id and the constant name rather than on the
  // interned id: both tables are looked up by what they mean, never by the
  // integer interning happened to assign them.
  const godCostByAction = new Map(godCosts.map((entry) => [entry.record.actionId, entry.record]));
  const godConstantById = new Map(godConstants.map((entry) => [entry.record.id, entry.record.value]));
  const raidConstantById = new Map(
    raidConstants.map((entry) => [entry.record.id, entry.record.value]),
  );
  // Scalars and role-appeal rows are separated here rather than at every read.
  // A role-appeal row is looked up by the pair it prices, never by its id, and
  // a scalar lookup that could accidentally hit one would be a divisor read out
  // of a table of appeals.
  const autonomyWeightById = new Map(
    autonomyWeights
      .filter((entry) => !isRoleAppeal(entry.record))
      .map((entry) => [entry.record.id, entry.record.value]),
  );
  const roleAppealByPair = new Map(
    autonomyWeights
      .filter((entry) => isRoleAppeal(entry.record))
      .map((entry) => [
        `${String(entry.record.role)} ${String(entry.record.primitive)}`,
        entry.record.value,
      ]),
  );

  const revisionEntries: RevisionEntry[] = [];
  const append = (namespace: ContentNamespace, entries: readonly Interned<unknown>[]): void => {
    for (const entry of entries) {
      revisionEntries.push({ namespace, contentId: entry.contentId, record: entry.record });
    }
  };
  append('technique', techniques);
  append('form', forms);
  append('cell', cells);
  append('node', nodes);
  append('species', species);
  append('tradition', traditions);
  append('primitive', primitives);
  append('territory', territories);
  append('god-cost', godCosts);
  append('god-constant', godConstants);
  append('raid-constant', raidConstants);
  append('autonomy-weight', autonomyWeights);
  append('track', tracks);
  append('ritual', rituals);

  // Antirequisites are declared one node at a time but meant as a relation
  // between a pair; the symmetric closure is computed once here, over the
  // interned node set, rather than per call.
  const antirequisiteClosure = normaliseAntirequisites(documents.node);

  const counts: ContentCounts = {
    techniques: techniques.length,
    forms: forms.length,
    cells: cells.length,
    v1Cells: cells.filter((entry) => entry.record.v1 === true).length,
    nodes: nodes.length,
    species: species.length,
    traditions: traditions.length,
    primitives: primitives.length,
    territories: territories.length,
    godCosts: godCosts.length,
    godConstants: godConstants.length,
    raidConstants: raidConstants.length,
    autonomyWeights: autonomyWeights.length,
    tracks: tracks.length,
    rituals: rituals.length,
  };

  return {
    contentRevision: computeContentRevision(revisionEntries),
    counts,
    techniques,
    forms,
    cells,
    nodes,
    species,
    traditions,
    primitives,
    territories,
    godCosts,
    godConstants,
    raidConstants,
    autonomyWeights,
    tracks,
    rituals,
    intern(namespace, id) {
      return tables.get(namespace)?.get(id) ?? 0;
    },
    idOf(namespace, contentId) {
      return reverse.get(namespace)?.get(contentId);
    },
    cellAt(techniqueId, formId) {
      if (techniqueId < 1 || techniqueId > TECHNIQUE_COUNT) return 0;
      if (formId < 1 || formId > FORM_COUNT) return 0;
      return internCell(techniqueId - 1, formId - 1);
    },
    cell(contentId) {
      return cellByContentId.get(contentId);
    },
    node(contentId) {
      return nodeByContentId.get(contentId);
    },
    godCost(actionId) {
      return godCostByAction.get(actionId);
    },
    godConstant(id) {
      const found = godConstantById.get(id);
      if (found === undefined) {
        throw new Error(
          `No god-agency constant named "${id}" is declared in god-constant.json. The loader ` +
            'checks the required set on every load, so this is a caller inventing a name — and ' +
            'returning 0 would put a silently wrong magnitude in the middle of a balance formula.',
        );
      }
      return found;
    },
    raidConstant(id) {
      const found = raidConstantById.get(id);
      if (found === undefined) {
        throw new Error(
          `No raid constant named "${id}" is declared in raid-constant.json. The loader checks ` +
            'the required set on every load, so this is a caller inventing a name — and returning ' +
            '0 would be a cast that reaches nowhere or a portal that never decays.',
        );
      }
      return found;
    },
    autonomyWeight(id) {
      const found = autonomyWeightById.get(id);
      if (found === undefined) {
        throw new Error(
          `No autonomy weight named "${id}" is declared in autonomy-weight.json. The loader ` +
            'checks the required set on every load, so this is a caller inventing a name — and ' +
            'returning 0 would be a divisor of zero, or a whole input to a mage\'s choice ' +
            'silently removed while she went on choosing plausibly.',
        );
      }
      return found;
    },
    roleAppeal(role, primitiveId) {
      return roleAppealByPair.get(`${role} ${primitiveId}`) ?? 0;
    },
    antirequisitesOf(nodeId) {
      return antirequisiteClosure.get(nodeId) ?? EMPTY_STRING_SET;
    },
  };
}

/** Shared empty set for {@link ContentRegistry.antirequisitesOf}'s no-antirequisite case. */
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

function internNamespace<T extends { readonly id: string }>(
  records: readonly T[],
): readonly Interned<T>[] {
  const table = internSorted(records.map((record) => record.id));
  return records
    .map((record) => ({ contentId: table.get(record.id) ?? 0, record }))
    .sort(byContentId);
}

function tableOf(entries: readonly Interned<{ readonly id: string }>[]): ReadonlyMap<string, ContentId> {
  return new Map(entries.map((entry) => [entry.record.id, entry.contentId]));
}

function byContentId(a: Interned<unknown>, b: Interned<unknown>): number {
  return a.contentId - b.contentId;
}
