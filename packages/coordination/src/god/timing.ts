/*
 * Multiverse Mages — the arrangement is the interface: when an intervention lands, and what that costs.
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
 * `sound-design.md` §3.1 and §3.2, made into a price.
 *
 * §3.1 makes one world tick one bar and hands each subsystem a subdivision of
 * it — economy on beats 1 and 3, **teaching on the backbeat**, research on 8ths,
 * scribing on 16ths — and reserves off-grid for *"knowledge loss. Portal events.
 * Nothing else."* §3.2 then says what off-grid means: *"it does not need a
 * stinger, a sting, or a volume boost to be noticed. It is the only arrhythmic
 * thing in a world made of rhythm."*
 *
 * ## The constraint that shaped every decision here
 *
 * §0.1: *"audio is a projection of state and computes no rules."* Nothing in
 * this file knows the audio system exists, and nothing in the audio system may
 * be consulted by it. **What is shared between the arrangement and the mechanic
 * is the clock, not the rules.** The arrangement is a rendering of §3.1's table;
 * this is a pricing of the same table. Neither reads the other.
 *
 * ## What the design does not settle, and is therefore raised rather than invented
 *
 * §3.1's table assigns subdivisions to **world subsystems**. It says nothing
 * about which subdivision a *god intervention* occupies, and §3.2's *"exactly
 * two things ignore the beat"* means an intervention cannot be placed off-grid
 * by fiat either. {@link SUBDIVISION_OF_ACTION} is therefore **provisional**,
 * and the one row it is confident about is the one the design calls obvious: an
 * intervention aimed at teaching belongs on the backbeat.
 *
 * The open question is recorded in `docs/superpowers/plans/w21-timing-envelopes.md`
 * §2.5 and belongs to the author: should a constitutional act have a subdivision
 * of its own?
 *
 * ## The god chooses the bar, not the subdivision
 *
 * `agent-api`'s session pins *"one action per submission, one world tick per
 * submission"*, and states why: *"'several actions per tick' is a different
 * action space from the one a policy is trained against."* So there is no
 * submission-order-within-a-bar to read, and the rule cannot be *where in the
 * bar did the god play*. It is:
 *
 * > An intervention occupies the subdivision its target subsystem owns. It is
 * > **in phase** when the bar it lands in is actually playing that subdivision,
 * > and **off-grid** when it is not.
 *
 * §3.1 argues this case itself, for teaching in particular: *"A civilization
 * that has stopped teaching has a kick and no snare, and it sounds like
 * something is missing, because something is."* Blessing a mage into a
 * civilization with no lesson in progress is a backbeat struck over a bar that
 * has no backbeat in it, and it costs more.
 *
 * ## Constitutional acts, and the eight bars §5.2 supplies
 *
 * The downbeat always plays — the tick boundary always happens — so the phase
 * predicate can never catch actions 1–7. §5.2 supplies the rule that can, and
 * supplies the number with it:
 *
 * > *"the permit chord includes one low partial that resolves neither up nor
 * > down… **it decays over about eight bars**."*
 *
 * Eight bars is eight world ticks. A constitutional act committed while a
 * previous one's unease is still ringing pays a surcharge scaling with the bars
 * left to run.
 *
 * This is orthogonal to §1.1's `axisChangeCounters`, which prices *flipping one
 * axis back and forth*. That counter never fires for a god who permits nineteen
 * different things once each — nothing is flipped twice, every counter goes
 * 0 → 1 and stops. The unease window prices the other thing: **churning the
 * constitution**, whatever axis each act touches.
 *
 * ## Determinism, stated so that it can be checked
 *
 * 1. The subdivision is a function of the action's `kind` — a frozen table.
 * 2. Whether the bar is playing it is a function of committed component rows:
 *    an in-flight `effort-progress` row of that kind, or the universe's
 *    materials. Nothing is cached, so nothing can go stale.
 * 3. The unease is one `i32` on the `bar-phase` row and the current `worldTick`.
 * 4. **No draw.** `contracts.md` §6 is append-only and states that reusing or
 *    renumbering a stream id invalidates every committed balance baseline.
 *    There is no stream 12 here and there must never be one: the timing rule is
 *    arithmetic, not chance.
 * 5. **No wall clock.** §0 puts real-time pacing outside the core entirely, and
 *    nothing here reads a clock that is not `state.clock.worldTick`.
 *
 * Together: a replay of the same `(rootSeed, initial state, action log)`
 * reproduces the same surcharge on the same tick, byte for byte.
 *
 * ## Raid time needs no rule, and that is §3.4 honoured structurally
 *
 * §3.4: *"Inside a raid, the grid is gone. No tempo, no subdivisions, no
 * snapping."* `contracts.md` §4.2 already masks every god action but no-op
 * during engagement — *"the god acts only in world time"* — so there is no
 * intervention in raid time for a timing rule to price. Quantization is off
 * because there is nothing there to quantize, and {@link interventionPhase} is
 * never reached from a raid.
 */

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, TIME_MODE, mul } from '@mm/sim-core';
import type { BarPhaseRecord } from '@mm/state';
import {
  BAR_PHASE,
  EFFORT_KIND,
  EFFORT_PROGRESS,
  UNIVERSE,
  attachRecord,
  componentOf,
} from '@mm/state';

