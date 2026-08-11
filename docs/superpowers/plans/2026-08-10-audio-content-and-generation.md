# Audio Content and Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `docs/design/sound-design.md` from prose into validated, CI-checked content data plus a generation pipeline, so the ~520-asset audio library can be produced as a batch job and the client that eventually plays it cannot get the rules subtly wrong.

**Architecture:** Audio content lives in `packages/content` as a **second, parallel content set** — its own schema directory, its own data directory, its own loader entry point, its own `npm run check:audio`. It reuses the existing JSON Schema interpreter and never enters `CONTENT_FILES`, `loadContent()`, or `contentRevision`. Generation is a plain Node script driven by those data files, using native `fetch`, writing candidate takes to a gitignored directory and committing only selected takes.

**Tech Stack:** TypeScript 5.9, Node ≥22 (native `fetch`), vitest 3.2, the existing `CompiledSchema` interpreter in `packages/content/src/json-schema.ts`. No new runtime or dev dependencies.

## Why audio content must not join the simulation's content set

This is the load-bearing architectural decision and every task depends on it.

`packages/content/src/revision.ts` computes `contentRevision` over *everything the loader interned*. `docs/design/contracts.md` §0 makes that value a **compatibility gate**: two universes may interact only if theirs are equal, with no partial-compatibility rule and no negotiation.

Therefore, if `voice-line.json` were added to `CONTENT_FILES`:

- Fixing a typo in a dwarf bark would change `contentRevision`, and two players on different patch levels **could not raid each other**.
- Every golden replay fixture would need regenerating for an audio edit, which is precisely the "fixture diff is a claim that behaviour changed on purpose" signal that `CLAUDE.md` protects.
- Every Monte Carlo worker would parse ~200 voice lines it will never use.

So: **`AUDIO_FILES` is a separate tuple, `loadAudioContent()` is a separate function, and Task 1 ships a test that fails if audio data ever affects `contentRevision`.**

Reusing the schema interpreter (rather than putting audio content outside `packages/content`) is deliberate: `json-schema.ts` documents at length why this project has its own validator, and duplicating it for audio would be a second source of truth for what a valid content file is.

## Global Constraints

- **Every new source file carries the standard AGPL header**, copyright **Ann Kelner**, `SPDX-License-Identifier: AGPL-3.0-or-later`. Copy the header verbatim from `packages/content/src/revision.ts`.
- **This is a public repository. No secrets, ever.** The generation API key is read from `process.env.ELEVENLABS_API_KEY` and must never be written to a file, a log line, or an error message.
- **No new runtime dependencies and no new devDependencies.** Node 22's native `fetch` covers HTTP. Adding a package would require the AGPL-compatibility check in `CLAUDE.md` and is not needed.
- **No floats in content.** `packages/content/src/json-schema.ts` rejects `type: "number"` outright. Every numeric field in every schema below is `type: "integer"`. Durations are in **milliseconds**, levels in **dBFS × 10** (so −30.0 dBFS is `-300`), pitch offsets in **cents**.
- **Content ids are kebab-case**, matching the existing `contentId` definition in `packages/content/schema/species.schema.json`.
- **`npm run verify` is the gate** — typecheck, lint, purity, content, tests. It must pass before every commit in this plan.
- **Work in the existing worktree** at `.claude/worktrees/sound-design` on branch `sound-design`. Run `npm ci` in it once before the first `npm run verify`, or npm resolves workspace binaries from the parent checkout.
- **`main` is protected**: this branch lands via pull request with both status checks green (`.github/workflows/ci.yml` and `ci/hetzner-lint`).
- Commits use the repo owner's identity (`lizTheDeveloper`) and end with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

| File | Responsibility |
|---|---|
| `ASSET-LICENSE.md` (create) | The asset licensing position: prose CC BY-SA 4.0, generated audio no-rights-asserted |
| `packages/content/schema/audio/audio-cue.schema.json` (create) | Schema for non-voice sounds: clicks, envelopes, materials, event cues |
| `packages/content/schema/audio/voice-line.schema.json` (create) | Schema for bark banks |
| `packages/content/data/audio/audio-cue.json` (create) | The cue data — §2, §4.1, §4.2, §5, §6, §7 of the sound doc |
| `packages/content/data/audio/voice-line.json` (create) | The bark data — §8 of the sound doc |
| `packages/content/src/audio.ts` (create) | `AUDIO_FILES`, `loadAudioContent()`, `audioSchemas()`, `audioSelect()` |
| `packages/content/src/audio-types.ts` (create) | `AudioCueRecord`, `VoiceLineBankRecord`, supporting unions |
| `packages/content/src/index.ts` (modify) | Re-export the audio surface |
| `packages/content/src/audio-cli.ts` (create) | `runAudioValidation()`, mirroring `cli.ts` |
| `packages/content/bin/validate-audio.mjs` (create) | CLI shell for `npm run check:audio` |
| `packages/content/test/unit/audio-*.test.ts` (create) | Schema, cross-reference, isolation and selection tests |
| `packages/content/test/fixtures/audio-select-vectors.json` (create) | Golden vectors pinning the selection hash |
| `scripts/generate-audio.mjs` (create) | Batch generation driver |
| `packages/content/src/audio-generation.ts` (create) | Pure request-shaping: `planRequests`, `redact` |
| `tools/audition/index.html` (create) | Static take-audition page |
| `packages/content/src/audio-selection-merge.ts` (create) | Pure selection-merge: `mergeSelections`, `selectionCoverage`, `assetIdOf` |
| `package.json` (modify) | `check:audio`, `audio:generate` scripts; `check:audio` joins `verify` |
| `.gitignore` (modify) | Ignore `assets/candidates/` |
| `docs/design/sound-design.md` (modify) | §0.5 licensing resolved |
| `docs/design/contracts.md` (modify) | §4.4 consumer note |

---

### Task 1: Asset licensing, audio content plumbing, and the click cues

Establishes the parallel content set end to end with the smallest real payload — the six clicks of sound-design §2 — and pins the isolation property that every later task depends on.

**Files:**
- Create: `ASSET-LICENSE.md`
- Create: `packages/content/schema/audio/audio-cue.schema.json`
- Create: `packages/content/data/audio/audio-cue.json`
- Create: `packages/content/src/audio-types.ts`
- Create: `packages/content/src/audio.ts`
- Create: `packages/content/bin/validate-audio.mjs`
- Modify: `packages/content/src/index.ts`
- Modify: `package.json`
- Modify: `docs/design/sound-design.md` (§0.5)
- Test: `packages/content/test/unit/audio-isolation.test.ts`
- Test: `packages/content/test/unit/audio-cue-schema.test.ts`

**Interfaces:**
- Consumes: `CompiledSchema` and `directorySource` from `packages/content/src/load.ts` and `source.ts`; `ContentDiagnostic` from `diagnostics.ts`.
- Produces:
  - `AUDIO_FILES: readonly ['audio-cue.json', 'voice-line.json']`
  - `type AudioFileName = (typeof AUDIO_FILES)[number]`
  - `audioSchemas(): ReadonlyMap<AudioFileName, CompiledSchema>`
  - `validateAudioContent(source: ContentSource): { diagnostics: readonly ContentDiagnostic[]; cues?: readonly AudioCueRecord[]; banks?: readonly VoiceLineBankRecord[] }`
  - `loadAudioContent(source: ContentSource): { cues: readonly AudioCueRecord[]; banks: readonly VoiceLineBankRecord[] }` — throws `ContentValidationError` on any diagnostic
  - `shippedAudioDirectory(): string`
  - `interface AudioCueRecord` as defined in Step 3

Task 3 creates `voice-line.json`. Until then `AUDIO_FILES` names it and the data file is an empty array `[]`, so the plumbing is complete from the first commit.

- [ ] **Step 1: Write `ASSET-LICENSE.md`**

The user's decision, recorded with its consequence stated. Create at repository root:

```markdown
# Asset licensing

Code in this repository is AGPL-3.0-or-later (see `LICENSE`). Assets are licensed
separately, because the AGPL does not cover non-software assets cleanly.

## Written material — CC BY-SA 4.0

The voice-line text in `docs/design/sound-design.md` §8 and
`packages/content/data/audio/voice-line.json`, and the design prose throughout
`docs/design/`, are © Ann Kelner and licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

These were written by a human author, are unambiguously ours to license, and the
share-alike term is the natural copyleft counterpart to the AGPL.

## Generated audio — no rights asserted

Audio files under `assets/` are machine-generated from the prompts in
`docs/design/sound-design.md` §9. **No copyright is asserted over them**, and they
may be used by anyone for any purpose.

This is a deliberate position rather than an oversight. Whether machine-generated
audio attracts copyright at all is unsettled, and it is likely in several
jurisdictions that it does not. A copyleft licence needs ownership to attach to;
claiming CC BY-SA over output we may not own would be an empty claim that a
downstream user could not rely on. Asserting nothing is the honest version, and it
is the same posture taken by projects that have algorithmically enumerated a
creative space in order to place it beyond enclosure.

The *prompts* that produced the audio are written material and are CC BY-SA 4.0
under the section above.

## Third-party assets

None at present. Any added must be AGPL-compatible for code and compatibly
licensed for assets, and must be recorded here with its source and licence.
```

- [ ] **Step 2: Update sound-design.md §0.5 to match**

In `docs/design/sound-design.md`, replace the entire `### 0.5 Licensing` section body with:

