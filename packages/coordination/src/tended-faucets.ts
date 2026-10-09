/*
 * Multiverse Mages — the two faucets every universe has: thresholds kept and
 * research done.
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
 * ## Why these exist (playtest round 4, main `0cc40e9c`)
 *
 * `passage` and `insight` had exactly one producer each: a mage spending her
 * month casting a `resource-yield` node of the right form (`application.ts`).
 * In the shipped grid that is three tier-1 Intellego nodes for passage
 * (Limen, Fatum, Umbra) and two for insight (Mentem, Imaginem). A universe
 * whose god never permitted Intellego × one of those forms made **none**, ever:
 * measured on lobby-shaped universes, a Creo/Rego × Herbam/Terram opening
 * produced 0 passage in a hundred years and spent its founding 32 on two raids,
 * and insight sat under one blessing's price for ~90% of every run with a
 * university teaching out of it. The verbs those stocks pay for — the portal
 * and the blessing — were dead for most of the game, for a reason no screen
 * showed.
 *
 * So each gets a second faucet tied to something every universe has:
 *
 * - **Passage from the threshold's keepers.** A living mage who holds a
 *   permitted portal node at usable mastery keeps a threshold, and a kept
 *   threshold yields passage — kinds.ts' *"passage, which is what a threshold
 *   yields"*, taken at its word. It is exactly the universe that *can* raid
 *   that earns the currency to, and the god's lever is the one `portalGate`
 *   already asks about: raise more portal-holders. Counted up to a maximum, so
 *   a library full of portal-holders is not a passage mint.
 * - **Insight from research.** A month of research the archive could pay for
 *   (`grantedMonths` — a researcher it could not supply did not research)
 *   yields a little insight, which teaching then spends. §6a's *"knowledge is an
 *   input to producing more knowledge"*, in the stock the faculty teaches from.
 *
 * Both are **ambient** with respect to the mage's goal — neither takes her
 * month away from anything — and that is why both are small and the applied
 * channel stays the large one: casting Intellego Limen at the world is still
 * the way to be rich in passage.
 *
 * Every magnitude is in `autonomy-weight.json` and **untuned**.
 */

import type { Fixed } from '@mm/sim-core';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { mul } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, collectRecords, componentOf, isCellId, permits } from '@mm/state';
import type { CellResolver } from '@mm/rules-magic';
import type { MaterialAmounts } from '@mm/rules-world';
import { NO_MATERIALS, zeroAmounts } from '@mm/rules-world';

/** The autonomy-weight ids this module reads. */
export const REQUIRED_TENDED_WEIGHTS = [
  'passage-per-keeper',
  'passage-keepers-max',
  'research-insight-per-month',
] as const;

/** What the two faucets are priced in, plus the portal-node set they read. */
export interface TendedFaucetWeights {
  /** Node ids whose effects open the portal gate. */
  readonly portalNodes: ReadonlySet<number>;
  /** The mastery a holder needs — `rules-raid`'s `CASTABLE_MASTERY`, the gate's own. */
  readonly usableMastery: number;
  /** Passage one keeper yields per world tick, `fp`. */
  readonly passagePerKeeper: Fixed;
  /** Keepers counted at most. */
  readonly maxKeepers: number;
  /** Insight one granted research mage-month yields, `fp`. */
  readonly researchInsightPerMonth: Fixed;
}

/** What the faucets produced this tick, and who produced it. */
export interface TendedOutcome {
  readonly yielded: MaterialAmounts;
  /** Living mages holding a permitted portal node at usable mastery, before the cap. */
  readonly keepers: number;
}

/** Nothing, for a world assembled without the faucets — every hand-built test world. */
export const NO_TENDING: TendedOutcome = Object.freeze({ yielded: NO_MATERIALS, keepers: 0 });

/**
 * Living mages holding a permitted portal node, in mind or palace, at or above
 * the usable mastery — the holder set `rules-raid`'s `portalGate` counts.
 *
 * One pass over the instance table rather than a pass per mage: a late
 * universe holds tens of thousands of instances and this runs every tick.
 */
export function thresholdKeepers(
  state: SimState,
  ruleset: Ruleset,
  cells: CellResolver,
  weights: Pick<TendedFaucetWeights, 'portalNodes' | 'usableMastery'>,
): number {
  if (weights.portalNodes.size === 0) return 0;
  const mages = componentOf(state, MAGE);
  const keepers = new Set<number>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind && row.locationKind !== LOCATION_KIND.palace) continue;
    if (row.mastery < weights.usableMastery) continue;
    if (!weights.portalNodes.has(row.nodeId)) continue;
    if (keepers.has(row.locationId)) continue;
    const mage = row.locationId as EntityHandle;
    if (!mages.has(mage) || mages.get(mage, 'alive') === 0) continue;
    const cellId = cells.cellOf(row.nodeId);
    if (!isCellId(cellId) || !permits(ruleset, cellId)) continue;
    keepers.add(row.locationId);
  }
  return keepers.size;
}

/**
 * The tick's yield from both faucets.
 *
 * @param researchMonthsGranted - Research mage-months the archive paid for, `fp`.
 */
export function tendedYield(
  keepers: number,
  researchMonthsGranted: Fixed,
  weights: TendedFaucetWeights,
): MaterialAmounts {
  const yielded = zeroAmounts();
  const counted = Math.min(Math.max(keepers, 0), Math.max(weights.maxKeepers, 0));
  yielded.passage = counted * Math.max(weights.passagePerKeeper, 0);
  yielded.insight = mul(Math.max(researchMonthsGranted, 0), Math.max(weights.researchInsightPerMonth, 0));
  return yielded;
}
