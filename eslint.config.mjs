/*
 * Multiverse Mages — ESLint configuration, including the mechanical enforcement
 * of simulation-core purity.
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

import { builtinModules } from 'node:module';

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The purity rules cover the benchmark's *workload* as well as the core.
 *
 * `packages/sim-core/bench` is split in two on purpose: the workload builds a
 * synthetic world and steps it, and must be as deterministic as the thing it
 * measures — a benchmark whose simulated result varied between runs would be
 * measuring noise. Only the runner reads a clock, and it lives in `scripts/`,
 * outside this glob, where floats and Node built-ins are legitimate.
 */
const CORE_SRC = ['packages/sim-core/src/**/*.ts', 'packages/sim-core/bench/**/*.ts'];
const CORE_TEST = ['packages/sim-core/test/**/*.ts'];

/**
 * Globals whose values are not a function of `(state, actions, rng)`. Reading
 * any of them makes a run irreproducible, which breaks lockstep PvP and makes
 * every committed Monte Carlo baseline meaningless. `Date` is banned whole
 * rather than just `Date.now` so that `new Date()` and `Date['now']()` are
 * covered by the same rule.
 */
const NONDETERMINISTIC_GLOBALS = [
  {
    name: 'Date',
    message:
      'The simulation core may not read wall-clock time. Callers own time; advance the clock through step().',
  },
  {
    name: 'performance',
    message:
      'performance.now() is wall-clock time. The simulation core may not read it — callers own time.',
  },
  {
    name: 'Intl',
    message:
      'Intl behaviour varies by ICU build and locale, so it is not deterministic across machines.',
  },
  {
    name: 'parseFloat',
    message: 'The rules path is float-free. Parse to an integer and use the fixed-point helpers.',
  },
];

/** `Math.random` is banned by name because the spec names it. */
const BAN_MATH_RANDOM = {
  selector: "MemberExpression[object.name='Math'][property.name='random']",
  message:
    'Math.random is banned in the simulation core. Draw from the seeded, stream-split PRNG passed into step().',
};

/**
 * Everything on `Math` except the integer-safe members is banned. This is an
 * allowlist rather than a denylist so that a member nobody thought of
 * (Math.f16round, a future addition) is rejected by default. Computed access
 * (`Math[name]`) has no `property.name` and is therefore also rejected.
 */
const BAN_FLOAT_MATH = {
  selector: "MemberExpression[object.name='Math']:not([property.name=/^(abs|min|max|sign|imul|clz32)$/])",
  message:
    'Only Math.abs/min/max/sign/imul/clz32 are integer-safe. Floating-point Math is banned in the rules path — use the fixed-point helpers.',
};

const BAN_FLOAT_NUMBER_MEMBERS = {
  selector: "MemberExpression[object.name='Number'][property.name=/^(parseFloat|EPSILON|MIN_VALUE|MAX_VALUE)$/]",
  message: 'This Number member is a floating-point concern. The rules path is float-free.',
};

/**
 * Non-integer numeric literals. Matching on `raw` rather than `value` is what
 * makes `1.0` and `1_000.5` catchable; anchoring the pattern is what keeps
 * string literals out, since a string literal's raw text starts with a quote.
 */
const BAN_DECIMAL_LITERAL = {
  selector: 'Literal[raw=/^[0-9_]*\\.[0-9_]*([eE][-+]?[0-9_]+)?$/]',
  message:
    'Non-integer numeric literal. The rules path uses fixed-point integers at scale 1/1024 — write the scaled integer, or fromInt().',
};

const BAN_NEGATIVE_EXPONENT_LITERAL = {
  selector: 'Literal[raw=/^[0-9_]+[eE]-[0-9_]+$/]',
  message:
    'Negative-exponent numeric literal is a fractional value. The rules path uses fixed-point integers at scale 1/1024.',
};

/** Node built-ins, with and without the `node:` prefix, plus the bare prefix. */
const NODE_BUILTIN_IMPORTS = [
  ...new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]),
];

const BAN_NODE_BUILTINS = [
  'error',
  {
    paths: NODE_BUILTIN_IMPORTS.map((name) => ({
      name,
      message:
        'The simulation core performs no I/O and imports no Node built-ins — it must run unchanged in Node, Electron, and a browser.',
    })),
    patterns: [
      {
        group: ['node:*'],
        message:
          'The simulation core performs no I/O and imports no Node built-ins — it must run unchanged in Node, Electron, and a browser.',
      },
    ],
  },
];

export default tseslint.config(
  {
    // .claude/worktrees holds throwaway git worktrees created by background agents.
    // They contain full copies of this repo, so linting them double-reports every file.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.tsbuild/**',
      'coverage/**',
      '.claude/worktrees/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },

  {
    // TypeScript's own checker reports undefined identifiers, and no-undef
    // produces false positives on type-only references.
    files: ['**/*.ts'],
    rules: { 'no-undef': 'off' },
  },

  {
    // Repo tooling is allowed to touch the filesystem and the clock.
    files: ['*.mjs', '*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.nodeBuiltin },
  },

  {
    // ---- Simulation core: purity is enforced here, not asked for politely. ----
    files: CORE_SRC,
    rules: {
      'no-restricted-globals': ['error', ...NONDETERMINISTIC_GLOBALS],
      'no-restricted-imports': BAN_NODE_BUILTINS,
      'no-restricted-syntax': [
        'error',
        BAN_MATH_RANDOM,
        BAN_FLOAT_MATH,
        BAN_FLOAT_NUMBER_MEMBERS,
        BAN_DECIMAL_LITERAL,
        BAN_NEGATIVE_EXPONENT_LITERAL,
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // The core's tests must be as reproducible as the core, but they are not
    // themselves the rules path: float literals are allowed so a test can state
    // what a float answer would have been, and built-ins are allowed so the
    // golden harness (task group 8) can load fixtures.
    files: CORE_TEST,
    rules: {
      'no-restricted-globals': ['error', ...NONDETERMINISTIC_GLOBALS.slice(0, 3)],
      'no-restricted-syntax': ['error', BAN_MATH_RANDOM],
    },
  },
);