```markdown
`CLAUDE.md`: assets are licensed separately from code, and the AGPL is not assumed to cover
non-software assets cleanly. **Resolved 2026-08-10; the position is recorded in `ASSET-LICENSE.md`
at the repository root.**

- **Written material — the voice lines in §8, the prompts in §9, and this document — is CC BY-SA
  4.0**, copyright Ann Kelner. Human-authored, unambiguously ours to license, share-alike as the
  counterpart to the AGPL.
- **Generated audio carries no asserted rights.** Whether machine-generated audio is copyrightable
  is unsettled and quite possibly no. Copyleft needs ownership to attach to, so claiming CC BY-SA
  over the output would be an empty claim rather than a protective one. Asserting nothing is the
  honest version, and it puts the library beyond enclosure by anyone else too.
- **This unblocks generation.** §9 can be run as a batch job.
```

- [ ] **Step 3: Write the failing isolation test**

This is the most important test in the plan. Create `packages/content/test/unit/audio-isolation.test.ts`:

```typescript
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

  it('never lets the loader read an audio file at all', () => {
    // A tripwire, not an assertion about a returned value. Asserting that
    // contentRevision is unchanged when audio files are present would pass
    // vacuously: loadContent iterates the fixed CONTENT_FILES array and never
    // scans a source for extra files, so a stowaway is simply never read.
    // Throwing on the read is what actually fails if audio joins CONTENT_FILES
    // — or if any other loader path starts reading it.
    const tripwire = {
      origin: 'fixture:tripwire',
      read(fileName: string): string | undefined {
        if ((AUDIO_FILES as readonly string[]).includes(fileName)) {
          throw new Error(
            `the loader read audio file ${fileName} — audio must never reach contentRevision`,
          );
        }
        return shippedContentSource().read(fileName);
      },
    };

    expect(() => loadContent(tripwire)).not.toThrow();
  });
});
```

`shippedContentSource()` is already exported from `@mm/content` (`packages/content/src/source.ts`). Use it; do not add a near-duplicate helper to `fixtures.ts`.

- [ ] **Step 4: Run it to verify it fails**

```bash
cd .claude/worktrees/sound-design && npm ci && npx vitest run packages/content/test/unit/audio-isolation.test.ts
```

Expected: FAIL — `AUDIO_FILES` is not exported from `@mm/content`.

- [ ] **Step 5: Write `audio-types.ts`**

Create `packages/content/src/audio-types.ts` with the AGPL header, then:

```typescript
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
```

- [ ] **Step 6: Write `audio.ts`**

Create `packages/content/src/audio.ts` with the AGPL header and a module doc comment stating the isolation rule, then:

```typescript
import { ContentValidationError, CompiledSchema } from './load.js';
import { directorySource, type ContentSource } from './source.js';
import { sortDiagnostics, type ContentDiagnostic } from './diagnostics.js';
import type { AudioCueRecord } from './audio-types.js';
import type { VoiceLineBankRecord } from './audio-types.js';

/**
 * The audio content files. **Deliberately not `CONTENT_FILES`** — see the module
 * doc comment and `test/unit/audio-isolation.test.ts`.
 */
export const AUDIO_FILES = ['audio-cue.json', 'voice-line.json'] as const;

export type AudioFileName = (typeof AUDIO_FILES)[number];

let cachedAudioSchemas: ReadonlyMap<AudioFileName, CompiledSchema> | undefined;

export function audioSchemas(): ReadonlyMap<AudioFileName, CompiledSchema> {
  if (cachedAudioSchemas !== undefined) return cachedAudioSchemas;
  const source = directorySource(shippedAudioSchemaDirectory(), 'schema/audio');
  const compiled = new Map<AudioFileName, CompiledSchema>();
  for (const fileName of AUDIO_FILES) {
    const schemaName = fileName.replace(/\.json$/u, '.schema.json');
    const text = source.read(schemaName);
    if (text === undefined) {
      throw new Error(`audio schema ${schemaName} is missing from ${source.origin}`);
    }
    compiled.set(fileName, new CompiledSchema(JSON.parse(text), `schema/audio/${schemaName}`));
  }
  cachedAudioSchemas = compiled;
  return compiled;
}

export interface AudioValidationResult {
  readonly diagnostics: readonly ContentDiagnostic[];
  readonly cues?: readonly AudioCueRecord[];
  readonly banks?: readonly VoiceLineBankRecord[];
}

export function validateAudioContent(source: ContentSource): AudioValidationResult {
  const diagnostics: ContentDiagnostic[] = [];
  const parsed = new Map<AudioFileName, unknown>();

  for (const fileName of AUDIO_FILES) {
    const text = source.read(fileName);
    if (text === undefined) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        message: `missing from ${source.origin}`,
      });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      diagnostics.push({
        file: fileName,
        pointer: '',
        message: `is not valid JSON: ${(error as Error).message}`,
      });
      continue;
    }
    const schema = audioSchemas().get(fileName);
    if (schema === undefined) throw new Error(`no compiled schema for ${fileName}`);
    diagnostics.push(...schema.validate(json, fileName));
    parsed.set(fileName, json);
  }

  if (diagnostics.length > 0) return { diagnostics: sortDiagnostics(diagnostics) };

  return {
    diagnostics: [],
    cues: parsed.get('audio-cue.json') as readonly AudioCueRecord[],
    banks: parsed.get('voice-line.json') as readonly VoiceLineBankRecord[],
  };
}

export function loadAudioContent(source: ContentSource): {
  readonly cues: readonly AudioCueRecord[];
  readonly banks: readonly VoiceLineBankRecord[];
} {
  const result = validateAudioContent(source);
  if (result.diagnostics.length > 0) throw new ContentValidationError(result.diagnostics);
  return { cues: result.cues ?? [], banks: result.banks ?? [] };
}
```

Add `shippedAudioDirectory()` and `shippedAudioSchemaDirectory()` alongside, mirroring however `shippedContentDirectory()` and `shippedSchemaDirectory()` resolve paths in `load.ts` — read those two functions and follow them exactly rather than inventing a second path convention. `CompiledSchema.validate`'s exact signature is in `json-schema.ts`; match it.

`VoiceLineBankRecord` does not exist until Task 3. For this task, add to `audio-types.ts`:

```typescript
/** Filled in by Task 3. Present now so `AUDIO_FILES` is complete from the start. */
export interface VoiceLineBankRecord {
  readonly id: string;
}
```

- [ ] **Step 7: Re-export from `index.ts`**

In `packages/content/src/index.ts`, add to the existing export block:

```typescript
export {
  AUDIO_FILES,
  audioSchemas,
  validateAudioContent,
  loadAudioContent,
  shippedAudioDirectory,
} from './audio.js';
export type { AudioFileName, AudioValidationResult } from './audio.js';
export type {
  AudioCueRecord,
  AudioCueKind,
  AudioBand,
  AudioGridPosition,
  VoiceLineBankRecord,
} from './audio-types.js';
```

- [ ] **Step 8: Write the cue schema**

