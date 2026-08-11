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

/**
 * The rest of the rules path, held to the same bans as the core.
 *
 * `contracts.md` §0 puts the float ban on *the rules path*, not on one package,
 * so a package outside this glob is a package where `0.5` compiles. The list is
 * enumerated rather than written as `packages/rules-*` plus a wildcard because
 * two packages must stay out of it and the reason differs for each:
 *
 * - `agent-api` is the one place floating point is permitted (§4.1): it
 *   normalizes the observation to a `Float64Array` on the way out. Banning
 *   floats there would ban the contract.
 * - `mc-harness` is host-side tooling — worker processes, result files, a wall
 *   clock to report throughput. Its determinism obligation is to run the core
 *   faithfully, not to be integer-only itself.
 *
 * `content` is also absent, and deliberately so: it parses author-facing JSON,
 * where a malformed float has to be *detected* before it can be rejected.
 */
const RULES_SRC = [
  'packages/state/src/**/*.ts',
  'packages/rules-magic/src/**/*.ts',
  'packages/rules-world/src/**/*.ts',
  'packages/rules-raid/src/**/*.ts',
];

const CORE_TEST = [
  'packages/sim-core/test/**/*.ts',
  'packages/state/test/**/*.ts',
  'packages/rules-magic/test/**/*.ts',
  'packages/rules-world/test/**/*.ts',
  'packages/rules-raid/test/**/*.ts',
];

/**
 * `packages/primitives` is rules path: it is where effect-primitive magnitudes
 * are stacked and clamped, so it carries the same float ban as the core. It is
 * a separate glob rather than an addition to {@link CORE_SRC} because it *does*
 * import — from `@mm/sim-core` and `@mm/content` — and lumping it in would blur
 * what "the core depends on nothing" means.
 */
const PRIMITIVES_SRC = ['packages/primitives/src/**/*.ts'];

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

/**
 * `no-restricted-imports` only visits static `import`/`export` declarations, so
 * `await import('node:fs')` and `require('fs')` walked straight through both the
 * enumerated path list and the `node:*` pattern below. Found by an adversarial
 * agent probing the ban rather than trusting it — which is the whole argument
 * for testing enforcement machinery: the rule had been correct-looking and
 * porous since the day it was written, and nothing would ever have said so.
 *
 * Expressed as syntax selectors because `no-restricted-imports` cannot describe
 * a call expression at all.
 *
 * Banned outright rather than filtered down to Node built-ins. Two reasons, and
 * the second is the real one:
 *
 * - The core is dependency-free and loads nothing lazily, so it has no
 *   legitimate use for `import()` at all. A blanket ban costs nothing.
 * - A selector matching only built-in specifiers has to embed the module list
 *   in a regex, and several of those names contain a `/` (`fs/promises`,
 *   `stream/web`). A rule that is fiddly to express is a rule that gets a
 *   subtle hole later — which is exactly the history of the ban it patches.
 */
const BAN_DYNAMIC_IMPORT = {
  selector: 'ImportExpression',
  message:
    'The simulation core performs no I/O and imports no Node built-ins — a dynamic import is ' +
    'still an import, and static `no-restricted-imports` cannot see one. The core loads nothing ' +
    'lazily; it must run unchanged in Node, Electron, and a browser.',
};

const BAN_REQUIRE = {
  selector: "CallExpression[callee.name='require']",
  message:
    'require() is CommonJS and, in the core, is a way to reach a Node built-in past the import ' +
    'ban. The simulation core is ESM and imports no Node built-ins.',
};

/**
 * ## Inline combination of primitive magnitudes
 *
 * `docs/design/contracts.md` §3 gives every effect primitive a *declared*
 * stacking rule, and the design note behind it names the failure this prevents:
 * two implementers disagreeing about whether two `+20%` research bonuses make
 * `+40%` or `+44%`. The disagreement is invisible — both readings compile, both
 * produce plausible numbers, and the divergence only shows up months later as a
 * balance baseline that nobody can reproduce.
 *
 * The defence is that the arithmetic exists in exactly one place
 * (`packages/primitives/src/stacking.ts`) and everywhere else calls it. These
 * selectors are the mechanical half of that: they reject the shapes an inline
 * reimplementation actually takes — arithmetic directly on a `.magnitude`, a
 * `reduce` over a `magnitudes` array, `Math.max` over one, a fixed-point helper
 * applied straight to a magnitude.
 *
 * **This is a tripwire, not a proof.** A determined `for` loop accumulating into
 * a differently-named local walks past it, and no syntax selector can close
 * that. What the tripwire buys is that the *obvious* way to write the mistake
 * fails immediately, with a message naming the function to call instead — which
 * is the difference between a convention and a rule. It is applied to every
 * package's `src` except the shared implementation itself and `sim-core`, which
 * has no concept of a primitive.
 */
const BAN_INLINE_MAGNITUDE_ARITHMETIC = {
  selector: "BinaryExpression[operator=/^[-+*/%]$/] > MemberExpression[property.name='magnitude']",
  message:
    'Effect primitive magnitudes may not be combined with inline arithmetic — the stacking rule is ' +
    'declared per primitive in contracts.md §3 and implemented once in @mm/primitives. Call ' +
    'stackMagnitudes(), or the named rule (additive/additiveIntoMultiplier/multiplicativeOnRemainder/maxOf).',
};

