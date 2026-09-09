/*
 * Multiverse Mages — the opening squares W192's strategy sweep is run under.
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
 * One arm, named by the environment variable `W192_ARM`.
 *
 * The arm is an **opening square**, and it reaches the simulation the same way a
 * god's choice does: `explicitOpeningAxes` resolves named axes to the two masks
 * `permits()` reads, and those masks are spliced onto the reference content. No
 * scenario option, no factor, no default moved — `opening-square.test.ts`
 * already asserts that a content splice and the options path produce the
 * identical snapshot hash, so this is the shipped path rather than a second one.
 *
 * `v1` is the control and must be byte-identical to the shipped opening; the
 * check is in `scripts/w192-opening-sweep.mjs` and is run before any arm.
 */

export const W192_ARMS = {
  v1: {
    label: 'v1 rectangle, 12 cells',
    techniqueIds: ['intellego', 'perdo', 'rego'],
    formIds: ['limen', 'mentem', 'nomen', 'terram'],
  },
  'named-4x4': {
    label: 'v1 + creo, 16 cells',
    techniqueIds: ['creo', 'intellego', 'perdo', 'rego'],
    formIds: ['limen', 'mentem', 'nomen', 'terram'],
  },
  'named-4x6': {
    label: 'the exclusion square, 24 cells',
    techniqueIds: ['creo', 'intellego', 'perdo', 'rego'],
    formIds: ['ignem', 'limen', 'mentem', 'nomen', 'terram', 'umbra'],
  },
  'std-4x13': {
    label: 'standard 4x13, 52 cells — the first prefix holding the pair',
    techniqueIds: ['intellego', 'perdo', 'rego', 'creo'],
    formIds: [
      'limen', 'mentem', 'nomen', 'terram', 'animal', 'aquam', 'auram',
      'corpus', 'fatum', 'herbam', 'ignem', 'imaginem', 'umbra',
    ],
  },
  'std-5x14': {
    label: 'the whole grid, 70 cells — PR #137',
    techniqueIds: ['creo', 'intellego', 'muto', 'perdo', 'rego'],
    formIds: [
      'animal', 'aquam', 'auram', 'corpus', 'fatum', 'herbam', 'ignem',
      'imaginem', 'limen', 'mentem', 'nomen', 'terram', 'umbra', 'vim',
    ],
  },
};

/**
 * The arm this process runs, or a refusal.
 *
 * Refuses an absent or unknown `W192_ARM` rather than defaulting to `v1`: a
 * worker that silently ran the control would produce an arm's worth of records
 * labelled as something they are not, which is the failure `CLAUDE.md` records
 * five instances of.
 */
export function armFromEnvironment(env) {
  const id = env.W192_ARM;
  if (id === undefined || W192_ARMS[id] === undefined) {
    throw new Error(
      `W192_ARM is ${JSON.stringify(id)}, which names no arm. Known: ${Object.keys(W192_ARMS).join(', ')}. ` +
        'Defaulting here would label one arm\'s records with another arm\'s id.',
    );
  }
  return { id, ...W192_ARMS[id] };
}
