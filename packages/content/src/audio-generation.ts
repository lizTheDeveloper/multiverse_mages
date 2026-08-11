/*
 * Multiverse Mages — the audio generation request planner.
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
 * This module is pure by design: it turns audio content records into a plan
 * of API requests, and does no I/O — no network call, no file write, no read
 * of `process.env`. That means it can be unit-tested without a network or an
 * API key, and it is why `redact` lives here too: it is exercised directly by
 * `generation-plan.test.ts` rather than only indirectly through the driver.
 *
 * `scripts/generate-audio.mjs` is the impure half. It imports this module
 * from `dist/audio-generation.js` — a built leaf module with no further
 * internal imports of its own — and does the network calls, file writes, and
 * credential handling that this module deliberately does not.
 */

import type { AudioCueRecord, VoiceLineBankRecord } from './audio-types.js';

/** One planned request against the ElevenLabs API. */
export interface GenerationRequest {
  readonly id: string;
  readonly endpoint: 'sound-effect' | 'text-to-speech';
  readonly body: Record<string, unknown>;
  readonly outputPath: string;
}

/** The API caps a single sound-effect request; clamp rather than fail the batch. */
const MAX_SFX_SECONDS = 22;

/** Removes an exact secret from a string. Never log anything this has not passed through. */
export function redact(text: string, key: string): string {
  if (!key) return text;
  return text.split(key).join('[redacted]');
}

/**
 * Expands content into one request per take.
 *
 * Cues with an empty prompt are assembled from other assets (sound-design §4.1
 * envelopes are processing chains, not standalone sounds) and are skipped.
 */
export function planRequests(
  cues: readonly AudioCueRecord[],
  banks: readonly VoiceLineBankRecord[],
  { takes }: { readonly takes: number },
): readonly GenerationRequest[] {
  const requests: GenerationRequest[] = [];

  for (const cue of cues) {
    if (cue.prompt === '') continue;
    for (let variant = 1; variant <= cue.variants; variant += 1) {
      for (let take = 1; take <= takes; take += 1) {
        requests.push({
          id: `${cue.id}-v${variant}-take${take}`,
          endpoint: 'sound-effect',
          body: {
            text: cue.prompt,
            duration_seconds: Math.min(
              MAX_SFX_SECONDS,
              Math.max(1, Math.round(cue.durationMs / 1000)),
            ),
            prompt_influence: 0.6,
          },
          outputPath: `assets/candidates/${cue.id}/v${variant}-take${take}.mp3`,
        });
      }
    }
  }

  for (const bank of banks) {
    for (const line of bank.lines) {
      for (let take = 1; take <= takes; take += 1) {
        requests.push({
          id: `${line.id}-take${take}`,
          endpoint: 'text-to-speech',
          body: {
            text: line.text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.3 },
          },
          outputPath: `assets/candidates/${line.id}/take${take}.mp3`,
        });
      }
    }
  }

  return requests;
}
