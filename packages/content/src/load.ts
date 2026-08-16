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
import { checkGodConstants, checkGodCosts, checkGodEconomy } from './god.js';
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
 */
export const MAX_CONTENT_NODES = 1024;

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

/**
 * Whether a node may author a **negative** magnitude for this primitive.
 *
 * ## The rule, and the whole reason it is one line
 *
 * `node.schema.json` read `"minimum": 1` for as long as there was content, so
 * all 407 shipped effects were positive and no node could express a cost. Every
 * deep spell was a bonus, and a rate primitive wired to node effects could only
 * ever *add* — which is a pure output boost with no opposing term, exactly the
 * shape the balance work keeps refusing to build on.
 *
 * A negative is meaningful under `additive-into-multiplier` and only there. Those
 * are the seven world-scale rate multipliers; their magnitudes are contributions
 * to the `(1 + Σ)` a rate is multiplied by, `Σ` is a signed quantity by
 * construction, and `@mm/primitives` floors the fold at zero so a stack of costs
 * can stop a rate and can never reverse it.
 *
 * Every other rule is refused, and each refusal is a defect that would otherwise
 * be silent rather than a conservatism:
 *
 * - **`presence`** (`portal`) — the magnitude carries no meaning at all, so a
 *   negative one still opens the portal while reading as a prohibition.
 * - **`multiplicative-on-remainder`** (`ward`, `concealment`) — the value is a
 *   *prevented fraction*. A negative one makes `applyWard` amplify damage with
 *   no bound at all, because the only bound in that direction is a ceiling.
 * - **`max`** (`blink`, `knowledge-steal`) — `knowledge-steal` is an fp
 *   probability and `rollStackedProbability` tests `draw < value` against an
 *   unclamped stack, so a negative probability is silently always-false.
 * - **`additive`** and **`summed-then-single-ward`** (`direct-damage`,
 *   `area-denial`, `summon`, `lifespan`) — each would need a floor of its own
 *   that no shared rule can supply. A negative `summon` has no count floor; a
 *   negative `direct-damage` is healing, which is a design decision rather than
 *   a sign convention.
 *
 * `lifespan` is the near miss worth naming here rather than in a commit message:
 * `effectiveLifespan` **already** floors a curse at `MIN_EFFECTIVE_LIFESPAN_MONTHS`
 * and its own field is documented *"true when the floor bound, i.e. a curse drove
 * the total non-positive."* Enabling it is one line in this function. It is left
 * refused because how many months a curse takes is a content-scale decision — and
 * because authored `lifespan` magnitudes are currently sub-month values that
 * `toInt` floors to zero, so the first authored curse would have to answer that
 * question anyway.
 *
 * Derived from the registry's declared `stacking` rather than a per-primitive
 * flag, so opening a rule opens it everywhere at once and there is no way for
 * `primitive.json` to say "signed" about a rule that cannot hold a sign.
 */
export function permitsNegativeMagnitude(primitive: PrimitiveRecord): boolean {
  return primitive.stacking === 'additive-into-multiplier';
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

  checkBits(documents.technique, 'technique.json', TECHNIQUE_COUNT, out);
  checkBits(documents.form, 'form.json', FORM_COUNT, out);

  checkCells(documents.cell, techniqueById, formById, nodeById, out);
  checkNodes(documents.node, cellById, nodeById, primitiveById, out);
  checkSpecies(documents.species, formById, cellById, out);
  checkTraditions(documents.tradition, out);
  // `god-agency`'s two tables. Their coverings and identities are checks a JSON
  // Schema cannot express — see `god.ts`.
  out.push(...checkGodCosts(documents.godCost));
  out.push(...checkGodConstants(documents.godConstant));
  // The one identity that spans both tables: the stewardship drain's floor must
  // leave a god able to afford the action that ends the drain.
  out.push(...checkGodEconomy(documents.godCost, documents.godConstant));
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
  checkExclusions(cells, out);
}

/**
 * The `intellego` technique, which `vision.md` §4b rules out as an exclusion
 * candidate: *"Intellego is the grid's perception trunk, so excluding it costs a
 * mage two-thirds of the grid rather than a school, and it is therefore not a
 * candidate."*
 *
 * A literal rather than a value derived from the technique that happens to have
 * the most cross-cell edges. The rule is a design decision recorded in §4b, not
 * a property of whatever content is loaded — deriving it would let a content
 * edit quietly move which technique is protected.
 */
const PERCEPTION_TRUNK_TECHNIQUE = 'intellego';