Create `packages/content/schema/audio/audio-cue.schema.json`. Keep strictly inside the interpreter's supported keyword set — no `type: "number"`, no keyword not listed in `ASSERTION_KEYWORDS` in `json-schema.ts`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://multiverse-mages.invalid/schema/audio/audio-cue.schema.json",
  "title": "audio-cue.json",
  "description": "Non-voice audio cues (docs/design/sound-design.md §§2-7). Renderer-only content: never loaded by the simulation, never part of contentRevision.",
  "type": "array",
  "minItems": 1,
  "items": { "$ref": "#/$defs/cue" },
  "$defs": {
    "cue": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id", "kind", "band", "grid", "durationMs", "levelDbTenths",
        "variants", "pitchJitterCents", "prompt", "post", "subject", "source",
        "densityThreshold"
      ],
      "properties": {
        "id": { "$ref": "#/$defs/contentId" },
        "kind": {
          "enum": [
            "click", "technique-envelope", "form-material",
            "arrangement-stem", "intervention", "knowledge", "raid-primitive"
          ]
        },
        "band": { "enum": ["sub", "low", "low-mid", "presence", "sparkle", "air"] },
        "grid": {
          "enum": [
            "downbeat", "beat-1-3", "backbeat", "eighth",
            "sixteenth", "off-grid", "unquantized"
          ]
        },
        "durationMs": { "type": "integer", "minimum": 1, "maximum": 600000 },
        "levelDbTenths": { "type": "integer", "minimum": -600, "maximum": 0 },
        "variants": { "type": "integer", "minimum": 1, "maximum": 16 },
        "pitchJitterCents": { "type": "integer", "minimum": 0, "maximum": 100 },
        "prompt": { "type": "string", "maxLength": 500 },
        "post": { "type": "string", "maxLength": 300 },
        "subject": { "type": "string", "minLength": 1, "maxLength": 64 },
        "source": { "type": "string", "minLength": 1, "maxLength": 16 },
        "densityThreshold": { "type": "integer", "minimum": 0, "maximum": 1000 }
      }
    },
    "contentId": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$", "maxLength": 64 }
  }
}
```

Before committing, confirm `pattern` and `maxLength` are in `ASSERTION_KEYWORDS` in `json-schema.ts`. If `pattern` is not implemented, copy whatever `contentId` definition `species.schema.json` uses instead — do not add a keyword to the interpreter as part of this task.

- [ ] **Step 9: Write the click cue data**

Create `packages/content/data/audio/audio-cue.json` with the six clicks of §2, and `packages/content/data/audio/voice-line.json` containing exactly `[]`.

```json
[
  {
    "id": "click-tick",
    "kind": "click", "band": "presence", "grid": "unquantized",
    "durationMs": 4, "levelDbTenths": -300, "variants": 5, "pitchJitterCents": 15,
    "prompt": "A single fingernail tapping once on glazed ceramic, very close mic, dry room, no reverb, crisp high transient",
    "post": "Gate to 4 ms, HPF 400 Hz, -30 dBFS",
    "subject": "hover", "source": "2", "densityThreshold": 0
  },
  {
    "id": "click-latch",
    "kind": "click", "band": "presence", "grid": "unquantized",
    "durationMs": 12, "levelDbTenths": -180, "variants": 5, "pitchJitterCents": 15,
    "prompt": "A small brass mechanism engaging with a precise click, followed by a faint sustained metallic ring",
    "post": "Split: click to 12 ms; ring becomes the sustain layer, tuned to root",
    "subject": "arm-intervention", "source": "2.1", "densityThreshold": 0
  },
  {
    "id": "click-commit",
    "kind": "click", "band": "presence", "grid": "downbeat",
    "durationMs": 40, "levelDbTenths": -140, "variants": 5, "pitchJitterCents": 15,
    "prompt": "A wooden stamp pressed firmly onto thick paper on a stone table, single hit, close, dry",
    "post": "Layer with a 60 Hz sine thump, 40 ms",
    "subject": "resolve-action", "source": "2", "densityThreshold": 0
  },
  {
    "id": "click-deny",
    "kind": "click", "band": "presence", "grid": "unquantized",
    "durationMs": 8, "levelDbTenths": -200, "variants": 5, "pitchJitterCents": 15,
    "prompt": "A single dry wooden knock with no resonance, damped immediately, dead room",
    "post": "Gate to 8 ms, remove all tail",
    "subject": "illegal-action", "source": "2.2", "densityThreshold": 0
  },
  {
    "id": "click-detent",
    "kind": "click", "band": "presence", "grid": "unquantized",
    "durationMs": 6, "levelDbTenths": -220, "variants": 5, "pitchJitterCents": 15,
    "prompt": "A rotary switch clicking one position, small metal detent, close mic",
    "post": "Pitch-shift per step",
    "subject": "threshold-step", "source": "2", "densityThreshold": 0
  },
  {
    "id": "click-seal",
    "kind": "click", "band": "low-mid", "grid": "downbeat",
    "durationMs": 700, "levelDbTenths": -120, "variants": 3, "pitchJitterCents": 0,
    "prompt": "Hot wax seal pressed onto parchment, slow press and slow release, heavy, close, quiet room tone",
    "post": "Keep the full 700 ms",
    "subject": "irreversible-action", "source": "2.4", "densityThreshold": 0
  }
]
```

- [ ] **Step 10: Write the cue schema test**

Create `packages/content/test/unit/audio-cue-schema.test.ts` with the AGPL header:

```typescript
import { describe, expect, it } from 'vitest';

import { loadAudioContent, shippedAudioDirectory, validateAudioContent } from '@mm/content';
import { directorySource, memorySource } from '@mm/content';

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
```

Check the exact `ContentDiagnostic` field names in `diagnostics.ts` and match them; if the pointer field is not `pointer`, adjust.

- [ ] **Step 11: Add the CLI shell and npm scripts**

Create `packages/content/bin/validate-audio.mjs` with the AGPL header, mirroring `validate-content.mjs` exactly:

```javascript
import process from 'node:process';

import { runAudioValidation } from '../dist/audio-cli.js';

process.exitCode = runAudioValidation(process.argv.slice(2));
```

Create `packages/content/src/audio-cli.ts` with `runAudioValidation(argv: readonly string[]): number`, following `cli.ts`'s structure: default to the shipped audio directory, print each diagnostic as `file pointer message`, return `0` when clean and `1` otherwise. Read `cli.ts` and match its output format so the two validators report identically.

In `package.json`:

```json
"check:audio": "node packages/content/bin/validate-audio.mjs",
"verify": "npm run typecheck && npm run lint && npm run check:purity && npm run check:content && npm run check:audio && npm run test"
```

- [ ] **Step 12: Run the full gate**

```bash
cd .claude/worktrees/sound-design && npm run verify
```

Expected: PASS, including both new test files.

- [ ] **Step 13: Commit**

```bash
git add ASSET-LICENSE.md packages/content package.json docs/design/sound-design.md
git commit -m "feat(audio): a content set for audio, kept out of contentRevision

Audio content reuses the JSON Schema interpreter and nothing else. It is not in
CONTENT_FILES and not in the loader, because contentRevision is a compatibility
gate (contracts §0): if a bark edit moved it, two players on different patch
levels could not raid each other, and every golden fixture would churn on a
typo fix. audio-isolation.test.ts is what makes that regression fail.

Asset licensing resolved in ASSET-LICENSE.md: written material CC BY-SA 4.0,
generated audio no-rights-asserted — copyleft needs ownership to attach to, and
claiming it over output we may not own would be an empty claim.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The full cue set, cross-checked against content

Adds every non-voice cue in sound-design §§4–7 — the compositional grid, the god interventions, the knowledge lifecycle, the raid primitives — and the cross-reference tests that keep them honest against the simulation's own content.

The four cue classes land in one task because they share one data file and one test file, and because the tests only mean anything once the set is complete: "every cue's subject points at real content" is vacuous while most cues are missing.

**Files:**
- Modify: `packages/content/data/audio/audio-cue.json`
- Test: `packages/content/test/unit/audio-grid.test.ts`

**Interfaces:**
- Consumes: `loadAudioContent`, `AudioCueRecord` from Task 1; `loadContent` for `technique.json`, `form.json` and `primitive.json`.
- Produces: cue ids `envelope-<techniqueId>`, `material-<formId>`, `intervention-<actionName>`, `knowledge-<event>`, `raid-<primitiveId>`.

- [ ] **Step 1: Write the failing cross-reference test**

Create `packages/content/test/unit/audio-grid.test.ts` with the AGPL header and this doc comment, then the tests:

```typescript
/**
 * sound-design.md §4 makes a spell sound *assembled* — technique supplies the
 * envelope, form supplies the material — so 5 + 14 components cover all 70
 * cells. That only holds if the two sets stay in step with the simulation's own
 * content. A form added to `form.json` with no material is a silent hole in the
 * grid that nobody hears until the cell ships.
 *
 * §3.2 is the other invariant here: exactly two things in world time are
 * off-grid, and arrhythmia is the entire reason knowledge loss lands. Every
 * future cue that wants to feel important will want to be off-grid too, so the
 * allow-list is closed and this test is the argument.
 */

import { describe, expect, it } from 'vitest';

import {
  directorySource,
  loadAudioContent,
  loadContent,
  shippedAudioDirectory,
  shippedContentSource,
} from '@mm/content';

const cues = loadAudioContent(directorySource(shippedAudioDirectory(), 'data/audio')).cues;
const registry = loadContent(shippedContentSource());

describe('the audio grid', () => {
  it('gives every technique an envelope', () => {
    for (const { record } of registry.techniques) {
      const cue = cues.find((c) => c.id === `envelope-${record.id}`);
      expect(cue, `no envelope cue for technique ${record.id}`).toBeDefined();
      expect(cue?.kind).toBe('technique-envelope');
      expect(cue?.subject).toBe(record.id);
    }
  });

  it('gives every form a material', () => {
    for (const { record } of registry.forms) {
      const cue = cues.find((c) => c.id === `material-${record.id}`);
      expect(cue, `no material cue for form ${record.id}`).toBeDefined();
      expect(cue?.kind).toBe('form-material');
      expect(cue?.subject).toBe(record.id);
    }
  });

  it('gives every effect primitive a raid cue', () => {
    for (const { record } of registry.primitives) {
      if (!COMBAT_PRIMITIVES.includes(record.id)) continue;
      const cue = cues.find((c) => c.id === `raid-${record.id}`);
      expect(cue, `no raid cue for primitive ${record.id}`).toBeDefined();
      expect(cue?.kind).toBe('raid-primitive');
    }
  });

  it('keeps every cue subject pointing at real content', () => {
    const knownSubjects = new Set<string>([
      ...registry.techniques.map((t) => t.record.id),
      ...registry.forms.map((f) => f.record.id),
      ...registry.primitives.map((p) => p.record.id),
      ...UI_SUBJECTS,
    ]);
    for (const cue of cues) {
      expect(knownSubjects.has(cue.subject), `${cue.id} -> ${cue.subject}`).toBe(true);
    }
  });

  it('allows off-grid only for knowledge loss and portal events', () => {
    const offGrid = cues.filter((c) => c.grid === 'off-grid').map((c) => c.id).sort();
    expect(offGrid).toEqual(['knowledge-last-instance-loss', 'portal-transition']);
  });

  it('gives every event-class cue a density threshold', () => {
    // sound-design §0.4: no event class may be discrete without a stated
    // threshold. The one that lacks it is the one that turns a mature universe
    // into noise, and a 10,000-mage universe is the benchmarked case.
    for (const cue of cues) {
      if (cue.kind !== 'knowledge' && cue.kind !== 'raid-primitive') continue;
      expect(cue.densityThreshold, `${cue.id} density threshold`).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives UI and assembled cues no density threshold', () => {
    for (const cue of cues) {
      if (cue.kind === 'knowledge' || cue.kind === 'raid-primitive') continue;
      expect(cue.densityThreshold, `${cue.id} density threshold`).toBe(0);
    }
  });
});

/** Cue subjects that name a UI or god-action concept rather than a content id. */
const UI_SUBJECTS = [
  'hover', 'arm-intervention', 'resolve-action', 'illegal-action',
  'threshold-step', 'irreversible-action',
  'knowledge-loss', 'portal',
  'permit-technique', 'forbid-technique', 'permit-form', 'forbid-form',
  'dispensation', 'interdiction', 'revoke-edict', 'grant-founding-knowledge',
  'bless-mage', 'assign-role', 'fund-university', 'encourage-research',
  'change-tradition', 'declare-ascension', 'favor-pulse',
  'research', 'discovery', 'teaching', 'scribing', 'grimoire-complete',
  'theft', 'rediscovery', 'mage-death',
];

/** Primitives that occupy raid space (sound-design §7.1); the rest are world-scale. */
const COMBAT_PRIMITIVES = ['direct-damage', 'ward', 'area-denial', 'blink', 'summon'];
```

