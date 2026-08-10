/*
 * Multiverse Mages — the worlds the golden replay fixtures were recorded in.
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

import type { StepContext, System, WorldSchema } from '@mm/sim-core';
import {
  FP_ONE,
  RNG_STREAM,
  TIME_MODE,
  defineWorld,
  eraOf,
  mul,
  nextBounded,
} from '@mm/sim-core';

/**
 * ## Why the worlds live in the repository and not in the fixtures
 *
 * A golden fixture is a snapshot, an action log, and a hash. It deliberately
 * does **not** carry the rules that produced it: systems are functions, and a
 * fixture that shipped its own copy of them could never fail, because it would
 * always be replayed against exactly the code that wrote it. The whole value of
 * the check is that yesterday's recording meets today's rules — so the rules
 * are here, in version control, where a change to them shows up as a diff next
 * to the fixture it breaks.
 *
 * A fixture names its world by key. Renaming a key, or changing what a system
 * does, is therefore a deliberate act with a visible consequence: either the
 * fixture fails to load, or it fails to reproduce, and both belong in the
 * change that caused them.
 *
 * ## These are stand-in rules, on purpose
 *
 * None of this is the game. `sim-core-foundation` builds the substrate; mages,
 * knowledge, and raids arrive in later changes. What these systems exercise is
 * the substrate's determinism surface, and each line below is here because it
 * is a way a run can stop being reproducible:
 *
 * - per-tick and per-actor RNG streams, so a reordered draw shows up;
 * - entity creation and destruction, so slot reuse and the free list's LIFO
 *   order are exercised across a save/load;
 * - sparse component membership, so the snapshot's canonical slot ordering is
 *   exercised against storage whose row order is genuinely scrambled;
 * - fixed-point multiplication, so the float ban has something to protect;
 * - both clock scales, so a mode transition is inside the replayed window.
 *
 * When real rules exist, these fixtures should be replaced by ones recorded in
 * real worlds. Until then they are what stands between the substrate and a
 * silent determinism regression.
 */

/** Action kinds the golden worlds understand, above the core's own. */
export const GOLDEN_ACTION = {
  /** Found a settlement / muster a warrior, depending on the world. */
  spawn: 1,
  /** Destroy whatever occupies the slot named by `params[0]`. */
  cull: 2,
  /** Promote the entity in slot `params[0]`, if it carries standing. */
  promote: 3,
} as const;

const realm = { name: 'realm', fields: { souls: 'u32', peakEra: 'u16' } } as const;
const vitality = { name: 'vitality', fields: { hp: 'i32', shield: 'u16' } } as const;
const standing = { name: 'standing', fields: { rank: 'u8', renown: 'i32' } } as const;

/** Growth per world tick, as a fixed-point factor a shade above 1. */
const GROWTH = FP_ONE + 24;

/**
 * Ceiling on a realm's population.
 *
 * Not flavour: `mul` refuses a product it cannot compute exactly, so an
 * unbounded compounding growth would eventually throw mid-fixture. A fixture
 * that fails by exception rather than by hash tells you nothing about
 * determinism.
 */
const SOULS_CEILING = 1000000;

/**
 * World time only: realms accumulate souls month by month and record the era
 * they reached.
 *
 * `peakEra` is written from {@link eraOf} rather than counted, which is what
 * makes this world a check on the clock: a snapshot that restored `worldTick`
 * incorrectly would show up here as a wrong era rather than as nothing at all.
 */
const demography: System = {
  name: 'demography',
  run(ctx: StepContext) {
    const realms = ctx.state.component('realm');
    if (realms.size === 0) {
      return;
    }
    const stream = ctx.rng.stream(RNG_STREAM.populace, ctx.tick);
    const souls = realms.field('souls');
    const peakEra = realms.field('peakEra');
    const era = eraOf(ctx.state.clock.worldTick);

    realms.forEach((row) => {
      const grown = mul(Math.min(souls[row] as number, SOULS_CEILING), GROWTH);
      souls[row] = Math.min(grown + nextBounded(stream, 12), SOULS_CEILING) >>> 0;
      peakEra[row] = era;
    });
  },
};

/** Founds realms and razes them, on action. */
const settlement: System = {
  name: 'settlement',
  run(ctx: StepContext) {
    const realms = ctx.state.component('realm');
    for (const action of ctx.actions) {
      if (action.kind === GOLDEN_ACTION.spawn) {
        const handle = ctx.state.entities.create();
        realms.add(handle);
        realms.set(handle, 'souls', 1024 + (handle & 0x3ff));
        realms.set(handle, 'peakEra', 0);
      }
      if (action.kind === GOLDEN_ACTION.cull && action.params !== undefined) {
        const handle = ctx.state.entities.handleAt(action.params[0] as number);
        if (handle !== 0) {
          ctx.state.entities.destroy(handle);
        }
      }
    }
  },
};

