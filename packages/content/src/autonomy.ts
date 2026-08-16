/*
 * Multiverse Mages — the target-appeal weight table, and the two invariants
 * that keep a role and an encouragement from becoming orders.
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
 *
 * **There are now two god-owned terms and therefore two of that check.** The
 * emphasis bound — what `encourageResearch` is worth to a mage deciding what to
 * study next — is checked against the *same five* mage-owned bounds, separately
 * and not as part of a sum that includes the role bound. See
 * {@link NON_ROLE_BOUND_IDS} for why folding them together would defeat both.
 */

import type { ContentDiagnostic } from './diagnostics.js';
import type { AutonomyWeightRecord, PrimitiveRecord } from './types.js';

/** The four standing roles of `contracts.md` §1.2, in role-id order. */
export const AUTONOMY_ROLE_IDS = ['researcher', 'warden', 'professor', 'raider'] as const;

/** One of the four. Mirrors `@mm/state`'s `MageRoleValue` without importing it. */
export type AutonomyRoleName = (typeof AUTONOMY_ROLE_IDS)[number];

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
  'target-emphasis-divisor',
  'target-bound-emphasis',
  'target-appeal-ceiling',
  // Goal selection, not target selection. Every other scalar here answers
  // *which node*; these two answer *whether to join an institution at all*, and
  // they are two rather than one because `completeAffiliation` and
  // `changeAffiliation` are two functions. See `terms.ts`.
  'goal-affiliate-first-opportunity',
  'goal-affiliate-transfer-opportunity',
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
] as const;

/** The scalar ids that must be at least 1, because they are divisors. */
const DIVISOR_IDS = [
  'target-effort-divisor',
  'target-affinity-divisor',
  'target-curiosity-divisor',
  'target-ambition-divisor',
  'target-caution-divisor',
  'target-emphasis-divisor',
] as const;

/**
 * The five bounds the role bound and the emphasis bound are each checked
 * against.
 *
 * **Five, not six, and the emphasis bound is deliberately not among them.**
 * These are the terms a mage owns — what a project costs her, what her species
 * is good at, how curious it is, how old she is, who she is. The role bound and
 * the emphasis bound are the two the *god* writes, and each is checked against
 * this sum separately rather than against a sum that includes the other. Folding
 * them together would let a future role bound hide behind the god's own second
 * instruction and still pass: two god-owned terms summing to more than the mage
 * keeps is exactly the puppeteer the check exists to refuse.
 */
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
        `weight "${id}" is not declared, and the autonomy scoring path reads it by name. An ` +
          'absent weight would arrive in the score as 0 — a divisor of zero, or a bound that ' +
          'silences a whole term, either of which is a plausible-looking answer to a question ' +
          'nobody asked.',
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

  // The design statement the two weights exist to make, as a check rather than
  // as a gloss: getting a first university is a near-necessity and moving
  // between universities is a preference. Authored the other way round they
  // would produce a population that churns between institutions and never joins
  // one, which reads in a metric as affiliation working.
  const first = value('goal-affiliate-first-opportunity');
  const transfer = value('goal-affiliate-transfer-opportunity');
  if (first !== undefined && transfer !== undefined && first <= transfer) {
    out.push(
      problem(
        '',
        `"goal-affiliate-first-opportunity" is ${String(first)} and ` +
          `"goal-affiliate-transfer-opportunity" is ${String(transfer)}. The first must be ` +
          'strictly the larger: an unaffiliated mage may neither scribe nor ward, so her first ' +
          'affiliation unlocks two goals, while a transfer only trades one library for a deeper ' +
          'one.',
      ),
    );
  }

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

  const emphasisBound = value('target-bound-emphasis');
  if (emphasisBound !== undefined && emphasisBound < 1) {
    out.push(
      problem(
        '',
        `"target-bound-emphasis" is ${String(emphasisBound)}. A bound below 1 removes the god's ` +
          'emphasis from target selection entirely, which is an ablation rather than a tuning ' +
          'value — run it through the divisor if that is what you want, so the arm says so.',
      ),
    );
  }
  if (emphasisBound !== undefined && boundsKnown && emphasisBound >= otherBounds) {
    out.push(
      problem(
        '',
        `"target-bound-emphasis" is ${String(emphasisBound)} and the five mage-owned bounds sum ` +
          `to ${String(otherBounds)}. An encouragement must never be able to outvote everything a ` +
          'mage knows about her own situation at once. Vision §7 is "You set the role; they ' +
          'decide everything else. You never issue direct orders" — and an emphasis that ' +
          'dominates the sum is a direct order arriving by tuning edit. It ' +
          'deletes the autonomy the whole design rests on.',
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
  if (ceiling !== undefined && boundsKnown && roleBound !== undefined && emphasisBound !== undefined) {
    const totalBound = otherBounds + roleBound + emphasisBound;
    if (ceiling < totalBound) {
      out.push(
        problem(
          '',
          `"target-appeal-ceiling" is ${String(ceiling)} but the seven bounds sum to ` +
            `${String(totalBound)}. A clamp that binds on an ordinary outlook flattens real ` +
            'differences into ties, and a score whose ceiling is reachable by summing its own ' +
            'bounds is a score that quietly stops discriminating at the top.',
        ),
      );
    }
  }

  return out;
}