The `knownSubjects` set grows in Task 3 and beyond; keep `UI_SUBJECTS` as the single place that list lives.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run packages/content/test/unit/audio-grid.test.ts
```

Expected: FAIL — no envelope cue for the first technique, and the off-grid assertion finds an empty array.

- [ ] **Step 3: Check which techniques and forms actually ship**

```bash
node -e "const c=require('./packages/content/data/technique.json');console.log(c.map(t=>t.id))"
node -e "const f=require('./packages/content/data/form.json');console.log(f.map(x=>x.id))"
```

v1 ships a subset (vision §4), so this may be fewer than 5 and 14. **Author cues for exactly the ids that ship** — the test iterates shipped content, and inventing cues for unshipped forms would pass a test nobody wrote while leaving the shipped ones unverified.

- [ ] **Step 4: Add the envelope and material cues**

Append to `audio-cue.json`, one per shipped technique and form, taking `prompt` verbatim from sound-design §9.2 and §9.3 and `band` from §1.3. Envelopes are `"grid": "unquantized"` and `"durationMs": 1500`; materials are `"grid": "unquantized"` and `"durationMs": 3000`. Example pair:

```json
  {
    "id": "envelope-creo",
    "kind": "technique-envelope", "band": "low-mid", "grid": "unquantized",
    "durationMs": 1500, "levelDbTenths": -160, "variants": 4, "pitchJitterCents": 0,
    "prompt": "A bell strike played backwards, swelling from silence into a full bloom, tail at the start, impact at the end",
    "post": "Apply as an envelope chain over form materials; do not ship standalone",
    "subject": "creo", "source": "4.1", "densityThreshold": 0
  },
  {
    "id": "material-ignem",
    "kind": "form-material", "band": "sparkle", "grid": "unquantized",
    "durationMs": 3000, "levelDbTenths": -180, "variants": 4, "pitchJitterCents": 0,
    "prompt": "Fire crackle over broadband roar, rising, unstable",
    "post": "",
    "subject": "ignem", "source": "4.2", "densityThreshold": 0
  }
```

Band assignments from §1.3: `mentem` → `presence`, `nomen` → `presence`, `corpus` → `low`, `terram` → `low`, `ignem` → `sparkle`, `auram` → `air`, `umbra` → `air`, others `low-mid`.

- [ ] **Step 5: Add the two off-grid cues**

```json
  {
    "id": "knowledge-last-instance-loss",
    "kind": "knowledge", "band": "low-mid", "grid": "off-grid",
    "durationMs": 3300, "levelDbTenths": -170, "variants": 3, "pitchJitterCents": 0,
    "prompt": "A single sustained tone slightly out of tune with everything around it, held steady, then stopping without decay",
    "post": "Hold exactly one bar. Detune 40 cents from the universe root. No impact transient.",
    "subject": "knowledge-loss", "source": "6.5", "densityThreshold": 1
  },
  {
    "id": "portal-transition",
    "kind": "knowledge", "band": "sub", "grid": "off-grid",
    "durationMs": 1800, "levelDbTenths": -150, "variants": 2, "pitchJitterCents": 0,
    "prompt": "A low sustained drone emerging from silence as if a door has opened onto a larger room",
    "post": "Ritardando handled by the client; this is the drone the arrangement collapses into",
    "subject": "portal", "source": "3.3", "densityThreshold": 1
  }
```

`'knowledge-loss'` and `'portal'` are already in `UI_SUBJECTS` in the test.

- [ ] **Step 6: Add the intervention cues (sound-design §5)**

One cue per action in contracts §4.2, excluding action 0 (no-op), which §5.1 says must stay silent —
RL agents no-op constantly. Fifteen cues, `"kind": "intervention"`, `"densityThreshold": 0`,
`"grid": "downbeat"` (interventions commit on the beat, §2.1), `"subject"` as listed in
`UI_SUBJECTS`.

The tier from §5.1 drives duration and level:

| Tier | Actions | `durationMs` | `levelDbTenths` |
|---|---|---|---|
| 1 clerical | `assign-role`, `fund-university`, `encourage-research` | 400 | -200 |
| 2 consequential | `bless-mage`, `grant-founding-knowledge`, `open-portal` | 2000 | -150 |
| 3 constitutional | `permit-technique`, `forbid-technique`, `permit-form`, `forbid-form`, `dispensation`, `interdiction`, `revoke-edict` | 3000 | -140 |
| 4 terminal | `change-tradition`, `declare-ascension` | 6000 | -120 |

`open-portal` reuses the existing `portal-transition` cue rather than adding a sixteenth — it is the
same event and §3.3 already specifies it. Two worked entries:

```json
  {
    "id": "intervention-permit-technique",
    "kind": "intervention", "band": "low-mid", "grid": "downbeat",
    "durationMs": 3000, "levelDbTenths": -140, "variants": 3, "pitchJitterCents": 0,
    "prompt": "A chord opening on a bowed string ensemble, warm and consonant, with one low partial that does not resolve",
    "post": "The unresolved partial decays over ~8 bars. §5.2: permitting arms invaders too, and this is where the player feels it.",
    "subject": "permit-technique", "source": "5.2", "densityThreshold": 0
  },
  {
    "id": "intervention-grant-founding-knowledge",
    "kind": "intervention", "band": "low-mid", "grid": "downbeat",
    "durationMs": 2000, "levelDbTenths": -150, "variants": 2, "pitchJitterCents": 0,
    "prompt": "A single sustained tone arriving from silence and settling, complete and unhurried, like something taking its place",
    "post": "§5.3: a birth. Followed by the granted cell's material entering the ambient bed for the first time.",
    "subject": "grant-founding-knowledge", "source": "5.3", "densityThreshold": 0
  }
```

- [ ] **Step 7: Add the knowledge lifecycle cues (sound-design §6)**

Eight cues, `"kind": "knowledge"`, each with a **non-zero** `densityThreshold` taken from the
thresholds §6 states — this is the only cue kind where §0.4's rule bites, and the test from Step 1
enforces it.

| id | `grid` | `densityThreshold` | `source` |
|---|---|---|---|
| `knowledge-research-motif` | `eighth` | 8 | 6.1 |
| `knowledge-discovery` | `downbeat` | 8 | 6.1 |
| `knowledge-teaching` | `backbeat` | 12 | 6.2 |
| `knowledge-scribing` | `sixteenth` | 3 | 6.3 |
| `knowledge-grimoire-complete` | `downbeat` | 6 | 6.3 |
| `knowledge-theft` | `backbeat` | 4 | 6.4 |
| `knowledge-rediscovery` | `downbeat` | 4 | 6.6 |
| `knowledge-mage-death` | `downbeat` | 4 | 6.5 |

`knowledge-last-instance-loss` from Step 5 needs its `densityThreshold` raised from the placeholder
`1` to `1` — it stays at 1 deliberately: §6.5 says last-instance loss must never be aggregated away,
so the threshold is the lowest legal value rather than an aggregation point. Note that in `post`.

Subjects are `research`, `discovery`, `teaching`, `scribing`, `grimoire-complete`, `theft`,
`rediscovery`, `mage-death`. Prompts come from §6's descriptions; two worked entries:

```json
  {
    "id": "knowledge-teaching",
    "kind": "knowledge", "band": "sparkle", "grid": "backbeat",
    "durationMs": 900, "levelDbTenths": -190, "variants": 6, "pitchJitterCents": 10,
    "prompt": "Two voices humming the same note, one arriving an eighth after the other and settling into unison, warm, close",
    "post": "§6.2: successful teaching is the moment two voices agree. Failed teaching lands the second voice a semitone off and corrects.",
    "subject": "teaching", "source": "6.2", "densityThreshold": 12
  },
  {
    "id": "knowledge-theft",
    "kind": "knowledge", "band": "sparkle", "grid": "backbeat",
    "durationMs": 900, "levelDbTenths": -190, "variants": 4, "pitchJitterCents": 10,
    "prompt": "Two voices, the second arriving before the first, the first stopping partway through, no room tone at all",
    "post": "§6.4: teaching violated three ways — response precedes call, source cuts off mid-phrase, no reverb because it happens in a mind.",
    "subject": "theft", "source": "6.4", "densityThreshold": 4
  }
