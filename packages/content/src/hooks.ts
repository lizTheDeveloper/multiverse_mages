/*
 * Multiverse Mages — the closed enumeration of tradition hook kinds.
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
 * A tradition may hook exactly four points and no others, and each hook's
 * `kind` is drawn from a closed set implemented *in code*
 * (`docs/design/contracts.md` §2.5, `vision.md` §4a).
 *
 * That the enumeration lives here rather than in the JSON Schema is the whole
 * mechanism: adding a kind must be a code change that someone reviews, because
 * a tradition that can introduce arbitrary behaviour through data is precisely
 * what defeats primitive-level Monte Carlo balancing. `params` are data; `kind`
 * is not.
 */

/** The four extension points, in the order `contracts.md` §2.5 lists them. */
export const HOOK_POINTS = ['acquire', 'store', 'cast', 'cost'] as const;

export type HookPoint = (typeof HOOK_POINTS)[number];

/** Shape of one declared param, so unknown or mistyped params fail the load. */
interface ParamSpec {
  readonly type: 'integer' | 'boolean';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly required: boolean;
}

interface HookKindSpec {
  readonly params: Readonly<Record<string, ParamSpec>>;
}

const FP_MAX = 1073741823;

/**
 * The v1 enumeration: `acquire` — standard, true-name; `store` — standard,
 * palace; `cast` — standard, prepared; `cost` — standard, prepaid.
 */
export const HOOK_KINDS: Readonly<Record<HookPoint, Readonly<Record<string, HookKindSpec>>>> = {
  acquire: {
    standard: { params: {} },
    'true-name': {
      params: {
        // A true name must be discovered, so research is dearer; a name can be
        // spoken, so teaching is cheaper. Both fp multipliers, both untuned.
        researchCostMultiplier: { type: 'integer', minimum: 1, maximum: FP_MAX, required: true },
        teachCostMultiplier: { type: 'integer', minimum: 1, maximum: FP_MAX, required: true },
        // A name is either known or not, so instances arrive at full mastery.
        instanceMastery: { type: 'integer', minimum: 1, maximum: FP_MAX, required: true },
      },
    },
  },
  store: {
    standard: { params: {} },
    // `standard` hardcodes unbounded capacity and `palace` cannot keep a written
    // copy, so "books exist AND a mage's memory is finite" was inexpressible in
    // the v1 vocabulary. That is the one corner of the store space W28 could not
    // author without a kind, and this is the kind: `standard` in every respect
    // except that a mage's personal store has a declared ceiling.
    bounded: {
      params: {
        slotsPerMage: { type: 'integer', minimum: 1, maximum: 4096, required: true },
      },
    },
    palace: {
      params: {
        slotsPerMage: { type: 'integer', minimum: 1, maximum: 4096, required: true },
        lootable: { type: 'boolean', required: true },
        burnable: { type: 'boolean', required: true },
        // Without this, an Art of Memory universe has zero library depth by
        // construction and vision §6a's knowledge-as-capital loop is switched
        // off for one of the three v1 traditions.
        libraryDepthCoefficient: { type: 'integer', minimum: 0, maximum: FP_MAX, required: true },
      },
    },
  },
  cast: {
    standard: { params: {} },
    prepared: {
      params: {
        slotsPerMage: { type: 'integer', minimum: 1, maximum: 4096, required: true },
      },
    },
  },
  cost: {
    standard: { params: {} },
    prepaid: { params: {} },
  },
};

/** Every kind name that is valid for some hook, with the hook it belongs to. */
export function hookPointOwning(kind: string): HookPoint | undefined {
  for (const point of HOOK_POINTS) {
    if (kind !== 'standard' && Object.hasOwn(HOOK_KINDS[point], kind)) return point;
  }
  return undefined;
}

/** Permitted kinds for one hook, in code-unit order, for error messages. */
export function permittedKinds(point: HookPoint): readonly string[] {
  return Object.keys(HOOK_KINDS[point]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Describes one param mismatch found while checking a hook's `params`. */
export interface HookParamProblem {
  /** Param name, or `''` when the whole params object is at fault. */
  readonly param: string;
  readonly message: string;
}

/**
 * Checks a hook's `params` against the spec for its kind.
 *
 * Returns every problem rather than the first: a tradition with three
 * mistyped params should take one edit to fix, not three.
 */
export function checkHookParams(
  point: HookPoint,
  kind: string,
  params: Readonly<Record<string, unknown>> | undefined,
): readonly HookParamProblem[] {
  const spec = HOOK_KINDS[point][kind];
  if (spec === undefined) return [];

  const problems: HookParamProblem[] = [];
  const supplied = params ?? {};

  for (const [name, paramSpec] of Object.entries(spec.params)) {
    if (!Object.hasOwn(supplied, name)) {
      if (paramSpec.required) {
        problems.push({ param: name, message: `kind "${kind}" requires param "${name}"` });
      }
      continue;
    }
    const value = supplied[name];
    if (paramSpec.type === 'boolean') {
      if (typeof value !== 'boolean') {
        problems.push({ param: name, message: `param "${name}" must be a boolean` });
      }
      continue;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      problems.push({
        param: name,
        message: `param "${name}" must be an integer — content carries no floats (contracts.md §0)`,
      });
      continue;
    }
    if (paramSpec.minimum !== undefined && value < paramSpec.minimum) {
      problems.push({
        param: name,
        message: `param "${name}" is below its minimum of ${String(paramSpec.minimum)}`,
      });
    }
    if (paramSpec.maximum !== undefined && value > paramSpec.maximum) {
      problems.push({
        param: name,
        message: `param "${name}" is above its maximum of ${String(paramSpec.maximum)}`,
      });
    }
  }

  for (const name of Object.keys(supplied)) {
    if (!Object.hasOwn(spec.params, name)) {
      const known = Object.keys(spec.params).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      problems.push({
        param: name,
        message:
          `kind "${kind}" declares no param "${name}"` +
          (known.length > 0 ? `; it accepts ${known.join(', ')}` : ' and accepts none'),
      });
    }
  }

  return problems;
}
