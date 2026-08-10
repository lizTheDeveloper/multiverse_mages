/*
 * Multiverse Mages — the worlds golden replay fixtures are recorded against.
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

import { TIME_MODE } from '../../src/clock.js';
import type { EntityHandle } from '../../src/handle.js';
import { nextBounded } from '../../src/rng/pcg32.js';
import { RNG_STREAM } from '../../src/rng/streams.js';
import type { System, WorldSchema } from '../../src/state.js';
import { defineWorld } from '../../src/state.js';

/**
 * Action kinds this world understands.
 *
 * Numbered from 1 so they sit below the core's clock actions (`CORE_ACTION`,
 * numbered from the top of the `uint16` range) and cannot collide with them.
 * Kind 0 is the core's legal no-op and is deliberately left alone.
 *
 * **These numbers are baked into every committed fixture's action log.**
 * Renumbering one does not fail a build — it silently makes every historical
 * fixture describe a different run. Append, never renumber.
 */
export const GOLDEN_ACTION = {
  /** Admits one scholar. No parameters. */
  enroll: 1,
  /** Removes the scholar in a slot, if one is there. Params: `[slot]`. */
  graduate: 2,
  /** Sets a scholar's stipend. Params: `[slot, amount]`. */
  endow: 3,
} as const;

/** Vitality drained per world tick, as an exclusive bound on the draw. */
const WORLD_BITE = 8;

/**
 * Vitality drained per engagement tick. Larger than {@link WORLD_BITE} so that
 * a mode transition is observable in the *state*, not only in the clock bytes.
 * A fixture whose engagement leg differed only in three clock fields would pass
 * even if entering an engagement stopped reaching the rules at all.
 */
const ENGAGEMENT_BITE = 64;

/** Vitality a freshly enrolled scholar starts with, before their aptitude roll. */
const BASE_VITALITY = 900;

/** Exclusive bound on the aptitude bonus rolled at enrolment. */
const APTITUDE_SPREAD = 256;

/** Exclusive bound on the insight a scholar gains in one tick of study. */
const INSIGHT_SPREAD = 32;

const vitality = { name: 'vitality', fields: { hp: 'i32' } } as const;
const scholarship = { name: 'scholarship', fields: { insight: 'i32', stipend: 'u32' } } as const;

/**
 * Admissions and departures: the only system that changes which entities exist.
 *
 * Enrolment rolls from an **actor** stream keyed on the new handle rather than
 * from the tick stream. Two scholars admitted in the same tick would otherwise
 * draw from one cursor in submission order, which makes their aptitudes a
 * function of the order the god happened to list them in — the exact coupling
 * `deriveActorStream` exists to prevent.
 */
const enrolment: System = {
  name: 'enrolment',
  run(ctx) {
    const vit = ctx.state.component('vitality');
    const sch = ctx.state.component('scholarship');

    for (const action of ctx.actions) {
      switch (action.kind) {
        case GOLDEN_ACTION.enroll: {
          const handle = ctx.state.entities.create();
          vit.add(handle);
          sch.add(handle);
          const roll = ctx.rng.actorStream(RNG_STREAM.mageBirth, handle);
          vit.set(handle, 'hp', BASE_VITALITY + nextBounded(roll, APTITUDE_SPREAD));
          break;
        }
        case GOLDEN_ACTION.graduate: {
          // A slot naming nobody is a legal no-op, not an error: the god
          // addresses slots, and slots empty out underneath a plan.
          const handle = ctx.state.entities.handleAt(action.params?.[0] ?? -1);
          if (handle !== 0) {
            ctx.state.entities.destroy(handle);
          }
          break;
        }
        case GOLDEN_ACTION.endow: {
          const handle = ctx.state.entities.handleAt(action.params?.[0] ?? -1);
          if (handle !== 0 && sch.has(handle)) {
            sch.set(handle, 'stipend', action.params?.[1] ?? 0);
          }
          break;
        }
        default:
          // Clock actions and anybody else's vocabulary. Not this world's problem.
          break;
      }
    }
  },
};

/**
 * Every scholar learns a little, every tick, from a seeded draw.
 *
 * Unconditional on purpose. A fixture that advanced world time and did no
 * seeded work would prove only that the clock counts; this is the system that
 * makes the world-time-only fixture sensitive to a float or an unseeded draw
 * sneaking into the rules path.
 */
const study: System = {
  name: 'study',
  run(ctx) {
    const sch = ctx.state.component('scholarship');
    const insight = sch.field('insight');
    sch.forEach((row, handle) => {
      const stream = ctx.rng.actorStream(RNG_STREAM.research, handle);
      insight[row] = (insight[row] as number) + nextBounded(stream, INSIGHT_SPREAD);
    });
  },
};

