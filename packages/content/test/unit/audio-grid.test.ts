/*
 * Multiverse Mages — the audio grid stays in step with shipped content.
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
    // raid-world-pulse is raid-kind but not a primitive — it is §3.5's world
    // clock heard from inside a raid — so it is exempt from this mapping.
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

  it('puts every envelope and material in the granular tier', () => {
    // sound-design §0.8: envelopes and form materials are grain sources the
    // client recombines per event. Marking one `rendered` would mean a single
    // chosen take played whole, which discards the unbounded variation that is
    // the entire reason the compositional grid exists — and nothing about the
    // sound would look wrong in a diff.
    for (const cue of cues) {
      if (cue.kind !== 'technique-envelope' && cue.kind !== 'form-material') continue;
      expect(cue.production, `${cue.id} production tier`).toBe('granular');
    }
  });

  it('never marks a bark-adjacent ceremonial cue synthesised', () => {
    // The rendered tier is small on purpose: these are heard a handful of times
    // a run, where fidelity beats variation and sameness is part of the weight.
    for (const id of ['click-seal', 'knowledge-last-instance-loss']) {
      expect(cues.find((c) => c.id === id)?.production, id).toBe('rendered');
    }
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
  'world-tempo',
  'research', 'discovery', 'teaching', 'scribing', 'grimoire-complete',
  'theft', 'rediscovery', 'mage-death',
];

/** Primitives that occupy raid space (sound-design §7.1); the rest are world-scale. */
const COMBAT_PRIMITIVES = ['direct-damage', 'ward', 'area-denial', 'blink', 'summon'];
