/*
 * Multiverse Mages — gathering effect contributions from usable instances.
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
 * ## One gate, in one place
 *
 * Four questions decide whether a held instance is a candidate at all:
 *
 * 1. Is it held somewhere that can act — a mind or a palace, not a book?
 * 2. Is its mastery at or above the activation threshold?
 * 3. Is its cell permitted, i.e. is it not dormant?
 * 4. Does the primitive's declared scale apply in the current clock mode?
 *
 * All four are asked here, and question 3 is asked **exactly once per candidate
 * instance**, before any contribution exists. That is `magic-primitives`'
 * "single-point legality" requirement, and the reason for it is not efficiency.
 * A pipeline that carried a `legal` flag forward would let two consumers
 * disagree about what to do with `false` — one skipping, one assuming the skip
 * already happened — and neither call site would look wrong. So an illegal
 * instance produces no contribution at all, and {@link EffectContribution} has
 * nowhere to record that a question was ever asked.
 *
 * ## A fifth question, added by W20, asked second
 *
 * `compositional-content.md` §3.4 gives every effect a `when`: `always`
 * (the default, and every effect authored before this change), `revealed`
 * (latent — contributes only while a held `reveal` effect names it), or
 * `holds-cell` (contributes only while the holder has at least `minNodes` of
 * a named cell). Answering it needs to know, in advance, which reveals are
 * active and how many nodes of each cell are held — information that is not
 * available effect by effect. So gathering is **two passes** over the same
 * instances rather than one:
 *
 * - **Pass 1** asks the original four questions only, and from what survives
 *   collects every active `reveal` effect's target and a per-cell count of
 *   held, contributing instances (`holds-cell`'s "held" is exactly this: the
 *   same location/mastery/permits notion of "held and usable" the other four
 *   gates already define, not a bare knowledge-graph membership check).
 *   A `reveal` effect's own `when` is deliberately **not** consulted in this
 *   pass — only the four original gates are — so a reveal can never itself be
 *   latent behind another reveal. That keeps this a single non-cyclic sweep
 *   instead of a fixed-point search over a graph nothing here promises
 *   terminates.
 * - **Pass 2** asks all five questions, including `when`, over the same
 *   instances in the same order, and is what actually builds the returned
 *   contributions — `reveal`-mode and `control`-mode effects included, marked
 *   by their `mode` so a caller can see they carry no magnitude.
 *
 * Two passes over the *same* materialized list, so a one-shot iterable is
 * copied once at the top rather than consumed twice.
 *
 * ## What this file may not do
 *
 * It may not combine anything. Two instances of the same primitive produce two
 * contributions, not one sum. Combining is `@mm/primitives`, via `stack.ts` —
 * see `contracts.md` §3 and the lint rule that enforces it.
 */

import type { ContentId, ContentRegistry, EffectRecord, NodeRecord } from '@mm/content';
import type { Fixed, TimeMode } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import { permits } from '@mm/state';

import type {
  EffectContribution,
  EffectSourceInstance,
  RevealTarget,
} from './contribution.js';
import { CONTRIBUTING_LOCATION_KINDS, MASTERY_ACTIVATION_THRESHOLD } from './contribution.js';
import { requireNode, requirePrimitive } from './registry-lookup.js';
import { primitiveAppliesInMode } from './scale.js';

/**
 * Everything gathering needs that is not the instances themselves.
 *
 * `cellOf` is a parameter rather than an import because `magic-grid` owns cell
 * addressing and this file owns effects; passing it keeps the two independently
 * testable and keeps there being exactly one implementation of each. `permits`
 * is imported directly, because `contracts.md` §1.1 says there is one
 * arbitration function and this is a consumer of it, not a second one.
 */
export interface EffectGatherContext {
  readonly registry: ContentRegistry;
  /** The universe's ruleset, or a raid's captured snapshot (`contracts.md` §1.1). */
  readonly ruleset: Ruleset;
  /** The clock mode effects are being gathered for. */
  readonly mode: TimeMode;
  /** `magic-grid`'s cell addressing: the interned cell id a node belongs to. */
  readonly cellOf: (nodeId: ContentId) => number;
  /** Defaults to {@link MASTERY_ACTIVATION_THRESHOLD}. */
  readonly activationThreshold?: Fixed;
}

/**
 * Whether an instance is a candidate at all, before legality is considered.
 *
 * Split out so the two cheap, purely local tests happen before the ruleset walk
 * — and, more importantly, so that a grimoire never causes a legality question
 * to be asked about it. Nothing downstream can then mistake "this book's cell
 * is permitted" for "this book contributes".
 */
function isContributingLocation(instance: EffectSourceInstance): boolean {
  return CONTRIBUTING_LOCATION_KINDS.has(instance.locationKind);
}

/**
 * Whether a held target's declared fields all match a candidate `revealed`
 * effect. `compositional-content.md` §3.4: "a reveal matches when every field
 * it declares matches" — an undeclared field imposes no constraint, and
 * declaring both `cell` and `primitive` is the conjunction of both.
 */
function revealMatches(target: RevealTarget, nodeCell: string, primitiveId: string): boolean {
  if (target.cell !== undefined && target.cell !== nodeCell) return false;
  if (target.primitive !== undefined && target.primitive !== primitiveId) return false;
  return true;
}

