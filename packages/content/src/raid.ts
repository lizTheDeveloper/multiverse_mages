/*
 * Multiverse Mages — the raid content table, and the two invariants that decide
 * whether a raid can end.
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
 * `raid-constant.json`, and the checks a JSON Schema cannot make over it.
 *
 * The file is modelled on `god-constant.json` for the reason that one exists:
 * the rules read each magnitude **by name**, so the set of ids is a contract
 * checked in both directions while every value is an untuned placeholder the
 * balance harness owns. What is different here is that two of the checks are
 * not tuning hygiene — they are the termination proof.
 *
 * ## Why a raid's termination is decided at content load
 *
 * A raid ends when `portalStability` reaches zero, and `portalStability` only
 * ever moves by `stabilityDecayPerTick`. So the maximum length of any raid is
 * `ceil(initial / decay)`, an arithmetic fact about two authored integers — and
 * therefore something that can be checked before a single tick is stepped,
 * against a compile-time ceiling.
 *
 * Both halves matter, and the second is the one that has actually bitten this
 * project's cousins:
 *
 * - **A decay of zero is a raid that never ends.** Not an error, not an
 *   exception, not a warning: a worker that stops returning, discovered as a
 *   Monte Carlo sweep that never completes. The obvious way to author the decay
 *   — "stability divided by the raid length I want" — produces exactly that,
 *   because `div` rounds toward negative infinity and the divisor is larger
 *   than the numerator whenever the desired length exceeds the stability. So
 *   the decay is an **authored raw integer**, and {@link checkRaidConstants}
 *   rejects anything below 1.
 * - **A ceiling nobody can reach is not a ceiling.** `MAX_ENGAGEMENT_TICKS`
 *   below is the hard ceiling the engine trips over if the decrement guarantee
 *   is ever broken. It is only meaningful if content cannot legally declare a
 *   raid longer than it, so the loader computes the bound and compares.
 *
 * The jitter is folded into the bound rather than ignored: a raid opens at
 * `initial + jitter` at worst, so the bound is computed from the worst case. An
 * unfolded jitter is a bound that is true on average and false sometimes, which
 * is the same thing as no bound at all.
 */

import type { ContentDiagnostic } from './diagnostics.js';
import type { RaidConstantRecord } from './types.js';

/**
 * The hard ceiling on engagement ticks, as a compile-time constant.
 *
 * Deliberately **not** a content value, unlike everything else a raid is made
 * of. It is the number the engine trips over when the decrement guarantee has
 * been broken, so it must not itself be reachable by the same content edit that
 * breaks the guarantee — a ceiling a tuning sweep can raise is a ceiling that
 * gets raised the first time a run bumps into it.
 *
 * 8192 ticks is 819 fictional seconds, about fourteen minutes: comfortably
 * above the ~3,600 the shipped content authors, and comfortably below anything
 * a worker would call a hang.
 */
export const MAX_ENGAGEMENT_TICKS = 8192;

/**
 * Every magnitude the raid rules read, by name.
 *
 * Checked in both directions, exactly as `REQUIRED_GOD_CONSTANTS` is: a missing
 * entry arrives in a formula as `0`, and a cast range of zero is a raid in which
 * nobody can reach anybody — a plausible-looking outcome that no assertion in
 * this project would catch. An unknown entry is a tuning knob that does
 * nothing, and the sweep that turned it would report the null result as a
 * finding about the game.
 */
export const REQUIRED_RAID_CONSTANTS: readonly string[] = Object.freeze([
  'archmage-objective-value',
  'area-denial-radius',
  'battlefield-extent',
  'cast-range',
  'cast-vigor-base',
  'cast-vigor-per-tier',
  'combatant-base-concealment',
  'combatant-base-max-hp',
  'combatant-hp-per-tier',
  'deployment-zone-depth',
  'detachment-damage',
  'detachment-max-hp',
  'detachment-range',
  'detachment-strength',
  'grimoire-burn-resist-cap',
  'max-combatants-per-side',
  'max-interaction-radius',
  'max-objectives-per-raid',
  'max-summons-per-side',
  'movement-per-tick',
  'muster-ceiling-ticks',
  'objective-interaction-radius',
  'objective-progress-per-tick',
  'objective-value-per-instance',
  'objective-value-per-tier',
  'portal-margin',
  'portal-stability-initial',
  'portal-stability-jitter',
  'resolution-stability-margin',
  'stability-decay-per-tick',
  'summon-damage',
  'summon-max-hp',
  'terrain-blocking-chance',
  'terrain-cell-size',
  'terrain-impassable-chance',
  'terrain-rough-chance',
  'terrain-rough-move-cost',
  'theft-range',
  'university-objective-value',
  'victory-threshold-fraction',
  'withdraw-stability-margin',
]);