/**
 * Anti-requisites (`vision.md` §4b), authored on cells and validated here.
 *
 * ## Why a one-sided exclusion is a hard failure rather than an inference
 *
 * §4b: *"Every exclusion carries its **reason**, and symmetry follows from the
 * reason rather than being asserted alongside it — an exclusion whose reason
 * does not run both ways is not yet an exclusion."*
 *
 * The loader could synthesise the reverse edge from the forward one. It does
 * not, because that would author content nobody wrote, and the reason is the
 * part that would be fabricated: an exclusion's reason is the thing a reader
 * checks the symmetry *against*. A generated mirror would always look symmetric
 * and would prove nothing. `contracts.md` §2 refuses the same shape everywhere
 * else — a silently-completed record is a balance defect found weeks later with
 * nothing pointing at the content.
 *
 * So both halves are authored, and the two must agree on **reason** and on
 * **resolution**. Disagreeing halves are the interesting case: they are what a
 * half-finished edit looks like, and taking either side would be a coin flip
 * that decides whether a mage loses her holdings.
 */
function checkExclusions(cells: readonly CellRecord[], out: ContentDiagnostic[]): void {
  const file = 'cell.json';
  const byId = new Map<string, CellRecord>();
  for (const cell of cells) if (!byId.has(cell.id)) byId.set(cell.id, cell);

  for (let position = 0; position < cells.length; position += 1) {
    const cell = cells[position];
    if (cell === undefined) continue;
    const exclusions = cell.excludes ?? [];

    for (let index = 0; index < exclusions.length; index += 1) {
      const exclusion = exclusions[index];
      if (exclusion === undefined) continue;
      const at = `${pointerAppend('', position)}/excludes/${String(index)}`;

      if (exclusion.cell === cell.id) {
        out.push(
          diagnostic(
            file,
            at,
            'self-exclusion',
            `cell "${cell.id}" excludes itself. An anti-requisite is a relation between two ` +
              'bodies of magic, and a mage cannot be forbidden what holding it is the condition of',
          ),
        );
        continue;
      }

      const other = byId.get(exclusion.cell);
      if (other === undefined) {
        out.push(
          diagnostic(
            file,
            `${at}/cell`,
            'unknown-reference',
            `cell "${cell.id}" excludes "${exclusion.cell}", which no cell.json record defines`,
          ),
        );
        continue;
      }

      if (
        cell.technique === PERCEPTION_TRUNK_TECHNIQUE ||
        other.technique === PERCEPTION_TRUNK_TECHNIQUE
      ) {
        out.push(
          diagnostic(
            file,
            at,
            'intellego-exclusion',
            `the exclusion between "${cell.id}" and "${exclusion.cell}" names a ` +
              `"${PERCEPTION_TRUNK_TECHNIQUE}" cell. vision.md §4b rules the perception trunk out ` +
              'as a candidate: excluding it costs a mage two-thirds of the grid rather than a ' +
              'school, which is not an exclusion between bodies of magic but a lobotomy',
          ),
        );
        continue;
      }

      const mirror = (other.excludes ?? []).find((candidate) => candidate.cell === cell.id);
      if (mirror === undefined) {
        out.push(
          diagnostic(
            file,
            at,
            'asymmetric-exclusion',
            `cell "${cell.id}" excludes "${exclusion.cell}", which does not exclude it back. ` +
              'vision.md §4b derives symmetry from the reason rather than asserting it alongside, ' +
              'so a one-sided edge is not yet an exclusion — author the mirror with the same ' +
              'reason, or delete this one. The loader will not synthesise it, because the reason ' +
              'is the half that would be fabricated',
          ),
        );
        continue;
      }

      if (mirror.reason !== exclusion.reason) {
        out.push(
          diagnostic(
            file,
            `${at}/reason`,
            'asymmetric-exclusion',
            `the exclusion between "${cell.id}" and "${exclusion.cell}" carries two different ` +
              'reasons. §4b makes symmetry follow from the reason, so two reasons are two ' +
              'different claims and at most one of them is the exclusion',
          ),
        );
      }

      if (mirror.resolution !== exclusion.resolution) {
        out.push(
          diagnostic(
            file,
            `${at}/resolution`,
            'asymmetric-exclusion',
            `the exclusion between "${cell.id}" and "${exclusion.cell}" resolves as ` +
              `"${exclusion.resolution}" one way and "${mirror.resolution}" the other. Which side ` +
              'a mage approaches from cannot decide whether she loses her holdings',
          ),
        );
      }
    }
  }
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
      const primitive = primitiveById.get(effect.primitive);
      if (primitive === undefined) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/primitive`,
            'unknown-reference',
            `node "${node.id}" declares effect primitive "${effect.primitive}", which primitive.json ` +
              'does not define. The primitive set is closed: content may not invent one — which is also ' +
              'what forbids a primitive that would modify portalStability (contracts.md §1.6)',
          ),
        );
        continue;
      }

      // `substrate.md` §2: the five techniques are five operations on one
      // conserved quantity, and the sign follows from the operation. **Creo
      // adds and Perdo removes**, so a Creo node may not carry a negative
      // world-scale magnitude and a Perdo node may not carry a positive one.
      //
      // ## Why only world scale
      //
      // The naive form of this rule — "a Perdo node may not carry a positive
      // magnitude" — was tested against shipped content and **refuted**: 18
      // Perdo effects are positive, and every one is an *engagement* primitive
      // (`direct-damage`, `area-denial`, `concealment`, `ward`). Those measure
      // a **consequence**, not a flow of vis. Unmaking a scent trail produces
      // concealment; the concealment is positive because it is what the
      // unmaking *achieved*, and the operation is still destructive. So the
      // rule binds where the primitive names a flow, which is world scale.
      //
      // *Intellego* is deliberately unconstrained, and that is Maxwell's demon
      // rather than an exemption. 19 Intellego nodes carry positive
      // `resource-yield` — *"know how many, of what ages, and which of them
      // will not see the winter"* — and none of them creates food. They are
      // information reducing waste in a process that was already running, so
      // the same labour yields more. That extracts more useful work from an
      // existing flow without adding to it, which is exactly what perception
      // is allowed to do.
      //
      // ## This rule was obeyed before it existed
      //
      // Measured over all 300 shipped nodes at the time of writing: Creo,
      // Intellego, Muto and Rego carry 220 world-scale effects between them
      // and **every one is positive**. Perdo carries exactly **one** — a
      // negative `teach-rate` — and no Perdo node has ever carried a positive
      // `resource-yield`. Nothing enforced any of that. The authors were
      // following the cosmology before it was written down, which is the
      // strongest available evidence that it was discovered rather than
      // invented, and it is why this check lands with zero content churn.
      //
      // Note it could not have been violated before signed magnitudes existed:
      // every magnitude had to be positive, and a positive Perdo world effect
      // is incoherent, so authors simply never wrote one. Signed magnitudes is
      // what admitted Perdo to the world economy at all.
      const scale = primitive.scale;
      const technique = cell?.technique;
      if (scale === 'world' && technique === 'perdo' && effect.magnitude > 0) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/magnitude`,
            'technique-sign',
            `node "${node.id}" is a *Perdo* working and adds ${String(effect.magnitude)} to ` +
              `"${effect.primitive}", a world-scale flow. Perdo unmakes: an unmaking that ` +
              'increases a flow is not a balance choice, it is a claim that destruction creates. ' +
              'Author it negative, or move the effect to a technique that makes (substrate.md §2)',
          ),
        );
      }
      if (scale === 'world' && technique === 'creo' && effect.magnitude < 0) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/magnitude`,
            'technique-sign',
            `node "${node.id}" is a *Creo* working and subtracts ${String(-effect.magnitude)} from ` +
              `"${effect.primitive}", a world-scale flow. Creo makes: a making that reduces a flow ` +
              'is a cost wearing the wrong technique — author it under Perdo (substrate.md §2)',
          ),
        );
      }

      if (effect.magnitude === 0) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/magnitude`,
            'content-invariant',
            `node "${node.id}" authors a magnitude of zero for "${effect.primitive}". An effect that ` +
              'does nothing reads as an authored intent and behaves as a comment; delete the effect ' +
              'instead. (The schema cannot say this: the interpreter behind it implements neither ' +
              '"not" nor "exclusiveMinimum".)',
          ),
        );
      } else if (effect.magnitude < 0 && !permitsNegativeMagnitude(primitive)) {
        out.push(
          diagnostic(
            file,
            `${at}/effects/${String(index)}/magnitude`,
            'content-invariant',
            `node "${node.id}" authors a negative magnitude for "${effect.primitive}", whose ` +
              `stacking rule is "${primitive.stacking}". A cost is only meaningful under ` +
              '"additive-into-multiplier", where it subtracts from the (1 + Σ) a rate is ' +
              'multiplied by and @mm/primitives floors that fold at zero. Under every other rule ' +
              'a negative is a category error with no floor to catch it: it inverts a prevented ' +
              'fraction, an evasion probability or a summoned headcount rather than opposing one ' +
              '(contracts.md §3)',
          ),
        );
      }
    }
  }

  out.push(...findPrerequisiteCycles(nodes, nodeById));
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
  };
}

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
