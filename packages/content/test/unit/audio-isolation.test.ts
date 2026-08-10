/*
 * Multiverse Mages — audio content is not simulation content.
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
 * `contentRevision` is a compatibility gate (`docs/design/contracts.md` §0): two
 * universes may interact only if theirs are equal. Audio content therefore must
 * never reach the loader — otherwise correcting a typo in a bark would stop two
 * players raiding each other, and would churn every golden replay fixture.
 *
 * The separation is one line in `source.ts` today and is exactly the kind of
 * thing a later "tidy-up" merges. This test is what makes that merge fail.
 */

import { describe, expect, it } from 'vitest';

import { AUDIO_FILES, CONTENT_FILES, loadContent, shippedContentSource } from '@mm/content';

describe('audio content isolation', () => {
  it('shares no file name with the simulation content set', () => {
    for (const audioFile of AUDIO_FILES) {
      expect(CONTENT_FILES as readonly string[]).not.toContain(audioFile);
    }
  });

  it('does not change contentRevision when audio data changes', () => {
    const before = loadContent(shippedContentSource()).contentRevision;

    // The loader reads by file name. If audio ever joined CONTENT_FILES, an
    // audio file present in the source would contribute to the preimage.
    const withAudio = {
      origin: 'fixture:with-audio',
      read(fileName: string): string | undefined {
        if ((AUDIO_FILES as readonly string[]).includes(fileName)) {
          return JSON.stringify([{ id: 'stowaway' }]);
        }
        return shippedContentSource().read(fileName);
      },
    };

    expect(loadContent(withAudio).contentRevision).toBe(before);
  });
});
