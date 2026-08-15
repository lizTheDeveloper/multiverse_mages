/*
 * Multiverse Mages — the RNG stream registry is permanent and append-only.
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
 * `rng-streams.test.ts` already pins `RNG_STREAM` against a literal table and
 * asserts the IDs are distinct, which covers *detection*. This file covers the
 * two things that assertion cannot:
 *
 * 1. **The failure has to explain itself.** A renumbering surfaces there as a
 *    `toEqual` diff between two integers. The person reading it will assume the
 *    test is stale and update it — that is the natural response to a test that
 *    disagrees with the source, and here it is exactly the wrong move, because
 *    the source is the thing that broke. `contracts.md` §6 and the
 *    `module-boundaries` spec both require the failure to *say* that every
 *    committed balance baseline is invalidated, so the message is part of the
 *    deliverable, not decoration.
 * 2. **The registry is locked to the normative document, in both directions.**
 *    The IDs are read out of `docs/design/contracts.md` §6 and matched to code
 *    by subsystem, so editing one side alone fails. Editing both still fails,
 *    against the permanent baseline below — which is what makes a renumbering a
 *    deliberate, reviewed act rather than a two-line diff.
 *
 * The checker is a pure function over a table, so the same assertions run
 * against synthetic registries that *are* broken. Without those controls, every
 * "no errors" expectation here would also pass if the checker returned an empty
 * array unconditionally.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RNG_STREAM } from '@mm/sim-core';

const contractsPath = fileURLToPath(
  new URL('../../../../docs/design/contracts.md', import.meta.url),
);

/**
 * The permanent assignment, as of the release that committed the first balance
 * baseline. **Append to this; never edit a line of it.**
 *
 * It is duplicated from `RNG_STREAM` on purpose. A test that read its
 * expectations out of the code under test could not detect a change to that
 * code, which is the entire failure mode here: renumbering is invisible — the
 * run stays deterministic, stays reproducible from its seed, and every existing
 * test still passes. Only a second, independently-committed copy notices.
 */
const PERMANENT_IDS: Readonly<Record<string, number>> = {
  mageBirth: 1,
  mortality: 2,
  research: 3,
  teaching: 4,
  scribing: 5,
  populace: 6,
  autonomy: 7,
  combat: 8,
  knowledgeTheft: 9,
  objectives: 10,
  terrain: 11,
  // Appended by `w70/opening-square`. The first append since the balance
  // baselines were committed, and the one that established what an append
  // costs: the gate hashes this whole table into `provenance.rngRegistryHash`
  // and refuses on it, so all three baselines invalidated by identity before a
  // single measured number moved. See `docs/design/opening-square.md` §4.
  openingSquare: 12,
  // Appended by `w190/scribing-fidelity`, and the second append since the
  // baselines were committed — so the same `rngRegistryHash` refusal applies
  // and the same re-baseline is owed. It takes its own id rather than sharing
  // stream 5 with durability precisely so that the *only* baseline movement is
  // behavioural: a shared cursor would have shifted every durability roll a
  // scribe takes after her first book.
  scribalError: 13,
};

/**
 * The first id an append would take, computed rather than written down.
 *
 * The synthetic cases below exercise the *checker*, not the registry, and they
 * used to spell this number `12`. That made every future append break three
 * tests that have nothing to do with the appended subsystem — which is exactly
 * what happened when stream 12 arrived, and is a false failure dressed as a
 * registry violation. The registry's own pins are still literals, because
 * those are the ones that must not be computed from the code under test.
 */
const NEXT_FREE_ID = Math.max(...Object.values(PERMANENT_IDS)) + 1;

/**
 * How each registry key is recognised in the §6 table. Substrings rather than
 * full rows, so rewording a description for clarity is not a false failure,
 * while moving a description to another ID is a real one.
 */
const DOC_TEXT_BY_SUBSYSTEM: Readonly<Record<string, string>> = {
  mageBirth: 'mage birth and personality rolls',
  mortality: 'mortality',
  research: 'research and discovery',
  teaching: 'teaching outcomes',
  scribing: 'scribing outcomes and grimoire durability',
  populace: 'populace cohort dynamics',
  autonomy: 'mage autonomy',
  combat: 'combat resolution only',
  knowledgeTheft: 'knowledge theft',
  objectives: 'objective and raid generation',
  terrain: 'terrain generation and combatant deployment',
  openingSquare: 'the opening square',
  scribalError: 'scribal error',
};

