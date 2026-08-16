#!/usr/bin/env node
/*
 * Multiverse Mages — resolve the `file:line` pointers in a comment, and prove
 * they still point where they claim.
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
 * A comment that cites `spec.md:158` instead of restating §158 is shorter and
 * does not rot into a second, disagreeing copy. It has one cost: the reader has
 * to go and look, and the line number can drift under an edit that never
 * touched the comment. This resolves the first and detects the second.
 *
 *     node scripts/resolve-refs.mjs <path>...      # print each ref's target
 *     node scripts/resolve-refs.mjs --check <path>...
 *
 * Exits, following `CLAUDE.md`'s rule that a checker needs a third answer for
 * *"the probe is broken"*:
 *
 * - `0`  every ref resolved (and, under `--check`, matched its anchor)
 * - `42` at least one ref is broken — missing file, line past EOF, or an anchor
 *        the target line no longer contains
 * - `1`  the probe itself failed: bad arguments, unreadable input, no refs found
 *        in a file the caller named
 *
 * Two ref shapes are recognised, both of which this repository already writes:
 *
 *     `universe-effects.ts:35`            an explicit basename or path
 *     `:158` position-free                a bare line, under a path named
 *                                         earlier in the same comment block
 *
 * A ref that **opens a line** may carry an **anchor**: the words between it and
 * the first dash or comma, as in `` `:158` position-free ``. `--check` requires
 * those words within {@link ANCHOR_WINDOW} lines of the target, which is what
 * turns a drifted line number into a failure rather than a silently wrong
 * citation.
 *
 * A ref in the middle of a sentence is followed by prose rather than by a
 * title, so it carries no anchor and is reported `?` — resolved, but only
 * against file and length. That is the honest coverage boundary: `?` means the
 * cited file exists and is long enough, not that the line still says what the
 * comment claims. Move a ref to the front of its own line to get it checked.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, basename, relative } from 'node:path';

/** How far from the cited line an anchor may sit and still count as a match. */
const ANCHOR_WINDOW = 6;

/** Words too common to distinguish one line from another. Dropped from anchors. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'its', 'not', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Every tracked file, once, so a basename can be resolved to a path. */
const trackedByBasename = (() => {
  const out = new Map();
  const listing = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  for (const path of listing.split('\n')) {
    if (path === '') continue;
    const key = basename(path);
    const existing = out.get(key);
    if (existing === undefined) out.set(key, [path]);
    else existing.push(path);
  }
  return out;
})();

/**
 * Turns a cited path into a repo path.
 *
 * A ref may name a bare basename (`universe-effects.ts`), a suffix
 * (`balance-metrics/spec.md`), or a full path. Ambiguity is an error rather
 * than a first match: `spec.md` alone names dozens of files, and picking one
 * would be the failure mode `CLAUDE.md` records as *an aggregator that locates
 * input by shape rather than by name*.
 */
function resolveCitedPath(cited) {
  if (existsSync(resolve(repoRoot, cited))) return { path: cited };

  const direct = trackedByBasename.get(basename(cited));
  if (direct === undefined) return { error: `no tracked file named ${basename(cited)}` };

  const matches = cited.includes('/')
    ? direct.filter((path) => path.endsWith(cited))
    : direct;
  if (matches.length === 1) return { path: matches[0] };
  if (matches.length === 0) return { error: `no tracked file matching ${cited}` };
  return { error: `${cited} is ambiguous: ${matches.slice(0, 4).join(', ')}` };
}