```

- [ ] **Step 8: Add the raid primitive cues (sound-design §7.1)**

One per combat primitive that ships in `primitive.json`. Check first, exactly as in Step 3:

```bash
node -e "console.log(require('./packages/content/data/primitive.json').map(p=>p.id))"
```

Author cues only for ids present in `COMBAT_PRIMITIVES` **and** in shipped content — the test
intersects the two, so a v1 that ships no raid primitives yet passes with no cues, and the moment
one lands the test demands its sound. Economy and social primitives get no raid cue; §7.1 puts them
in the arrangement instead.

All are `"kind": "raid-primitive"`, `"grid": "unquantized"` (§3.4 turns quantization off in raid
time), and `"densityThreshold": 6`. One worked entry:

```json
  {
    "id": "raid-ward",
    "kind": "raid-primitive", "band": "presence", "grid": "unquantized",
    "durationMs": 2000, "levelDbTenths": -170, "variants": 4, "pitchJitterCents": 0,
    "prompt": "A pitched sustained tone under strain, clean at first, going sour as pressure builds, ending in a sharp snap",
    "post": "§7.1: a blocked hit is consonant against this tone; a breaking ward is the tone snapping. Ward remaining is audible without a bar.",
    "subject": "ward", "source": "7.1", "densityThreshold": 6
  }
```

- [ ] **Step 9: Run the tests**

```bash
npx vitest run packages/content/test/unit/audio-grid.test.ts
```

Expected: PASS, all seven tests.

- [ ] **Step 10: Run the full gate and commit**

```bash
npm run verify
git add packages/content
git commit -m "feat(audio): the cue set for §§4-7, cross-checked against content

§4's compositional bet is that 5 envelopes and 14 materials cover all 70 cells.
That only holds while the two sets stay in step with technique.json and
form.json, so the tests iterate shipped content rather than a hand-written list:
a form added with no material now fails CI instead of shipping a silent hole,
and so does a combat primitive with no raid sound.

Two invariants from the design are now CI checks rather than prose:

- The off-grid allow-list is closed to knowledge loss and portal events. §3.2
  makes arrhythmia the whole reason loss lands, and it stops working the moment
  a third thing is allowed to use it. Everything that ships later will want to
  be off-grid; the test is the answer.
- Every event-class cue carries a density threshold (§0.4). The benchmark puts
  10,000 entities in a universe, and the event class that lacks a threshold is
  the one that turns that universe into noise.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Voice line banks

Ships sound-design §8 as validated data: six species banks, the populace banks, the cross-species lines, and the last-copy line that does mechanical work.

**Files:**
- Create: `packages/content/schema/audio/voice-line.schema.json`
- Modify: `packages/content/data/audio/voice-line.json`
- Modify: `packages/content/src/audio-types.ts`
- Test: `packages/content/test/unit/voice-line.test.ts`

**Interfaces:**
- Consumes: `loadAudioContent`, `validateAudioContent` from Task 1.
- Produces:
  - `type VoiceLineTier = 'selection' | 'acknowledgement' | 'annoyance-polite' | 'annoyance-irritated' | 'annoyance-cracking' | 'annoyance-unhinged' | 'breakthrough' | 'blessed' | 'death' | 'last-copy' | 'cross-species'`
  - `interface VoiceLineRecord { readonly id: string; readonly tier: VoiceLineTier; readonly text: string; readonly about: string }`
  - `interface VoiceLineBankRecord { readonly id: string; readonly speaker: string; readonly speakerKind: 'species' | 'populace'; readonly voicePrompt: string; readonly lines: readonly VoiceLineRecord[] }`

`VoiceLineBankRecord` replaces the placeholder from Task 1 Step 6.

- [ ] **Step 1: Write the failing test**

Create `packages/content/test/unit/voice-line.test.ts` with the AGPL header:

```typescript
/**
 * The barks are the explain channel made audible (contracts §4.4): vision §7
 * makes mage autonomy a pillar, and without a data path autonomy reads as
 * randomness. They are also, per sound-design §8.2, the one place a sound does
 * mechanical work — the last-copy line is `libraryDependence` (contracts §7)
 * surfaced per-mage, which is why every species bank must carry exactly one.
 */

import { describe, expect, it } from 'vitest';

import {
  directorySource,
  loadAudioContent,
  loadContent,
  shippedAudioDirectory,
  shippedContentSource,
} from '@mm/content';

const banks = loadAudioContent(directorySource(shippedAudioDirectory(), 'data/audio')).banks;
const speciesBanks = banks.filter((b) => b.speakerKind === 'species');

describe('voice line banks', () => {
  it('gives every playable species a bank', () => {
    const species = loadContent(shippedContentSource()).species.map((s) => s.record.id).sort();
    expect(speciesBanks.map((b) => b.speaker).sort()).toEqual(species);
  });

  it('gives every species bank exactly one last-copy line', () => {
    for (const bank of speciesBanks) {
      const lastCopy = bank.lines.filter((l) => l.tier === 'last-copy');
      expect(lastCopy, `${bank.speaker} last-copy lines`).toHaveLength(1);
    }
  });

  it('escalates: every species bank carries all four annoyance tiers', () => {
    const tiers = [
      'annoyance-polite', 'annoyance-irritated',
      'annoyance-cracking', 'annoyance-unhinged',
    ] as const;
    for (const bank of speciesBanks) {
      for (const tier of tiers) {
        const count = bank.lines.filter((l) => l.tier === tier).length;
        expect(count, `${bank.speaker} ${tier}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('meets the §8.1 bank size floor', () => {
    for (const bank of speciesBanks) {
      expect(bank.lines.length, `${bank.speaker} bank size`).toBeGreaterThanOrEqual(28);
    }
  });

  it('points every cross-species line at a species that exists', () => {
    const speakers = new Set(speciesBanks.map((b) => b.speaker));
    for (const bank of banks) {
      for (const line of bank.lines.filter((l) => l.tier === 'cross-species')) {
        expect(speakers.has(line.about), `${line.id} -> ${line.about}`).toBe(true);
      }
    }
  });

  it('has no duplicate line ids across all banks', () => {
    const ids = banks.flatMap((b) => b.lines.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run packages/content/test/unit/voice-line.test.ts
```

Expected: FAIL — `voice-line.json` is `[]`, so the species-coverage assertion compares `[]` against six ids.

- [ ] **Step 3: Write the schema**

Create `packages/content/schema/audio/voice-line.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://multiverse-mages.invalid/schema/audio/voice-line.schema.json",
  "title": "voice-line.json",
  "description": "Bark banks (docs/design/sound-design.md §8). Renderer-only content: never loaded by the simulation, never part of contentRevision. Text is CC BY-SA 4.0 per ASSET-LICENSE.md.",
  "type": "array",
  "items": { "$ref": "#/$defs/bank" },
  "$defs": {
    "bank": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "speaker", "speakerKind", "voicePrompt", "lines"],
      "properties": {
        "id": { "$ref": "#/$defs/contentId" },
        "speaker": { "$ref": "#/$defs/contentId" },
        "speakerKind": { "enum": ["species", "populace"] },
        "voicePrompt": { "type": "string", "minLength": 1, "maxLength": 500 },
        "lines": { "type": "array", "minItems": 1, "maxItems": 64, "items": { "$ref": "#/$defs/line" } }
      }
    },
    "line": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "tier", "text", "about"],
      "properties": {
        "id": { "$ref": "#/$defs/contentId" },
        "tier": {
          "enum": [
            "selection", "acknowledgement", "annoyance-polite",
            "annoyance-irritated", "annoyance-cracking", "annoyance-unhinged",
            "breakthrough", "blessed", "death", "last-copy", "cross-species"
          ]
        },
        "text": { "type": "string", "minLength": 1, "maxLength": 300 },
        "about": { "type": "string", "maxLength": 64 }
      }
    },
    "contentId": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$", "maxLength": 64 }
  }
}
```

- [ ] **Step 4: Extend `audio-types.ts`**

Replace the `VoiceLineBankRecord` placeholder with the full definitions from this task's **Interfaces** block, and add the AGPL-header-consistent doc comment: `/** One species' or role's bark bank (sound-design.md §8). */`

- [ ] **Step 5: Transcribe the banks**

Fill `packages/content/data/audio/voice-line.json` from `docs/design/sound-design.md`. The line text already exists there and is the source of truth — transcribe it verbatim, do not paraphrase or improvise new lines.

| Bank | Doc section | `speakerKind` | `speaker` |
|---|---|---|---|
| `bank-human` | §8.3 | `species` | `human` |
| `bank-elf` | §8.4 | `species` | `elf` |
| `bank-dwarf` | §8.5 | `species` | `dwarf` |
| `bank-draconic` | §8.6 | `species` | `draconic` |
| `bank-gnome` | §8.7 | `species` | `gnome` |
| `bank-orc` | §8.8 | `species` | `orc` |
| `bank-scribe`, `bank-student`, `bank-laborer`, `bank-soldier` | §8.10 | `populace` | role id |

Rules while transcribing:

- `voicePrompt` comes from §9.5's table for that speaker.
- Tier mapping: the *(polite)* / *(irritated)* / *(cracking)* / *(unhinged)* markers in §8 map to the four `annoyance-*` tiers. Lines before the first marker in an Annoyance block are `annoyance-polite`.
- The last-copy line for each species is the §8.2 table, tier `last-copy`.
- Cross-species lines from §8.9 go in the *speaker's* bank with tier `cross-species` and `about` set to the subject species id. `"Human → Elf"` becomes a line in `bank-human` with `"about": "elf"`.
- `about` is `""` for every non-cross-species line.
- Line ids are `<speaker>-<tier-short>-<n>`, e.g. `human-annoyance-unhinged-1`, `elf-selection-3`.

Worked example, the first three human lines:

```json
[
  {
    "id": "bank-human",
    "speaker": "human",
    "speakerKind": "species",
    "voicePrompt": "Mid-thirties, quick and slightly breathless, warm, always sounds like they are already late. Neutral accent. Reads sincerely, never for laughs.",
    "lines": [
      { "id": "human-selection-1", "tier": "selection", "text": "Adjunct, actually.", "about": "" },
      { "id": "human-selection-2", "tier": "selection", "text": "I've read about this.", "about": "" },
      { "id": "human-last-copy-1", "tier": "last-copy", "text": "I'm the only one who knows this. That's — you understand that's a problem, yes?", "about": "" }
    ]
  }
]
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run packages/content/test/unit/voice-line.test.ts
```

Expected: PASS, all six tests. If the bank-size floor fails, the transcription missed lines — go back to §8 rather than lowering the floor.

- [ ] **Step 7: Run the full gate and commit**

```bash
npm run verify
git add packages/content
git commit -m "feat(audio): the bark banks, as validated content

