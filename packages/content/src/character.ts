/*
 * Multiverse Mages — named individuals: identity, voice, and art.
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
 * A **character** is one named mage: a name, a species, a voice drawn from that
 * species' pool, and generated art.
 *
 * Like the audio set, this is renderer-only content and is deliberately outside
 * `contentRevision` (`docs/design/contracts.md` §0 makes that a compatibility
 * gate with no negotiation, so adding a character must never stop two players
 * raiding each other). The simulation does not know these records exist —
 * `characterFor` hashes a mage handle into the pool, exactly as `audioSelect`
 * hashes a bark variant, so nothing here consumes an RNG stream or moves a
 * balance baseline.
 *
 * The `inputHash` on each asset is what keeps a character *current*. It is a
 * hash of the fields that determine that asset, so when a new per-mage detail
 * is added the hash changes, the asset reports STALE, and the forge regenerates
 * only what actually moved. Nobody has to remember which characters were
 * affected.
 */

import type { CharacterRecord, CharacterAsset } from './character-types.js';

/** Fields that determine each asset. Adding one here marks that asset stale. */
const ASSET_INPUTS: Readonly<Record<string, readonly (keyof CharacterRecord)[]>> = {
  portrait: ['species', 'ageBracket', 'look'],
  sprite: ['species', 'ageBracket', 'look'],
  voice: ['voiceId', 'voiceNote'],
};

/** FNV-1a over the inputs, in the same integer-only idiom as `audioSelect`. */
export function assetInputHash(character: CharacterRecord, asset: string): string {
  const keys = ASSET_INPUTS[asset];
  if (keys === undefined) throw new Error(`unknown asset kind: ${asset}`);
  const payload = keys.map((k) => `${k}=${String(character[k] ?? '')}`).join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash = Math.imul(hash ^ payload.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Whether a stored asset still matches the character it was generated from. */
export function isStale(character: CharacterRecord, asset: string): boolean {
  const stored: CharacterAsset | undefined = character.assets[asset];
  if (stored === undefined) return true;
  return stored.inputHash !== assetInputHash(character, asset);
}

/** Every asset kind a character can carry, whether or not it has one yet. */
export function assetKinds(): readonly string[] {
  return Object.keys(ASSET_INPUTS);
}

/**
 * Which character a simulation mage speaks and looks as.
 *
 * A pure hash, never an RNG draw (`sound-design.md` §0.2): adding characters
 * must not rot a balance baseline, and a replay must cast the same mage as the
 * same character every time.
 */
export function characterFor(
  rootSeed: number,
  mageId: number,
  speciesId: string,
  pool: readonly CharacterRecord[],
): CharacterRecord | undefined {
  const candidates = pool.filter((c) => c.species === speciesId);
  if (candidates.length === 0) return undefined;
  let hash = 0x811c9dc5;
  for (const value of [rootSeed, mageId]) {
    let remaining = value >>> 0;
    for (let byte = 0; byte < 4; byte += 1) {
      hash = Math.imul(hash ^ (remaining & 0xff), 0x01000193) >>> 0;
      remaining >>>= 8;
    }
  }
  for (let i = 0; i < speciesId.length; i += 1) {
    hash = Math.imul(hash ^ speciesId.charCodeAt(i), 0x01000193) >>> 0;
  }
  return candidates[hash % candidates.length];
}
