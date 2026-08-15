/*
 * Multiverse Mages — the design language's claims are checked, not just written.
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
 * `docs/design/design-language.md` states the rule this suite exists to enforce:
 * *"a notation nobody can check is worse than no notation."* A document full of
 * claim-shaped paragraphs is exactly that notation, so the claims are records
 * and the records are validated.
 *
 * ## Why the checks are structural rather than semantic
 *
 * Nothing here asserts that a verdict is *right*. It cannot: settling
 * `dominates` needs a four-hundred-run sweep, and settling `commits` needs a
 * search over founding masks. What this suite asserts is that every claim is
 * **the kind of thing that could be settled** — it names a procedure, it names
 * the reading that would refute it, it pins the constants it invented, and it
 * carries a version so that a verdict compared across a change is not silently
 * comparing two different claims.
 *
 * That is the same split the metric registry draws. `metrics-registry.ts` keeps
 * the normative sentence beside the collector because *"the way [drift] happens
 * in practice is that the code moves and the document does not"*. Here the
 * document is the artefact, so the check runs the other way: the schema moves
 * with it, and a claim that stops satisfying the schema fails a named test.
 *
 * ## Why it lives in `packages/content`
 *
 * Because `CompiledSchema` does. Validating the design language with the same
 * compiler that validates shipped content means the language is checked by the
 * machinery the game is checked by, and it introduces no dependency — which
 * matters twice over in a repository that must audit every licence against
 * AGPL-3.0-or-later.
 *
 * ## The rule that does the most work
 *
 * Check 5: **every form in the schema's enum must have at least one claim using
 * it.** A vocabulary word with no worked example is a word nobody has been
 * forced to make precise, and it is how a closed vocabulary quietly becomes a
 * list of labels.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CompiledSchema } from '@mm/content';

/** From packages/content/test/unit/ up to the repository root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const DOC_PATH = 'docs/design/design-language.md';
const SCHEMA_PATH = 'docs/design/design-language.schema.json';

const documentText = readFileSync(`${repoRoot}${DOC_PATH}`, 'utf8');
const schemaDocument: unknown = JSON.parse(readFileSync(`${repoRoot}${SCHEMA_PATH}`, 'utf8'));

interface ParsedClaim {
  readonly heading: string;
  readonly value: Record<string, unknown>;
}

/**
 * Reads every claim out of the document.
 *
 * Anchored on the `### Claim: <id>` heading rather than on "the nth fenced
 * block", for the reason `schema-doc-agreement.test.ts` gives about
 * `contracts.md`: matching by position silently compares the wrong pair the
 * moment an unrelated example is inserted above.
 */
function parseClaims(markdown: string): readonly ParsedClaim[] {
  const claims: ParsedClaim[] = [];
  const headingPattern = /^### Claim: (?<id>[a-z0-9-]+)$/gmu;
  for (const match of markdown.matchAll(headingPattern)) {
    const heading = match.groups?.['id'] as string;
    const after = (match.index ?? 0) + match[0].length;
    const fenceAt = markdown.indexOf('```json', after);
    if (fenceAt === -1) throw new Error(`${DOC_PATH}: no json block follows "### Claim: ${heading}"`);
    const bodyAt = markdown.indexOf('\n', fenceAt) + 1;
    const endAt = markdown.indexOf('```', bodyAt);
    if (endAt === -1) throw new Error(`${DOC_PATH}: unterminated json block under "${heading}"`);
    // A later heading between the two means this claim's own fence is missing
    // and the block found belongs to the next claim.
    const nextHeading = markdown.slice(after, fenceAt).match(/^### Claim: /mu);
    if (nextHeading !== null) throw new Error(`${DOC_PATH}: "${heading}" has no json block of its own`);
    const parsed: unknown = JSON.parse(markdown.slice(bodyAt, endAt));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${DOC_PATH}: the block under "${heading}" is not a JSON object`);
    }
    claims.push({ heading, value: parsed as Record<string, unknown> });
  }
  return claims;
}

/** The `form` enum, read from the schema so the two cannot drift apart. */
function declaredForms(): readonly string[] {
  const root = schemaDocument as { properties?: { form?: { enum?: unknown } } };
  const values = root.properties?.form?.enum;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${SCHEMA_PATH}: "form" must declare a non-empty enum`);
  }
  return values.map((value) => String(value));
}

const claims = parseClaims(documentText);
const forms = declaredForms();

function procedureOf(claim: ParsedClaim): Record<string, unknown> {
  const procedure = claim.value['procedure'];
  if (typeof procedure !== 'object' || procedure === null || Array.isArray(procedure)) {
    throw new Error(`claim ${claim.heading} has no procedure object`);
  }
  return procedure as Record<string, unknown>;
}