/** The consequence sentence every failure from this file has to carry. */
const CONSEQUENCE =
  'A subsystem stream ID is baked into every committed Monte Carlo balance baseline and every ' +
  'golden replay fixture. Changing one silently re-rolls every run that used it: the simulation ' +
  'stays deterministic and reproducible, so nothing fails — the baselines simply stop describing ' +
  'the game they were measured on. The registry is append-only. Take the next unused number.';

/**
 * Every way a registry table departs from the permanent assignment.
 *
 * Returns all of them rather than throwing on the first. A renumbering is
 * usually a shift of several IDs at once, and reporting one per run invites the
 * reader to "fix" them one at a time instead of reading what happened.
 */
export function registryProblems(
  actual: Readonly<Record<string, number>>,
  permanent: Readonly<Record<string, number>> = PERMANENT_IDS,
): string[] {
  const problems: string[] = [];

  const byId = new Map<number, string[]>();
  for (const [name, id] of Object.entries(actual)) {
    const names = byId.get(id);
    if (names === undefined) byId.set(id, [name]);
    else names.push(name);
  }

  for (const [id, names] of [...byId.entries()].sort((a, b) => a[0] - b[0])) {
    if (names.length > 1) {
      problems.push(
        `Stream ID ${id} is claimed by ${names.length} subsystems: ${names.join(', ')}. Two ` +
          'subsystems sharing an ID share a cursor, so a draw in one shifts every draw in the ' +
          `other and §6's insertion invariance is gone. ${CONSEQUENCE}`,
      );
    }
  }

  for (const [name, id] of Object.entries(actual)) {
    if (!Number.isInteger(id) || id < 1) {
      problems.push(
        `Subsystem "${name}" has stream ID ${String(id)}, which is not a positive integer. ` +
          `${CONSEQUENCE}`,
      );
    }
  }

  for (const [name, expected] of Object.entries(permanent)) {
    const found = actual[name];
    if (found === undefined) {
      problems.push(
        `Subsystem "${name}" has been removed from the registry; its permanent ID was ` +
          `${expected}. A retired ID is retired, not reusable. ${CONSEQUENCE}`,
      );
    } else if (found !== expected) {
      problems.push(
        `Subsystem "${name}" is registered as stream ID ${found} but its permanent ID is ` +
          `${expected}. ${CONSEQUENCE}`,
      );
    }
  }

  // Appending is the only permitted change, and an append takes the next free
  // number. A new subsystem parachuted in at ID 3 would push nothing and break
  // nothing visible, while renumbering everything after it in spirit.
  const highestPermanent = Math.max(0, ...Object.values(permanent));
  let nextFree = highestPermanent + 1;
  for (const [name, id] of Object.entries(actual)) {
    if (permanent[name] !== undefined) continue;
    if (id !== nextFree) {
      problems.push(
        `Subsystem "${name}" is new and takes stream ID ${id}, but the next unused ID is ` +
          `${nextFree}. ${CONSEQUENCE}`,
      );
    }
    nextFree += 1;
  }

  return problems;
}

/** The §6 table, as `(id, subsystem description)` rows, read from the document. */
export function parseStreamRegistryTable(markdown: string): { id: number; subsystem: string }[] {
  const section = /\n## 6\. RNG Stream Registry\n([\s\S]*?)\n## /.exec(markdown);
  if (section === null) {
    throw new Error(
      'Could not find "## 6. RNG Stream Registry" in docs/design/contracts.md. This test binds ' +
        'the code registry to the normative table; if the section moved, point it at the new one ' +
        'rather than deleting the binding.',
    );
  }

  const rows: { id: number; subsystem: string }[] = [];
  for (const line of section[1]!.split('\n')) {
    const cells = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (cells === null) continue;
    const id = Number(cells[1]);
    if (!Number.isInteger(id)) continue; // the header row and its `|---|` rule
    rows.push({ id, subsystem: cells[2]!.replace(/\*\*/g, '').toLowerCase() });
  }
  return rows;
}

const contracts = readFileSync(contractsPath, 'utf8');
const docRows = parseStreamRegistryTable(contracts);

