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

import { readFileSync } from 'node:fs';

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

/**
 * `check:audio` is the only thing that validates the audio set — audio is
 * deliberately outside `CONTENT_FILES`, so `check:content` and every
 * schema verifier walk straight past it. That makes the gate itself the whole
 * guarantee, and the two CI paths are not one file: `verify` is what the
 * self-hosted runner invokes, while the Actions workflow lists its steps by
 * hand and is the only gate that sees fork PRs. A step present in one and
 * absent from the other is a hole in exactly half the checks.
 */
describe('the audio validation gate', () => {
  it('is part of npm run verify', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts['check:audio']).toBeDefined();
    expect(manifest.scripts['verify']).toContain('check:audio');
  });

  it('is a step in the GitHub Actions workflow, in both jobs', () => {
    const workflow = readFileSync(
      new URL('../../../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    );
    const steps = workflow.split('\n').filter((line) => line.includes('npm run check:audio'));
    expect(steps.length).toBe(2);
  });
});

function validCue() {
  return {
    id: 'click-test', kind: 'click', production: 'synthesised', band: 'presence', grid: 'unquantized',
    durationMs: 4, levelDbTenths: -300, variants: 5, pitchJitterCents: 15,
    prompt: 'a test prompt', post: '', subject: 'hover', source: '2',
    densityThreshold: 0,
  };
}
