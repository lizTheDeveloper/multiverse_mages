/*
 * Multiverse Mages — effect gathering, single-point legality, and scale routing.
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

import { TIME_MODE } from '@mm/sim-core';
import type { ContentId, ContentRegistry, PrimitiveScale } from '@mm/content';
import { LOCATION_KIND } from '@mm/state';
import { describe, expect, it } from 'vitest';

import {
  CONTRIBUTING_LOCATION_KINDS,
  MASTERY_ACTIVATION_THRESHOLD,
  gatherEffects,
} from '../../src/effects/index.js';

import {
  cellIdOfNode,
  countingCellOf,
  mindInstance,
  permissiveRuleset,
  rulesetInterdicting,
  shippedRegistry,
  v1Nodes,
  worldActiveNodesInDistinctCells,
} from './effect-fixtures.js';

/**
 * A v1 node declaring some primitive of the given scale, plus that primitive's
 * id. Searched rather than named — see `fixtures.ts`.
 */
function nodeForScale(
  registry: ContentRegistry,
  scale: PrimitiveScale,
): { readonly nodeId: ContentId; readonly primitiveId: string } {
  const ofScale = new Set(
    registry.primitives.filter((entry) => entry.record.scale === scale).map((entry) => entry.record.id),
  );
  for (const node of v1Nodes(registry)) {
    for (const effect of node.record.effects) {
      if (ofScale.has(effect.primitive)) {
        return { nodeId: node.contentId, primitiveId: effect.primitive };
      }
    }
  }
  throw new Error(`no v1 node declares a "${scale}"-scale primitive`);
}


describe('effects are sourced from usable knowledge instances', () => {
  it('gathers from a held mind instance at the activation threshold', () => {
    const registry = shippedRegistry();
    const { nodeId, primitiveId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    expect(gathered.map((contribution) => contribution.primitiveId)).toContain(primitiveId);
    expect(gathered.every((contribution) => contribution.nodeId === nodeId)).toBe(true);
  });

  it('gathers from a palace instance, which is the Art of Memory store', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects(
      [{ nodeId, locationKind: LOCATION_KIND.palace, mastery: MASTERY_ACTIVATION_THRESHOLD }],
      {
        registry,
        ruleset: permissiveRuleset(),
        mode: TIME_MODE.world,
        cellOf: countingCellOf(registry),
      },
    );

    expect(gathered.length).toBeGreaterThan(0);
  });

  it('contributes nothing below the activation threshold', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects(
      [mindInstance(nodeId, MASTERY_ACTIVATION_THRESHOLD - 1)],
      {
        registry,
        ruleset: permissiveRuleset(),
        mode: TIME_MODE.world,
        cellOf: countingCellOf(registry),
      },
    );

    expect(gathered).toEqual([]);
  });

  it('contributes nothing from a dormant instance, and leaves it untouched', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');
    const instance = mindInstance(nodeId);
    const before = { ...instance };

    const gathered = gatherEffects([instance], {
      registry,
      ruleset: rulesetInterdicting(cellIdOfNode(registry, nodeId)),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    expect(gathered).toEqual([]);
    expect(instance).toEqual(before);
  });

  it('names mind and palace as the only contributing locations', () => {
    expect([...CONTRIBUTING_LOCATION_KINDS].sort((a, b) => a - b)).toEqual([
      LOCATION_KIND.mind,
      LOCATION_KIND.palace,
    ]);
  });
});

/**
 * Half of `magic-primitives`' written-instance requirement is asserted here:
 * that a grimoire or a library instance contributes *nothing* directly. The
 * other half — that a library's influence appears through `libraryDepth` and
 * only there — is task 4.12's function to publish, and its test belongs beside
 * it. Splitting it is deliberate: this file must not grow an import of a
 * module another task group owns, and "books are not a second, invisible source
 * of power" is exactly the negative claim below.
 */