import { ACTION } from './actions.js';

/**
 * §3.1's subdivisions of the bar, as an enum.
 *
 * Named for the row of §3.1's table each one is, not for a note position: the
 * positions (beats 1 and 3, the backbeat, 8ths, 16ths) are the arrangement's
 * business and the arrangement is downstream. What the rules path needs is
 * *which subsystem owns this moment*, and that is what these are.
 */
export const SUBDIVISION = {
  /** §3.1's *"Tick boundary — world state advances. Kick. The heartbeat."* */
  downbeat: 0,
  /** Beats 1 and 3: *"Economy: materials, populace."* */
  economy: 1,
  /** Beats 2 and 4. *"Teaching. The backbeat."* */
  teaching: 2,
  /** 8th notes: research. */
  research: 3,
  /** 16th notes: scribing, *"the hi-hat"*. */
  scribing: 4,
} as const;

export type Subdivision = (typeof SUBDIVISION)[keyof typeof SUBDIVISION];

/**
 * Which subdivision each §4.2 action aims at. **Provisional — see the module note.**
 *
 * Frozen and total over the sixteen action ids, because a missing row would be
 * a silent `downbeat` and the downbeat is the one that is never off-grid: an
 * action that fell out of this table would quietly become free of the rule.
 */
export const SUBDIVISION_OF_ACTION: Readonly<Record<number, Subdivision>> = Object.freeze({
  // Tier 0. §5.1: *"Doing nothing is free."*
  [ACTION.noop]: SUBDIVISION.downbeat,

  // Tier 3, constitutional. §3.1's downbeat is the tick boundary, which always
  // plays — so these are never off-grid by the phase predicate, and are priced
  // by §5.2's eight-bar unease instead.
  [ACTION.permitTechnique]: SUBDIVISION.downbeat,
  [ACTION.forbidTechnique]: SUBDIVISION.downbeat,
  [ACTION.permitForm]: SUBDIVISION.downbeat,
  [ACTION.forbidForm]: SUBDIVISION.downbeat,
  [ACTION.issueDispensation]: SUBDIVISION.downbeat,
  [ACTION.issueInterdiction]: SUBDIVISION.downbeat,
  [ACTION.revokeEdict]: SUBDIVISION.downbeat,

  // §3.1's teaching row is *"mind to mind, fast, cheap, the thing that keeps
  // knowledge alive against mortality"*, and §5.3 calls a founding grant a birth
  // into a mind. Both of these put knowledge into a head that did not have it.
  [ACTION.grantFoundingKnowledge]: SUBDIVISION.teaching,
  [ACTION.blessMage]: SUBDIVISION.teaching,

  // Both aim at what mages spend their months on.
  [ACTION.assignRole]: SUBDIVISION.research,
  [ACTION.encourageResearch]: SUBDIVISION.research,

  // §3.1's economy row: *"materials, populace."*
  [ACTION.fundUniversity]: SUBDIVISION.economy,

  // Tier 4 and the portal. §5.4 and §5.5 give these their own ceremony and §3.2
  // gives portal events the off-grid slot outright, so neither is priced by a
  // subdivision it does not own.
  [ACTION.changeTradition]: SUBDIVISION.downbeat,
  [ACTION.openPortal]: SUBDIVISION.downbeat,
  [ACTION.declareAscension]: SUBDIVISION.downbeat,
});

