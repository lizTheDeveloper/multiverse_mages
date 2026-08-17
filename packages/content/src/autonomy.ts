/*
 * Multiverse Mages — the target-appeal weight table, and the one invariant that
 * keeps a role from becoming an order.
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
 * `autonomy-weight.json`, and the checks a JSON Schema cannot make over it.
 *
 * The file is modelled on `god-constant.json` for the reason that one exists:
 * the rules read each magnitude **by name**, so the set of ids is a contract
 * checked in both directions while every value is an untuned placeholder the
 * balance harness owns.
 *
 * ## Why this table exists at all
 *
 * Before it, `compareTargets` ordered a mage's candidate nodes by
 * `remainingCost` and then by `nodeId` — and in the v1 content set
 * `researchCost` is a pure function of tier with no within-tier variation, so
 * that was exactly *"tier, then node id"*, one fixed total order shared by every
 * mage of every species in every universe. Measured consequence
 * (`docs/design/strategy-dimensionality.md`): the strategy space had **one**
 * effective dimension and a run's held set was predictable from its size alone
 * at prefix fidelity 0.943.
 *
 * Vision §7 already specified the fix: *"mages act on utility-scored goals
 * shaped by species, age, personality, and their assigned standing role."* This
 * file is what that sentence weighs, and the two kinds of record in it are the
 * two kinds of shaping:
 *
 * - **scalars** — one weight or one bound, read by name;
 * - **role-appeal rows** — one `(role, primitive)` pair, so a warden and a
 *   researcher looking at the same candidate list want different nodes out of
 *   it. `role` and `primitive` are declared as fields rather than parsed back
 *   out of the id, and the id must agree with them, so the file cannot say one
 *   thing to a reader and another to the loader.
 *
 * ## Three groups of scalar now, not one
 *
 * The file's name is still true of most of it and no longer of all of it. Two
 * applied-work magnitudes and one casting cost already lived here, and the five
 * `scope-multiplier-*` weights join them: they price how far a node's effects
 * *reach* rather than which node a mage wants. They are here for the one
 * property the file exists to provide — the rules read each magnitude **by
 * name**, so the id set is a contract the loader checks in both directions
 * while every value stays an untuned placeholder the balance harness owns. A
 * second table holding five scalars would be a second place to forget.
 *
 * ## The dominance check is the design pillar, not tuning hygiene
 *
 * `role-bias.ts` makes the argument at the goal level and it is the same one
 * here: a bias with no bound reintroduces role-as-filter by the back door, and
 * it would arrive as a tuning edit rather than as a design decision anyone
 * reviewed. So {@link checkAutonomyWeights} requires the role bound to be
 * **strictly below the sum of the other five bounds** — any combination of
 * effort, affinity, species, age and personality can outvote any role — and
 * requires every role-appeal magnitude to fit inside the role bound. Raising one
 * without the other fails the load rather than quietly widening the god's
 * authority over what an individual mage studies.
 */

import type { ContentDiagnostic } from './diagnostics.js';
import type { AutonomyWeightRecord, EffectTarget, PrimitiveRecord } from './types.js';

/** The four standing roles of `contracts.md` §1.2, in role-id order. */
export const AUTONOMY_ROLE_IDS = ['researcher', 'warden', 'professor', 'raider'] as const;

/** One of the four. Mirrors `@mm/state`'s `MageRoleValue` without importing it. */
export type AutonomyRoleName = (typeof AUTONOMY_ROLE_IDS)[number];

/**
 * The five effect targets, narrowest reach first.
 *
 * Not a new ordering: it is `EffectTarget`'s own declaration order in
 * `types.js`, restated as a value so the loader can walk it. Inventing a second
 * ordering here would be a second answer to "which of two nodes reaches
 * further", and the two would drift.
 */
export const EFFECT_SCOPE_ORDER: readonly EffectTarget[] = [
  'self',
  'single',
  'area',
  'side',
  'universe',
] as const;

/** The weight id that prices one effect target. */
export function scopeMultiplierId(target: EffectTarget): string {
  return `scope-multiplier-${target}`;
}