describe('written instances produce no direct contribution', () => {
  it('ignores grimoire and library instances of an effect-bearing node', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects(
      [
        { nodeId, locationKind: LOCATION_KIND.grimoire, mastery: MASTERY_ACTIVATION_THRESHOLD },
        { nodeId, locationKind: LOCATION_KIND.library, mastery: MASTERY_ACTIVATION_THRESHOLD },
      ],
      {
        registry,
        ruleset: permissiveRuleset(),
        mode: TIME_MODE.world,
        cellOf: countingCellOf(registry),
      },
    );

    expect(gathered).toEqual([]);
  });

  it('still gathers the same node from a mind, so the shelf is what is inert', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');

    const shelved = gatherEffects(
      [{ nodeId, locationKind: LOCATION_KIND.library, mastery: MASTERY_ACTIVATION_THRESHOLD }],
      {
        registry,
        ruleset: permissiveRuleset(),
        mode: TIME_MODE.world,
        cellOf: countingCellOf(registry),
      },
    );
    const held = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    expect(shelved).toEqual([]);
    expect(held.length).toBeGreaterThan(0);
  });
});

describe('legality is evaluated once per candidate and carried nowhere', () => {
  it('drops an interdicted node before it becomes a contribution', () => {
    const registry = shippedRegistry();
    const [first, second, third] = worldActiveNodesInDistinctCells(registry, 3);
    expect(third).toBeDefined();
    if (first === undefined || second === undefined || third === undefined) return;

    // Not `.map(mindInstance)`: map passes the index as the second argument,
    // which would land in the mastery parameter and put every instance below
    // the activation threshold — a green-looking test measuring nothing.
    const instances = [first, second, third].map((nodeId) => mindInstance(nodeId));
    const legal = gatherEffects(instances, {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });
    const gathered = gatherEffects(instances, {
      registry,
      ruleset: rulesetInterdicting(cellIdOfNode(registry, third)),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    const contributingNodes = new Set(gathered.map((contribution) => contribution.nodeId));
    expect(new Set(legal.map((contribution) => contribution.nodeId)).size).toBe(3);
    expect(contributingNodes.has(third)).toBe(false);
    expect(contributingNodes).toEqual(new Set([first, second]));
  });

  it('carries no legality field forward for a consumer to re-test', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    const [contribution] = gathered;
    expect(contribution).toBeDefined();
    if (contribution === undefined) return;

    expect(Object.keys(contribution).sort()).toEqual([
      'durationTicks',
      'magnitude',
      'nodeId',
      'primitiveId',
      'target',
    ]);
  });

  it('resolves each candidate instance cell exactly once', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');
    const cellOf = countingCellOf(registry);

    const gathered = gatherEffects([mindInstance(nodeId), mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf,
    });

    // Two usable instances, two resolutions — not one per contribution, and not
    // one more when the caller reads the result.
    expect(cellOf.calls).toBe(2);
    expect(gathered.length).toBeGreaterThan(0);
    void gathered.map((contribution) => contribution.magnitude);
    expect(cellOf.calls).toBe(2);
  });

  it('does not resolve a cell for an instance that is not usable at all', () => {
    const registry = shippedRegistry();
    const { nodeId } = nodeForScale(registry, 'world');
    const cellOf = countingCellOf(registry);

    gatherEffects(
      [{ nodeId, locationKind: LOCATION_KIND.grimoire, mastery: MASTERY_ACTIVATION_THRESHOLD }],
      { registry, ruleset: permissiveRuleset(), mode: TIME_MODE.world, cellOf },
    );

    expect(cellOf.calls).toBe(0);
  });
});

describe('effects route by the scale declared in the registry', () => {
  it('makes a world-scale effect inert during engagement', () => {
    const registry = shippedRegistry();
    const { nodeId, primitiveId } = nodeForScale(registry, 'world');

    const gathered = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.engagement,
      cellOf: countingCellOf(registry),
    });

    expect(gathered.map((contribution) => contribution.primitiveId)).not.toContain(primitiveId);
  });

  it('makes an engagement-scale effect inert at world scale', () => {
    const registry = shippedRegistry();
    const { nodeId, primitiveId } = nodeForScale(registry, 'engagement');

    const gathered = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    expect(gathered.map((contribution) => contribution.primitiveId)).not.toContain(primitiveId);
  });

  it('applies a `both`-scale effect in either mode', () => {
    const registry = shippedRegistry();
    const { nodeId, primitiveId } = nodeForScale(registry, 'both');
    const shared = {
      registry,
      ruleset: permissiveRuleset(),
      cellOf: countingCellOf(registry),
    } as const;

    const inWorld = gatherEffects([mindInstance(nodeId)], { ...shared, mode: TIME_MODE.world });
    const inEngagement = gatherEffects([mindInstance(nodeId)], {
      ...shared,
      mode: TIME_MODE.engagement,
    });

    expect(inWorld.map((contribution) => contribution.primitiveId)).toContain(primitiveId);
    expect(inEngagement.map((contribution) => contribution.primitiveId)).toContain(primitiveId);
  });

  it('routes every primitive the registry declares, with no unrouted scale', () => {
    const registry = shippedRegistry();
    const scales = new Set(registry.primitives.map((entry) => entry.record.scale));
    expect([...scales].sort()).toEqual(['both', 'engagement', 'world']);
  });
});

