/*
 * Multiverse Mages — W204: the arm table for the "wires that never bind" hunt.
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
 * One arm is one *mechanism*, plus a seam through which that mechanism can be
 * neutralized or amplified without editing `packages/`.
 *
 * Three rules the table obeys, each of which is a way a previous instrument in
 * this repository answered confidently about the wrong input:
 *
 * 1. **Neutralize by magnitude, never by skipping the path.** A wrapper that
 *    returns early changes how many draws a subsystem takes, every downstream
 *    stream diverges, and *every* arm then looks live. Wrappers here call
 *    through and zero the result.
 * 2. **Every arm has an amplify direction as well as a zero direction.** A
 *    mechanism flat at zero *and* flat at 100x is either structurally dead or a
 *    seam that never engaged — indistinguishable from a broken instrument
 *    without the second direction. A mechanism flat at zero but moving when
 *    amplified is magnitude-bound under v1 content, which is the `teach-rate`
 *    archetype this hunt is named for.
 * 3. **The seam is recorded on the row.** A reader cannot tell "inert" from "my
 *    wrapper missed" without it, and neither can the author a week later.
 */

import { neutralizing } from '@mm/coordination';
import { acquirePolicy, storePolicy } from '@mm/rules-magic';
import {
  directorySource,
  loadContent,
  memorySource,
  shippedDataDirectory,
} from '@mm/content';
import { referenceContent } from '@mm/scenario';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The seven world-scale primitives `WorldStepDeps.primitives` names. */
export const WORLD_PRIMITIVES = [
  'lifespan',
  'resource-yield',
  'build-rate',
  'research-rate',
  'teach-rate',
  'scribe-rate',
  'fertility',
];

/** Primitives with no `WorldStepDeps.primitives` slot but authored on nodes. */
export const OTHER_PRIMITIVES = [
  'worship-yield',
  'portal',
  'direct-damage',
  'ward',
  'area-denial',
  'blink',
  'summon',
  'concealment',
  'knowledge-steal',
];

/** Every content file, read once, so an amplified set can be rebuilt cheaply. */
function shippedFiles() {
  const dir = shippedDataDirectory();
  const files = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    files[name] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}

const SHIPPED_FILES = shippedFiles();

/**
 * Content with every authored `magnitude` for `primitiveId` multiplied by
 * `factor`, and nothing else changed.
 *
 * Costs are untouched on purpose: the ablation mask's own docblock warns that
 * editing what a node *costs* confounds "this primitive matters" with "this
 * research path got cheaper". Only the effect magnitude moves, so the two arms
 * research the identical graph at the identical price.
 */
export function amplifiedContent(primitiveId, factor) {
  const nodes = JSON.parse(SHIPPED_FILES['node.json']);
  let touched = 0;
  for (const node of nodes) {
    for (const effect of node.effects ?? []) {
      if (effect.primitive !== primitiveId) continue;
      effect.magnitude = Math.trunc(effect.magnitude * factor);
      touched += 1;
    }
  }
  if (touched === 0) {
    throw new Error(
      `No authored effect names primitive "${primitiveId}", so amplifying it would produce a ` +
        'content set identical to the shipped one and an arm that silently measured nothing.',
    );
  }
  const files = { ...SHIPPED_FILES, 'node.json': JSON.stringify(nodes) };
  return { registry: loadContent(memorySource(files, `w204:${primitiveId}x${factor}`)), touched };
}

/** The shipped registry, loaded the way `shippedContent()` loads it. */
export function shippedRegistry() {
  return loadContent(directorySource(shippedDataDirectory()));
}

/**
 * Refuses a replacement that equals what it replaces.
 *
 * The first version of the `store` arm swapped the tradition's store policy for
 * the standard one and reported "byte-identical" — a perfect inert row. The
 * shipped default tradition is `true-naming`, whose store hook *is* the standard
 * one, so the arm had replaced a policy with itself. An arm that changes nothing
 * is indistinguishable from a mechanism that does nothing, and it is the one
 * failure this table must never have silently.
 */
function refuseIdentity(label, original, replacement) {
  if (JSON.stringify(original) === JSON.stringify(replacement)) {
    throw new Error(
      `${label}: the replacement is deep-equal to what it replaces, so this arm would run the ` +
        'identical universe and report a byte-identical null. Pick a base whose hook is not ' +
        'already the identity.',
    );
  }
  return replacement;
}

/** Zeroes every `Fixed` in an array of magnitudes, preserving its length. */
const zeroed = (values) => values.map(() => 0);

/**
 * Wraps a deps field so it still runs and still draws, and returns zero.
 *
 * `map` receives whatever the real dep returned. It must produce a value of the
 * same shape — a shorter array is a different number of stacking sources, which
 * is a second change riding along with the one being measured.
 */
function wrapDep(content, field, map) {
  const original = content.deps[field];
  if (original === undefined) {
    throw new Error(`deps.${field} is undefined in the reference universe; there is nothing to wrap.`);
  }
  return {
    ...content,
    deps: {
      ...content.deps,
      [field]: (...args) => map(original(...args)),
    },
  };
}