/** Radii that must fit inside the spatial index's cell, so a query stays nine cells. */
const RADII_BOUNDED_BY_INTERACTION: readonly string[] = Object.freeze([
  'area-denial-radius',
  'cast-range',
  'detachment-range',
  'objective-interaction-radius',
  'portal-margin',
  'theft-range',
]);

/**
 * The termination bound implied by an opening stability and a decay.
 *
 * `ceil(stability / decay)`, computed on integers with no division rounding
 * surprise: the whole point of this module is that a raid's length is not
 * decided by a floor.
 *
 * @throws RangeError if `decay` is below 1. Callers reaching this with a zero
 * decay have already skipped the load check, and returning `Infinity` would let
 * them carry on.
 */
export function engagementTickBound(stability: number, decay: number): number {
  if (!Number.isInteger(decay) || decay < 1) {
    throw new RangeError(
      `A raid's stability decay is ${String(decay)}. It must be an authored integer of at least ` +
        '1: a decay of 0 gives a raid with no bound at all, and there is no number this function ' +
        'could return that would be honest about that.',
    );
  }
  return Math.ceil(stability / decay);
}

function problem(pointer: string, message: string): ContentDiagnostic {
  return { file: 'raid-constant.json', pointer, code: 'content-invariant', message };
}

/**
 * Checks the raid table declares exactly the set the rules read, that the
 * termination arithmetic holds, and that no radius outgrows the spatial index.
 *
 * The three classes of failure, and what each would cost:
 *
 * - **A missing or unread constant.** As above: a `0` in a formula, or a knob
 *   that does nothing.
 * - **A raid that cannot end, or can outlast the ceiling.** The decay must be
 *   at least 1 and the worst-case bound must fit under
 *   {@link MAX_ENGAGEMENT_TICKS}. This is the check that makes "every raid
 *   terminates" a property of the content set rather than an observation about
 *   the runs somebody happened to do.
 * - **A radius larger than the spatial index's cell.** The index promises a
 *   radius query inspects at most nine cells; a radius beyond the cell size
 *   silently breaks that promise and the query starts missing combatants at the
 *   edge of the effect — which reads as a balance result, not as a bug.
 */