/** How an intervention sat against the bar, and what that did to its price. */
export interface InterventionPhase {
  readonly subdivision: Subdivision;
  /** Whether the bar was playing this intervention's subdivision. */
  readonly inPhase: boolean;
  /**
   * Bars of §5.2's unease still ringing when a constitutional act landed. `0`
   * for every other action and for a constitution nobody has recently changed.
   */
  readonly uneaseBars: number;
  /**
   * The multiplier on the action's favor cost. `fp(1024)` when in phase.
   *
   * Composed exactly as `hysteresisMultiplier` is, and applied in the same one
   * place, so the affordability mask and the resolver cannot disagree about a
   * price — which is the argument `favor.ts` already makes about `hysteresis`.
   */
  readonly multiplier: Fixed;
}

/** The neutral answer: on the beat, nothing owing. */
export const ON_THE_BEAT: InterventionPhase = Object.freeze({
  subdivision: SUBDIVISION.downbeat,
  inPhase: true,
  uneaseBars: 0,
  multiplier: FP_ONE,
});

/**
 * The constants §5.2's eight bars need.
 *
 * There is deliberately **no off-grid surcharge constant**. §3.2's off-grid
 * *is* implemented as a predicate — {@link barIsPlaying} — and reported on every
 * phase, but it is not priced (see {@link interventionPhase}), and
 * `@mm/content`'s loader refuses a `god-constant.json` row nothing reads:
 * *"an unread constant is a tuning knob that does nothing, and the sweep that
 * turned it would report the null result as a finding about the game."* That
 * rule is right, and it is why the number is absent rather than authored and
 * inert. It arrives with the answer to §2.5's open question, not before it.
 */
export interface TimingConstants {
  /** Bars a constitutional act's unease decays over. §5.2 says about eight. */
  readonly uneaseBars: number;
  /** Surcharge per bar of unease still ringing. `fp`. */
  readonly uneaseStep: Fixed;
}

/** Whether the bar is playing a given subdivision, read from committed rows. */
export function barIsPlaying(
  state: SimState,
  universe: EntityHandle,
  subdivision: Subdivision,
): boolean {
  // §3.1's downbeat is the tick boundary. It always happens; a world tick that
  // did not advance world state is not a bar at all.
  if (subdivision === SUBDIVISION.downbeat) return true;

  if (subdivision === SUBDIVISION.economy) {
    // *"Economy: materials, populace."* A universe with nothing in the
    // storeroom is not playing beats 1 and 3.
    return componentOf(state, UNIVERSE).get(universe, 'materials') > 0;
  }

  const kind =
    subdivision === SUBDIVISION.teaching
      ? EFFORT_KIND.teaching
      : subdivision === SUBDIVISION.research
        ? EFFORT_KIND.research
        : EFFORT_KIND.scribing;

  // An in-flight project is the subdivision being struck. Read rather than
  // cached: a stored bitmask would be a second record of a fact these rows
  // already carry, and §1.1's `encouragedCells` note is the project's own
  // argument against exactly that — *"a stored magnitude and a stored expiry
  // are two records of one linear decay, and they can disagree."*
  const store = componentOf(state, EFFORT_PROGRESS);
  let playing = false;
  store.forEach((_rowIndex, handle) => {
    if (playing) return;
    if (store.get(handle, 'kind') === kind && store.get(handle, 'progress') > 0) playing = true;
  });
  return playing;
}

/** The `bar-phase` row, or the zeroed one a universe that has never legislated has. */
export function barPhaseOf(state: SimState, universe: EntityHandle): BarPhaseRecord {
  const store = componentOf(state, BAR_PHASE);
  if (!store.has(universe)) return { uneaseUntilTick: 0, lastConstitutionalTick: 0 };
  return {
    uneaseUntilTick: store.get(universe, 'uneaseUntilTick'),
    lastConstitutionalTick: store.get(universe, 'lastConstitutionalTick'),
  };
}

