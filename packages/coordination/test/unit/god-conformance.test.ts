/*
 * Multiverse Mages — the god-agency rules that are checked rather than
 * remembered.
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
 * Five properties the specs state as prohibitions, each asserted against the
 * tree rather than against a reading of it.
 *
 * A prohibition tested by an example is a prohibition tested nowhere: "this
 * blessing writes no mage field" is a fact about one code path, and the
 * requirement is about every code path there will ever be. So these read the
 * source, the way `economy-three-inputs.test.ts` reads `rules-world/src` for a
 * write to `favor` — a scan is coarse, and it fails on the day somebody adds the
 * thing the rule forbids, which is the day it needs to fail.
 *
 * Each scan states what it would miss. A scan that claims to be exhaustive is
 * worse than one that does not, because the next reader trusts it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ACTION, LEGACY_CHANNELS, legacyGrant } from '../../src/index.js';

import { constants } from './god-fixtures.js';

const GOD_DIR = fileURLToPath(new URL('../../src/god', import.meta.url));
const CONTRACTS = fileURLToPath(new URL('../../../../docs/design/contracts.md', import.meta.url));

/** Every `.ts` file of the capability, by name, with its source. */
function godSources(): { name: string; source: string }[] {
  return readdirSync(GOD_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => ({ name, source: readFileSync(`${GOD_DIR}/${name}`, 'utf8') }));
}

