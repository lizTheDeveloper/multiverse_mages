/*
 * Multiverse Mages — the decay curve, handed to the census rather than copied into it.
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
 * W26's wiring: `@mm/agent-api`'s knowledge census asks for the decay
 * arithmetic as an argument, and this is the one place in the workspace that
 * supplies it.
 *
 * ## Why the wiring is here
 *
 * `contracts.md` §5 runs the dependency one way — rules packages never import
 * `agent-api` — so `agent-api` cannot import `masteryFloor` and
 * `masteryDecayPerTick` from `@mm/rules-magic`, and re-deriving them there would
 * be a second copy of a formula. `@mm/scenario` is the composition root and a
 * leaf, and already depends on both, which makes it the only file that can hold
 * both halves without putting an edge anywhere that matters.
 *
 * **Nothing here computes anything.** Every function below is a reference to
 * `rules-magic`'s own export or a lookup into loaded content. If this file ever
 * contains arithmetic, the property it exists to preserve is already gone —
 * `rediscoveryMultiplier` is the precedent, three copies of one number, two of
 * them wrong.
 *
 * ## What it deliberately does not know
 *
 * Dormancy. `masteryFloor` takes it, and the census will ask if given an
 * `isDormant`, but supplying one needs the live ruleset as well as the content
 * — the ruleset changes as the god issues edicts, and a model built once at the
 * top of a run would answer with a stale one. {@link referenceMasteryModel}
 * takes the predicate as an argument so the caller decides, and a caller that
 * omits it gets `dormancyEvaluated: false` in the summary rather than a zero it
 * might mistake for a measurement.
 */

import type { MasteryModel } from '@mm/agent-api';
import type { ContentRegistry } from '@mm/content';
import {
  DEFAULT_TEACH_THRESHOLD,
  masteryDecayPerTick,
  masteryFloor,
} from '@mm/rules-magic';

import { speciesTable } from './content-set.js';

export interface MasteryModelOptions {
  /**
   * `contracts.md` §1.5's `TEACH_THRESHOLD`. Defaults to `rules-magic`'s
   * placeholder, which is the value `teach()` uses when a caller passes none —
   * so the census judges by the same number the rules act on.
   */
  readonly teachThreshold?: number;
  /**
   * Whether the god currently forbids this node's cell. Supply it and the
   * census separates **condemned** instances (no floor, decaying to
   * destruction, and a loss event on the way out) from **marooned** ones
   * (floored, alive, and unteachable forever). Omit it and the census says so.
   */
  readonly isDormant?: (nodeId: number) => boolean;
}

/**
 * The census's {@link MasteryModel}, built from loaded content and
 * `rules-magic`'s own exports.
 *
 * Retention is looked up the way `coordination`'s `world-step.ts` looks it up —
 * species record, `retention` field — and returns `0` for a species the
 * registry does not name, which is what that function returns for a holder with
 * no mage row. The two agreeing matters: a census that scored an orphaned
 * instance differently from the sweep that decays it would report a countdown
 * nobody is running.
 */
export function referenceMasteryModel(
  registry: ContentRegistry,
  options: MasteryModelOptions = {},
): MasteryModel {
  const { speciesOf } = speciesTable(registry);
  const model: MasteryModel = {
    teachThreshold: options.teachThreshold ?? DEFAULT_TEACH_THRESHOLD,
    retentionOfSpecies: (speciesId) => speciesOf(speciesId)?.retention ?? 0,
    masteryFloor,
    masteryDecayPerTick,
  };
  return options.isDormant === undefined ? model : { ...model, isDormant: options.isDormant };
}