/** Replaces an optional deps field with its designed off-state. */
function unsetDep(content, field) {
  if (content.deps[field] === undefined) {
    throw new Error(
      `deps.${field} is already undefined in the reference universe, so unsetting it is a no-op ` +
        'arm. That is itself the finding — record it as structural, do not run it as an arm.',
    );
  }
  const deps = { ...content.deps };
  delete deps[field];
  return { ...content, deps };
}

/** Applies an ablation mask to the world loop. */
function ablate(content, primitiveId) {
  return { ...content, deps: { ...content.deps, ablation: neutralizing(primitiveId) } };
}

/**
 * The arm table.
 *
 * `zero` neutralizes; `amp` amplifies; either may be absent when the mechanism
 * has no seam in that direction, and an absent direction is reported as
 * `n/a` rather than as "no movement".
 */
export function armTable() {
  const arms = [];

  for (const id of WORLD_PRIMITIVES) {
    arms.push({
      id: `primitive:${id}`,
      family: 'effect primitive',
      seam: 'deps.ablation = neutralizing(id) — the shipped mask, applied in stackMagnitudes',
      zero: (content) => ablate(content, id),
      amp: (content, factor) => ({
        ...referenceContent(amplifiedContent(id, factor).registry),
        // The wrapped deps of `content` are not carried: an amplify arm is
        // content-level and must be built from the amplified registry, not
        // grafted onto the control's deps.
      }),
    });
  }

  for (const id of OTHER_PRIMITIVES) {
    arms.push({
      id: `primitive:${id}`,
      family: 'effect primitive (non-world-scale)',
      seam: 'deps.ablation = neutralizing(id)',
      zero: (content) => ablate(content, id),
      amp: (content, factor) => ({ ...referenceContent(amplifiedContent(id, factor).registry) }),
      optional: true,
    });
  }

  arms.push({
    id: 'deps:researchBonusesFor',
    family: 'knowledge-derived bonus channel',
    seam: 'wrap deps.researchBonusesFor, call through, zero every magnitude',
    zero: (content) => wrapDep(content, 'researchBonusesFor', zeroed),
  });
  arms.push({
    id: 'deps:teachBonusesFor',
    family: 'knowledge-derived bonus channel',
    seam: 'wrap deps.teachBonusesFor, call through, zero every magnitude',
    zero: (content) => wrapDep(content, 'teachBonusesFor', zeroed),
  });
  arms.push({
    id: 'deps:lifespanEffectsFor',
    family: 'knowledge-derived bonus channel',
    seam: 'wrap deps.lifespanEffectsFor, call through, zero every magnitude',
    zero: (content) => wrapDep(content, 'lifespanEffectsFor', zeroed),
  });
  arms.push({
    id: 'deps:universeEffects',
    family: 'universe-scoped effect index',
    seam: 'deps.universeEffects = undefined (its designed off-state)',
    zero: (content) => unsetDep(content, 'universeEffects'),
  });
  // The two tradition hooks that reach the world loop at all. `cast` and `cost`
  // have no `WorldStepDeps` field — their only call sites are inside raid
  // arbitration — so they get no arm here and are reported as structural.
  // Each tradition arm runs against the tradition that actually implements the
  // hook — `true-naming` for acquire, `art-of-memory` for store. The shipped
  // default is `true-naming`, so an art-of-memory store arm run on the default
  // base would be replacing the standard policy with itself.
  arms.push({
    id: 'tradition-hook:acquire (true-naming)',
    family: 'tradition hook',
    seam: "base = true-naming; deps.acquire := acquirePolicy({kind:'standard'})",
    base: 'true-naming',
    zero: (content) => ({
      ...content,
      deps: {
        ...content.deps,
        acquire: refuseIdentity(
          'tradition-hook:acquire',
          content.deps.acquire,
          acquirePolicy({ point: 'acquire', kind: 'standard', params: {} }),
        ),
      },
    }),
  });
  arms.push({
    id: 'tradition-hook:store (art-of-memory)',
    family: 'tradition hook',
    seam: "base = art-of-memory; deps.store := storePolicy({kind:'standard'})",
    base: 'art-of-memory',
    zero: (content) => ({
      ...content,
      deps: {
        ...content.deps,
        store: refuseIdentity(
          'tradition-hook:store',
          content.deps.store,
          storePolicy({ point: 'store', kind: 'standard', params: {} }),
        ),
      },
    }),
  });

  arms.push({
    id: 'deps:appeal',
    family: 'mage target selection',
    seam: 'deps.appeal — every non-effort divisor raised until its term rounds to nothing',
    zero: (content) => ({
      ...content,
      deps: {
        ...content.deps,
        // A divisor of zero is a division by zero, not a neutralization. Raising
        // it instead keeps the same arithmetic and drives every term to zero.
        appeal: refuseIdentity('deps:appeal', content.deps.appeal, {
          ...content.deps.appeal,
          affinityDivisor: 1 << 24,
          curiosityDivisor: 1 << 24,
          ambitionDivisor: 1 << 24,
          cautionDivisor: 1 << 24,
        }),
      },
    }),
  });

  arms.push({
    id: 'deps:god',
    family: 'god agency',
    seam: 'deps.god = undefined (its designed off-state)',
    zero: (content) => unsetDep(content, 'god'),
  });

  return arms;
}

export { ablate, unsetDep, wrapDep, zeroed };
