/*
 * Multiverse Mages — tests for the audio generation request planner.
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
 * The generation script is the only thing in this repository that holds a
 * credential, and it is in a public repo. `redact` is tested first and hardest
 * for that reason: a key that reaches a log line is a key that is compromised,
 * and no amount of care at the call sites is a substitute for the function that
 * makes it impossible.
 */

import { describe, expect, it } from 'vitest';

import { planRequests, redact } from '@mm/content';
import type { AudioCueRecord, VoiceLineBankRecord } from '@mm/content';

const cues: AudioCueRecord[] = [
  {
    id: 'click-tick', kind: 'click', production: 'synthesised', band: 'presence', grid: 'unquantized',
    durationMs: 4, levelDbTenths: -300, variants: 5, pitchJitterCents: 15,
    prompt: 'A single fingernail tapping once on glazed ceramic',
    post: '', subject: 'hover', source: '2', densityThreshold: 0,
  },
  {
    id: 'envelope-creo', kind: 'technique-envelope', production: 'granular', band: 'low-mid', grid: 'unquantized',
    durationMs: 1500, levelDbTenths: -160, variants: 4, pitchJitterCents: 0,
    prompt: '', post: 'assembled', subject: 'creo', source: '4.1', densityThreshold: 0,
  },
];

const banks: VoiceLineBankRecord[] = [
  {
    id: 'bank-human', speaker: 'human', speakerKind: 'species', voiceId: 'voice-human',
    voicePrompt: 'Mid-thirties, quick and slightly breathless',
    lines: [{ id: 'human-selection-1', tier: 'selection', text: 'Adjunct, actually.', about: '' }],
  },
];

describe('redact', () => {
  it('removes the key from a string that contains it', () => {
    expect(redact('Bearer sk-abc123 failed', 'sk-abc123')).toBe('Bearer [redacted] failed');
  });

  it('removes every occurrence', () => {
    expect(redact('sk-x and sk-x', 'sk-x')).toBe('[redacted] and [redacted]');
  });

  it('is a no-op when the key is absent or empty', () => {
    expect(redact('nothing here', 'sk-x')).toBe('nothing here');
    expect(redact('nothing here', '')).toBe('nothing here');
  });
});

describe('planRequests', () => {
  it('plans one request per take per cue variant', () => {
    const requests = planRequests(cues, [], { takes: 3 });
    // click-tick: 5 variants x 3 takes. envelope-creo has an empty prompt.
    expect(requests).toHaveLength(15);
  });

  it('skips cues with an empty prompt, because they are assembled not generated', () => {
    const requests = planRequests(cues, [], { takes: 1 });
    expect(requests.some((r) => r.id.startsWith('envelope-creo'))).toBe(false);
  });

  it('routes cues to sound-effect and lines to text-to-speech', () => {
    const requests = planRequests(cues, banks, { takes: 1 });
    const cueRequest = requests.find((r) => r.id.startsWith('click-tick'));
    const lineRequest = requests.find((r) => r.id.startsWith('human-selection-1'));
    expect(cueRequest?.endpoint).toBe('sound-effect');
    expect(lineRequest?.endpoint).toBe('text-to-speech');
    expect(lineRequest?.body.text).toBe('Adjunct, actually.');
  });

  it('writes candidates to a per-asset directory with a take index', () => {
    const requests = planRequests(cues, [], { takes: 2 });
    expect(requests[0]!.outputPath).toBe('assets/candidates/click-tick/v1-take1.mp3');
    expect(requests[1]!.outputPath).toBe('assets/candidates/click-tick/v1-take2.mp3');
  });

  it('never puts a duration on a sound-effect body above the API maximum', () => {
    const long: AudioCueRecord[] = [{ ...cues[0]!, id: 'click-seal', durationMs: 700000, variants: 1 }];
    const [request] = planRequests(long, [], { takes: 1 });
    expect(request!.body.duration_seconds).toBeLessThanOrEqual(22);
  });

  it('carries each bank\'s own voice onto its requests', () => {
    const twoBanks: VoiceLineBankRecord[] = [
      banks[0]!,
      {
        id: 'bank-elf', speaker: 'elf', speakerKind: 'species', voiceId: 'voice-elf',
        voicePrompt: 'Unhurried, quiet',
        lines: [{ id: 'elf-selection-1', tier: 'selection', text: 'Mm.', about: '' }],
      },
    ];
    const requests = planRequests(cues, twoBanks, { takes: 1 });
    expect(requests.find((r) => r.id.startsWith('human-selection-1'))?.voiceId).toBe('voice-human');
    expect(requests.find((r) => r.id.startsWith('elf-selection-1'))?.voiceId).toBe('voice-elf');
  });

  it('leaves voiceId empty on sound-effect requests', () => {
    const requests = planRequests(cues, banks, { takes: 1 });
    for (const request of requests.filter((r) => r.endpoint === 'sound-effect')) {
      expect(request.voiceId).toBe('');
    }
  });

  it('reports an unassigned bank as empty rather than inventing a voice', () => {
    // An empty voiceId is how content says "not cast yet". The planner must
    // pass that through untouched so the driver can refuse the bank by name;
    // substituting a default here would record a species in the wrong voice
    // and nothing downstream would notice.
    const unassigned: VoiceLineBankRecord[] = [{ ...banks[0]!, voiceId: '' }];
    const requests = planRequests(cues, unassigned, { takes: 1 });
    const voice = requests.find((r) => r.endpoint === 'text-to-speech');
    expect(voice).toBeDefined();
    expect(voice?.voiceId).toBe('');
  });

  it('produces unique output paths across the whole plan', () => {
    const requests = planRequests(cues, banks, { takes: 4 });
    const paths = requests.map((r) => r.outputPath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