const BAN_INLINE_MAGNITUDE_ACCUMULATION = {
  selector: "AssignmentExpression[operator=/^[-+*/%]=$/] > MemberExpression[property.name='magnitude']",
  message:
    'Accumulating into or out of a primitive magnitude is inline stacking by another spelling. ' +
    'Collect the magnitudes and call stackMagnitudes() from @mm/primitives.',
};

const BAN_MAGNITUDE_REDUCE = {
  selector:
    "CallExpression[callee.property.name=/^(reduce|reduceRight)$/][callee.object.name=/[Mm]agnitudes$/]",
  message:
    'Folding an array of primitive magnitudes is exactly what @mm/primitives exists to do once. ' +
    'The fold you write here will not know the primitive’s declared cap, and an uncapped ' +
    'compounding rate is the runaway contracts.md §3 caps exist to prevent.',
};

const BAN_MAGNITUDE_MATH_EXTREMUM = [
  {
    selector:
      "CallExpression[callee.object.name='Math'][callee.property.name=/^(max|min)$/] > MemberExpression[property.name='magnitude']",
    message:
      'Only some primitives stack by max (contracts.md §3), and which ones is registry data, not a ' +
      'judgement call at the call site. Use maxOf()/stackMagnitudes() from @mm/primitives.',
  },
  {
    selector:
      "CallExpression[callee.object.name='Math'][callee.property.name=/^(max|min)$/] > SpreadElement > Identifier[name=/[Mm]agnitudes$/]",
    message:
      'Only some primitives stack by max (contracts.md §3), and which ones is registry data, not a ' +
      'judgement call at the call site. Use maxOf()/stackMagnitudes() from @mm/primitives.',
  },
];

const BAN_FIXED_POINT_ON_MAGNITUDE = {
  selector: "CallExpression[callee.name=/^(mul|div|lerp)$/] > MemberExpression[property.name='magnitude']",
  message:
    'Applying a fixed-point helper straight to a primitive magnitude skips the declared stacking ' +
    'rule and the cap. Route it through @mm/primitives, which applies both and counts the clamp.',
};

const BAN_INLINE_PRIMITIVE_STACKING = [
  BAN_INLINE_MAGNITUDE_ARITHMETIC,
  BAN_INLINE_MAGNITUDE_ACCUMULATION,
  BAN_MAGNITUDE_REDUCE,
  ...BAN_MAGNITUDE_MATH_EXTREMUM,
  BAN_FIXED_POINT_ON_MAGNITUDE,
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
    files: [...CORE_SRC, ...RULES_SRC],
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
        BAN_DYNAMIC_IMPORT,
        BAN_REQUIRE,
        // Listed here rather than left to the "everyone else" block below.
        // Flat config resolves `no-restricted-syntax` last-block-wins, not by
        // union, so a later block matching these same files replaced this whole
        // array — and one did. For a while `packages/state/src` and every
        // `rules-*` package accepted `0.5`, `Math.random()` and `Math.floor`
        // with no error at all, while the block above still read as though it
        // banned them. Rules-path packages need both sets, so both live here.
        ...BAN_INLINE_PRIMITIVE_STACKING,
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // ---- Shared primitive arithmetic: rules path, so the float ban applies. ----
    // This block does not overlap CORE_SRC, and the inline-stacking block below
    // deliberately excludes this glob: flat config resolves `no-restricted-syntax`
    // last-block-wins rather than by union, so two blocks matching one file would
    // silently disable the first block's bans.
    files: PRIMITIVES_SRC,
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
        BAN_DYNAMIC_IMPORT,
        BAN_REQUIRE,
        // NOT the inline-stacking ban: this package *is* the shared
        // implementation, so combining magnitudes here is the whole point.
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    // ---- Everyone else: combine primitive magnitudes through @mm/primitives. ----
    //
    // "Everyone else" means everyone the purity block above does not already
    // cover. That block now carries these bans itself, and this one must not
    // match any file it matches: flat config replaces `no-restricted-syntax`
    // wholesale rather than merging it, so an overlap silently deletes the
    // float ban from whichever files both blocks touch. That is not a
    // hypothetical — it is what this block did to `state` and `rules-*` until a
    // review probed the config instead of reading it.
    //
    // `sim-core` and `primitives/src` were already excluded for the same
    // reason; the rules packages were missed because they were added later.
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/sim-core/**/*.ts', ...PRIMITIVES_SRC, ...RULES_SRC],
    rules: {
      'no-restricted-syntax': ['error', ...BAN_INLINE_PRIMITIVE_STACKING],
    },
  },

  {
    /**
     * The content loader is *not* pure — it reads the filesystem, and it parses
     * author-written JSON where a malformed float has to be detected before it
     * can be rejected. So it gets neither the float ban nor the Node-builtin
     * ban. It does get these two.
     *
     * Adversarial testing found that a computed-specifier dynamic import in
     * `packages/content` was caught by nothing in this repository: the module-
     * boundary scanner could not read the specifier, and the dependency-purity
     * script only reads manifests, never source. Every other workspace package
     * was covered by the outright `import()` ban; content was the one hole.
     */
    files: ['packages/content/src/**/*.ts', 'packages/content/bin/**/*.mjs'],
    rules: {
      'no-restricted-syntax': ['error', BAN_DYNAMIC_IMPORT, BAN_REQUIRE],
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