CLAUDE.md says content lives in validated data files, and the barks are content
— they key off species ids, they carry a tier structure the client has to honour,
and per sound-design §8.2 one of them does mechanical work: the last-copy line is
libraryDependence (contracts §7) surfaced per-mage, so clicking around the roster
is a legitimate way to audit single points of failure.

The tests enforce what makes the escalation land rather than merely that the file
parses: every species has a bank, every bank carries all four annoyance tiers,
and every bank carries exactly one last-copy line.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The selection hash and its golden vectors

sound-design §0.2 forbids audio taking an RNG stream and specifies a state hash instead. This ships the function and pins it with committed vectors, so the eventual client cannot reinvent it slightly differently.

**Files:**
- Modify: `packages/content/src/audio.ts`
- Create: `packages/content/test/fixtures/audio-select-vectors.json`
- Test: `packages/content/test/unit/audio-select.test.ts`

**Interfaces:**
- Produces: `audioSelect(rootSeed: number, tick: number, entityId: number, kind: string, repeat: number, variantCount: number): number` — returns an index in `[0, variantCount)`.

- [ ] **Step 1: Write the failing test**

Create `packages/content/test/unit/audio-select.test.ts` with the AGPL header:

```typescript
/**
 * sound-design §0.2: audio variation must never take an RNG stream. Contracts §6
 * makes the stream registry append-only and baseline-coupled, so an audio stream
 * would have rotted every committed balance baseline the first time somebody
 * added a sound — silently, and months before anyone looked.
 *
 * Hashing state instead costs nothing and buys replay-identical audio: the same
 * golden fixture plays the same barks in the same order every time, which is what
 * makes "it sounded wrong here" a reproducible bug report.
 *
 * The committed vectors exist because the client is a different package written
 * later. A function that is merely described gets reimplemented subtly
 * differently; a function with vectors does not.
 */

import { describe, expect, it } from 'vitest';

import { audioSelect } from '@mm/content';

import vectors from '../fixtures/audio-select-vectors.json' with { type: 'json' };

describe('audioSelect', () => {
  it('matches the committed vectors', () => {
    for (const v of vectors) {
      expect(
        audioSelect(v.rootSeed, v.tick, v.entityId, v.kind, v.repeat, v.variantCount),
        JSON.stringify(v),
      ).toBe(v.expected);
    }
  });

  it('is deterministic across calls', () => {
    const once = audioSelect(12345, 700, 42, 'selection', 3, 5);
    const twice = audioSelect(12345, 700, 42, 'selection', 3, 5);
    expect(once).toBe(twice);
  });

  it('stays in range for every variant count', () => {
    for (let variantCount = 1; variantCount <= 16; variantCount += 1) {
      for (let tick = 0; tick < 200; tick += 1) {
        const index = audioSelect(7, tick, 3, 'annoyance-polite', 0, variantCount);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(variantCount);
      }
    }
  });

  it('varies with every input independently', () => {
    const base = audioSelect(1, 1, 1, 'selection', 1, 8);
    const differs = [
      audioSelect(2, 1, 1, 'selection', 1, 8),
      audioSelect(1, 2, 1, 'selection', 1, 8),
      audioSelect(1, 1, 2, 'selection', 1, 8),
      audioSelect(1, 1, 1, 'death', 1, 8),
      audioSelect(1, 1, 1, 'selection', 2, 8),
    ];
    // Any single-input change should move the result for at least most inputs;
    // a function ignoring one of its arguments fails this decisively.
    expect(differs.filter((d) => d !== base).length).toBeGreaterThanOrEqual(3);
  });

  it('spreads roughly evenly across variants', () => {
    const counts = new Array<number>(5).fill(0);
    for (let tick = 0; tick < 5000; tick += 1) {
      counts[audioSelect(99, tick, 1, 'selection', 0, 5)] += 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run packages/content/test/unit/audio-select.test.ts
```

Expected: FAIL — `audioSelect` is not exported, and the fixture does not exist.

- [ ] **Step 3: Implement `audioSelect`**

Append to `packages/content/src/audio.ts`. Use FNV-1a with `Math.imul`, matching `revision.ts`'s approach so the codebase has one hashing idiom rather than two:

```typescript
/**
 * Deterministic audio variant selection (sound-design.md §0.2).
 *
 * Never draws from a simulation RNG stream. Contracts §6 makes the registry
 * append-only and baseline-coupled, so an audio draw would invalidate every
 * committed balance baseline. Hashing state costs nothing and makes replays
 * sound identical to the run that recorded them.
 *
 * Integer-only, so it behaves identically in the renderer and in a test.
 */
export function audioSelect(
  rootSeed: number,
  tick: number,
  entityId: number,
  kind: string,
  repeat: number,
  variantCount: number,
): number {
  if (variantCount < 1) throw new RangeError('variantCount must be at least 1');
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    let remaining = value >>> 0;
    for (let byte = 0; byte < 4; byte += 1) {
      hash = Math.imul(hash ^ (remaining & 0xff), 0x01000193) >>> 0;
      remaining >>>= 8;
    }
  };
  mix(rootSeed);
  mix(tick);
  mix(entityId);
  for (let i = 0; i < kind.length; i += 1) {
    hash = Math.imul(hash ^ kind.charCodeAt(i), 0x01000193) >>> 0;
  }
  mix(repeat);
  return hash % variantCount;
}
```

Export it from `index.ts` alongside the Task 1 exports.

- [ ] **Step 4: Generate the vectors**

Vectors must be *produced by the implementation*, then committed and never regenerated to make a test pass — the same rule `CLAUDE.md` applies to golden fixtures. Run once:

```bash
npm run typecheck
node --input-type=module -e "
import { audioSelect } from './packages/content/dist/index.js';
const kinds = ['selection', 'annoyance-unhinged', 'death', 'click-tick'];
const out = [];
for (const rootSeed of [1, 12345, 2147483647]) {
  for (const tick of [0, 1, 700, 65535]) {
    for (const entityId of [0, 42]) {
      for (const kind of kinds) {
        for (const repeat of [0, 17]) {
          for (const variantCount of [1, 5, 16]) {
            out.push({ rootSeed, tick, entityId, kind, repeat, variantCount,
              expected: audioSelect(rootSeed, tick, entityId, kind, repeat, variantCount) });
          }
        }
      }
    }
  }
}
console.log(JSON.stringify(out, null, 2));
" > packages/content/test/fixtures/audio-select-vectors.json
```

Confirm the file has 576 entries before committing.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run packages/content/test/unit/audio-select.test.ts
```

Expected: PASS, all five tests. If the distribution test fails, the hash is biased — fix the hash, regenerate the vectors, and do not widen the tolerance.

- [ ] **Step 6: Document the algorithm in the spec**

In `docs/design/sound-design.md` §0.2, after the code block, add:

```markdown
**Implemented and pinned.** `audioSelect()` in `packages/content/src/audio.ts`, with committed
vectors at `packages/content/test/fixtures/audio-select-vectors.json`. The vectors exist because the
client is a different package written later, and a function that is only described gets
reimplemented subtly differently. Regenerating them is a claim that audio selection changed on
purpose, and reviewers should read it as one.
```

- [ ] **Step 7: Run the full gate and commit**

```bash
npm run verify
git add packages/content docs/design/sound-design.md
git commit -m "feat(audio): pin variant selection to a state hash, not an RNG stream

Contracts §6 makes the stream registry append-only and baseline-coupled. An
audio draw would have rotted every committed balance baseline the first time
someone added a sound, silently. Hashing (rootSeed, tick, entityId, kind,
repeat) costs nothing and buys replay-identical audio for free.

Vectors are committed because the client is written later and elsewhere: a
described function gets reimplemented subtly differently, a function with 576
vectors does not.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The generation pipeline

Drives the batch job from the content files. Pure request-shaping is separated from I/O so it can be tested without a network or a key.

**Files:**
- Create: `packages/content/src/audio-generation.ts`
- Create: `scripts/generate-audio.mjs`
- Modify: `packages/content/src/index.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `packages/content/test/unit/generation-plan.test.ts`

**Interfaces:**
- Consumes: `loadAudioContent` from Task 1, `AudioCueRecord` and `VoiceLineBankRecord` from Tasks 1 and 3.
- Produces, from `packages/content/src/audio-generation.ts` (re-exported from `index.ts`):
  - `planRequests(cues, banks, { takes })` → `readonly GenerationRequest[]`
  - `GenerationRequest = { id, endpoint: 'sound-effect' | 'text-to-speech', body: object, outputPath: string }`
  - `redact(text, key)` → `string`

- [ ] **Step 1: Write the failing test**

Create `packages/content/test/unit/generation-plan.test.ts` with the AGPL header:

```typescript
/**
 * The generation script is the only thing in this repository that holds a
 * credential, and it is in a public repo. `redact` is tested first and hardest
 * for that reason: a key that reaches a log line is a key that is compromised,
 * and no amount of care at the call sites is a substitute for the function that
 * makes it impossible.
 */

