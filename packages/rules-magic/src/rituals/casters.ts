/*
 * Multiverse Mages — a spell that requires more than one mage, derived at
 * cast time and stored nowhere.
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
 * `contracts.md` §2.13: the consequence of §2.12's exclusions rather than an
 * unrelated mechanic. Every school that excludes another is a limitation on
 * one mage; a ritual is what that limitation is *for* — the most powerful
 * spells require casters who between them hold what no one of them could
 * hold alone.
 *
 * ## No ritual state is stored anywhere
 *
 * There is no "ritual team" component and nothing here writes to `@mm/state`.
 * {@link ritualCasters} recomputes an assignment from the university's living,
 * affiliated mages every time it is called — the same reason current
 * knowledge existence is derived rather than cached (`contracts.md` §1.5): it
 * is cheaper, it cannot desynchronise, and it makes a caster's death
 * *instantly* consequential. The capability stops existing on the tick she
 * dies, with nothing to migrate and nothing to clean up. A caller that wants
 * to know whether a ritual is available calls this function again; there is
 * no snapshot of "the last time we checked" anywhere to go stale.
 *
 * ## Co-location is the same university, never a coordinate
 *
 * `vision.md` §7a is explicit that world-scale entities carry no coordinates
 * at all, so proximity has to be expressed non-spatially. Same university is
 * that expression. {@link RitualCasterCandidate} is deliberately a projection
 * of `@mm/state`'s `MageRecord` — `universityId` and `alive` and nothing
 * else — rather than the record itself or a live read through
 * `@mm/rules-world`'s affiliation module: this package may not import
 * `rules-world` (`contracts.md` §5), and affiliation is that package's to
 * write. This file only ever *reads* the two fields a caller already has.
 *
 * ## Deterministic caster selection, which is the easiest place to break replay
 *
 * `docs/design/compositional-content.md` and `contracts.md` §0 require the
 * simulation core to be deterministic, and nothing here draws randomness —
 * there is no RNG parameter, deliberately. But determinism is not automatic
 * just because nothing rolls a die: which mage fills which role has to be a
 * **stable total ordering** over the eligible roster, or two peers replaying
 * the same tick from two different array orderings (candidate discovery
 * order, an entity store's internal iteration, a `Set`'s insertion order)
 * would assign different casters and diverge from there. So:
 *
 * - The roster is sorted on the mage's own entity {@link Handle} — never
 *   arrival order, never anything clock-derived — and the sort happens on a
 *   **copy**, so a caller's own array is never mutated as a side effect of
 *   asking a question.
 * - Roles are filled in the order the content declares them, and each role
 *   takes the **lowest-handle eligible mage not already assigned to an
 *   earlier role** — distinct casters per role is enforced by the algorithm
 *   itself, not left as an emergent property of "whoever qualifies", which is
 *   what makes a one-mage university provably ritual-less regardless of what
 *   she has learned (see {@link ritualCasters}'s own note).
 * - A refusal names the first role that could not be filled, which is itself
 *   deterministic — it can never depend on which later role a caller happens
 *   to check first, because there is only one order this function ever tries.
 *
 * ## World time only, in v1 — deliberately
 *
 * `contracts.md` §4.2 masks nearly every action during an engagement, and
 * `@mm/rules-raid`'s arbitration has no expression of "same university" a
 * visiting caster could ever satisfy — raid-scale entities are a different
 * shape entirely (§1.6). A raid-time ritual would need both an unmasked
 * ritual-cast action and an engagement-scale co-location concept that does
 * not exist yet. Neither is built here; this module answers only "is this
 * ritual available in this university, right now, at world time".
 *
 * ## Cost is host-governed, and moot here
 *
 * `vision.md` §4a defines cost as *"what casting takes out of the caster"*,
 * and a ritual has several. Every caster pays the active tradition's `cost`
 * hook — under the portal rule (§3) a visiting team would each pay the
 * *host* universe's price. This module does not charge anyone: availability
 * is a prerequisite question, and charging casters belongs with whichever
 * future module actually resolves a cast (`contracts.md` §2.13's note on
 * effects being authored but not yet wired, the same gap §6a records for
 * `gatherEffects`).
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Handle, MageRecord } from '@mm/state';

import { heldTrackCount, internTrack } from '../instances/exclusion.js';
import type { NodeCatalog } from '../instances/catalog.js';

/** The reserved "unaffiliated" sentinel `contracts.md` §1.2 gives `universityId`. */
const UNAFFILIATED: Handle = 0;

/**
 * One caster role, resolved to an interned track id.
 *
 * The interned form rather than `RitualRole`'s raw `track` string, for the
 * same reason {@link KnowledgeNode.trackId} is interned rather than left as a
 * string on the hot path: `heldTrackCount` compares against every node a
 * candidate holds, once per role per candidate, and string comparison there
 * would be a per-candidate cost content controls.
 */
export interface RitualRoleDefinition {
  readonly trackId: ContentId;
  readonly minNodes: number;
}

/**
 * A ritual, resolved to interned ids — what {@link ritualCasters} actually
 * reads. Build one with {@link ritualsFromRegistry} once per content load;
 * never per candidate check.
 */
export interface RitualDefinition {
  readonly ritualId: ContentId;
  readonly roles: readonly RitualRoleDefinition[];
}

/**
 * One mage this package is permitted to know about: her handle, and the two
 * `MageRecord` fields co-location and liveness are decided from. See the
 * module note on why this is a projection rather than the record itself.
 */
export interface RitualCasterCandidate {
  readonly handle: Handle;
  readonly mage: Pick<MageRecord, 'universityId' | 'alive'>;
}