/**
 * The largest scope multiplier the arithmetic survives, and where it comes from.
 *
 * `researchRequirement` ends in `div(base, rate)`, which is
 * `base * FP_ONE / rate`, and `rate` can legitimately be `1` — the smallest
 * positive product of `learnRate` and a stacked `research-rate`, which
 * `research.ts` records as reachable since magnitudes became signed. So `base`
 * itself must stay inside `FP_MAX / FP_ONE`, i.e. `2097151`.
 *
 * The worst `base` authorable against the shipped ceilings is the deepest node
 * (`researchCost` fp(65536)) at the worst effective rediscovery multiplier
 * (`fp(8192)` divided by the orc's `fp(512)`, so 16x) — `1048576` before scope.
 * `2097151 / 1024` of that is `2047`, and `fp(2048)` overflows by exactly one.
 *
 * A literal rather than a figure derived from `node.json` and `species.json`,
 * for the reason `load.ts`'s `WORST_REDISCOVERY_AFFINITY` is one: deriving it
 * would make whether this file loads depend on whoever last edited a node.
 * `research-scope.test.ts` runs the real worst case through the real function
 * and fails naming this constant if the coupling ever breaks.
 */
export const SCOPE_MULTIPLIER_CEILING = 2047;

/**
 * The scalar weights `rules-world` reads by name.
 *
 * A divisor rather than a multiplier wherever a deviation is being scaled down,
 * because `floorDiv` is the one division the rules path is allowed and a
 * multiplier would need a second scale to undo.
 */
export const REQUIRED_AUTONOMY_WEIGHTS = [
  'target-effort-divisor',
  'target-affinity-divisor',
  'target-curiosity-divisor',
  'target-ambition-divisor',
  'target-caution-divisor',
  'target-age-young-per-tier',
  'target-age-prime-per-tier',
  'target-age-senescent-per-tier',
  'target-bound-effort',
  'target-bound-affinity',
  'target-bound-species',
  'target-bound-age',
  'target-bound-personality',
  'target-bound-role',
  'target-appeal-ceiling',
  // The two applied-work magnitudes. Not target-selection weights — they price
  // what `GOAL.applyMagic` makes and what it eats — but they belong in this
  // file for the reason the file exists: the rules read each by name, so the id
  // set is a contract checked in both directions while the value stays an
  // untuned placeholder the balance harness owns. A second table for two
  // scalars would be a second place to forget.
  'apply-output-per-month',
  'apply-ration-per-month',
  // What a mage-month of magical *work* costs the archive — the `casting`
  // claimant of `substrate.md` §6. Here for the same reason as the two above:
  // the rules read it by name, so the id is a contract checked in both
  // directions while the value stays an untuned placeholder the harness owns.
  'casting-vellum-per-month',
  // The five scope multipliers. Not target-selection weights either — they
  // price a node's *reach*, per `docs/design/ars-magica-and-what-we-owe-it.md`
  // — and they are here for the reason the three above are: `rules-magic` reads
  // each by name at content load, so the id set is a contract checked in both
  // directions while the values stay untuned placeholders the harness owns.
  // Kept in `EFFECT_SCOPE_ORDER` so the file reads narrowest-first.
  'scope-multiplier-self',
  'scope-multiplier-single',
  'scope-multiplier-area',
  'scope-multiplier-side',
  'scope-multiplier-universe',
] as const;

/** The scalar ids that must be at least 1, because they are divisors. */
const DIVISOR_IDS = [
  'target-effort-divisor',
  'target-affinity-divisor',
  'target-curiosity-divisor',
  'target-ambition-divisor',
  'target-caution-divisor',
] as const;

/** The five bounds the role bound is checked against. */
const NON_ROLE_BOUND_IDS = [
  'target-bound-effort',
  'target-bound-affinity',
  'target-bound-species',
  'target-bound-age',
  'target-bound-personality',
] as const;

function problem(pointer: string, message: string): ContentDiagnostic {
  return { file: 'autonomy-weight.json', pointer, code: 'content-invariant', message };
}