export function checkRaidConstants(
  records: readonly RaidConstantRecord[],
): readonly ContentDiagnostic[] {
  const out: ContentDiagnostic[] = [];
  const byId = new Map<string, RaidConstantRecord>();

  records.forEach((record, index) => {
    if (byId.has(record.id)) {
      out.push(problem(`/${String(index)}`, `constant "${record.id}" is declared twice.`));
      return;
    }
    byId.set(record.id, record);
  });

  for (const required of REQUIRED_RAID_CONSTANTS) {
    if (byId.has(required)) continue;
    out.push(
      problem(
        '',
        `constant "${required}" is not declared, and the raid rules read it by name. An absent ` +
          'constant arrives in a formula as 0, and a raid in which nothing has any reach is a ' +
          'plausible-looking outcome that nothing in this project asserts against.',
      ),
    );
  }

  const known = new Set(REQUIRED_RAID_CONSTANTS);
  for (const record of records) {
    if (known.has(record.id)) continue;
    out.push(
      problem(
        '',
        `constant "${record.id}" is declared but nothing reads it. An unread constant is a tuning ` +
          'knob that does nothing, and the sweep that turned it would report the null result as a ' +
          'finding about the game.',
      ),
    );
  }

  const value = (id: string): number | undefined => byId.get(id)?.value;

  const decay = value('stability-decay-per-tick');
  const initial = value('portal-stability-initial');
  const jitter = value('portal-stability-jitter');

  if (decay !== undefined && decay < 1) {
    out.push(
      problem(
        '',
        `stability-decay-per-tick is ${String(decay)}. It must be an authored raw integer of at ` +
          'least 1. A decay of 0 is what fixed-point division produces whenever the divisor ' +
          'exceeds the numerator, and it is a raid that runs forever — with no error, no ' +
          'exception, and no symptom other than a worker that never returns.',
      ),
    );
  }

  if (decay !== undefined && decay >= 1 && initial !== undefined && jitter !== undefined) {
    // The worst case, not the nominal one: a bound that holds on average is not
    // a bound. Jitter widens the opening stability, so it widens the bound.
    const bound = engagementTickBound(initial + jitter, decay);
    if (bound > MAX_ENGAGEMENT_TICKS) {
      out.push(
        problem(
          '',
          `a portal opening at up to ${String(initial + jitter)} and decaying by ${String(decay)} ` +
            `per tick runs for up to ${String(bound)} engagement ticks, above the ` +
            `${String(MAX_ENGAGEMENT_TICKS)} ceiling. The ceiling is the loud failure the engine ` +
            'raises when the decrement guarantee has been broken; content that can reach it ' +
            'legally makes that failure indistinguishable from an ordinary long raid.',
        ),
      );
    }
    if (bound < 1) {
      out.push(
        problem(
          '',
          'a portal that opens at or below its own per-tick decay collapses before anyone acts. ' +
            'That is a raid with no ticks in it, which every metric would report as a resolved ' +
            'defender victory.',
        ),
      );
    }
  }

  const interaction = value('max-interaction-radius');
  if (interaction !== undefined) {
    for (const id of RADII_BOUNDED_BY_INTERACTION) {
      const radius = value(id);
      if (radius === undefined || radius <= interaction) continue;
      out.push(
        problem(
          '',
          `${id} is ${String(radius)}, beyond the ${String(interaction)} max-interaction-radius ` +
            'that sets the spatial index cell size. A radius query is only bounded to nine cells ' +
            'while every radius fits in one; past that the query silently stops finding ' +
            'combatants at the edge of the effect, which reads as balance rather than as a bug.',
        ),
      );
    }
  }

  const extent = value('battlefield-extent');
  const cellSize = value('terrain-cell-size');
  if (extent !== undefined && cellSize !== undefined) {
    if (cellSize < 1) {
      out.push(problem('', 'terrain-cell-size must be positive; a zero-width cell tiles nothing.'));
    } else if (extent % cellSize !== 0) {
      out.push(
        problem(
          '',
          `battlefield-extent ${String(extent)} is not a whole number of ${String(cellSize)} ` +
            'terrain cells. A partial cell at the far edge is a strip of the field whose ' +
            'passability depends on which way the index rounds, which is a determinism hazard ' +
            'rather than a cosmetic one.',
        ),
      );
    }
    if (extent < 1) {
      out.push(problem('', 'battlefield-extent must be positive; there is nowhere to fight.'));
    }
  }

  const perSide = value('max-combatants-per-side');
  const summons = value('max-summons-per-side');
  if (perSide !== undefined && perSide < 1) {
    out.push(
      problem('', 'max-combatants-per-side must be at least 1, or no side can field anybody.'),
    );
  }
  if (perSide !== undefined && summons !== undefined && summons > perSide) {
    out.push(
      problem(
        '',
        `max-summons-per-side (${String(summons)}) exceeds max-combatants-per-side ` +
          `(${String(perSide)}). The summon cap is meant to bind before the side cap does; above ` +
          'it, it is the side cap doing the work and the summon cap is decorative.',
      ),
    );
  }

  const threshold = value('victory-threshold-fraction');
  if (threshold !== undefined && (threshold < 1 || threshold > 1024)) {
    out.push(
      problem(
        '',
        `victory-threshold-fraction is ${String(threshold)}; it is a fraction at scale 1024 and ` +
          'must lie in 1..1024. At 0 the attacker wins by arriving, and above fp(1024) she ' +
          'cannot win by taking everything on the field.',
      ),
    );
  }

  for (const id of ['terrain-impassable-chance', 'terrain-blocking-chance', 'terrain-rough-chance']) {
    const chance = value(id);
    if (chance === undefined || chance <= 1024) continue;
    out.push(
      problem('', `${id} is ${String(chance)}; it is a probability at scale 1024 and cannot exceed it.`),
    );
  }

  const impassable = value('terrain-impassable-chance');
  if (impassable !== undefined && impassable >= 1024) {
    out.push(
      problem(
        '',
        'terrain-impassable-chance of fp(1024) makes every cell rock, so no deployment position ' +
          'exists and no raid can begin.',
      ),
    );
  }

  return out;
}