describe('design-language.md', () => {
  it('compiles its schema under the repository schema compiler', () => {
    expect(() => new CompiledSchema(schemaDocument, SCHEMA_PATH)).not.toThrow();
  });

  it('states at least one claim', () => {
    expect(claims.length).toBeGreaterThan(0);
  });

  it('validates every claim against the schema with no diagnostics', () => {
    const schema = new CompiledSchema(schemaDocument, SCHEMA_PATH);
    for (const claim of claims) {
      const diagnostics = schema.validate(claim.value, DOC_PATH);
      expect(
        diagnostics.map((diagnostic) => `${claim.heading}${diagnostic.pointer}: ${diagnostic.message}`),
      ).toEqual([]);
    }
  });

  it('gives every claim an id matching its heading, and no id twice', () => {
    const seen = new Set<string>();
    for (const claim of claims) {
      expect(claim.value['claimId'], `heading "${claim.heading}"`).toBe(claim.heading);
      expect(seen.has(claim.heading), `duplicate claim id ${claim.heading}`).toBe(false);
      seen.add(claim.heading);
    }
  });

  /**
   * The check that keeps the vocabulary honest. A form nobody has written a
   * claim for is a word nobody has been forced to make precise, and the
   * document says outright that the vocabulary is closed — which is only
   * meaningful if every member of it has been used at least once.
   */
  it('has at least one claim for every form the schema declares', () => {
    const used = new Set(claims.map((claim) => String(claim.value['form'])));
    const unused = forms.filter((form) => !used.has(form));
    expect(unused, 'forms declared in the schema with no worked claim').toEqual([]);
  });

  it('makes every claim name the reading that would refute it', () => {
    for (const claim of claims) {
      const refutedBy = procedureOf(claim)['refutedBy'];
      expect(typeof refutedBy, `claim ${claim.heading}`).toBe('string');
      expect(String(refutedBy).length, `claim ${claim.heading}`).toBeGreaterThan(11);
    }
  });

  /**
   * `not-measurable` is the verdict the language exists to make respectable —
   * the same distinction the metric registry draws between a missing key and an
   * `unavailable` status. It is only respectable if it says which instrument is
   * missing; otherwise it is a blank cell with a nicer name.
   */
  it('makes a not-measurable verdict say what instrument is missing', () => {
    for (const claim of claims.filter((entry) => entry.value['verdict'] === 'not-measurable')) {
      expect(typeof claim.value['verdictReason'], `claim ${claim.heading}`).toBe('string');
    }
  });

  it('makes a settled verdict point at committed evidence', () => {
    const settled = new Set(['holds', 'refuted']);
    for (const claim of claims.filter((entry) => settled.has(String(entry.value['verdict'])))) {
      const evidence = claim.value['evidence'];
      expect(Array.isArray(evidence), `claim ${claim.heading} is settled with no evidence`).toBe(true);
      expect((evidence as readonly unknown[]).length, `claim ${claim.heading}`).toBeGreaterThan(0);
    }
  });

  /**
   * Set-geometry statistics are inflated by marginal totals alone: a
   * nested-looking matrix arises by chance from row and column sums. Ecology
   * has required a null model for this for thirty years and this project
   * reported containment 1.000 without one, so the requirement is enforced here
   * rather than remembered.
   */
  it('makes every held-set claim declare a null model', () => {
    for (const claim of claims.filter((entry) => procedureOf(entry)['design'] === 'held-set')) {
      const nullModel = procedureOf(claim)['nullModel'];
      expect(typeof nullModel, `held-set claim ${claim.heading} has no null model`).toBe('string');
    }
  });

  it('makes a claim that names a margin pin its constants', () => {
    for (const claim of claims.filter((entry) => procedureOf(entry)['margin'] !== undefined)) {
      const pinned = claim.value['pinnedConstants'];
      expect(typeof pinned, `claim ${claim.heading} names a margin`).toBe('object');
      expect(Object.keys(pinned as object).length, `claim ${claim.heading}`).toBeGreaterThan(0);
    }
  });

  it('resolves every superseded claim id', () => {
    const ids = new Set(claims.map((claim) => claim.heading));
    for (const claim of claims) {
      for (const superseded of (claim.value['supersedes'] as readonly string[] | undefined) ?? []) {
        expect(ids.has(superseded), `claim ${claim.heading} supersedes unknown ${superseded}`).toBe(
          true,
        );
      }
    }
  });
});
