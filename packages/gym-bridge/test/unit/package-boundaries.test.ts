/*
 * Multiverse Mages — what the bridge is not allowed to grow into.
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
 * The package's own claims about itself, checked.
 *
 * `design.md` argues that the failure available here is not *missing*
 * functionality but a **second implementation of functionality that exists**:
 * a second normalization, a second seed derivation, a second reward, a second
 * concurrency story. Each would quietly decouple what a learned agent optimizes
 * from what the balance gates measure, and none would fail anything. So each is
 * asserted against rather than trusted to.
 *
 * The scanning is deliberately crude — it reads its own source with a regex and
 * strips comments first. A crude check that runs is worth more than a precise
 * one nobody writes, and every one of these has a specific shape it is looking
 * for rather than a vibe.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function read(relative: string): string {
  return readFileSync(join(packageRoot, relative), 'utf8');
}

function sourceFiles(): { name: string; text: string }[] {
  const dir = join(packageRoot, 'src');
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.ts'))
    .sort()
    .map((entry) => ({ name: entry, text: readFileSync(join(dir, entry), 'utf8') }));
}

/**
 * Source with block comments, line comments and string literals removed.
 *
 * **Template literals are stripped first, and the order is load-bearing.** A
 * message in this package reads *"the seed is the client's"* inside a template,
 * and stripping single-quoted strings before templates cuts that apostrophe as
 * an opening quote — after which every subsequent quote in the file pairs
 * wrongly and the "no fractional literal" check below reported `§4.2` from a
 * prose string as a rescaling constant. That is the shape of a crude check
 * going wrong, so it is written down rather than only fixed.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

describe('the bridge pays for its one edge', () => {
  it('declares no third-party runtime dependency', () => {
    const manifest = JSON.parse(read('package.json')) as Record<string, unknown>;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const name of Object.keys((manifest[field] ?? {}) as Record<string, string>)) {
        expect(
          name.startsWith('@mm/'),
          `packages/gym-bridge declares ${name}. It is host-side and so is not in the ` +
            "dependency-purity script's PURE_PACKAGES — this test is the only thing holding the " +
            'zero-third-party claim, and the AGPL compatibility question is removed by never ' +
            'asking it rather than by answering it repeatedly.',
        ).toBe(true);
      }
    }
    expect(Object.keys((manifest['dependencies'] ?? {}) as Record<string, string>)).toEqual([
      '@mm/agent-api',
    ]);
  });

  it('declares AGPL-3.0-or-later, like every package here', () => {
    const manifest = JSON.parse(read('package.json')) as Record<string, unknown>;
    expect(manifest['license']).toBe('AGPL-3.0-or-later');
    expect(manifest['author']).toBe('Ann Kelner');
  });

  it('carries the standard licence header in every source file', () => {
    for (const file of sourceFiles()) {
      expect(file.text, file.name).toContain('SPDX-License-Identifier: AGPL-3.0-or-later');
      expect(file.text, file.name).toContain('Copyright (C) 2026 Ann Kelner');
    }
  });

  it('is covered by the workspace dependency-graph test, as a described leaf', () => {
    // The §5 table lives in sim-core's suite. Asserting the entry exists here
    // means deleting it there fails two suites rather than none.
    const graph = readFileSync(
      join(repoRoot, 'packages/sim-core/test/unit/module-boundaries.test.ts'),
      'utf8',
    );
    expect(graph).toContain("'gym-bridge': {");
    expect(graph).toContain('keeps the gym-bridge package a leaf');
  });

  it('imports no workspace package but agent-api, anywhere in src', () => {
    const found = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of file.text.matchAll(/from '(@mm\/[^']+)'/g)) {
        found.add(match[1] as string);
      }
    }
    expect([...found]).toEqual(['@mm/agent-api']);
  });
});

describe('the bridge computes nothing it is not allowed to compute', () => {
  it('applies no normalization to an observation value', () => {
    // §4.1 makes agent-api's normalize.ts the ONE licensed float boundary. A
    // second one here would decouple what a policy learns from what the gates
    // measure, and both sides would still be numbers in [0, 1] — so nothing
    // downstream would notice. The shapes below are what a second one looks
    // like when somebody writes it.
    for (const file of sourceFiles()) {
      const body = code(file.text);
      expect(body, `${file.name}: divides`).not.toMatch(/observation\s*\[[^\]]*\]\s*[/*]/);
      expect(body, `${file.name}: scales`).not.toMatch(/[/*]\s*(?:FP_SCALE|OBSERVATION_SCALE|1024)/);
      expect(body, `${file.name}: clamps`).not.toMatch(/\bsaturate\s*\(/);
      expect(body, `${file.name}: maps the vector`).not.toMatch(
        /observation\s*\.\s*map\s*\(/,
      );
    }
  });

  it('holds no non-integer numeric literal', () => {
    // Not because the rules-path float ban applies — it does not, this package
    // is host-side — but because a fractional constant here could only be a
    // rescaling factor or a tolerance, and both are things this package must
    // not have. A tolerance in a transport is a transport that loses data.
    for (const file of sourceFiles()) {
      expect(code(file.text), file.name).not.toMatch(/(?<![\w.])\d+\.\d+(?![\w.])/);
    }
  });

  it('scores nothing, under any name', () => {
    for (const file of sourceFiles()) {
      const body = code(file.text);
      for (const forbidden of ['reward', 'fitness', 'discount', 'gamma', 'advantage']) {
        expect(body.toLowerCase(), `${file.name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('derives no seed', () => {
    // `mc-harness` publishes `deriveRunSeed` with its own version constant, and
    // §5 grants this package no edge to it. A second derivation would be a
    // second implementation of a published constant, silent when it drifts.
    for (const file of sourceFiles()) {
      const body = code(file.text);
      expect(body, `${file.name}: hashes`).not.toMatch(/\bfnv|\bhash\w*\s*\(/i);
      expect(body, `${file.name}: derives`).not.toMatch(/deriveRunSeed|seedFrom|nextSeed/);
    }
  });

  it('reads no clock outside the measurement command', () => {
    // A wall-clock read inside a frame handler would put a timing value into a
    // recorded episode, and a record that carries one cannot be compared byte
    // for byte. The throughput command lives in bin/ for exactly this reason.
    for (const file of sourceFiles()) {
      const body = code(file.text);
      expect(body, `${file.name}: Date`).not.toMatch(/\bDate\s*\./);
      expect(body, `${file.name}: performance`).not.toMatch(/\bperformance\s*\./);
      expect(body, `${file.name}: Math.random`).not.toMatch(/Math\s*\.\s*random/);
    }
  });

  it('runs no sweep, aggregates nothing, and writes no baseline', () => {
    // The reuse of `mc-harness`'s pool is expressed by declining to compete
    // with it. See `vector.ts`: `RunExecutor` runs a whole episode to
    // termination inside a worker, a Python policy cannot be inside that call,
    // and inverting the contract would give the repository two ways to drive a
    // universe.
    for (const file of sourceFiles()) {
      const body = code(file.text).toLowerCase();
      for (const forbidden of ['sweep', 'baseline', 'aggregate', 'worker_threads', 'tournament']) {
        expect(body, `${file.name}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('the bridge performs no I/O of its own', () => {
  it('imports no Node built-in in src, so the dispatcher stays lines-in, lines-out', () => {
    // The two things `src` cannot own — `process.argv` and the dynamic import of
    // a scenario module — live in `bin/`, which is where a reader will look for
    // them and where §5's boundary scanner correctly declines to guess at a
    // computed specifier.
    for (const file of sourceFiles()) {
      expect(file.text, file.name).not.toMatch(/from 'node:/);
      expect(code(file.text), file.name).not.toMatch(/\bprocess\s*\./);
    }
  });
});
