/*
 * Multiverse Mages — changing a universe's tradition is total.
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

import { describe, expect, it } from 'vitest';

import type { LocationKindValue } from '@mm/state';
import { LOCATION_KIND } from '@mm/state';

import type { InstanceView } from '../../src/traditions/index.js';
import { RESOLUTION, canHoldAt, changeTradition, storePolicy } from '../../src/traditions/index.js';

import { ART_OF_MEMORY, TRUE_NAMING, VANCIAN, ownHook } from './fixtures.js';

const STANDARD_STORE = ownHook('store', VANCIAN);
const PALACE_STORE = ownHook('store', ART_OF_MEMORY);
const WORLD_TICK = 480;

let nextInstance = 1;
function instance(nodeId: number, locationKind: LocationKindValue, locationId = 1): InstanceView {
  nextInstance += 1;
  return { instanceId: nextInstance, nodeId, locationKind, locationId };
}

describe('switching to a palace store', () => {
  const instances = [
    instance(10, LOCATION_KIND.mind),
    instance(11, LOCATION_KIND.grimoire, 40),
    instance(12, LOCATION_KIND.library, 7),
    instance(10, LOCATION_KIND.grimoire, 41),
  ];

  const result = changeTradition({
    outgoingStore: STANDARD_STORE,
    incomingStore: PALACE_STORE,
    instances,
    worldTick: WORLD_TICK,
  });

  it('applies', () => {
    expect(result.applied).toBe(true);
    expect(result.refusal).toBe('');
  });

  it('reports one resolution per instance, in the order supplied', () => {
    expect(result.resolutions.map((r) => r.instanceId)).toEqual(instances.map((i) => i.instanceId));
  });

  it('leaves no instance at a location the incoming kind cannot hold', () => {
    const incoming = storePolicy(PALACE_STORE);
    const surviving = result.resolutions.filter((r) => r.resolution === RESOLUTION.kept);
    for (const kept of surviving) expect(canHoldAt(incoming, kept.locationKind)).toBe(true);
    expect(surviving.map((r) => r.locationKind)).toEqual([LOCATION_KIND.mind]);
  });

  it('destroys every written instance and says which kind refused it', () => {
    const destroyed = result.resolutions.filter((r) => r.resolution === RESOLUTION.destroyed);
    expect(destroyed).toHaveLength(3);
    for (const gone of destroyed) expect(gone.reason).toContain('palace');
  });

  it('does not cost a mage what she personally knows', () => {
    // `mind` is holdable under every kind in the enumeration. The palace
    // replaces the grimoire, not the head.
    expect(result.destroyed).not.toContain(instances[0]?.instanceId);
  });

  it('emits a loss only for the node whose last instance went', () => {
    // Node 10 also had a mind instance, which survives, so node 10 has not left
    // the universe. Nodes 11 and 12 have.
    expect(result.losses.map((loss) => loss.nodeId).sort()).toEqual([11, 12]);
  });

  it('names the node, the world tick, and the location kind in a loss', () => {
    const loss = result.losses.find((event) => event.nodeId === 12);
    expect(loss).toEqual({
      nodeId: 12,
      worldTick: WORLD_TICK,
      locationKind: LOCATION_KIND.library,
    });
  });
});

describe('switching away from a palace store', () => {
  const instances = [
    instance(20, LOCATION_KIND.palace, 3),
    instance(21, LOCATION_KIND.palace, 3),
    instance(20, LOCATION_KIND.mind, 3),
  ];

  const result = changeTradition({
    outgoingStore: PALACE_STORE,
    incomingStore: STANDARD_STORE,
    instances,
    worldTick: WORLD_TICK,
  });

  it('leaves nothing at locationKind palace', () => {
    const surviving = result.resolutions.filter((r) => r.resolution === RESOLUTION.kept);
    expect(surviving.some((r) => r.locationKind === LOCATION_KIND.palace)).toBe(false);
  });

  it('reports the loss of the node that lived only in a palace', () => {
    expect(result.losses.map((loss) => loss.nodeId)).toEqual([21]);
  });
});

describe('a loss from a tradition change is an ordinary loss', () => {
  it('carries the same three fields any other loss event carries', () => {
    const result = changeTradition({
      outgoingStore: STANDARD_STORE,
      incomingStore: PALACE_STORE,
      instances: [instance(30, LOCATION_KIND.grimoire, 9)],
      worldTick: 12,
    });
    // Indistinguishable in form is the requirement: a consumer that could tell
    // god-caused loss from any other would end up accounting for it separately,
    // which is exactly the bookkeeping that hides how expensive the god's own
    // switch is.
    expect(Object.keys(result.losses[0] ?? {}).sort()).toEqual([
      'locationKind',
      'nodeId',
      'worldTick',
    ]);
  });
});

describe('the operation is atomic', () => {
  it('describes no change at all when it refuses', () => {
    // An instance the *outgoing* tradition cannot hold means an earlier change
    // was partial. Resolving on top of that would launder the older defect into
    // a deliberate-looking destruction.
    const result = changeTradition({
      outgoingStore: PALACE_STORE,
      incomingStore: STANDARD_STORE,
      instances: [instance(40, LOCATION_KIND.palace), instance(41, LOCATION_KIND.grimoire, 5)],
      worldTick: WORLD_TICK,
    });

    expect(result.applied).toBe(false);
    expect(result.resolutions).toEqual([]);
    expect(result.destroyed).toEqual([]);
    expect(result.losses).toEqual([]);
    expect(result.refusal).toMatch(/does not hold/);
  });

  it('does not mutate the instances it was given', () => {
    const instances = [instance(50, LOCATION_KIND.grimoire, 2)];
    const before = structuredClone(instances);
    changeTradition({
      outgoingStore: STANDARD_STORE,
      incomingStore: PALACE_STORE,
      instances,
      worldTick: WORLD_TICK,
    });
    expect(instances).toEqual(before);
  });
});

describe('a change between two traditions that store knowledge alike', () => {
  it('is allowed, and costs the knowledge nothing', () => {
    // Vancian and True Naming both store the standard way; they differ at
    // `acquire`. Refusing this would make the store hook the arbiter of whether
    // a tradition change is a tradition change at all.
    const result = changeTradition({
      outgoingStore: STANDARD_STORE,
      incomingStore: ownHook('store', TRUE_NAMING),
      instances: [instance(60, LOCATION_KIND.grimoire, 1), instance(60, LOCATION_KIND.mind)],
      worldTick: WORLD_TICK,
    });

    expect(result.applied).toBe(true);
    expect(result.destroyed).toEqual([]);
    expect(result.losses).toEqual([]);
    expect(result.resolutions.every((r) => r.resolution === RESOLUTION.kept)).toBe(true);
  });
});

describe('an empty universe', () => {
  it('changes tradition with nothing to resolve', () => {
    const result = changeTradition({
      outgoingStore: STANDARD_STORE,
      incomingStore: PALACE_STORE,
      instances: [],
      worldTick: WORLD_TICK,
    });
    expect(result).toEqual({
      applied: true,
      resolutions: [],
      destroyed: [],
      losses: [],
      refusal: '',
    });
  });
});
