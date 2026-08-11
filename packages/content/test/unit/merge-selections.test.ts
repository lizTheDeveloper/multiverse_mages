/*
 * Multiverse Mages — merging audition passes into stored take selections.
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

import { describe, expect, it } from 'vitest';

import { assetIdOf, mergeSelections, selectionCoverage } from '@mm/content';

// assetIdOf is exercised directly here (not just via selectionCoverage below)
// so the import above is a real use, not dead weight the type checker flags.
describe('assetIdOf', () => {
  it('strips a versioned take suffix', () => {
    expect(assetIdOf('click-tick-v1-take3')).toBe('click-tick');
  });

  it('strips a bare take suffix', () => {
    expect(assetIdOf('click-tick-take3')).toBe('click-tick');
  });
});

describe('mergeSelections', () => {
  it('adds new selections', () => {
    expect(mergeSelections({}, { 'click-tick': 'v1-take3.mp3' })).toEqual({
      'click-tick': 'v1-take3.mp3',
    });
  });

  it('lets a later pass overwrite an earlier choice', () => {
    const merged = mergeSelections({ 'click-tick': 'v1-take1.mp3' }, { 'click-tick': 'v1-take3.mp3' });
    expect(merged['click-tick']).toBe('v1-take3.mp3');
  });

  it('keeps selections the incoming pass did not revisit', () => {
    const merged = mergeSelections({ 'click-deny': 'v1-take2.mp3' }, { 'click-tick': 'v1-take1.mp3' });
    expect(merged['click-deny']).toBe('v1-take2.mp3');
  });

  it('does not mutate its inputs', () => {
    const existing = { 'click-tick': 'v1-take1.mp3' };
    mergeSelections(existing, { 'click-tick': 'v1-take9.mp3' });
    expect(existing['click-tick']).toBe('v1-take1.mp3');
  });

  it('drops an explicit null, so a bad take can be un-chosen', () => {
    const merged = mergeSelections({ 'click-tick': 'v1-take1.mp3' }, { 'click-tick': null });
    expect('click-tick' in merged).toBe(false);
  });
});

describe('selectionCoverage', () => {
  it('reports what is still unaudited', () => {
    const requests = [{ id: 'a-v1-take1' }, { id: 'b-v1-take1' }];
    const coverage = selectionCoverage(requests, { a: 'v1-take1.mp3' });
    expect(coverage).toEqual({ total: 2, chosen: 1, missing: ['b'] });
  });

  it('counts an empty selection set as zero coverage', () => {
    const coverage = selectionCoverage([{ id: 'a-v1-take1' }], {});
    expect(coverage.chosen).toBe(0);
    expect(coverage.missing).toEqual(['a']);
  });
});