import { describe, expect, it } from 'vitest';

import { planRequests, redact } from '@mm/content';

const cues = [
  {
    id: 'click-tick', kind: 'click', band: 'presence', grid: 'unquantized',
    durationMs: 4, levelDbTenths: -300, variants: 5, pitchJitterCents: 15,
    prompt: 'A single fingernail tapping once on glazed ceramic',
    post: '', subject: 'hover', source: '2', densityThreshold: 0,
  },
  {
    id: 'envelope-creo', kind: 'technique-envelope', band: 'low-mid', grid: 'unquantized',
    durationMs: 1500, levelDbTenths: -160, variants: 4, pitchJitterCents: 0,
    prompt: '', post: 'assembled', subject: 'creo', source: '4.1', densityThreshold: 0,
  },
];

const banks = [
  {
    id: 'bank-human', speaker: 'human', speakerKind: 'species',
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
    expect(requests[0].outputPath).toBe('assets/candidates/click-tick/v1-take1.mp3');
    expect(requests[1].outputPath).toBe('assets/candidates/click-tick/v1-take2.mp3');
  });

  it('never puts a duration on a sound-effect body above the API maximum', () => {
    const long = [{ ...cues[0], id: 'click-seal', durationMs: 700000, variants: 1 }];
    const [request] = planRequests(long, [], { takes: 1 });
    expect(request.body.duration_seconds).toBeLessThanOrEqual(22);
  });

  it('produces unique output paths across the whole plan', () => {
    const requests = planRequests(cues, banks, { takes: 4 });
    const paths = requests.map((r) => r.outputPath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run packages/content/test/unit/generation-plan.test.ts
```

Expected: FAIL — `planRequests` is not exported from `@mm/content`.

- [ ] **Step 3: Implement `audio-generation.ts`**

Create `packages/content/src/audio-generation.ts` with the AGPL header and a module doc comment noting it is pure by design so it can be tested without a key, and that the script imports it from `dist/` as a leaf module.

Write it as TypeScript using the `AudioCueRecord` and `VoiceLineBankRecord` types from `audio-types.js`, and export `interface GenerationRequest { readonly id: string; readonly endpoint: 'sound-effect' | 'text-to-speech'; readonly body: Record<string, unknown>; readonly outputPath: string }`. The bodies below are otherwise unchanged:

```javascript
/** The API caps a single sound-effect request; clamp rather than fail the batch. */
const MAX_SFX_SECONDS = 22;

/** Removes an exact secret from a string. Never log anything this has not passed through. */
export function redact(text, key) {
  if (!key) return text;
  return text.split(key).join('[redacted]');
}

/**
 * Expands content into one request per take.
 *
 * Cues with an empty prompt are assembled from other assets (sound-design §4.1
 * envelopes are processing chains, not standalone sounds) and are skipped.
 */
export function planRequests(cues, banks, { takes }) {
  const requests = [];

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
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run packages/content/test/unit/generation-plan.test.ts
```

Expected: PASS, all nine tests.

- [ ] **Step 5: Write the driver**

Create `scripts/generate-audio.mjs` with the AGPL header. It does the I/O the pure module deliberately does not:

```javascript
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

import { loadAudioContent, directorySource, shippedAudioDirectory } from '../packages/content/dist/index.js';
import { planRequests, redact } from '../packages/content/dist/audio-generation.js';

const KEY = process.env.ELEVENLABS_API_KEY;
const BASE = 'https://api.elevenlabs.io/v1';

function fail(message) {
  console.error(redact(message, KEY ?? ''));
  process.exit(1);
}

if (!KEY) {
  fail('ELEVENLABS_API_KEY is not set. Export it in your shell; never write it to a file in this repo.');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const takes = Number(args.find((a) => a.startsWith('--takes='))?.slice(8) ?? 6);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const voiceId = process.env.ELEVENLABS_VOICE_ID ?? '';

const { cues, banks } = loadAudioContent(directorySource(shippedAudioDirectory(), 'data/audio'));
let requests = planRequests(cues, banks, { takes });
if (only) requests = requests.filter((r) => r.id.startsWith(only));

console.log(`${requests.length} requests planned (${takes} takes each).`);
if (dryRun) {
  for (const request of requests.slice(0, 20)) console.log(`  ${request.endpoint}  ${request.outputPath}`);
  if (requests.length > 20) console.log(`  ... and ${requests.length - 20} more`);
  process.exit(0);
}

let generated = 0;
let skipped = 0;

for (const request of requests) {
  if (existsSync(request.outputPath)) {
    skipped += 1;
    continue;
  }
  const url =
    request.endpoint === 'sound-effect'
      ? `${BASE}/sound-generation`
      : `${BASE}/text-to-speech/${voiceId}`;

  if (request.endpoint === 'text-to-speech' && !voiceId) {
    fail('ELEVENLABS_VOICE_ID is not set, and voice lines were planned. Set it, or use --only= to generate cues.');
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
    });
  } catch (error) {
    fail(`network error on ${request.id}: ${error.message}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    fail(`${request.id} failed: ${response.status} ${redact(detail, KEY)}`);
  }

  mkdirSync(dirname(request.outputPath), { recursive: true });
  writeFileSync(request.outputPath, Buffer.from(await response.arrayBuffer()));
  generated += 1;
  console.log(`  ${generated}/${requests.length}  ${request.outputPath}`);
}

console.log(`Done. ${generated} generated, ${skipped} already present.`);
```

The resume-by-`existsSync` behaviour is deliberate: this is a metered API and a batch that dies at request 900 must not re-bill the first 899.

- [ ] **Step 6: Wire scripts and gitignore**

In `package.json`, add:

```json
"audio:generate": "node scripts/generate-audio.mjs"
```

Do **not** add it to `verify` — it costs money and needs a network.

In `.gitignore`, add:

```
# Generated audio candidates. Selected takes are committed under assets/selected/.
assets/candidates/
```

- [ ] **Step 7: Verify the dry run works without a network**

```bash
npm run typecheck
ELEVENLABS_API_KEY=dummy npm run audio:generate -- --dry-run --takes=2
```

Expected: prints the planned request count and the first 20 paths, exits 0, makes no network call and writes no files.

Then confirm the guard:

```bash
env -u ELEVENLABS_API_KEY npm run audio:generate -- --dry-run
```

Expected: exits 1 with the message about the key never being written to a file.

- [ ] **Step 8: Run the full gate and commit**

```bash
npm run verify
git add scripts package.json .gitignore packages/content
git commit -m "feat(audio): generation pipeline driven by the content files

Request shaping is pure and unit-tested; the driver holds the I/O and the
credential. That split is the point: redact() is tested hardest because this is
a public repo and a key that reaches a log line is compromised, and care at the
call sites is not a substitute for a function that makes it impossible.

Native fetch, no SDK — an HTTP client would be a new dependency needing an
AGPL-compatibility check to save about fifteen lines.

Resumes by skipping existing files. The API is metered and a batch that dies at
request 900 must not re-bill the first 899.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The audition harness

Generation is cheap; selecting among ~1,500 takes is the expensive part (sound-design §9.6). This makes it a keyboard-driven pass instead of a file-browser one.

**Files:**
- Create: `packages/content/src/audio-selection-merge.ts`
- Create: `tools/audition/index.html`
- Modify: `packages/content/src/index.ts`
- Test: `packages/content/test/unit/merge-selections.test.ts`

**Interfaces:**
- Produces, from `packages/content/src/audio-selection-merge.ts` (re-exported from `index.ts`):
  - `mergeSelections(existing, incoming)` → `Record<string, string>` mapping asset id to chosen take path
  - `selectionCoverage(requests, selections)` → `{ total, chosen, missing: readonly string[] }`

- [ ] **Step 1: Write the failing test**

Create `packages/content/test/unit/merge-selections.test.ts` with the AGPL header:

```typescript
import { describe, expect, it } from 'vitest';

import { assetIdOf, mergeSelections, selectionCoverage } from '@mm/content';

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
```

`selectionCoverage` derives the asset id by stripping the trailing `-v<n>-take<n>` or `-take<n>` suffix from a request id.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run packages/content/test/unit/merge-selections.test.ts
```

Expected: FAIL — `mergeSelections` is not exported from `@mm/content`.

- [ ] **Step 3: Implement the merge module**

Create `packages/content/src/audio-selection-merge.ts` with the AGPL header. Write it as TypeScript — `Selections` is `Readonly<Record<string, string>>`, an incoming pass is `Readonly<Record<string, string | null>>`, and `selectionCoverage` takes `readonly { readonly id: string }[]`. **It must import nothing**: the audition page loads it directly in a browser, so a single `node:` import would break the tool. The logic is otherwise unchanged:

```javascript
/** Strips the take suffix from a request id, leaving the asset id. */
export function assetIdOf(requestId) {
  return requestId.replace(/-(?:v\d+-)?take\d+$/u, '');
}

/**
 * Merges an audition pass into the stored selections.
 *
 * An explicit `null` un-chooses: the audition pass is iterative, and a take that
 * sounded fine in isolation often does not survive hearing it next to its
 * neighbours.
 */
export function mergeSelections(existing, incoming) {
  const merged = { ...existing };
  for (const [assetId, take] of Object.entries(incoming)) {
    if (take === null) delete merged[assetId];
    else merged[assetId] = take;
  }
  return merged;
}

/** Reports how much of a generation plan has been auditioned. */
export function selectionCoverage(requests, selections) {
  const assetIds = [...new Set(requests.map((request) => assetIdOf(request.id)))];
  const missing = assetIds.filter((assetId) => !(assetId in selections));
  return { total: assetIds.length, chosen: assetIds.length - missing.length, missing };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run packages/content/test/unit/merge-selections.test.ts
```

Expected: PASS, all seven tests.

- [ ] **Step 5: Write the audition page**

Create `tools/audition/index.html`. Self-contained, no external requests — this repo ships no CDN
dependencies and the page must work offline. It imports the tested module directly, so the running
logic and the tested logic are the same code:

```html
<meta charset="utf-8">
<title>Multiverse Mages — take audition</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 44rem; }
  #asset { font-size: 1.3rem; font-weight: 600; margin: 1rem 0 0.25rem; }
  ol { padding-left: 1.5rem; }
  li.playing { font-weight: 600; }
  li.chosen::after { content: " ← chosen"; color: #0a7; font-weight: 600; }
  kbd { border: 1px solid #ccc; border-radius: 3px; padding: 0 4px; font-size: 0.85em; }
  #coverage { color: #666; }
</style>

<h1>Take audition</h1>
<p>Pick a folder of candidates (<code>assets/candidates/</code>).</p>
<input type="file" id="picker" webkitdirectory directory multiple>

<p id="coverage">No folder loaded.</p>
<div id="asset"></div>
<ol id="takes"></ol>
<p>
  <kbd>1</kbd>–<kbd>9</kbd> audition · <kbd>Enter</kbd> choose last played ·
  <kbd>x</kbd> un-choose · <kbd>n</kbd>/<kbd>p</kbd> next/previous asset
</p>
<button id="export" disabled>Download selections.json</button>

<script type="module">
  import { assetIdOf, mergeSelections, selectionCoverage } from '../../packages/content/dist/audio-selection-merge.js';

  let assets = [];      // [{ id, takes: [{ name, url }] }]
  let index = 0;
  let selections = {};
  let lastPlayed = null;
  const audio = new Audio();

  document.getElementById('picker').addEventListener('change', (event) => {
    const byAsset = new Map();
    for (const file of event.target.files) {
      if (!/\.(mp3|wav|ogg)$/u.test(file.name)) continue;
      // Path is <root>/<assetDir>/<take>. The asset id is the directory name.
      const parts = file.webkitRelativePath.split('/');
      const id = parts.length >= 2 ? parts[parts.length - 2] : assetIdOf(file.name);
      if (!byAsset.has(id)) byAsset.set(id, []);
      byAsset.get(id).push({ name: file.name, url: URL.createObjectURL(file) });
    }
    assets = [...byAsset.entries()]
      .map(([id, takes]) => ({ id, takes: takes.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    index = 0;
    document.getElementById('export').disabled = assets.length === 0;
    render();
  });

  function render() {
    const asset = assets[index];
    if (!asset) {
      document.getElementById('asset').textContent = 'Nothing loaded.';
      document.getElementById('takes').replaceChildren();
      return;
    }
    document.getElementById('asset').textContent =
      `${asset.id}  (${index + 1} of ${assets.length})`;

    const list = document.getElementById('takes');
    list.replaceChildren();
    asset.takes.forEach((take, i) => {
      const item = document.createElement('li');
      item.textContent = take.name;
      if (lastPlayed === i) item.classList.add('playing');
      if (selections[asset.id] === take.name) item.classList.add('chosen');
      item.addEventListener('click', () => play(i));
      list.append(item);
    });

    // selectionCoverage takes request-shaped objects; one per take is enough,
    // since it dedupes by asset id.
    const requests = assets.flatMap((a) => a.takes.map((t) => ({ id: `${a.id}-take1` })));
    const { total, chosen } = selectionCoverage(requests, selections);
    document.getElementById('coverage').textContent =
      `${chosen} of ${total} assets chosen — ${total - chosen} to go.`;
  }

  function play(i) {
    const take = assets[index]?.takes[i];
    if (!take) return;
    lastPlayed = i;
    audio.src = take.url;
    void audio.play();
    render();
  }

  function choose() {
    const asset = assets[index];
    if (!asset || lastPlayed === null) return;
    selections = mergeSelections(selections, { [asset.id]: asset.takes[lastPlayed].name });
    render();
  }

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key >= '1' && event.key <= '9') play(Number(event.key) - 1);
    else if (event.key === 'Enter') choose();
    else if (event.key === 'x') {
      const asset = assets[index];
      if (asset) { selections = mergeSelections(selections, { [asset.id]: null }); render(); }
    } else if (event.key === 'n') { index = Math.min(index + 1, assets.length - 1); lastPlayed = null; render(); }
    else if (event.key === 'p') { index = Math.max(index - 1, 0); lastPlayed = null; render(); }
  });

  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(selections, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'selections.json';
    link.click();
  });
</script>
```

The page imports the **leaf** module from `dist/`, never `dist/index.js`: `index.js` re-exports the filesystem-reading loader (contracts §5 notes this), and a browser would fail on `node:fs`. `dist/` is gitignored, so run `npm run typecheck` before opening the page.

- [ ] **Step 6: Verify the page loads**

```bash
npx --yes http-server tools/audition -p 8099 --no-dotfiles
```

Open `http://localhost:8099`, confirm the page renders and the keyboard bindings respond with an empty selection set. This step is manual; there is nothing to assert automatically about a file-picker UI.

- [ ] **Step 7: Run the full gate and commit**

```bash
npm run verify
git add tools packages/content
git commit -m "feat(audio): audition harness for choosing among takes

sound-design §9.6: generation is cheap and selection is not — six takes across
~250 voice lines is 1,500 auditions, and that number decides whether the barks
are funny. Keyboard-driven beats a file browser.

The merge and coverage logic is a separate pure module the page imports directly,
so the tested code and the running code are the same code. An explicit null
un-chooses, because takes that sound fine alone often do not survive being heard
next to their neighbours.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The explain-channel consumer note

Records sound-design §10.1's finding where the people who will fix the payload shape are looking. This is the only task that edits a governance document, and it is deliberately last and small.

**Files:**
- Modify: `docs/design/contracts.md` (§4.4)

- [ ] **Step 1: Add the note**

In `docs/design/contracts.md` §4.4, after the paragraph ending "no simulation behaviour may depend on whether it was requested.", add:

```markdown
**Consumer note, added while drafting `docs/design/sound-design.md` (§10.1).** The core's guarantee
above is unchanged and should stay. But a planned consumer — the client's bark system — wants
*per-mage decision reasons at world-tick granularity*, which is a different shape from *on-demand
explanation of one decision*. Two consequences, neither urgent:

- Whoever pins the explain channel's payload in `agent-interface` should know that shape is wanted,
  because it is much cheaper to know before the format is fixed than after.
- `electron-client` should treat the channel as required for its own read path even though the core
  keeps it optional. A client that skipped it to save bandwidth would ship a game where mages are
  silent about why they act — which is the exact failure this section exists to prevent, arriving
  through a door nobody was watching.
```

- [ ] **Step 2: Verify nothing else moved**

```bash
git diff --stat docs/design/contracts.md
```

Expected: one file changed, additions only.

- [ ] **Step 3: Run the full gate and commit**

```bash
npm run verify
git add docs/design/contracts.md
git commit -m "docs(contracts): note what the explain channel's payload shape is wanted for

§4.4 keeps the channel optional for the core, correctly. But barks want per-mage
reasons at tick granularity, which is a different shape from on-demand
single-decision explanation, and it is far cheaper to know that before the format
is pinned in agent-interface than after.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After the plan

Open the pull request to `main` once all seven tasks are green. Both status checks must pass — GitHub Actions and `ci/hetzner-lint`.

Then the batch job is a single command, and it is the first thing in this project that costs money:

```bash
export ELEVENLABS_API_KEY=...        # never written to a file in this repo
npm run audio:generate -- --dry-run  # confirm the plan first
npm run audio:generate -- --takes=6
```

**Start with `--only=click-` and audition those 30 assets before generating anything else.** The clicks are §11's highest-value layer, they are the fastest to judge, and if the palette in §1 is wrong they are where it will be obvious — for about a dollar rather than for the whole library.

## What this plan does not build

Stated so the gap is deliberate rather than discovered later:

- **No playback.** There is no audio engine, no mixer, no scheduler, and no beat grid implementation. All of that is `electron-client` (0.13.0), which is proposal-only, and sound-design §10 is the list of what it will need from the read path. This is also why §0.3's accessibility floor — every sonified state change has a visual equivalent in the same frame — has no task here: there is no frame yet. It belongs in `electron-client`'s spec, and it is a requirement rather than an option.
- **No key derivation.** §1.1 makes the universe's root and mode a pure function of `rootSeed`, in the same family as `audioSelect` and cheap to add. It is left out because nothing consumes it until there is a synthesiser to tune, and a pinned function with no caller is a function that drifts from the design without anyone noticing.
- **No selected-take pipeline.** Task 6 exports `selections.json`; converting chosen takes to a shipping format and committing them under `assets/selected/` needs a format decision (Opus at what bitrate) that is better made with real files in hand.
- **Nothing from Appendix A.** The on-beat input layer stays designed-and-not-proposed, and would need a vision §12 amendment and an answer from the balance-harness owner first.