export const CHRONICLE = defineWorld({
  components: [realm],
  systems: [settlement, demography],
});

/** Musters, culls, and promotes warriors, on action. */
const muster: System = {
  name: 'muster',
  run(ctx: StepContext) {
    const vit = ctx.state.component('vitality');
    const rank = ctx.state.component('standing');

    for (const action of ctx.actions) {
      if (action.kind === GOLDEN_ACTION.spawn) {
        const handle = ctx.state.entities.create();
        vit.add(handle);
        // Deliberately fragile: a warrior must be able to die inside a fixture's
        // window, or the burial system and the free list's LIFO reuse would
        // never be exercised by a golden run.
        vit.set(handle, 'hp', 140 + (handle & 0x3f));
        vit.set(handle, 'shield', handle & 0x3f);
        // Only every third warrior carries standing, so component membership is
        // genuinely sparse and the snapshot's slot ordering has work to do.
        if ((handle & 3) === 0) {
          rank.add(handle);
          rank.set(handle, 'rank', 1);
          rank.set(handle, 'renown', 0);
        }
      }

      if (action.kind === GOLDEN_ACTION.cull && action.params !== undefined) {
        const handle = ctx.state.entities.handleAt(action.params[0] as number);
        if (handle !== 0) {
          ctx.state.entities.destroy(handle);
        }
      }

      if (action.kind === GOLDEN_ACTION.promote && action.params !== undefined) {
        const handle = ctx.state.entities.handleAt(action.params[0] as number);
        if (handle !== 0 && rank.has(handle)) {
          rank.set(handle, 'rank', (rank.get(handle, 'rank') + 1) & 0xff);
          rank.set(handle, 'renown', rank.get(handle, 'renown') + 37);
        }
      }
    }
  },
};

/**
 * Attrition in world time, blows traded in engagement time.
 *
 * The two scales draw from different streams and at different rates, so a
 * fixture that crosses a mode boundary would not reproduce if the transition
 * landed on the wrong tick — which is exactly what the engagement fixture is
 * for. The per-combatant draw is keyed on the entity handle through
 * `actorStream`, never on a row index: rows move under swap-removal, and a
 * positional key would make a warrior's roll depend on who died before her.
 */
const melee: System = {
  name: 'melee',
  run(ctx: StepContext) {
    const vit = ctx.state.component('vitality');
    if (vit.size === 0) {
      return;
    }
    const engaged = ctx.mode === TIME_MODE.engagement;
    const hp = vit.field('hp');
    const shield = vit.field('shield');

    vit.forEach((row, handle) => {
      const stream = ctx.rng.actorStream(RNG_STREAM.combat, ctx.tick, handle);
      const blow = nextBounded(stream, engaged ? 40 : 6);
      const absorbed = Math.min(blow, shield[row] as number);
      shield[row] = ((shield[row] as number) - absorbed) & 0xffff;
      hp[row] = (hp[row] as number) - (blow - absorbed);
    });
  },
};

/** Removes the fallen, which is where slot recycling and the free list get exercised. */
const burial: System = {
  name: 'burial',
  run(ctx: StepContext) {
    const vit = ctx.state.component('vitality');
    if (vit.size === 0) {
      return;
    }
    const hp = vit.field('hp');
    const fallen: number[] = [];
    vit.forEach((row, handle) => {
      if ((hp[row] as number) <= 0) {
        fallen.push(handle);
      }
    });
    // Collected first, destroyed after: destroying inside `forEach` would
    // swap-remove rows out from under the iteration.
    for (const handle of fallen) {
      ctx.state.entities.destroy(handle);
    }
  },
};

export const WARBAND = defineWorld({
  components: [vitality, standing],
  systems: [muster, melee, burial],
});

/**
 * Every world a fixture may name.
 *
 * A fixture that names a key not in here fails to load rather than being
 * skipped. A golden fixture nobody runs is worse than no fixture: it reads as
 * coverage in the diff and provides none.
 */
export const GOLDEN_WORLDS: ReadonlyMap<string, WorldSchema> = new Map([
  ['chronicle', CHRONICLE],
  ['warband', WARBAND],
]);

/** The world a fixture names, or an error naming what is available. */
export function worldNamed(key: string): WorldSchema {
  const schema = GOLDEN_WORLDS.get(key);
  if (schema === undefined) {
    throw new Error(
      `Golden fixture names world "${key}", which test/golden/worlds.ts does not define. ` +
        `Defined: ${[...GOLDEN_WORLDS.keys()].join(', ')}.`,
    );
  }
  return schema;
}