/** The part of the knowledge subsystem a ritual check reads. */
export interface RitualKnowledgeView {
  /** `KnowledgeSubsystem.heldNodeIdsOf` — every distinct node id a mage holds. */
  heldNodeIdsOf(holder: Handle): readonly ContentId[];
}

/** What {@link ritualCasters} needs beyond the ritual and the candidate roster. */
export interface RitualCastContext {
  /** The university every caster must be alive and affiliated to. Never `0`. */
  readonly university: Handle;
  readonly catalog: NodeCatalog;
  readonly knowledge: RitualKnowledgeView;
}

/** One role, filled. */
export interface RitualCasterAssignment {
  /** Index into {@link RitualDefinition.roles}. */
  readonly roleIndex: number;
  readonly caster: Handle;
}

/**
 * Why {@link ritualCasters} could not assign a full cast.
 *
 * A refusal is data, never an exception — the same discipline
 * `instances/outcomes.ts`'s {@link KnowledgeRefusal} follows and for the same
 * reason: a caller (mage autonomy, scoring whether a ritual is worth
 * pursuing) may ask this question every tick, and an exception is not
 * something you evaluate a hundred of per tick.
 */
export type RitualRefusal =
  /** `ctx.university` is `0`, the "unaffiliated" sentinel, not a university. */
  | { readonly reason: 'ritual-no-university'; readonly ritualId: ContentId }
  /**
   * No living, affiliated, not-yet-assigned mage in the university satisfies
   * this role's `minNodes` on its track. Names the **first** such role in
   * declaration order — deterministic, because there is exactly one order
   * this function ever tries (see the module note).
   */
  | { readonly reason: 'ritual-role-unfilled'; readonly ritualId: ContentId; readonly roleIndex: number };

/** {@link ritualCasters}'s result: a full cast, or a refusal and no casters. */
export interface RitualCastersResult {
  /** Empty on a refusal. Never partial — either every role filled, or none did. */
  readonly casters: readonly RitualCasterAssignment[];
  /** Present exactly when `casters` is empty. */
  readonly refusal?: RitualRefusal;
}

/**
 * Assigns a distinct caster to every role of a ritual, or reports why it
 * could not — a pure, deterministic function of `ctx.university`'s current
 * roster and what each candidate holds. See the module note for why the
 * ordering below is not incidental.
 *
 * **The acceptance claim this function exists to make true:** no single mage
 * can ever fill every role of a ritual whose roles the content loader has
 * already proven mutually exclusive (`ritual-castable-by-one`,
 * `contracts.md` §2.13) — not because this function refuses to consider her
 * twice (it does refuse that, via `assigned`, but that alone would only ban
 * the *degenerate* one-mage case), but because the track exclusion the
 * loader proved means she can never simultaneously satisfy two roles'
 * `minNodes` requirements in the first place. The `assigned` set exists for
 * the ordinary case of a university with too few *distinct* casters, not as
 * the thing standing between one mage and the whole ritual — the content
 * graph is.
 */
export function ritualCasters(
  ritual: RitualDefinition,
  mages: readonly RitualCasterCandidate[],
  ctx: RitualCastContext,
): RitualCastersResult {
  if (ctx.university === UNAFFILIATED) {
    return { casters: [], refusal: { reason: 'ritual-no-university', ritualId: ritual.ritualId } };
  }

  // A stable total order over the eligible roster, computed on a copy. Never
  // the caller's own array order, never insertion order, never anything
  // clock-derived — see the module note.
  const eligible = mages
    .filter((candidate) => candidate.mage.alive !== 0 && candidate.mage.universityId === ctx.university)
    .slice()
    .sort((a, b) => a.handle - b.handle);

  const assigned = new Set<Handle>();
  const casters: RitualCasterAssignment[] = [];

  for (let roleIndex = 0; roleIndex < ritual.roles.length; roleIndex += 1) {
    const role = ritual.roles[roleIndex];
    if (role === undefined) continue;

    const caster = eligible.find(
      (candidate) =>
        !assigned.has(candidate.handle) &&
        heldTrackCount(ctx.catalog, ctx.knowledge.heldNodeIdsOf(candidate.handle), role.trackId) >=
          role.minNodes,
    );

    if (caster === undefined) {
      return {
        casters: [],
        refusal: { reason: 'ritual-role-unfilled', ritualId: ritual.ritualId, roleIndex },
      };
    }
    assigned.add(caster.handle);
    casters.push({ roleIndex, caster: caster.handle });
  }

  return { casters };
}

/** Whether {@link ritualCasters} would assign a full cast. Never throws. */
export function ritualAvailable(
  ritual: RitualDefinition,
  mages: readonly RitualCasterCandidate[],
  ctx: RitualCastContext,
): boolean {
  return ritualCasters(ritual, mages, ctx).refusal === undefined;
}

/**
 * Projects a loaded content registry's `rituals` into {@link RitualDefinition}s,
 * interning every role's track once. Built once per content load, the same
 * discipline `catalog.ts`'s `catalogFromRegistry` and `exclusion.ts`'s
 * `trackCatalogFromRegistry` follow — never call this per candidate check.
 */
export function ritualsFromRegistry(registry: ContentRegistry): readonly RitualDefinition[] {
  // `ContentRegistry.rituals` is optional (see its own doc): a registry built
  // by `loadContent` always populates it, but the type stays permissive for a
  // hand-built fixture assembled before this field existed.
  return (registry.rituals ?? []).map((entry) => ({
    ritualId: entry.contentId,
    roles: entry.record.roles.map((role) => ({
      trackId: internTrack(registry, role.track),
      minNodes: role.minNodes,
    })),
  }));
}