describe('the gathered set is a deterministic function of its inputs', () => {
  it('preserves instance order, then the node’s declared effect order', () => {
    const registry = shippedRegistry();
    const [first, second] = worldActiveNodesInDistinctCells(registry, 2);
    if (first === undefined || second === undefined) return;

    const gathered = gatherEffects([mindInstance(first), mindInstance(second)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: countingCellOf(registry),
    });

    const nodeOrder = gathered.map((contribution) => contribution.nodeId);
    const firstRun = nodeOrder.filter((nodeId) => nodeId === first).length;
    expect(nodeOrder.slice(0, firstRun).every((nodeId) => nodeId === first)).toBe(true);
    expect(nodeOrder.slice(firstRun).every((nodeId) => nodeId === second)).toBe(true);

    const firstRecord = registry.node(first);
    expect(firstRecord).toBeDefined();
    if (firstRecord === undefined) return;
    const declared = firstRecord.effects
      .filter((effect) => {
        const primitive = registry.primitives.find((entry) => entry.record.id === effect.primitive);
        return primitive?.record.scale !== 'engagement';
      })
      .map((effect) => effect.primitive);
    expect(gathered.slice(0, firstRun).map((contribution) => contribution.primitiveId)).toEqual(
      declared,
    );
  });
});

/**
 * The optional cost term rides on the contribution, unread.
 *
 * `gather.ts` may not interpret a displacement any more than it may combine a
 * magnitude: which consumer spends it, and what spending it means, are
 * decisions that live downstream. What is asserted here is only that the field
 * survives the journey when it exists and leaves no trace when it does not —
 * the second of which is what keeps three hundred pure-bonus effects behaving
 * exactly as they did before the field was invented.
 */
describe('an effect’s authored displacement', () => {
  /** A v1 node carrying an effect with a displacement, searched rather than named. */
  function displacingNode(registry: ContentRegistry): ContentId {
    for (const node of v1Nodes(registry)) {
      if (node.record.effects.some((effect) => effect.displacement !== undefined)) {
        return node.contentId;
      }
    }
    throw new Error(
      'no v1 node carries a displacement; the shipped content dropped every authored cost',
    );
  }

  /** A v1 node whose every effect is a pure bonus. */
  function pureBonusNode(registry: ContentRegistry): ContentId {
    for (const node of v1Nodes(registry)) {
      if (node.record.effects.every((effect) => effect.displacement === undefined)) {
        return node.contentId;
      }
    }
    throw new Error('every v1 node carries a displacement, which no author intended');
  }

  it('reaches the contribution unchanged', () => {
    const registry = shippedRegistry();
    const nodeId = displacingNode(registry);
    const authored = registry.nodes
      .find((entry) => entry.contentId === nodeId)
      ?.record.effects.find((effect) => effect.displacement !== undefined)?.displacement;

    const contributions = gatherEffects([mindInstance(nodeId)], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: (id) => cellIdOfNode(registry, id),
    });

    const carried = contributions.find((entry) => entry.displacement !== undefined);
    expect(carried?.displacement).toEqual(authored);
  });

  it('is an absent key, not an undefined one, when the effect is a pure bonus', () => {
    const registry = shippedRegistry();
    const contributions = gatherEffects([mindInstance(pureBonusNode(registry))], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: (id) => cellIdOfNode(registry, id),
    });

    expect(contributions.length).toBeGreaterThan(0);
    for (const contribution of contributions) {
      // `in` rather than `=== undefined`: an explicit `undefined` would read
      // the same to every consumer and serialize differently, and the point of
      // the optional field is that an effect authored before it existed carries
      // no trace of it at all.
      expect('displacement' in contribution).toBe(false);
    }
  });
});
