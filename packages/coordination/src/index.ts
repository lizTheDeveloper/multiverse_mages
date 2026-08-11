/*
 * Multiverse Mages — coordinating layer public surface.
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
 * `@mm/coordination` — the world step loop, and the adapter that lets world
 * rules reach knowledge rules without a cycle.
 *
 * ## Why this package exists, when §5 did not originally list it
 *
 * `contracts.md` §5 rule 3 requires that where `rules-magic` and `rules-world`
 * interact, *"the interaction lives in a coordinating layer, not in a cycle"*.
 * §5's package list offered two places that could hold one, and neither fits a
 * **world** loop:
 *
 * - **`rules-raid`** is permitted to import both, and the module-boundaries test
 *   names it as the example. But §5 defines it as *"engagement space, combat,
 *   objectives, consequences"*, and none of those is a world tick. Putting the
 *   world loop there would make every consumer that never raids — the headless
 *   Monte Carlo worker, a single-player client between portals — load the
 *   engagement package in order to advance a month, and would hand ownership of
 *   0.4.0's central loop to `raid-engagement`, a capability that has not
 *   started. It also inverts the relationship the clock describes: §0 says an
 *   engagement *freezes* world time, so the raid layer is the thing that pauses
 *   the world loop, and a module cannot cleanly be both the thing paused and the
 *   thing pausing.
 * - **`agent-api`** may import every `rules-*` package, and is where §4's
 *   observation lives. It is ruled out by §5 rule 4 in the other direction:
 *   rules packages never import `agent-api`, so a loop living there could never
 *   be reached by `rules-raid` when a raid writes its consequences back into
 *   world state. The observation layer must not become an input to the rules it
 *   observes, and a world loop it owned would be exactly that.
 *
 * So the coordinating layer gets a package of its own, named for the role §5
 * rule 3 gives it, sitting above both rules packages and below `agent-api`. This
 * is the **third deviation from §5 as originally drawn**, after `state` and
 * `primitives`, and it is recorded beside them for the same reason: §5 was
 * written before anyone tried to satisfy it.
 *
 * ## What is here
 *
 * - {@link CoordinatingKnowledgeGateway} — `rules-world`'s knowledge port,
 *   implemented over `rules-magic`. The only file in the repository that names
 *   both packages.
 * - {@link buildOutlook} — one mage's situation, assembled from both halves.
 * - {@link worldSystem} / {@link defineWorldSimulation} — the tick itself, as a
 *   `System`, so that the pure `step(state, actions, rng) -> state` stays
 *   `@mm/sim-core`'s and is not reimplemented here.
 */

export type { GatewayDeps, LivingMage, MageRates } from './gateway.js';
export {
  CoordinatingKnowledgeGateway,
  MAX_FRONTIER_SCAN,
  MAX_TEACHING_COUNTERPARTIES,
  isHeldAtMind,
} from './gateway.js';

export type { OutlookDeps } from './outlook.js';
export { buildOutlook } from './outlook.js';

export type { WorldSimulation, WorldStepDeps, WorldStepReport } from './world-step.js';
export { defineWorldSimulation, worldSystem } from './world-step.js';