/**
 * Source with block comments and line comments removed.
 *
 * Every rule below is about what the code *does*, and every one of these files
 * explains in prose why it does not do the forbidden thing — so scanning the
 * comments would fail on the documentation that exists to prevent the defect.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the worship computation never reads knowledge', () => {
  it('imports no knowledge component and names no knowledge quantity', () => {
    // The decoupling that answers vision §6a. The §6a loop compounds on library
    // depth and the §7 loop compounds on worship; a direct edge between them
    // produces one loop with the *product* of the two gains, which is the
    // failure §6a predicts. The only permitted route from knowledge to favor is
    // the `worship-yield` primitive, which multiplies *regeneration* through a
    // channel §3 caps at 2x and never enters the worship formula.
    const worship = code(readFileSync(`${GOD_DIR}/worship.ts`, 'utf8'));
    for (const forbidden of [
      'KNOWLEDGE_INSTANCE',
      'KnowledgeSubsystem',
      'knownNodes',
      'instanceCount',
      'libraryDepth',
      'EVER_KNOWN',
      'GRIMOIRE',
      'LIBRARY',
      'rules-magic',
    ]) {
      expect(worship, `worship.ts must not name ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('takes its inputs as counts and a flag, with no knowledge among them', () => {
    // The signature is the stronger half of the rule: `WorshipSources` has four
    // fields and there is no argument through which a library could reach the
    // formula at all. Asserted on the declaration so that widening it is a
    // failure here rather than a quiet new coupling.
    const worship = code(readFileSync(`${GOD_DIR}/worship.ts`, 'utf8'));
    const block = worship.slice(
      worship.indexOf('export interface WorshipSources'),
      worship.indexOf('}', worship.indexOf('export interface WorshipSources')),
    );
    const fields = [...block.matchAll(/readonly (\w+):/g)].map((match) => match[1]);
    expect(fields.sort()).toEqual(['blessedMages', 'completedUniversities', 'mages', 'populace']);
  });
});

describe('the dispatch table matches contracts.md §4.2 exactly', () => {
  it('names every id the document declares, and no others', () => {
    // Read out of the document rather than transcribed, because a transcription
    // agrees with the document only on the day it is written. These ids are
    // serialized into action logs and indexed by a trained policy's output
    // layer, so a renumbering is silent in every direction.
    const doc = readFileSync(CONTRACTS, 'utf8');
    const section = doc.slice(doc.indexOf('### 4.2'), doc.indexOf('### 4.3'));
    const rows = [...section.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)];
    expect(rows.length).toBe(16);

    const camel = (name: string): string =>
      name
        .split(/[\s-]+/)
        .map((word, index) => (index === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
        .join('');

    const fromDoc = Object.fromEntries(
      rows.map((row) => [camel(row[2] ?? ''), Number(row[1])]),
    );
    // `no-op` camel-cases to `noOp`; the table's own spelling of the id is
    // `noop`, which is `sim-core`'s too. Renamed here rather than in either
    // place, because the *number* is what is normative and both names are read
    // by people.
    fromDoc['noop'] = fromDoc['noOp'] ?? 0;
    delete fromDoc['noOp'];

    expect(fromDoc).toEqual({ ...ACTION });
  });
});

describe('no intervention writes a mage field other than roleId', () => {
  it('writes no mage-only field anywhere in the capability, and does write roleId', () => {
    // The interventions spec: *"no intervention may set a mage's goal, target,
    // movement, or spell choice"*, and the mage's own utility scoring keeps
    // producing her decisions afterwards. A role is an input to that scoring,
    // not a replacement for it.
    //
    // Every `store.set(handle, 'field', …)` in the capability is collected and
    // the set of field names is compared against §1.2's mage fields. Coarse in
    // one direction — it also sees universe and god-state writes, which is
    // harmless because no mage-only field name is shared with them — and it
    // misses exactly one thing, stated so the next reader does not trust it
    // further than it goes: a write routed through a helper taking the field
    // name as a variable. Nothing does that today, and the day something does,
    // this test is what has to be changed deliberately.
    const written = new Set<string>();
    for (const { source } of godSources()) {
      for (const match of code(source).matchAll(/\.set\(\s*[^,]+,\s*'(\w+)'/g)) {
        written.add(match[1] ?? '');
      }
    }

    /** §1.2's mage fields, less `roleId` — the one an intervention may write. */
    const forbidden = [
      'speciesId',
      'birthTick',
      'universityId',
      'curiosity',
      'ambition',
      'caution',
      'vigor',
      'maxVigor',
      'alive',
    ];
    for (const field of forbidden) {
      expect([...written], `an intervention writes the mage field ${field}`).not.toContain(field);
    }
    // And `roleId` really is written, so the assertions above are not satisfied
    // by a capability that writes nothing at all.
    expect(written.has('roleId')).toBe(true);
  });

  it('names no goal, target or utility field anywhere in the capability', () => {
    for (const { name, source } of godSources()) {
      const body = code(source);
      for (const forbidden of ['GOAL_COMMITMENT', 'targetNodeId', 'utilityScore', 'selectGoal']) {
        expect(body, `${name} must not name ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('every magnitude comes from content, never from a literal', () => {
  it('hardcodes none of the authored constants in the rules', () => {
    // `release-plan.md` forbids anything below 0.5.0 from claiming balance, and
    // every value in `god-constant.json` carries `tuningStatus: "untuned"`. A
    // literal copy of one in the rules is a knob the harness cannot turn, and a
    // sweep would report the content value while the code used the other one.
    //
    // What this scan misses, stated: a magnitude that happens to equal a small
    // number the code legitimately uses. So the search is restricted to the
    // distinctive ones — the four- and five-digit authored values — and skips
    // anything at or below `fp(1024)`, which is the unit and appears everywhere.
    const distinctive = new Set(
      Object.values(constants())
        .filter((value) => typeof value === 'number' && value > 1024)
        .map((value) => String(value)),
    );
    expect(distinctive.size).toBeGreaterThan(8);

    for (const { name, source } of godSources()) {
      if (name === 'constants.ts') continue;
      const body = code(source);
      for (const literal of [...body.matchAll(/\b(\d{4,})\b/g)].map((match) => match[1] ?? '')) {
        expect(
          distinctive.has(literal),
          `${name} hardcodes ${literal}, which is an authored god-agency magnitude`,
        ).toBe(false);
      }
    }
  });
});

describe('prestige buys stocks and never rates', () => {
  it('declares exactly the four permitted channels', () => {
    expect([...LEGACY_CHANNELS].sort()).toEqual(['archive', 'favor', 'materials', 'populace']);
  });

  it('grants exactly those four and nothing else, at every prestige level', () => {
    for (const prestige of [0, 1, 2048, constants().prestigeCap, constants().prestigeCap * 10]) {
      expect(Object.keys(legacyGrant(prestige, constants())).sort()).toEqual(
        [
          // The four stock channels, one per entry in `LEGACY_CHANNELS`.
          'archiveNodes',
          'favor',
          'materials',
          'populace',
          // Not a fifth channel. `archiveMaxTier` grants nothing — it is the
          // authored bound on how deep a seeded instance may be, passed through
          // from content because the count above cannot be honoured without it.
          // A channel is something prestige buys; this is a limit on one.
          'archiveMaxTier',
        ].sort(),
      );
    }
  });

  it('names no rate, cap, budget or species trait in the legacy path', () => {
    // The distinction is the whole model. In a game with two compounding loops a
    // rate bonus is fed through both for the entire run and its advantage
    // *grows* with run length — the meta-game deciding matches before they
    // start. A stock is spent, consumed, aged out, or looted, so its advantage
    // decays.
    const ascension = code(readFileSync(`${GOD_DIR}/ascension.ts`, 'utf8'));
    const legacy = ascension.slice(ascension.indexOf('export function legacyBudget'));
    for (const forbidden of [
      'favorRegenBase',
      'favorPerWorship',
      'favorCap',
      'edictBudget',
      'worshipMage',
      'worshipUniversity',
      'worshipPopulace',
      'worshipLag',
      'ascensionTierGate',
      'ascensionEraCount',
      'PrimitiveRecord',
      'speciesOf',
    ]) {
      expect(legacy, `the legacy path must not name ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('nothing in the simulation clamps a balance metric', () => {
  it('names none of the three thresholds §7 makes the harness assert', () => {
    // *"A metric clamped in code is a metric that can never fail, and a claim
    // that can never fail is what `release-plan.md` exists to prevent."* The
    // thresholds live in the harness, which measures; the rules must not know
    // them.
    for (const { name, source } of godSources()) {
      const body = code(source);
      for (const forbidden of [
        'worshipSnowball',
        'ascensionRate',
        'prestigeAdvantage',
        'giniCoefficient',
      ]) {
        expect(body, `${name} must not name ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('leaves the ascension band unrepresented in the rules', () => {
    // 0.05 and 0.20 are the band; neither may appear, and no float may appear
    // at all — `CLAUDE.md`'s first non-negotiable constraint is that there is no
    // floating-point arithmetic in the rules path.
    for (const { name, source } of godSources()) {
      const body = code(source);
      const floats = [...body.matchAll(/\b\d+\.\d+\b/g)].map((match) => match[0]);
      expect(floats, `${name} contains floating-point literals`).toEqual([]);
    }
  });
});
