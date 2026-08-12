/*
 * Multiverse Mages — W20's effect-mode dispatch, proven at engagement scale.
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
 * `docs/design/compositional-content.md` §3.3 gives every effect a required
 * `mode` — the technique's envelope, made mechanical — and this file proves
 * the four claims the task that added it makes about engagement scale:
 *
 * 1. A `control`-mode ward does not stack as a magnitude at all — never a
 *    guaranteed 90% prevention from a placeholder `magnitude`.
 * 2. A `control`-mode `knowledge-steal` is not a guaranteed theft.
 * 3. `portal`'s presence gate is mode-aware: `create`/`control` open it,
 *    `remove` never does, whatever else the holder knows.
 * 4. A latent effect (`when` other than `{kind:"always"}`) never fires in a
 *    raid — the reveal/latent decision `arbitration.ts`'s docblock records.
 *
 * Plus `transform`, which is not gridded into v1 but is implemented and
 * tested per the task anyway: it subtracts from its own primitive and adds
 * to `transformTo`.
 *
 * Every fixture here is hand-built (`mode-fixture.ts`) rather than the
 * shipped content set — see that file's docblock for why.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, RNG_STREAM, createState, rngFromRootSeed } from '@mm/sim-core';
import type { RulesetSnapshot } from '@mm/state';
import { LOCATION_KIND, MAGE, attachRecord, defineWorldStateSchema } from '@mm/state';
import {
  CASTABLE_MASTERY,
  CastArbiter,
  contributesMagnitude,
  enablesGate,
  portalGate,
} from '@mm/rules-raid';

import { buildModeFixture, effect } from './mode-fixture.js';

/** A ruleset permitting every technique and form — nothing under test is about legality. */
function permissiveRuleset(): RulesetSnapshot {
  return Object.freeze({
    permittedTechniques: 0b11111,
    permittedForms: (1 << 14) - 1,
    edicts: [],
    traditionId: 1,
    contentRevision: 'a'.repeat(32),
  });
}

function arbiterFor(fixture: ReturnType<typeof buildModeFixture>): CastArbiter {
  return new CastArbiter({
    hostRuleset: permissiveRuleset(),
    grid: fixture.grid,
    registry: fixture.registry,
    tuning: { castVigorBase: 0, castVigorPerTier: 0 },
  });
}

const HELD = (nodeId: number) => [{ nodeId, locationKind: LOCATION_KIND.mind, mastery: FP_ONE }];