/** Whether a record is a role-appeal row rather than a scalar. */
export function isRoleAppeal(
  record: AutonomyWeightRecord,
): record is AutonomyWeightRecord & { readonly role: AutonomyRoleName; readonly primitive: string } {
  return record.role !== undefined || record.primitive !== undefined;
}

/**
 * Checks `autonomy-weight.json`.
 *
 * Takes the primitive table because a role-appeal row naming a primitive the
 * content set does not declare is a row that can never fire, and a weight that
 * can never fire is indistinguishable from a weight that is wrong.
 */
export function checkAutonomyWeights(
  records: readonly AutonomyWeightRecord[],
  primitives: readonly PrimitiveRecord[],
): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];
  const byId = new Map<string, AutonomyWeightRecord>();
  const primitiveIds = new Set(primitives.map((record) => record.id));
  const roleNames = new Set<string>(AUTONOMY_ROLE_IDS);
  const seenPairs = new Set<string>();

  records.forEach((record, index) => {
    const at = `/${String(index)}`;
    if (byId.has(record.id)) {
      out.push(problem(at, `weight "${record.id}" is declared twice.`));
      return;
    }
    byId.set(record.id, record);

    if (!isRoleAppeal(record)) return;

    if (record.role === undefined || record.primitive === undefined) {
      out.push(
        problem(
          at,
          `weight "${record.id}" declares one of "role" and "primitive" and not the other. A ` +
            'role-appeal row is a (role, primitive) pair and half of one is not a table entry.',
        ),
      );
      return;
    }
    if (!roleNames.has(record.role)) {
      out.push(
        problem(
          `${at}/role`,
          `weight "${record.id}" names role "${record.role}"; contracts.md §1.2 enumerates ` +
            `${AUTONOMY_ROLE_IDS.join(', ')}.`,
        ),
      );
    }
    if (!primitiveIds.has(record.primitive)) {
      out.push(
        problem(
          `${at}/primitive`,
          `weight "${record.id}" names primitive "${record.primitive}", which primitive.json does ` +
            'not declare. A role-appeal row for a primitive no node can carry is a weight that ' +
            'can never fire, and one that can never fire cannot be told apart from one that is wrong.',
        ),
      );
    }
    const expected = `role-appeal-${record.role}-${record.primitive}`;
    if (record.id !== expected) {
      out.push(
        problem(
          `${at}/id`,
          `weight "${record.id}" is a role-appeal row for (${record.role}, ${record.primitive}) ` +
            `and so must be named "${expected}". The id is what a reader scans; a row whose id ` +
            'disagrees with its fields says one thing to a person and another to the loader.',
        ),
      );
    }
    const pair = `${record.role}\u0000${record.primitive}`;
    if (seenPairs.has(pair)) {
      out.push(
        problem(at, `(${record.role}, ${record.primitive}) is declared twice.`),
      );
    }
    seenPairs.add(pair);
  });

  const required = new Set<string>(REQUIRED_AUTONOMY_WEIGHTS);
  for (const id of REQUIRED_AUTONOMY_WEIGHTS) {
    if (byId.has(id)) continue;
    out.push(
      problem(
        '',
        `weight "${id}" is not declared, and target selection reads it by name. An absent weight ` +
          'would arrive in the score as 0 — a divisor of zero, or a bound that silences a whole ' +
          'term, either of which is a plausible-looking answer to a question nobody asked.',
      ),
    );
  }
  for (const record of records) {
    if (isRoleAppeal(record) || required.has(record.id)) continue;
    out.push(
      problem(
        '',
        `weight "${record.id}" is declared but nothing reads it. An unread weight is a tuning knob ` +
          'that does nothing, and the sweep that turned it would report the null result as a ' +
          'finding about the game.',
      ),
    );
  }

  const value = (id: string): number | undefined => byId.get(id)?.value;

  for (const id of DIVISOR_IDS) {
    const divisor = value(id);
    if (divisor === undefined || divisor >= 1) continue;
    out.push(
      problem(
        '',
        `"${id}" is ${String(divisor)}. It divides, and floorDiv by zero or by a negative is ` +
          'either a crash or a term that silently changes sign; the loader refuses both.',
      ),
    );
  }

  const roleBound = value('target-bound-role');
  let otherBounds = 0;
  let boundsKnown = true;
  for (const id of NON_ROLE_BOUND_IDS) {
    const bound = value(id);
    if (bound === undefined) {
      boundsKnown = false;
      continue;
    }
    if (bound < 1) {
      out.push(
        problem(
          '',
          `"${id}" is ${String(bound)}. A bound below 1 removes its term from the score entirely, ` +
            'which is an ablation rather than a tuning value.',
        ),
      );
    }
    otherBounds += bound;
  }

  if (roleBound !== undefined && boundsKnown && roleBound >= otherBounds) {
    out.push(
      problem(
        '',
        `"target-bound-role" is ${String(roleBound)} and the other five bounds sum to ` +
          `${String(otherBounds)}. A role must never be able to outvote everything else at once: ` +
          'vision §7 is "you set the role; they decide everything else", and a role bias that ' +
          'dominates the sum of the other terms is role-as-filter arriving by tuning edit.',
      ),
    );
  }

  if (roleBound !== undefined) {
    for (const record of records) {
      if (!isRoleAppeal(record)) continue;
      if (Math.abs(record.value) <= roleBound) continue;
      out.push(
        problem(
          '',
          `role-appeal row "${record.id}" is ${String(record.value)}, outside the role bound of ` +
            `${String(roleBound)}. Clamping it at lookup would leave an out-of-range entry in the ` +
            'table looking authored while behaving as something else; the loader names it instead.',
        ),
      );
    }
  }

  const ceiling = value('target-appeal-ceiling');
  if (ceiling !== undefined && boundsKnown && roleBound !== undefined) {
    const totalBound = otherBounds + roleBound;
    if (ceiling < totalBound) {
      out.push(
        problem(
          '',
          `"target-appeal-ceiling" is ${String(ceiling)} but the six bounds sum to ` +
            `${String(totalBound)}. A clamp that binds on an ordinary outlook flattens real ` +
            'differences into ties, and a score whose ceiling is reachable by summing its own ' +
            'bounds is a score that quietly stops discriminating at the top.',
        ),
      );
    }
  }

  // ---- The scope multipliers (docs/design/ars-magica-and-what-we-owe-it.md) ----
  //
  // Two invariants, and the second is the design claim rather than hygiene.
  //
  // A multiplier below 1 is not a cheap node: `mul` floors, so fp(0) makes every
  // node in that band free and completes it on the first step that supplies any
  // effort at all. The ceiling is {@link SCOPE_MULTIPLIER_CEILING}, which is
  // where the fixed-point domain runs out rather than where taste does.
  //
  // And **wider must never cost less**. That is the whole content of the axis,
  // and without the check a tuning edit could invert it — leaving a table that
  // still looks like a scope curve while paying a universe-wide effect a
  // discount, which reads in a sweep as an unremarkable number.
  let previousScope: number | undefined;
  let previousScopeId: string | undefined;
  for (const target of EFFECT_SCOPE_ORDER) {
    const id = scopeMultiplierId(target);
    const multiplier = value(id);
    if (multiplier === undefined) continue;
    if (multiplier < 1 || multiplier > SCOPE_MULTIPLIER_CEILING) {
      out.push(
        problem(
          '',
          `"${id}" is ${String(multiplier)}, outside [1, ${String(SCOPE_MULTIPLIER_CEILING)}]. ` +
            'Below 1 it floors a whole band of nodes to a research cost of zero; above the ' +
            'ceiling the worst authorable requirement leaves the fixed-point domain, and the ' +
            'rules path throws rather than saturating.',
        ),
      );
    }
    if (previousScope !== undefined && previousScopeId !== undefined && multiplier < previousScope) {
      out.push(
        problem(
          '',
          `"${id}" is ${String(multiplier)}, below "${previousScopeId}" at ` +
            `${String(previousScope)}. The scope axis says a node that reaches further costs at ` +
            'least as much to research; a table that inverts it still looks like a scope curve ' +
            'and quietly discounts the widest effects in the game.',
        ),
      );
    }
    previousScope = multiplier;
    previousScopeId = id;
  }

  return out;
}
