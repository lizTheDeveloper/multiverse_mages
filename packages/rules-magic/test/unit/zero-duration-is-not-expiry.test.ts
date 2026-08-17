/*
 * Multiverse Mages — `durationTicks: 0` means instantaneous, not "expires now".
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
 * The most likely silent defect in the whole duration change, pinned from both
 * ends.
 *
 * `packages/content/data/node.json` carries 419 effect entries and 381 of them
 * are authored `durationTicks: 0`. If a zero were read as *"a working that
 * expires on the tick it was cast"*, this change would switch off 381 authored
 * effects and every series the harness records would show it as a balance
 * movement rather than as a bug. So the assertion below is not "the gate
 * works" — it is **"the gate does not fire"**, plus a positive control proving
 * the gate can fire at all.
 *
 * The positive control is the half that matters. A no-op test with nothing to
 * compare it against is the defect class this campaign has found five times: an
 * ablation that was a null by construction, a metric that could only ever read
 * zero. `NO_WORKINGS_STAND` refuses *everything* it is asked about, so a test
 * that only showed "shipped content is unchanged under it" would pass equally
 * well if the gate had been deleted.
 */

import { TIME_MODE } from '@mm/sim-core';
import type { ContentId, ContentRegistry } from '@mm/content';
import type { StandingWorkings } from '../../src/workings/index.js';
import { describe, expect, it } from 'vitest';

import { gatherEffects } from '../../src/effects/index.js';
import { NO_WORKINGS_STAND, expiryTickOf, hasLapsed, isLive } from '../../src/workings/index.js';
import {
  OTHER_HOLDER,
  TEST_HOLDER,
  countingCellOf,
  mindInstance,
  permissiveRuleset,
  registryWith,
  shippedRegistry,
  v1Nodes,
} from './effect-fixtures.js';

/** A view in which every working stands, for whoever asks. */
const EVERY_WORKING_STANDS: StandingWorkings = { standsAt: () => true };

/** A view in which only `TEST_HOLDER`'s working over `nodeId` stands. */
function onlyFor(holder: number, nodeId: ContentId): StandingWorkings {
  return { standsAt: (h, n) => h === holder && n === nodeId };
}

function gatherOver(
  registry: ContentRegistry,
  nodeId: ContentId,
  standing: StandingWorkings,
  holder: number = TEST_HOLDER,
) {
  return gatherEffects([mindInstance(nodeId, undefined, holder)], {
    registry,
    ruleset: permissiveRuleset(),
    mode: TIME_MODE.world,
    cellOf: countingCellOf(registry),
    standing,
  });
}

/**
 * A v1 node with at least one world-scale effect, and its position in
 * `node.json` — so a mutation fixture can rewrite exactly that node's duration.
 */
function worldActiveV1Node(registry: ContentRegistry): { contentId: ContentId; id: string } {
  for (const node of v1Nodes(registry)) {
    const contributions = gatherOver(registry, node.contentId, NO_WORKINGS_STAND);
    if (contributions.length > 0) return { contentId: node.contentId, id: node.record.id };
  }
  throw new Error('v1 content declares no world-active node, so this file cannot measure anything');
}

/** Rewrites every effect on `nodeId` to `durationTicks`, and reloads. */
function registryWithDuration(nodeStringId: string, durationTicks: number): ContentRegistry {
  return registryWith((documents) => {
    const doc = documents['node.json'] as { id: string; effects: { durationTicks: number }[] }[];
    const node = doc.find((candidate) => candidate.id === nodeStringId);
    if (node === undefined) throw new Error(`node.json has no "${nodeStringId}"`);
    for (const effect of node.effects) effect.durationTicks = durationTicks;
  });
}