/**
 * Whether `effect`'s `when` is satisfied, given what pass 1 collected.
 *
 * Absent `when` means `always`, per `compositional-content.md` §3.4 and every
 * effect authored before it existed.
 */
function whenSatisfied(
  effect: EffectRecord,
  nodeCell: string,
  revealTargets: readonly RevealTarget[],
  heldCellCounts: ReadonlyMap<string, number>,
): boolean {
  const when = effect.when ?? { kind: 'always' as const };
  switch (when.kind) {
    case 'always':
      return true;
    case 'revealed':
      return revealTargets.some((target) => revealMatches(target, nodeCell, effect.primitive));
    case 'holds-cell':
      return (heldCellCounts.get(when.cell) ?? 0) >= when.minNodes;
  }
}

/** Builds one contribution, adding `control`/`transformTo` only when the effect carries them (`exactOptionalPropertyTypes`). */
function buildContribution(
  instance: EffectSourceInstance,
  effect: EffectRecord,
  primitiveId: string,
): EffectContribution {
  const contribution: {
    nodeId: ContentId;
    primitiveId: string;
    magnitude: Fixed;
    target: EffectContribution['target'];
    durationTicks: number;
    mode: EffectContribution['mode'];
    // `NonNullable`, not the indexed type. Indexing an optional property yields
    // `T | undefined`, which under `exactOptionalPropertyTypes` is a *wider*
    // type than the target's `control?: EffectControl` — that one permits the
    // key to be absent but never permits it to be present and undefined.
    control?: NonNullable<EffectContribution['control']>;
    transformTo?: NonNullable<EffectContribution['transformTo']>;
  } = {
    nodeId: instance.nodeId,
    primitiveId,
    magnitude: effect.magnitude,
    target: effect.target,
    durationTicks: effect.durationTicks,
    mode: effect.mode,
  };
  if (effect.control !== undefined) contribution.control = effect.control;
  if (effect.transformTo !== undefined) contribution.transformTo = effect.transformTo;
  return contribution;
}

/** A candidate that survived the four original gates, with its node resolved once. */
interface Candidate {
  readonly instance: EffectSourceInstance;
  readonly node: NodeRecord;
}

/**
 * Every effect contributed by these instances, in this mode, under this ruleset.
 *
 * Order is deterministic and meaningful: instances in the order given, and
 * within an instance the node's effects in declared order. Nothing sorts, so
 * two peers holding the same instances in the same order produce byte-identical
 * contribution lists — and the one place order genuinely must not matter, the
 * fold over magnitudes, is `@mm/primitives`' problem and is solved there.
 *
 * Instances are read and never written. A dormant instance is skipped, not
 * destroyed: `contracts.md` §1.1 is explicit that a mage may hold knowledge her
 * universe has since forbidden.
 */
export function gatherEffects(
  instances: Iterable<EffectSourceInstance>,
  context: EffectGatherContext,
): readonly EffectContribution[] {
  const { registry, ruleset, mode, cellOf } = context;
  const threshold = context.activationThreshold ?? MASTERY_ACTIVATION_THRESHOLD;

  // ---- The four original gates, and `requireNode`, each asked exactly once
  // per instance, before either of the two `when`-passes below runs. Two
  // passes over the *reveal/holds-cell* question must not become two
  // evaluations of legality — `cellOf`/`permits` counting once per candidate
  // is a documented invariant (`effect-gathering.test.ts`), not an
  // implementation detail free to move.
  const candidates: Candidate[] = [];
  for (const instance of instances) {
    if (!isContributingLocation(instance)) continue;
    if (instance.mastery < threshold) continue;
    // ---- The single legality point, asked once per instance. ----
    if (!permits(ruleset, cellOf(instance.nodeId))) continue;
    candidates.push({ instance, node: requireNode(registry, instance.nodeId) });
  }

  // ---- Pass 1, over the gated candidates only: collects what pass 2 needs
  // to answer `when` — active reveals, and a per-cell count of held,
  // contributing instances. A `reveal` effect's own `when` is deliberately
  // not consulted here, so a reveal can never itself be latent behind
  // another reveal — see this file's opening note.
  const revealTargets: RevealTarget[] = [];
  const heldCellCounts = new Map<string, number>();

  for (const { node } of candidates) {
    heldCellCounts.set(node.cell, (heldCellCounts.get(node.cell) ?? 0) + 1);

    for (const effect of node.effects) {
      if (effect.mode !== 'reveal') continue;
      const primitive = requirePrimitive(registry, effect.primitive);
      if (!primitiveAppliesInMode(primitive, mode)) continue;
      if (effect.reveals !== undefined) revealTargets.push(effect.reveals);
    }
  }

  // ---- Pass 2, over the same candidates in the same order: scale and
  // `when`, and builds the result.
  const contributions: EffectContribution[] = [];

  for (const { instance, node } of candidates) {
    for (const effect of node.effects) {
      const primitive = requirePrimitive(registry, effect.primitive);
      if (!primitiveAppliesInMode(primitive, mode)) continue;
      if (!whenSatisfied(effect, node.cell, revealTargets, heldCellCounts)) continue;

      contributions.push(buildContribution(instance, effect, primitive.id));
    }
  }

  return contributions;
}