/** The significant words of an anchor, lowercased. */
function anchorWords(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Every ref in one file, in source order.
 *
 * Bare `:NNN` refs inherit the last explicit path named in the same comment
 * block, which is the shape a long module note uses when it cites one spec
 * several times. A bare ref with no such path in scope is reported, not guessed
 * at.
 */
function refsIn(source) {
  const lines = source.split('\n');
  const found = [];
  let inBlock = false;
  let blockPath;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*\/\*/.test(line)) {
      inBlock = true;
      blockPath = undefined;
    }

    const isComment = inBlock || /^\s*\/\//.test(line);
    if (isComment) {
      // A path in backticks, then a colon, then end of line: the declaration
      // form a long note uses before a list of bare `:NNN` refs. Deliberately
      // narrow — any backticked filename would arm on every passing mention.
      const declared = line.match(/`([\w./-]+\.(?:ts|mjs|js|md|json))`:\s*$/);
      if (declared !== null) blockPath = declared[1];

      const pattern = /`([\w./-]+\.(?:ts|mjs|js|md|json)):(\d+)`|`?:(\d+)`/g;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const bare = match[3] !== undefined;
        const cited = bare ? blockPath : match[1];
        const lineNo = Number(bare ? match[3] : match[2]);
        // An anchor is only read when the ref *opens* the line's content, which
        // is where the convention puts a title: `- `:158` position-free — …`.
        // A ref in the middle of a sentence is followed by prose, not by a
        // title, and reading that prose as an anchor invents a drift report.
        const before = line.slice(0, match.index).replace(/^\s*(?:\*|\/\/)?\s*(?:[-*]\s+)?/, '');
        const trailing = line.slice(match.index + match[0].length).replace(/\s*\*\/\s*$/, '');
        found.push({
          sourceLine: i + 1,
          cited,
          lineNo,
          anchor: before === '' ? trailing.trim().split(/[,.;:—(]/)[0].trim() : '',
          raw: match[0],
        });
      }
    }

    if (/\*\//.test(line)) inBlock = false;
  }
  return found;
}

/** Resolves one ref against the tree. */
function inspect(ref) {
  if (ref.cited === undefined) {
    return { ...ref, status: 'broken', why: 'bare line ref with no path named in this comment' };
  }
  const resolved = resolveCitedPath(ref.cited);
  if (resolved.error !== undefined) return { ...ref, status: 'broken', why: resolved.error };

  const target = readFileSync(resolve(repoRoot, resolved.path), 'utf8').split('\n');
  if (ref.lineNo < 1 || ref.lineNo > target.length) {
    return {
      ...ref,
      path: resolved.path,
      status: 'broken',
      why: `line ${ref.lineNo} is past the end of a ${target.length}-line file`,
    };
  }

  const text = target[ref.lineNo - 1].trim();
  const words = anchorWords(ref.anchor);
  if (words.length === 0) return { ...ref, path: resolved.path, status: 'unanchored', text };

  const from = Math.max(0, ref.lineNo - 1 - ANCHOR_WINDOW);
  const window = target.slice(from, ref.lineNo + ANCHOR_WINDOW).join(' ').toLowerCase();
  const hit = words.filter((word) => window.includes(word)).length;
  if (hit * 2 >= words.length) return { ...ref, path: resolved.path, status: 'ok', text };
  return {
    ...ref,
    path: resolved.path,
    status: 'broken',
    text,
    why: `anchor "${ref.anchor}" is not within ${String(ANCHOR_WINDOW)} lines of ${resolved.path}:${String(ref.lineNo)}`,
  };
}

function main(argv) {
  const check = argv.includes('--check');
  const paths = argv.filter((arg) => arg !== '--check');
  if (paths.length === 0) {
    process.stderr.write('usage: resolve-refs.mjs [--check] <path>...\n');
    return 1;
  }

  let broken = 0;
  let total = 0;

  for (const path of paths) {
    let source;
    try {
      source = readFileSync(resolve(process.cwd(), path), 'utf8');
    } catch (error) {
      process.stderr.write(`cannot read ${path}: ${String(error)}\n`);
      return 1;
    }

    const refs = refsIn(source).map(inspect);
    total += refs.length;
    if (refs.length === 0) continue;

    process.stdout.write(`\n${relative(repoRoot, resolve(process.cwd(), path))}\n`);
    for (const ref of refs) {
      const where = `${String(ref.sourceLine)}`.padStart(5);
      if (ref.status === 'broken') {
        broken += 1;
        process.stdout.write(`${where}  ✗ ${ref.raw} — ${ref.why}\n`);
        continue;
      }
      const mark = ref.status === 'unanchored' ? '?' : '✓';
      process.stdout.write(`${where}  ${mark} ${ref.path}:${String(ref.lineNo)}\n`);
      process.stdout.write(`${' '.repeat(9)}${ref.text}\n`);
    }
  }

  if (total === 0) {
    process.stderr.write('no refs found in any named file; the probe found nothing to check\n');
    return 1;
  }
  process.stdout.write(`\n${String(total)} refs, ${String(broken)} broken\n`);
  return check && broken > 0 ? 42 : 0;
}

process.exit(main(process.argv.slice(2)));
