/*
 * Multiverse Mages — a node authors one working duration, or none.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The refusal `standing-working` depends on, with both arms.
 *
 * A working is one row per (holder, node) carrying one `expiresTick`. Two
 * different non-zero durations on one node cannot both be kept, and whichever
 * the rules pick silently gives the other effect the wrong span — no throw, no
 * symptom but a magnitude that persists for the wrong number of months.
 *
 * The accepted arm is the half that matters. A refusal test alone would pass
 * equally well if the loader had started refusing *every* duration, which would
 * have taken the whole mechanism out of the game while looking like a working
 * check.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource, validateContent } from '../../src/index.js';
import { brokenSource } from './fixtures.js';

/** The two effects a mutation reaches for, on the first node that carries two. */
function nodeWithTwoEffects(documents: Record<string, unknown>): { durationTicks: number }[] {
  const nodes = documents['node.json'] as { id: string; effects: { durationTicks: number }[] }[];
  const node = nodes.find((candidate) => candidate.effects.length > 1);
  if (node === undefined) throw new Error('no shipped node carries two effects to disagree about');
  return node.effects;
}

describe('a node authors one working duration, or none', () => {
  it('refuses two different non-zero durations on one node', () => {
    const result = validateContent(
      brokenSource((documents) => {
        const effects = nodeWithTwoEffects(documents);
        const [first, second] = effects;
        if (first === undefined || second === undefined) throw new Error('unreachable');
        first.durationTicks = 24;
        second.durationTicks = 96;
      }),
    );

    expect(result.registry).toBeUndefined();
    expect(
      result.diagnostics.some((entry) => /more than one non-zero durationTicks/.test(entry.message)),
    ).toBe(true);
  });

  it('accepts the same two effects at the same non-zero duration', () => {
    // The positive control. Same node, same two effects, one number changed —
    // so a loader that had started refusing durations outright would fail here
    // and could not hide behind the refusal above.
    const registry = loadContent(
      brokenSource((documents) => {
        for (const effect of nodeWithTwoEffects(documents)) effect.durationTicks = 24;
      }),
    );
    expect(registry.nodes.length).toBeGreaterThan(0);
  });

  it('accepts a zero beside a non-zero, which is the common shipped case', () => {
    // Zero is not a short duration. It means instantaneous or permanent — an
    // effect that needs no working — so it composes with a working rather than
    // competing with one. 21 of the 38 shipped durable nodes do exactly this,
    // which is why the shipped content loads at all.
    const shipped = loadContent(shippedContentSource());
    const mixed = shipped.nodes.filter(
      (entry) =>
        entry.record.effects.some((effect) => effect.durationTicks !== 0) &&
        entry.record.effects.some((effect) => effect.durationTicks === 0),
    );
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('is not vacuous: shipped content really does declare durations', () => {
    // The measurement this whole change was built on, kept live. If it ever
    // reads zero, every assertion above is testing a rule with no subject.
    const shipped = loadContent(shippedContentSource());
    const durable = shipped.nodes.filter((entry) =>
      entry.record.effects.some((effect) => effect.durationTicks !== 0),
    );
    expect(durable.length).toBeGreaterThan(0);
  });
});