/**
 * Vitality drains each tick, faster inside an engagement, and a scholar who
 * runs out is destroyed.
 *
 * Destruction is deferred out of the iteration rather than done inside it.
 * `forEach` walks a cached ascending-slot order, and destroying mid-walk would
 * make the visit sequence depend on which entity happened to die first — a
 * divergence that only shows up when two peers' populations differ slightly,
 * which is to say in production and never in a unit test.
 */
const attrition: System = {
  name: 'attrition',
  run(ctx) {
    const vit = ctx.state.component('vitality');
    const hp = vit.field('hp');
    const bite = ctx.mode === TIME_MODE.engagement ? ENGAGEMENT_BITE : WORLD_BITE;

    const doomed: EntityHandle[] = [];
    vit.forEach((row, handle) => {
      const stream = ctx.rng.actorStream(RNG_STREAM.mortality, handle);
      const remaining = (hp[row] as number) - nextBounded(stream, bite);
      hp[row] = remaining;
      if (remaining <= 0) {
        doomed.push(handle);
      }
    });

    for (const handle of doomed) {
      ctx.state.entities.destroy(handle);
    }
  },
};

/**
 * The world every committed fixture is recorded against.
 *
 * Small enough to read in one sitting, and deliberately so — this is the
 * reference example of how rules code is written here. It exercises the three
 * things a determinism gate has to cover: entities appearing and disappearing,
 * component fields being written, and randomness drawn from named streams.
 */
const academy: WorldSchema = defineWorld({
  components: [vitality, scholarship],
  systems: [enrolment, study, attrition],
});

/** The ID `academy` is recorded under. Stable forever; fixtures name it. */
export const ACADEMY_WORLD_ID = 'academy-v1';

/**
 * Every world a fixture may name, by stable string ID.
 *
 * The registry exists so that the fixture files and the regeneration command
 * resolve a world through the *same* code. A fixture that encoded one world and
 * was verified against another would still produce a hash comparison — just a
 * meaningless one, failing or passing for reasons unrelated to determinism.
 *
 * An ID is part of a fixture's on-disk contract. Changing a world's rules under
 * an existing ID is exactly the situation the goldens are for: the fixtures
 * fail, and someone decides whether that was the point.
 */
export const GOLDEN_WORLDS: ReadonlyMap<string, WorldSchema> = new Map([
  [ACADEMY_WORLD_ID, academy],
]);

/**
 * Resolves a world ID, naming what is available when it does not resolve.
 *
 * Throwing beats returning `undefined` here. A fixture that named a world
 * nobody registered would otherwise be skipped, and a skipped fixture is a
 * determinism check that reports success without checking anything.
 */
export function worldById(id: string): WorldSchema {
  const world = GOLDEN_WORLDS.get(id);
  if (world === undefined) {
    const known = [...GOLDEN_WORLDS.keys()].join(', ');
    throw new Error(`No golden world registered as "${id}". Registered: ${known || '(none)'}.`);
  }
  return world;
}

/**
 * The academy, with its rules deliberately changed from `fromTick` onward.
 *
 * **Never registered in {@link GOLDEN_WORLDS}, and no fixture may name it.** It
 * exists so a test can execute the one scenario nobody can commit: a change
 * that makes the simulation stop reproducing a recorded run. "Introduce a
 * nondeterministic operation" is not something CI can run — a permanently
 * nondeterministic branch cannot live in the repository — but replaying a
 * genuine fixture against a world whose behaviour changes at a *known* tick
 * asks the harness the same question and has a checkable answer: it must report
 * that tick, and say so in the message.
 *
 * Built by appending to the real academy's systems rather than by restating
 * them, so the pre-`fromTick` half of the run cannot silently drift away from
 * the world the fixtures were recorded against. If it did, the divergence would
 * be reported at tick 0 and the test would be checking nothing.
 *
 * The drift is a bare increment on an existing field: no new draws, so it moves
 * no RNG stream, and no create or destroy, so it cannot change which entities
 * exist. The reported tick is then exactly the tick the rules changed, which is
 * the fact under test.
 */
export function academyDriftingFrom(fromTick: number): WorldSchema {
  const drift: System = {
    name: 'drift',
    run(ctx) {
      if (ctx.tick < fromTick) {
        return;
      }
      const sch = ctx.state.component('scholarship');
      const insight = sch.field('insight');
      sch.forEach((row) => {
        insight[row] = (insight[row] as number) + 1;
      });
    },
  };

  return defineWorld({
    components: [vitality, scholarship],
    systems: [enrolment, study, attrition, drift],
  });
}