describe('control mode: no magnitude, only a clamp (task: ward)', () => {
  it('a bare control-mode ward contributes nothing — not a 100% ward', () => {
    const fixture = buildModeFixture([
      {
        id: 'rego-only-control',
        technique: 'rego',
        form: 'terram',
        // The exact shape the bug report describes: a placeholder magnitude
        // on a control effect, which must never reach the ward stack.
        effects: [effect({ primitive: 'ward', mode: 'control', magnitude: 1024, control: { ceiling: 1024 } })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds;
    const defences = arbiter.passiveDefences(HELD(nodeId as number), CASTABLE_MASTERY, 0);
    // Before this change this would have stacked to the §3 cap of fp(922) —
    // 90% damage prevention from a node that grants no ward magnitude at all.
    expect(defences.ward).toBe(0);
  });

  it('a control ceiling bounds a real ward source below what it would otherwise stack to', () => {
    const fixture = buildModeFixture([
      { id: 'creo-source', technique: 'creo', form: 'terram', effects: [effect({ primitive: 'ward', mode: 'create', magnitude: 300 })] },
      { id: 'rego-ceiling', technique: 'rego', form: 'terram', effects: [effect({ primitive: 'ward', mode: 'control', magnitude: 1024, control: { ceiling: 200 } })] },
    ]);
    const arbiter = arbiterFor(fixture);
    const [sourceId, ceilingId] = fixture.nodeIds as [number, number];

    const sourceAlone = arbiter.passiveDefences(HELD(sourceId), CASTABLE_MASTERY, 0);
    expect(sourceAlone.ward).toBe(300);

    const withCeiling = arbiter.passiveDefences([...HELD(sourceId), ...HELD(ceilingId)], CASTABLE_MASTERY, 0);
    expect(withCeiling.ward).toBe(200);
  });

  it('a control floor raises a weak ward source — reliability bought, per the design', () => {
    const fixture = buildModeFixture([
      { id: 'creo-weak', technique: 'creo', form: 'terram', effects: [effect({ primitive: 'ward', mode: 'create', magnitude: 100 })] },
      { id: 'rego-floor', technique: 'rego', form: 'terram', effects: [effect({ primitive: 'ward', mode: 'control', magnitude: 1024, control: { floor: 250 } })] },
    ]);
    const arbiter = arbiterFor(fixture);
    const [sourceId, floorId] = fixture.nodeIds as [number, number];

    const withFloor = arbiter.passiveDefences([...HELD(sourceId), ...HELD(floorId)], CASTABLE_MASTERY, 0);
    expect(withFloor.ward).toBe(250);
  });
});

describe('control mode: no magnitude, only a clamp (task: knowledge-steal)', () => {
  it('a bare control-mode knowledge-steal contributes no probability magnitude', () => {
    const fixture = buildModeFixture([
      {
        id: 'rego-steal-control',
        technique: 'rego',
        form: 'nomen',
        effects: [effect({ primitive: 'knowledge-steal', mode: 'control', magnitude: 1024, control: { ceiling: 1024 } })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];

    // The centralised read `theftMagnitudes` promises: this is the direct
    // proof that a `control` effect's placeholder magnitude never reaches
    // the array `rollStackedProbability` draws against.
    expect(arbiter.theftMagnitudes(nodeId)).toEqual([]);
    expect(arbiter.theftControls(nodeId)).toEqual([{ ceiling: 1024 }]);
  });

  it('never succeeds across many draws when control is the only source — the opposite of guaranteed', () => {
    const fixture = buildModeFixture([
      {
        id: 'rego-steal-control',
        technique: 'rego',
        form: 'nomen',
        effects: [effect({ primitive: 'knowledge-steal', mode: 'control', magnitude: 1024, control: { ceiling: 1024 } })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    const magnitudes = arbiter.theftMagnitudes(nodeId);
    const controls = arbiter.theftControls(nodeId);

    const rng = rngFromRootSeed(0x1234);
    for (let tick = 0; tick < 20; tick += 1) {
      const stream = rng.actorStream(RNG_STREAM.knowledgeTheft, tick, tick);
      // A bare control source stacks (via `max` with no sources) to a
      // probability of zero, so every draw fails — the strongest possible
      // disproof of "a control-mode effect is a guaranteed steal".
      expect(arbiter.attemptTheft(nodeId, magnitudes, stream, controls)).toBe(false);
    }
  });
});

describe('transform: subtracts from its primitive, adds to transformTo (Muto, not in v1)', () => {
  it('the leaving side is negative', () => {
    const fixture = buildModeFixture([
      {
        id: 'muto-out',
        technique: 'muto',
        form: 'terram',
        effects: [effect({ primitive: 'knowledge-steal', mode: 'transform', magnitude: 300, transformTo: 'ward' })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    expect(arbiter.theftMagnitudes(nodeId)).toEqual([-300]);
  });

  it('the arriving side is positive, on the other primitive', () => {
    const fixture = buildModeFixture([
      {
        id: 'muto-in',
        technique: 'muto',
        form: 'terram',
        effects: [effect({ primitive: 'ward', mode: 'transform', magnitude: 300, transformTo: 'knowledge-steal' })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    expect(arbiter.theftMagnitudes(nodeId)).toEqual([300]);
  });

  it('contributes to neither primitive when a third is named', () => {
    const fixture = buildModeFixture([
      {
        id: 'muto-elsewhere',
        technique: 'muto',
        form: 'terram',
        effects: [effect({ primitive: 'concealment', mode: 'transform', magnitude: 300, transformTo: 'blink' })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    expect(arbiter.theftMagnitudes(nodeId)).toEqual([]);
  });
});

describe('the reveal/latent decision: a raid never activates a latent effect', () => {
  it('an always-on effect contributes normally', () => {
    const fixture = buildModeFixture([
      { id: 'creo-always', technique: 'creo', form: 'terram', effects: [effect({ primitive: 'ward', mode: 'create', magnitude: 400 })] },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    expect(arbiter.passiveDefences(HELD(nodeId), CASTABLE_MASTERY, 0).ward).toBe(400);
  });

  it('a `revealed` latent effect contributes nothing, whether or not a reveal is also held', () => {
    const fixture = buildModeFixture([
      {
        id: 'creo-latent',
        technique: 'creo',
        form: 'terram',
        effects: [effect({ primitive: 'ward', mode: 'create', magnitude: 400, when: { kind: 'revealed' } })],
      },
      {
        id: 'intellego-reveal',
        technique: 'intellego',
        form: 'terram',
        effects: [effect({ primitive: 'ward', mode: 'reveal', reveals: { primitive: 'ward' } })],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [latentId, revealId] = fixture.nodeIds as [number, number];

    expect(arbiter.passiveDefences(HELD(latentId), CASTABLE_MASTERY, 0).ward).toBe(0);
    // Holding the reveal too changes nothing: this package never activates a
    // latent effect, deliberately (see arbitration.ts's module docblock).
    const both = arbiter.passiveDefences([...HELD(latentId), ...HELD(revealId)], CASTABLE_MASTERY, 0);
    expect(both.ward).toBe(0);
  });

  it('a `holds-cell` conditional effect also contributes nothing in a raid', () => {
    const fixture = buildModeFixture([
      {
        id: 'creo-conditional',
        technique: 'creo',
        form: 'terram',
        effects: [
          effect({
            primitive: 'ward',
            mode: 'create',
            magnitude: 400,
            when: { kind: 'holds-cell', cell: 'rego-terram', minNodes: 1 },
          }),
        ],
      },
    ]);
    const arbiter = arbiterFor(fixture);
    const [nodeId] = fixture.nodeIds as [number];
    expect(arbiter.passiveDefences(HELD(nodeId), CASTABLE_MASTERY, 0).ward).toBe(0);
  });
});

describe('`enablesGate`: portal presence is mode-aware (task: portal)', () => {
  it('create and control open the gate; remove and reveal never do', () => {
    expect(enablesGate(effect({ primitive: 'portal', mode: 'create' }), 'portal')).toBe(true);
    expect(enablesGate(effect({ primitive: 'portal', mode: 'control', control: { floor: 1 } }), 'portal')).toBe(true);
    expect(enablesGate(effect({ primitive: 'portal', mode: 'remove' }), 'portal')).toBe(false);
    expect(enablesGate(effect({ primitive: 'portal', mode: 'reveal', reveals: { primitive: 'portal' } }), 'portal')).toBe(false);
  });

  it('a latent portal effect never opens the gate, whatever its mode', () => {
    expect(
      enablesGate(effect({ primitive: 'portal', mode: 'create', when: { kind: 'revealed' } }), 'portal'),
    ).toBe(false);
  });

  it('ignores effects on a different primitive', () => {
    expect(enablesGate(effect({ primitive: 'ward', mode: 'create' }), 'portal')).toBe(false);
  });
});

describe('portalGate: a remove-mode portal node does not enable raiding (task: portal)', () => {
  /** One living mage, holding whatever `heldOf` is told to report for her. */
  function worldWithOneMage(): ReturnType<typeof createState> {
    const world = createState({ rootSeed: 1, schema: defineWorldStateSchema(), contentRevision: 'a'.repeat(32) });
    const handle = world.entities.create();
    attachRecord(world, MAGE, handle, {
      speciesId: 1,
      birthTick: 0,
      roleId: 1,
      universityId: 0,
      curiosity: FP_ONE,
      ambition: FP_ONE,
      caution: FP_ONE,
      vigor: 64 * FP_ONE,
      maxVigor: 64 * FP_ONE,
      alive: 1,
    });
    return world;
  }

  it('refuses when the only portal-carrying node is remove-mode', () => {
    const fixture = buildModeFixture([
      // `portalGate` checks the fixed cell "rego-limen" for legality regardless
      // of which node actually carries `portal` (`PORTAL_CELL_ID` in
      // `portal.ts`), so every fixture here needs one, even unheld.
      { id: 'rego-limen-unrelated', technique: 'rego', form: 'limen', effects: [effect({ primitive: 'ward', mode: 'control', control: { ceiling: 1 } })] },
      { id: 'perdo-limen', technique: 'perdo', form: 'limen', effects: [effect({ primitive: 'portal', mode: 'remove', magnitude: 1024 })] },
    ]);
    const [, nodeId] = fixture.nodeIds as [number, number];
    const world = worldWithOneMage();

    const gate = portalGate({
      attackerWorld: world,
      attackerRuleset: permissiveRuleset(),
      registry: fixture.registry,
      grid: fixture.grid,
      favor: 100 * FP_ONE,
      favorCost: 8 * FP_ONE,
      alreadyEngaged: false,
      heldOf: () => HELD(nodeId),
    });
    expect(gate).toEqual({ open: false, refusal: 'knowledge-lost' });
  });

  it('opens on a create-mode portal node', () => {
    const fixture = buildModeFixture([
      { id: 'rego-limen-unrelated', technique: 'rego', form: 'limen', effects: [effect({ primitive: 'ward', mode: 'control', control: { ceiling: 1 } })] },
      { id: 'creo-limen', technique: 'creo', form: 'limen', effects: [effect({ primitive: 'portal', mode: 'create', magnitude: 1024 })] },
    ]);
    const [, nodeId] = fixture.nodeIds as [number, number];
    const world = worldWithOneMage();

    const gate = portalGate({
      attackerWorld: world,
      attackerRuleset: permissiveRuleset(),
      registry: fixture.registry,
      grid: fixture.grid,
      favor: 100 * FP_ONE,
      favorCost: 8 * FP_ONE,
      alreadyEngaged: false,
      heldOf: () => HELD(nodeId),
    });
    expect(gate).toEqual({ open: true, refusal: '' });
  });

  it('opens on a control-mode portal node — Rego is the portal cell', () => {
    const fixture = buildModeFixture([
      { id: 'rego-limen', technique: 'rego', form: 'limen', effects: [effect({ primitive: 'portal', mode: 'control', magnitude: 1024, control: { floor: 1024 } })] },
    ]);
    const [nodeId] = fixture.nodeIds as [number];
    const world = worldWithOneMage();

    const gate = portalGate({
      attackerWorld: world,
      attackerRuleset: permissiveRuleset(),
      registry: fixture.registry,
      grid: fixture.grid,
      favor: 100 * FP_ONE,
      favorCost: 8 * FP_ONE,
      alreadyEngaged: false,
      heldOf: () => HELD(nodeId),
    });
    expect(gate).toEqual({ open: true, refusal: '' });
  });
});

describe('`contributesMagnitude`: what raid.ts asks before selecting a node', () => {
  it('agrees with the magnitude table: create/remove/transform yes, control/reveal no', () => {
    expect(contributesMagnitude(effect({ primitive: 'direct-damage', mode: 'create' }), 'direct-damage')).toBe(true);
    expect(contributesMagnitude(effect({ primitive: 'direct-damage', mode: 'remove' }), 'direct-damage')).toBe(true);
    expect(
      contributesMagnitude(
        effect({ primitive: 'direct-damage', mode: 'transform', transformTo: 'blink' }),
        'direct-damage',
      ),
    ).toBe(true);
    expect(
      contributesMagnitude(effect({ primitive: 'ward', mode: 'transform', transformTo: 'direct-damage' }), 'direct-damage'),
    ).toBe(true);
    expect(
      contributesMagnitude(effect({ primitive: 'direct-damage', mode: 'control', control: { ceiling: 1 } }), 'direct-damage'),
    ).toBe(false);
    expect(
      contributesMagnitude(effect({ primitive: 'direct-damage', mode: 'reveal', reveals: { primitive: 'direct-damage' } }), 'direct-damage'),
    ).toBe(false);
  });

  it('is false for a latent effect regardless of mode', () => {
    expect(
      contributesMagnitude(
        effect({ primitive: 'direct-damage', mode: 'create', when: { kind: 'revealed' } }),
        'direct-damage',
      ),
    ).toBe(false);
  });
});