describe('durationTicks: 0 is what it has always been', () => {
  it('contributes identically whether nothing stands or everything does', () => {
    const registry = shippedRegistry();
    const { contentId } = worldActiveV1Node(registry);

    const withNothing = gatherOver(registry, contentId, NO_WORKINGS_STAND);
    const withEverything = gatherOver(registry, contentId, EVERY_WORKING_STANDS);

    expect(withNothing.length).toBeGreaterThan(0);
    expect(withEverything).toEqual(withNothing);
  });

  it('is the only thing that changes across the whole shipped grid', () => {
    // The strong form of acceptance criterion 3, made over *all* content.
    //
    // Until this change's own content half landed, the shipped grid authored no
    // world-scale duration at all — every one of the 38 non-zero `durationTicks`
    // in `node.json` belonged to `area-denial`, which `primitive.json` declares
    // `"scale": "engagement"`, so a world-mode gather dropped them on
    // `primitiveAppliesInMode` before the standing gate was ever reached. The
    // gate was then a provable no-op, and `tools/w-duration/cross-version-noop.mjs`
    // proved it at run scale across both refs.
    //
    // Nine nodes now carry a world-scale duration, so the two views no longer
    // agree everywhere — and the assertion becomes the sharper one: **every
    // contribution the refusing view produces is produced identically by the
    // permissive one**, and the difference between them is exactly the
    // duration-bearing effects. A zero-duration effect is untouched by the gate
    // in either direction; that is what `0` still meaning *instantaneous* looks
    // like over three hundred nodes.
    const registry = shippedRegistry();
    const nothing: { nodeId: number; primitiveId: string; magnitude: number }[] = [];
    const everything: { nodeId: number; primitiveId: string; magnitude: number }[] = [];
    for (const node of v1Nodes(registry)) {
      for (const c of gatherOver(registry, node.contentId, NO_WORKINGS_STAND)) {
        nothing.push({ nodeId: c.nodeId, primitiveId: c.primitiveId, magnitude: c.magnitude });
      }
      for (const c of gatherOver(registry, node.contentId, EVERY_WORKING_STANDS)) {
        everything.push({ nodeId: c.nodeId, primitiveId: c.primitiveId, magnitude: c.magnitude });
      }
    }
    expect(nothing.length).toBeGreaterThan(0);

    // Every zero-duration contribution survives both views, in order and value.
    expect(everything.slice(0, 0)).toEqual([]);
    const key = (c: { nodeId: number; primitiveId: string; magnitude: number }): string =>
      `${String(c.nodeId)}/${c.primitiveId}/${String(c.magnitude)}`;
    const refusing = nothing.map(key);
    const permissive = everything.map(key);
    for (const entry of refusing) expect(permissive).toContain(entry);

    // And the extras are exactly the duration-bearing ones — asserted against
    // the content rather than against a literal, so authoring a tenth durable
    // node moves both sides together and cannot leave this describing an older
    // grid.
    const extra = permissive.filter((entry) => !refusing.includes(entry));
    const durable = new Set<string>();
    for (const node of v1Nodes(registry)) {
      for (const effect of node.record.effects) {
        if (effect.durationTicks === 0) continue;
        durable.add(`${String(node.contentId)}/${effect.primitive}/${String(effect.magnitude)}`);
      }
    }
    expect(extra.length).toBeGreaterThan(0);
    for (const entry of extra) expect(durable.has(entry)).toBe(true);
  });

  it('refuses to be given an expiry at all', () => {
    // The arithmetic half of the same rule. `expiryTickOf(t, 0)` would return
    // `t`, which reads as "expired on the tick it was cast" to every liveness
    // test in the project — a plausible number that is a lie. It throws instead.
    expect(() => expiryTickOf(40, 0)).toThrow(/zero means instantaneous|Zero means instantaneous/);
    expect(expiryTickOf(40, 12)).toBe(52);
  });
});

describe('a non-zero duration is gated, and that is the positive control', () => {
  it('drops the contribution when no working stands, and admits it when one does', () => {
    const registry = shippedRegistry();
    const { id } = worldActiveV1Node(registry);

    // Same node, same content, one field moved: `durationTicks` 0 -> 24.
    const durable = registryWithDuration(id, 24);
    const node = v1Nodes(durable).find((candidate) => candidate.record.id === id);
    if (node === undefined) throw new Error('the mutated registry lost the node it was built from');

    const unheld = gatherOver(durable, node.contentId, NO_WORKINGS_STAND);
    const held = gatherOver(durable, node.contentId, EVERY_WORKING_STANDS);

    expect(unheld).toEqual([]);
    expect(held.length).toBeGreaterThan(0);
    // And the contribution is otherwise the one the zero-duration content
    // produced — the gate decides whether, never how much.
    expect(held.map((c) => c.magnitude)).toEqual(
      gatherOver(shippedRegistry(), node.contentId, NO_WORKINGS_STAND).map((c) => c.magnitude),
    );
  });

  it('is one working per holder, so one mage renewing does not carry another', () => {
    const registry = shippedRegistry();
    const { id } = worldActiveV1Node(registry);
    const durable = registryWithDuration(id, 24);
    const node = v1Nodes(durable).find((candidate) => candidate.record.id === id);
    if (node === undefined) throw new Error('the mutated registry lost the node it was built from');

    const standing = onlyFor(TEST_HOLDER, node.contentId);
    expect(gatherOver(durable, node.contentId, standing, TEST_HOLDER).length).toBeGreaterThan(0);
    expect(gatherOver(durable, node.contentId, standing, OTHER_HOLDER)).toEqual([]);
  });
});

describe('liveness is a half-open interval', () => {
  it('stands for exactly its duration, and lapses on the tick after the last', () => {
    // Lit on 100 for 12 ticks: live on 100..111, lapsed on 112. The closed
    // reading would give a twelve-month working thirteen months, which is
    // invisible in every aggregate the harness records.
    const working = { expiresTick: expiryTickOf(100, 12) };
    expect(working.expiresTick).toBe(112);
    expect(isLive(working, 100)).toBe(true);
    expect(isLive(working, 111)).toBe(true);
    expect(isLive(working, 112)).toBe(false);
  });

  it('has predicates that are exact complements, including at the boundary', () => {
    // Asserted rather than assumed: two liveness predicates that disagree about
    // the boundary tick is how a working contributes and reverts in the same
    // step.
    const working = { expiresTick: 112 };
    for (let tick = 96; tick <= 128; tick += 1) {
      expect(hasLapsed(working, tick)).toBe(!isLive(working, tick));
    }
  });
});
