/*
 * Multiverse Mages — character record types.
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

/** One generated asset, with the hash of the inputs that produced it. */
export interface CharacterAsset {
  readonly path: string;
  readonly inputHash: string;
}

/** One line spoken by a specific character, overriding its species bank. */
export interface CharacterLine {
  readonly id: string;
  readonly tier: string;
  readonly text: string;
  readonly about?: string;
}

/** One named individual. See `character.ts` for why this is renderer-only. */
export interface CharacterRecord {
  readonly id: string;
  readonly name: string;
  readonly species: string;
  readonly voiceId: string;
  readonly voiceNote?: string;
  readonly ageBracket?: 'young' | 'middle' | 'old';
  readonly note?: string;
  /**
   * Visual description for the art generator, and only that.
   *
   * Deliberately separate from `note`, which is flavour prose for a reader.
   * The first portrait this project generated came back as Santa Claus,
   * because a note about requisition forms in a coat pocket was handed to an
   * image model as costume direction.
   */
  readonly look?: string;
  /**
   * Lines that override the species bank for this character.
   *
   * Most characters have none and speak their species' bank unchanged. An
   * override is for a persona whose specific history the joke depends on — and
   * it must still read as its species' register (§8.1a), or the character stops
   * sounding like what it is.
   */
  readonly lines?: readonly CharacterLine[];
  readonly assets: Readonly<Record<string, CharacterAsset>>;
}