/** True for §5.1 tier 3 — the actions that change what is possible. */
export function isConstitutional(actionKind: number): boolean {
  return actionKind >= ACTION.permitTechnique && actionKind <= ACTION.revokeEdict;
}

/**
 * Where an intervention sits against the bar, and what it therefore costs.
 *
 * The whole of the timing rule. Called from the one place a price is computed,
 * and never from a raid — `contracts.md` §4.2 masks every god action during
 * engagement, so the assertion below is a statement of §3.4 rather than a guard
 * against a reachable state.
 */
export function interventionPhase(
  state: SimState,
  universe: EntityHandle,
  actionKind: number,
  worldTick: number,
  constants: TimingConstants,
): InterventionPhase {
  // §3.4: *"Inside a raid, the grid is gone."* There is nothing to quantize
  // because there is no intervention — the mask refused it two layers up.
  if (state.clock.mode !== TIME_MODE.world) return ON_THE_BEAT;

  const subdivision = SUBDIVISION_OF_ACTION[actionKind] ?? SUBDIVISION.downbeat;

  if (isConstitutional(actionKind)) {
    const { uneaseUntilTick } = barPhaseOf(state, universe);
    const remaining = Math.max(uneaseUntilTick - worldTick, 0);
    // Clamped to the window so a constant that was lowered mid-run cannot price
    // an act against more bars than the rule declares.
    const bars = Math.min(remaining, Math.max(constants.uneaseBars, 0));
    return {
      subdivision,
      inPhase: bars === 0,
      uneaseBars: bars,
      multiplier: FP_ONE + bars * constants.uneaseStep,
    };
  }

  // §3.2's off-grid surcharge is **computed and reported, and not yet charged.**
  //
  // Not an oversight and not timidity. `contracts.md` §4.2 makes affordability a
  // *mask* condition, and `agent-api`'s mask reprices every action itself — it
  // models the hysteresis multiplier in `cheapestAxisMultiplier` precisely so
  // that no action is admitted by the mask and refused by the resolver. A
  // surcharge charged here and invisible there would not be a cost at all: it
  // would be an illegal-action counter, which is exactly the defect integration
  // round 2 found in `uniform-random-legal` — *"seven of fifteen verbs inert,
  // telemetry clean."*
  //
  // Making the mask agree needs {@link SUBDIVISION_OF_ACTION} to be normative,
  // and it is not: §3.1 assigns subdivisions to world subsystems and says
  // nothing about god interventions. So the predicate ships, tested, and the
  // price waits on the author's answer. The unease window above needs no such
  // answer, because §5.2 states its number outright.
  return {
    subdivision,
    inPhase: barIsPlaying(state, universe, subdivision),
    uneaseBars: 0,
    multiplier: FP_ONE,
  };
}

/**
 * Starts §5.2's eight bars ringing.
 *
 * Called after a constitutional act is applied, never before: an act that was
 * refused for want of favor did not change the law, and charging the next one
 * for it would make an unaffordable action cost something after all.
 */
export function markConstitutionalAct(
  state: SimState,
  universe: EntityHandle,
  worldTick: number,
  constants: TimingConstants,
): void {
  const record: BarPhaseRecord = {
    lastConstitutionalTick: worldTick,
    uneaseUntilTick: worldTick + Math.max(constants.uneaseBars, 0),
  };
  const store = componentOf(state, BAR_PHASE);
  if (!store.has(universe)) {
    attachRecord(state, BAR_PHASE, universe, record);
    return;
  }
  store.set(universe, 'lastConstitutionalTick', record.lastConstitutionalTick);
  store.set(universe, 'uneaseUntilTick', record.uneaseUntilTick);
}

/** The phase multiplier, folded into a cost. Kept beside the rule that produces it. */
export function timedCost(base: Fixed, phase: InterventionPhase): Fixed {
  return mul(base, phase.multiplier);
}