describe('the RNG stream registry matches the normative table', () => {
  it('parsed the §6 table at all, so the assertions below are not vacuous', () => {
    expect(docRows.length).toBe(Object.keys(PERMANENT_IDS).length);
  });

  it('assigns each subsystem the ID docs/design/contracts.md §6 gives it', () => {
    for (const [name, id] of Object.entries(RNG_STREAM as Record<string, number>)) {
      const text = DOC_TEXT_BY_SUBSYSTEM[name];
      expect(text, `No §6 description is mapped to registry key "${name}".`).toBeDefined();
      const row = docRows.find((candidate) => candidate.subsystem.includes(text as string));
      expect(row, `§6 has no row describing "${text}".`).toBeDefined();
      expect(
        (row as { id: number }).id,
        `The registry gives "${name}" stream ID ${id}; contracts.md §6 gives it ` +
          `${(row as { id: number }).id}. ${CONSEQUENCE}`,
      ).toBe(id);
    }
  });

  it('carries no ID the document does not, and none the code does not', () => {
    expect([...docRows.map((row) => row.id)].sort((a, b) => a - b)).toEqual(
      Object.values(RNG_STREAM).sort((a, b) => a - b),
    );
  });

  it('is dense from 1, which is what "append-only" leaves behind', () => {
    const ids = Object.values(RNG_STREAM).sort((a, b) => a - b);
    expect(ids).toEqual(ids.map((_value, index) => index + 1));
  });

  it('departs from the permanent assignment in no way at all', () => {
    expect(registryProblems(RNG_STREAM as Record<string, number>)).toEqual([]);
  });
});

describe('the registry check rejects the changes that invalidate baselines', () => {
  it('rejects renumbering, naming the subsystem and both IDs', () => {
    const renumbered = { ...PERMANENT_IDS, mortality: NEXT_FREE_ID };
    const problems = registryProblems(renumbered);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('mortality');
    expect(problems[0]).toContain(String(NEXT_FREE_ID));
    expect(problems[0]).toContain('2');
    expect(problems[0]).toContain('balance baseline');
    expect(problems[0]).toContain('append-only');
  });

  it('rejects two subsystems declaring the same ID, naming both', () => {
    const duplicated = { ...PERMANENT_IDS, terrain: 8 };
    const problems = registryProblems(duplicated);

    const duplicate = problems.find((problem) => problem.includes('claimed by'));
    expect(duplicate).toBeDefined();
    expect(duplicate).toContain('combat');
    expect(duplicate).toContain('terrain');
    expect(duplicate).toContain('balance baseline');
  });

  it('rejects a swap, which leaves the ID set identical', () => {
    // The nastiest case, and the one a set-comparison misses entirely: every ID
    // is still present exactly once, so nothing about the shape of the table
    // has changed. Only the name-to-ID binding moved.
    const swapped = { ...PERMANENT_IDS, research: 4, teaching: 3 };
    const problems = registryProblems(swapped);

    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('research');
    expect(problems.join('\n')).toContain('teaching');
  });

  it('rejects removing a subsystem, because a retired ID is not reusable', () => {
    const withoutScribing: Record<string, number> = { ...PERMANENT_IDS };
    delete withoutScribing['scribing'];
    const problems = registryProblems(withoutScribing);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('scribing');
    expect(problems[0]).toContain('removed');
  });

  it('rejects a new subsystem inserted below the high-water mark', () => {
    const inserted = { ...PERMANENT_IDS, weather: 3 };
    const problems = registryProblems(inserted);

    expect(problems.some((problem) => problem.includes('weather'))).toBe(true);
    expect(problems.join('\n')).toContain(`next unused ID is ${String(NEXT_FREE_ID)}`);
  });

  it('accepts appending a subsystem with the next unused ID', () => {
    // The control. Every assertion above says the checker complained; if it
    // complained about everything, they would all pass and mean nothing.
    expect(registryProblems({ ...PERMANENT_IDS, weather: NEXT_FREE_ID })).toEqual([]);
    expect(
      registryProblems({ ...PERMANENT_IDS, weather: NEXT_FREE_ID, tides: NEXT_FREE_ID + 1 }),
    ).toEqual([]);
  });
});
