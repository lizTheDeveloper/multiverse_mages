/*
 * Multiverse Mages — audio content record types.
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

/** Which layer of the sound design a cue belongs to (sound-design.md §§2–7). */
export type AudioCueKind =
  | 'click'
  | 'technique-envelope'
  | 'form-material'
  | 'arrangement-stem'
  | 'intervention'
  | 'knowledge'
  | 'raid-primitive';

/** The six mix bands of sound-design.md §1.3. */
export type AudioBand = 'sub' | 'low' | 'low-mid' | 'presence' | 'sparkle' | 'air';

/**
 * Where a cue sits on the world-time beat grid (sound-design.md §3.1).
 *
 * `off-grid` is deliberately hard to spell and is asserted against a closed
 * allow-list in `audio-grid.test.ts`: §3.2 makes arrhythmia the entire reason
 * knowledge loss lands, and every future cue that wants to feel important will
 * want to be off-grid too.
 */
export type AudioGridPosition =
  | 'downbeat'
  | 'beat-1-3'
  | 'backbeat'
  | 'eighth'
  | 'sixteenth'
  | 'off-grid'
  | 'unquantized';

export interface AudioCueRecord {
  readonly id: string;
  readonly kind: AudioCueKind;
  readonly band: AudioBand;
  readonly grid: AudioGridPosition;
  /** Nominal length in milliseconds. */
  readonly durationMs: number;
  /** Nominal level in dBFS × 10; −30.0 dBFS is -300. */
  readonly levelDbTenths: number;
  /** Round-robin variant count, ≥1 (sound-design.md §2.3). */
  readonly variants: number;
  /** Maximum per-trigger pitch jitter in cents (sound-design.md §2.3). */
  readonly pitchJitterCents: number;
  /** The §9 generation prompt. Empty string means "not generated — assembled". */
  readonly prompt: string;
  /** Post-generation processing note from §9, or empty. */
  readonly post: string;
  /** Content id this cue is keyed to: a technique, form, action or primitive id. */
  readonly subject: string;
  /** Section of docs/design/sound-design.md this cue implements, e.g. "2.1". */
  readonly source: string;
  /**
   * Events per tick above which this cue stops playing discretely and becomes a
   * density texture (sound-design.md §0.4).
   *
   * `0` means the cue is not an event class at all — a click, an envelope, a
   * material. §0.4's rule is that no event class may be discrete *without* a
   * stated threshold, because the one that lacks it is the one that turns a
   * 10,000-mage universe into noise. `audio-grid.test.ts` asserts both
   * directions, so the field cannot be quietly defaulted to zero for a cue that
   * needs one.
   */
  readonly densityThreshold: number;
}

/** A bark's escalation slot (sound-design.md §8.1, §8.2, §8.9). */
export type VoiceLineTier =
  | 'selection'
  | 'acknowledgement'
  | 'annoyance-polite'
  | 'annoyance-irritated'
  | 'annoyance-cracking'
  | 'annoyance-unhinged'
  | 'breakthrough'
  | 'blessed'
  | 'death'
  | 'last-copy'
  | 'cross-species';

/** A single bark line (sound-design.md §8). */
export interface VoiceLineRecord {
  readonly id: string;
  readonly tier: VoiceLineTier;
  readonly text: string;
  /** Target species id for `cross-species` lines; `""` otherwise. */
  readonly about: string;
}

/** One species' or role's bark bank (sound-design.md §8). */
export interface VoiceLineBankRecord {
  readonly id: string;
  readonly speaker: string;
  readonly speakerKind: 'species' | 'populace';
  readonly voicePrompt: string;
  readonly lines: readonly VoiceLineRecord[];
}
