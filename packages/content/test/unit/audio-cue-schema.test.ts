/*
 * Multiverse Mages — the audio cue schema accepts the shipped clicks and
 * rejects the same defects the simulation content schemas reject.
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

import {
  directorySource,
  loadAudioContent,
  memorySource,
  shippedAudioDirectory,
  validateAudioContent,
} from '@mm/content';

function shippedAudio() {
  return directorySource(shippedAudioDirectory(), 'data/audio');
}

describe('audio cue schema', () => {
  it('accepts the shipped audio content', () => {
    expect(validateAudioContent(shippedAudio()).diagnostics).toEqual([]);
  });

  it('ships all six clicks of sound-design §2', () => {
    const clicks = loadAudioContent(shippedAudio()).cues.filter((c) => c.kind === 'click');
    expect(clicks.map((c) => c.id).sort()).toEqual([
      'click-commit', 'click-deny', 'click-detent',
      'click-latch', 'click-seal', 'click-tick',
    ]);
  });

  it('rejects a float duration, because content is integers only', () => {
    const source = memorySource({
      'audio-cue.json': JSON.stringify([
        { ...validCue(), durationMs: 4.5 },
      ]),
      'voice-line.json': '[]',
    });
    const diagnostics = validateAudioContent(source).diagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.pointer).toBe('/0/durationMs');
  });

  it('rejects an unknown mix band', () => {
    const source = memorySource({
      'audio-cue.json': JSON.stringify([{ ...validCue(), band: 'midrange' }]),
      'voice-line.json': '[]',
    });
    expect(validateAudioContent(source).diagnostics).toHaveLength(1);
  });

  it('rejects an unknown property rather than ignoring it', () => {
    const source = memorySource({
      'audio-cue.json': JSON.stringify([{ ...validCue(), reverb: 'lots' }]),
      'voice-line.json': '[]',
    });
    expect(validateAudioContent(source).diagnostics).toHaveLength(1);
  });
});

function validCue() {
  return {
    id: 'click-test', kind: 'click', band: 'presence', grid: 'unquantized',
    durationMs: 4, levelDbTenths: -300, variants: 5, pitchJitterCents: 15,
    prompt: 'a test prompt', post: '', subject: 'hover', source: '2',
    densityThreshold: 0,
  };
}
