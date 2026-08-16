/*
 * Multiverse Mages — interning is deterministic, and contentRevision gates it.
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
 * **How "stable across processes" is actually tested.** Spawning a second
 * process would only re-run the same code, so it would demonstrate nothing that
 * a second in-process load does not. What can differ between processes is the
 * *input order* — a content file reordered by a merge, a directory listing, a
 * hash-map iteration — and the *environment*, through locale-sensitive
 * collation. Both are tested directly:
 *
 * 1. Interning is invariant under reordering every content file.
 * 2. The whole mapping is pinned against a committed golden table, so any build
 *    on any machine that produces a different integer for a string fails here
 *    rather than in a desynchronised multiplayer match.
 */

import { describe, expect, it } from 'vitest';

import {
  CONTENT_FILES,
  cellAxes,
  internSorted,
  loadContent,
  shippedContentSource,
} from '@mm/content';
import type { ContentNamespace, ContentRegistry } from '@mm/content';

import { shippedDocuments, sourceOf } from './fixtures.js';

const NAMESPACES: readonly ContentNamespace[] = [
  'technique',
  'form',
  'cell',
  'node',
  'species',
  'tradition',
  'primitive',
  'territory',
];

/** Every string id to its integer, across every namespace. */
function fullMapping(registry: ContentRegistry): Record<string, number> {
  const mapping: Record<string, number> = {};
  const namespaced = [
    ['technique', registry.techniques],
    ['form', registry.forms],
    ['cell', registry.cells],
    ['node', registry.nodes],
    ['species', registry.species],
    ['tradition', registry.traditions],
    ['primitive', registry.primitives],
    ['territory', registry.territories],
  ] as const;
  for (const [namespace, entries] of namespaced) {
    for (const entry of entries) mapping[`${namespace}:${entry.record.id}`] = entry.contentId;
  }
  return mapping;
}

/** The shipped content with every file's records reversed. */
function reversedSource(): ReturnType<typeof sourceOf> {
  const documents = shippedDocuments();
  for (const fileName of CONTENT_FILES) {
    documents[fileName] = [...(documents[fileName] as unknown[])].reverse();
  }
  return sourceOf(documents, 'reversed');
}

const registry = loadContent(shippedContentSource());

describe('interning', () => {
  it('produces the same mapping on a second load', () => {
    const second = loadContent(shippedContentSource());
    expect(fullMapping(second)).toEqual(fullMapping(registry));
  });

  it('is invariant under reordering every content file', () => {
    const reversed = loadContent(reversedSource());
    expect(fullMapping(reversed)).toEqual(fullMapping(registry));
    expect(reversed.contentRevision).toBe(registry.contentRevision);
  });

  it('never assigns the reserved id 0, and assigns each id exactly once', () => {
    for (const namespace of NAMESPACES) {
      const ids = new Set<number>();
      const entries = Object.entries(fullMapping(registry)).filter(([key]) =>
        key.startsWith(`${namespace}:`),
      );
      for (const [, contentId] of entries) {
        expect(contentId).toBeGreaterThan(0);
        expect(ids.has(contentId)).toBe(false);
        ids.add(contentId);
      }
    }
  });

  it('returns 0 for an id that is not in the namespace', () => {
    expect(registry.intern('node', 'no-such-node')).toBe(0);
    expect(registry.intern('cell', 'rego-limen')).toBeGreaterThan(0);
  });

  it('derives cell ids from the grid, so every axis pair is addressable', () => {
    for (const entry of registry.cells) {
      const { techniqueBit, formBit } = cellAxes(entry.contentId);
      expect(registry.cellAt(techniqueBit + 1, formBit + 1)).toBe(entry.contentId);
    }
    expect(registry.intern('cell', 'rego-limen')).toBe(4 * 14 + 12 + 1);
  });

  it('sorts by code unit, never by locale collation', () => {
    // A locale-aware sort can place "co-op" and "coop" differently depending on
    // the ICU build, which is exactly the cross-machine divergence banned in
    // CLAUDE.md. The code-unit order is fixed: "-" (0x2D) precedes any letter.
    const table = internSorted(['coop', 'co-op', 'zz', 'aa']);
    expect([...table.entries()]).toEqual([
      ['aa', 1],
      ['co-op', 2],
      ['coop', 3],
      ['zz', 4],
    ]);
  });

  it('pins the interned integers of the shipped content set', () => {
    // A golden table, deliberately spanning all eight namespaces. If a future
    // change renumbers content, this fails and the fix is a considered decision
    // about whether the contentRevision bump is acceptable — not a surprise.
    expect(registry.intern('technique', 'rego')).toBe(5);
    expect(registry.intern('form', 'nomen')).toBe(14);
    expect(registry.intern('cell', 'creo-animal')).toBe(1);
    expect(registry.intern('cell', 'rego-nomen')).toBe(70);
    expect(registry.intern('node', 'can-call-the-pack')).toBe(1);
    // 300, not 299: pre-authoring the other 58 cells brought 249 nodes, and
    // `knowledge-model` task 2.5's `rn-keep-the-name-close` is the one neither
    // side of that merge shared. Node ids intern in sort order, so it lands at
    // 285 and every node after it shifts by one — the renumbering these
    // assertions exist to surface.
    expect(registry.intern('node', 'rn-keep-the-name-close')).toBe(285);
    expect(registry.intern('node', 'rv-turn-the-casting')).toBe(300);
    expect(registry.intern('species', 'draconic')).toBe(1);
    expect(registry.intern('tradition', 'art-of-memory')).toBe(1);
    expect(registry.intern('primitive', 'area-denial')).toBe(1);
    expect(registry.intern('territory', 'arable-lowland')).toBe(1);
  });

  it('round-trips an interned id back to its string', () => {
    for (const namespace of NAMESPACES) {
      for (const [key, contentId] of Object.entries(fullMapping(registry))) {
        if (!key.startsWith(`${namespace}:`)) continue;
        expect(registry.idOf(namespace, contentId)).toBe(key.slice(namespace.length + 1));
      }
    }
  });
});

describe('contentRevision', () => {
  it('is a 32-character hex digest', () => {
    expect(registry.contentRevision).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('is pinned to the digest of the shipped content set', () => {
    // The golden table above samples nine interned ids out of several hundred.
    // This is the whole-set fingerprint: one value that changes if *any* byte
    // of *any* shipped record changes, including the ones nobody sampled.
    //
    // §0 makes this load-bearing rather than decorative — two universes may
    // only interact if their `contentRevision` values are equal — so a silent
    // drift here is a silent refusal to raid, or worse, two builds that agree
    // on the hash and disagree on the content. The tests below prove the digest
    // *moves* when content changes; only a pinned literal proves it lands
    // where every other machine lands.
    //
    // A failure here is not a test to update reflexively. It says the shipped
    // content set changed, and the question is whether that was intended.
    //
    // It has moved twice, both deliberately:
    //
    // a3e246fb601bc6c3c19e9682cd94e1ea -> 5444a4e2727aa7ba20ffaa4ef67981d1,
    // when `knowledge-model` task 2.5 added the `rn-keep-the-name-close` node so
    // that `rego-nomen` carries `concealment`, which the task list requires of
    // that cell and which no rego cell previously supplied.
    //
    // 5444a4e2727aa7ba20ffaa4ef67981d1 -> 4f90d08940a3f0224893a2731eed41e9,
    // when the other 58 cells were pre-authored: 249 nodes and every cell's
    // `nodes` list. Nothing in the v1 subset changed, but the digest covers the
    // whole shipped set by design, so it moves anyway. That is the correct
    // behaviour and the reason `contentRevision` gates raiding rather than some
    // v1-only fingerprint — two universes disagreeing about the inert 58 cells
    // would disagree the moment either one enabled a cell.
    //
    // 4f90d08940a3f0224893a2731eed41e9 -> f813d90d3ddadb345c0a9d55505de432,
    // when `territory.json` was added as the eighth content file (§2.7) so that
    // carrying capacity could be derived from a fixed resource instead of from
    // the materials stock, which by construction only grows. Five new records
    // and a new namespace in the preimage; nothing existing changed a byte.
    //
    // f813d90d3ddadb345c0a9d55505de432 -> 0e63987b2823f4d991ea1c7a40944055,
    // when `god-agency` added `god-cost.json` and `god-constant.json` — the
    // price of every §4.2 action, and every magnitude of the worship loop, the
    // favor economy, ascension, stagnation and prestige. They are in the
    // preimage deliberately: two universes that disagreed about what forbidding
    // a technique costs, or about the worship saturation constants, would be
    // playing different games while their revisions agreed they were
    // compatible. Nothing existing changed a byte.
    //
    // 0e63987b2823f4d991ea1c7a40944055 -> f66b312c914c5c1159d12626bcf40ff8,
    // when `raid-engagement` added `raid-constant.json` (§2.10) — every
    // magnitude an engagement is made of, and with them the two authored
    // integers the termination proof rests on. They are in the preimage for the
    // reason the god tables are: two universes that disagreed about how long a
    // portal holds would fight two different battles while their revisions
    // agreed they were compatible. Nothing existing changed a byte.
    //
    // 2512ea02d2a7569d8d0bacc4c5a926ca -> ec506311ed7aadeb1aaf0e14f5750465,
    // when the ascension predicates were made to read positive achievement and
    // five constants joined `god-constant.json`: `ascension-summit-cells`,
    // `ascension-summit-copies`, `ascension-canon-breadth`,
    // `ascension-canon-cells` and `ascension-loss-fraction`. Unlike every move
    // above it, this one is *not* "nothing existing changed a byte" in effect —
    // no existing record changed, but the rules that read these constants decide
    // when a run ends, so two universes on either side of this revision would
    // disagree about whether a game was over. That is exactly what the revision
    // exists to make incompatible, and it is why the digest is checked rather
    // than the file list.
    //
    // ec506311ed7aadeb1aaf0e14f5750465 -> 61f6aa53e091684809765b1f9020ee96, when
    // `raid-engagement` added the constants that make a raid fire — the arrival
    // process, the loot count, and the rival stand-in a warband is drawn from.
    // They are in the preimage for the reason the god tables are: two universes
    // that disagreed about how long a portal holds, or about how many books come
    // off a shelf, would fight two different battles while their revisions agreed
    // they were compatible.
    //
    // W6 and W8 each recorded a successor to 2512ea02 on their own branches —
    // ec506311 and aeedc362 — because neither contained the other. This tree
    // contains both sets of constants, so it is a third revision, and that it is
    // neither of theirs is the whole point of a digest over the preimage rather
    // than a hand-maintained list.
    //
    // 61f6aa53e091684809765b1f9020ee96 -> a622452a3b55e38fd902a2d3264b44d7, when W17 added
    // `autonomy-weight.json` (§2.11) — every magnitude a mage's choice of *which
    // node to work on* is made of, including the role x primitive table that
    // makes vision §7's standing role a number. It is in the preimage for the
    // reason the other three tables are: two universes whose mages valued the
    // same node differently would be developing different magic while their
    // revisions agreed they were compatible. Nothing existing changed a byte.
    //
    // Three branches each recorded a successor to 2512ea02 — W6's ec506311,
    // W8's aeedc362 and W17's d37624e3 — because no two of them contained each
    // other. This is the revision of the tree that holds all three.
    //
    // a622452a3b55e38fd902a2d3264b44d7 -> 2c67315ae04ee6c74dfa204474af4eb6,
    // when the single undifferentiated materials stock was split into three
    // material kinds — `food`, `stone`, `vellum` — routed by form and produced
    // in differing mixes by territory. Unlike most entries above this one is
    // not "nothing existing changed a byte": every one of the fourteen
    // `form.json` records gained `yieldWeights` and `tuningStatus`, and every
    // one of the five `territory.json` records gained `yieldPerLandUnit`. Both
    // are in the preimage on purpose — two universes that disagreed about
    // what a form's magic actually yields, or about what a stretch of land
    // produces, would be running different economies while their revisions
    // agreed they were compatible.
    //
    // `main` reached this merge asserting d37624e3 — W17's successor, taken
    // there without W6's or W8's constants and without the material split. It
    // is not a competing claim about the same tree: it is a claim about a
    // smaller preimage, and this tree's preimage strictly contains it. The
    // digest moving from d37624e3 to 2c67315a across this merge is therefore
    // the union arriving, not a disagreement being settled.
    //
    // 2c67315ae04ee6c74dfa204474af4eb6 -> ba7be8d68b582e2985e0360bbc7e11b0,
    // when this branch merged `main` and took `main`'s
    // `max-summons-per-side`. On `main` that
    // edit reads `d37624e36be00f59cf21b87ff6eba144 ->
    // 6b18886a4b3a2803c0b1b92eb8f8fae8`: the cap came down from 16 to 8 to
    // agree with `primitive.json`'s `summon` cap, which is the same ceiling
    // authored twice and had disagreed with it since both files existed. It is
    // a *value* edit rather than a new file — the first one in this list that
    // is — which is the point of a revision over the values: two universes
    // that disagreed about how many summons a side may hold would fight two
    // different battles, and the digest says so instead of calling them
    // compatible.
    //
    // So neither 2c67315a nor 6b18886a survives the merge, and that is
    // correct rather than a lost claim. Each was a digest over a preimage the
    // other did not contain — this branch's material split, `main`'s summon
    // cap — and this tree is the first one holding both. A fourth value is
    // what a digest over the union is supposed to produce; a merge that kept
    // either side's literal would be asserting a revision no tree has.
    // ba7be8d68b582e2985e0360bbc7e11b0 -> 6973d2c55f6d7788bbaa6886e507bbde, when this branch
    // merged `main` a second time and took the two `node.json` passes `main`
    // had landed meanwhile. On `main` they read as two edits.
    //
    // The first, `6b18886a4b3a2803c0b1b92eb8f8fae8 ->
    // d97caaaa431191d5a8e3cc46b55be1f7`, added `knowledgeKind` to `node.json`
    // (§2.3) with `episteme` on every one of the 300 records — the field that
    // decides whether a node's knowledge survives being written down. No node's
    // kind was *judged* in this step and no simulated result moved: the revision
    // is in the preimage because the field will gate scribing, so two universes
    // disagreeing about which nodes can be written would run different libraries
    // while their revisions agreed they were compatible. Kept separate from the
    // authoring pass below on purpose, so the mechanical edit and the design
    // judgements are reviewable apart.
    //
    // The second, `d97caaaa431191d5a8e3cc46b55be1f7 ->
    // 5c319f8275e05ddef2a166dd7552942b`, judged twenty-nine of the three
    // hundred `metis` — the first authoring pass, reasoned node by node in
    // `docs/design/metis-authoring.md`. A pure value edit, like the summons cap
    // above and unlike the four file additions before it. It belongs in the
    // preimage because two universes disagreeing about *which* knowledge can be
    // written down would keep different libraries and lose different things,
    // which is not a difference a compatibility check may shrug at.
    //
    // And so, for the second time in this list, neither side's literal survives:
    // not this branch's ba7be8d6, which is a digest over a preimage holding the
    // material split and the raid constants but neither `node.json` pass, and
    // not `main`'s 5c319f82, which holds both passes and neither of this
    // branch's. This tree is the first one holding all four. A fifth value is
    // what a digest over the union is supposed to produce, and it is the same
    // reason the check is a digest over the preimage rather than a
    // hand-maintained list of file names.
    //
    // 6973d2c55f6d7788bbaa6886e507bbde -> 162f80bf169296d0e5fd516cc3c5257a,
    // when the founding-grant budget added three god constants — the starting
    // allowance, the self-discovered nodes that earn another grant, and the
    // ceiling. In the preimage for the reason every other god constant is: two
    // universes that disagreed about how many nodes a god may seed would be
    // playing different games while their revisions agreed they were
    // compatible. Nothing existing changed a byte, and all three ship at values
    // no run can reach, so this revision plays identically to the last one —
    // which is the opposite of the ascension-constant move above, and the
    // difference is worth reading: that one changed when a run ends, this one
    // changes nothing until a sweep names a level.
    //
    // `2c67315a` is the digest W29 recorded on its own branch, which reached
    // that point holding W6's, W8's and W17's constants and the material split
    // but *not* the value edit below.
    //
    // 2c67315ae04ee6c74dfa204474af4eb6 -> ba7be8d68b582e2985e0360bbc7e11b0,
    // when W29's tree met a `main` that had meanwhile brought
    // `max-summons-per-side` down from 16 to 8 to agree with `primitive.json`'s
    // `summon` cap — the same ceiling authored twice, disagreeing since both
    // files existed. That edit is the first entry in this whole list that
    // changes a *value* rather than adding a file, which is the point of a
    // revision taken over the values: two universes that disagreed about how
    // many summons a side may hold would fight two different battles, and the
    // digest now says so instead of calling them compatible.
    //
    // `main` reached this merge asserting 6b18886a — W17's successor plus that
    // value edit, taken there without W6's or W8's constants and without the
    // material split. Neither 6b18886a nor 2c67315a is a competing claim about
    // *this* tree: each is a claim about a smaller preimage, and this tree's
    // preimage strictly contains both. ba7be8d6 is therefore the union
    // arriving, not a disagreement being settled — the same situation the
    // three-branch paragraph above describes, one level up.
    //
    // Union again: main's revision together with this branch's metis-from-use
    // content. Neither literal is a digest over a preimage holding both.
    //
    // 162f80bf169296d0e5fd516cc3c5257a -> d4e3047657b4fa8a1a74e1d52f9f5c86,
    // when `apply-magic` added two scalars to `autonomy-weight.json` — what a
    // mage-month of applied magic makes, and what she eats while she makes it.
    // In the preimage for the reason the god constants are: the two numbers
    // decide how much of a universe's economy comes out of its mages rather than
    // its fields, so two universes disagreeing about them would keep different
    // populations while their revisions agreed they were compatible. Unlike the
    // grant-budget move above, this one **does** change every run: applying
    // magic is a goal a mage will choose, so a tick's materials and a tick's
    // goal histogram both move from the first month.
    //
    // Union once more, and this is the merge that produced the literal below:
    // `main`'s chain above met this branch's optional `displacement` term on an
    // effect — five effects on the four `rego-terram` nodes, the first cost any
    // effect in the shipped set has ever carried. Every other effect in
    // `node.json` is untouched and the field is absent from all of them, which
    // is the whole design: absence means "pure bonus", the reading three
    // hundred nodes were authored under.
    //
    // It belongs in the preimage for the plainest possible reason: it changes
    // what a universe *produces*. Two universes agreeing on their revisions
    // while one of them empties its fields when a mage learns to quarry
    // without hands would not be running the same economy, and the raid
    // arbitration that reads the host's ruleset would be arbitrating between
    // two different games.
    //
    // Neither side's literal — this branch's 5ab77110/b6a577dd, nor `main`'s
    // d4e30476 — is a digest over a preimage containing both, so the value
    // below was **re-measured from the merged tree** rather than taken from
    // either side.
    // d4e3047657b4fa8a1a74e1d52f9f5c86 -> e8442af2c5f91ae6f80ad9a178e0e451,
    // when anti-requisites landed (`vision.md` §4b) and `cell.json` gained an
    // `excludes` array carrying one pair: *Creo Ignem* and *Creo Umbra* exclude
    // one another, `destructive`. In the preimage for the sharpest version of
    // the reason every entry above gives — two universes disagreeing about
    // which bodies of magic exclude one another would disagree about what a
    // mage may *hold*, and under a `destructive` resolution about what she
    // loses when she learns the other. A raider carries her own acquisition
    // rules across a portal (§8's arbitration split), so a revision mismatch
    // here is not an abstract incompatibility: it decides whether a stolen node
    // burns the thief's own school.
    //
    // Unlike the founding-grant constants above, this one is **not** inert at
    // ship: the pair is authored on live cells, and any mage who holds one side
    // and acquires the other loses her instances of it. What keeps the shipped
    // baselines still is that no v1 cell is involved — the v1 rectangle is
    // `intellego · perdo · rego` × `mentem · terram · limen · nomen`, and both
    // halves of this pair are *creo*, so the reference universe never reaches
    // either. The mechanic is live and the reference run cannot see it, which is
    // exactly the state a balance sweep should be able to change without a
    // content edit.
    //
    // On this branch that same edit was first recorded as `162f80bf ->
    // ee99b5845d1da2afe532eb5280e07f57`, and the two arrived on separate
    // branches, so neither literal is a digest over a preimage holding both:
    // `d4e30476` has the applied-magic scalars and no exclusions, `ee99b584`
    // has the exclusions and no scalars. This tree is the first holding both,
    // and a third value is what a digest over the union is supposed to produce
    // — the same situation the three-branch paragraph above describes, and the
    // reason the check is a digest over the preimage rather than a
    // hand-maintained list of files.
    //
    // 162f80bf169296d0e5fd516cc3c5257a -> 87fdff6cbf4414b584fef95bf9d4916a,
    // when `w109` appended the seventeenth god cost — action 16, the alliance
    // invitation. A price is in the preimage for the same reason every god
    // constant is: two universes that disagreed about what a scholar costs
    // would be playing different games while their revisions called them
    // compatible. This is an *addition* rather than a value edit, so every
    // existing price is byte-identical and a universe that never invites
    // anybody plays exactly as it did — but the revision moves anyway, and it
    // has to. A digest that only moved when an existing byte changed could not
    // tell a build that knows action 16 from one that does not, and those two
    // builds genuinely cannot replay each other's runs.
    //
    // Union, for the third time in this list, and the two moves above are
    // independent: `apply-magic`'s two `autonomy-weight.json` scalars landed on
    // `main`, this branch's seventeenth god cost landed here, and neither
    // literal is a digest over a preimage holding both. `d4e30476` does not
    // know action 16 exists; `87fdff6c` does not know what a mage-month of
    // applied magic makes. This tree is the first one holding both, so a sixth
    // value is what a digest over the union is supposed to produce — not a
    // disagreement being settled.
    //
    // b63bd615c1877925b36c7b3eb7812731 -> 0dfdd5efc2c6dad07bd486a7d80c851d,
    // when this branch merged the `main` that had meanwhile landed
    // anti-requisites (PR #161). And so, for the fourth time in this list,
    // neither side's literal survives: `e8442af2` is a digest over a preimage
    // holding the exclusion pair and not the seventeenth god cost, `b63bd615`
    // over one holding the seventeenth god cost and not the exclusion pair.
    // This tree is the first one holding both, so a sixth value is what a
    // digest over the union is supposed to produce -- not a disagreement being
    // settled.
    //
    // MEASURED, in one direction only, and the asymmetry is worth reading.
    // Stripping the two `excludes` arrays from `cell.json` on this tree and
    // reloading reproduces `b63bd615...` EXACTLY, so the exclusion pair is the
    // whole of `main`'s contribution to the move and this branch contributes
    // none of it. The mirror probe cannot be run as a content edit: deleting the
    // `invite-scholar` record is refused first by the schema's `minItems` and
    // then, with that relaxed, by the `god-cost` content invariant -- "no cost
    // is declared for action id 16" -- because `GOD_ACTION_ID_MAX` moved to 16
    // in code on this branch. That refusal is the defect fix in the PR body
    // working as intended (an undeclared price is a free action), so the
    // one-sided probe is a property of the invariant, not a gap in the check.
    //
    // Also measured, because it is the obvious thing to assume wrongly: the
    // schema is NOT in the preimage. Editing `god-cost.schema.json`'s
    // `minItems` from 17 to 16 while leaving all seventeen records in place
    // reproduces `0dfdd5ef...` byte-identically. The digest is over the content
    // values, not over the files that constrain them.
    // d4e30476... -> 2644913b..., when magnitudes became signed and
    // `pn-the-nameless` took the first authored **cost** in the grid: a
    // `teach-rate` of −192 beside its concealment. One authored value, and the
    // revision is a digest over the values, so this is the ordinary case rather
    // than a union of branches. It changes every run in which any mage learns
    // The Nameless — which is the point of the change, not a side effect of it.
    //
    // 8681bf846bd94be80fdabc447e6e01df -> 57c4db8d16329e8d4b16503531f6dcc7,
    // when `content/deep-magic` added 37 nodes for the late game and the
    // prestige ladder, and the `nodes` lists of the 31 cells that carry them.
    // An addition again, not a value edit: every existing record is
    // byte-identical, and the two `excludes` arrays `main` had meanwhile
    // authored (PR #161) are still on the two cells that hold them — the merge
    // is a union of that branch's node lists with main's exclusions, so
    // neither side's literal is a digest over a preimage holding both. This
    // tree is the first one holding both, and the value here was recomputed
    // from it rather than copied from either parent.
    //
    // 57c4db8d16329e8d4b16503531f6dcc7 -> 5a7f36e2e3b7d1a349b0e3802cb8fb79,
    // when `w35/permit-cost` appended the four `stewardship-*` magnitudes to
    // `god-constant.json` — the recurring favor cost of holding a permissive
    // ruleset open, and the economy's first drain. Union for the fifth time in
    // this list, and this one is worth naming precisely: the branch recorded
    // `d4e30476… -> 0baf4644…`, over a preimage that has the four stewardship
    // constants and neither the seventeenth god cost, nor the exclusion pair,
    // nor the deep-magic nodes. Every one of those is on this tree. Neither
    // parent's literal is a digest over a preimage holding all of it, so the
    // value here was recomputed from the merged content — 76 constants and 17
    // costs — rather than taken from a side.
    //
    // 5a7f36e2e3b7d1a349b0e3802cb8fb79 -> 5dede81afebb971eba5784765321a035,
    // when the `content/deep-magic` merge was reverted on the Group D
    // integration branch, pending the author's ruling on the set. The 37 nodes
    // and the 31 cells' node lists leave the preimage again; the four
    // `stewardship-*` constants stay, because W35 is independent of them. So
    // this is a *fourth* distinct value rather than a return to `8681bf84…` —
    // that literal is a digest over a preimage with neither the deep-magic
    // nodes nor the stewardship constants, and this tree has the second. The
    // two entries above are left standing on purpose: they are the record of a
    // digest that was computed, not a claim about this tree.
    //
    // 5dede81afebb971eba5784765321a035 -> c96f4046f85b2fc5121e12690c20d810,
    // when `w77/effect-displacement` gave an effect an optional `displacement`
    // term — five effects on the four `rego-terram` nodes, the first cost any
    // effect in the shipped set has carried. Every other effect in `node.json`
    // is untouched and the field is absent from all of them, which is the whole
    // design: absence means *pure bonus*, the reading three hundred nodes were
    // authored under.
    //
    // It belongs in the preimage for the plainest possible reason: it changes
    // what a universe *produces*. Two universes agreeing on their revisions
    // while one of them empties its fields when a mage learns to quarry without
    // hands would not be running the same economy, and the raid arbitration
    // that reads the host's ruleset would be arbitrating between two different
    // games.
    //
    // Union for the sixth time in this list. The branch recorded
    // `5ab77110`/`b6a577dd`, over a preimage without the seventeenth god cost,
    // without the exclusion pair and without W35's four `stewardship-*`
    // constants; all three are on this tree. Re-measured from the merged tree
    // rather than taken from either side.
    //
    // c96f4046f85b2fc5121e12690c20d810 -> 216edfe4b1d99735d4515ae843d2de67,
    // when `w28/magic-regimes` authored four more traditions — `chorale`,
    // `flesh-codex`, `shared-mind`, `witch-bond` — together with the `bounded`
    // store kind the v1 vocabulary was missing, and gave every tradition record
    // a required `gloss` and `tuningStatus`.
    //
    // Unlike most entries in this list, this one *does* change existing
    // records: the three v1 traditions each gained two fields. Every tradition
    // id after `art-of-memory` also renumbers, because four new ids sort in
    // among three — which is precisely the incompatibility the digest exists to
    // catch, since a snapshot stores the integer and only the integer names
    // which tradition. A raid arbitrated under a host whose integer 5 is
    // `true-naming` against a guest whose integer 5 is something else is not a
    // disagreement a mismatch check should let through.
    //
    // Union for the seventh time in this list, and recomputed rather than taken
    // from a side: the branch's preimage has the four regimes and none of W35's
    // stewardship constants or W77's displacement terms, both of which are on
    // this tree.
    expect(registry.contentRevision).toBe('216edfe4b1d99735d4515ae843d2de67');
  });

  it('is stable across loads of identical content', () => {
    expect(loadContent(shippedContentSource()).contentRevision).toBe(registry.contentRevision);
  });

  it('changes when any content value changes', () => {
    const documents = shippedDocuments();
    const nodes = documents['node.json'] as Record<string, unknown>[];
    const target = nodes.find((node) => node['id'] === 'rt-set-the-stone');
    (target?.['effects'] as Record<string, unknown>[])[0]!['magnitude'] = 193;
    const changed = loadContent(sourceOf(documents, 'tweaked'));
    expect(changed.contentRevision).not.toBe(registry.contentRevision);
  });

  it('changes when a record is renamed, because the interning changes too', () => {
    const documents = shippedDocuments();
    const nodes = documents['node.json'] as Record<string, unknown>[];
    const target = nodes.find((node) => node['id'] === 'rt-set-the-stone');
    if (target === undefined) throw new Error('fixture drifted');
    target['id'] = 'rt-set-the-stone-again';
    const cells = documents['cell.json'] as Record<string, unknown>[];
    const cell = cells.find((record) => record['id'] === 'rego-terram');
    cell!['nodes'] = (cell!['nodes'] as string[]).map((id) =>
      id === 'rt-set-the-stone' ? 'rt-set-the-stone-again' : id,
    );
    for (const node of nodes) {
      node['prerequisites'] = (node['prerequisites'] as string[]).map((id) =>
        id === 'rt-set-the-stone' ? 'rt-set-the-stone-again' : id,
      );
    }
    const renamed = loadContent(sourceOf(documents, 'renamed'));
    expect(renamed.contentRevision).not.toBe(registry.contentRevision);
  });
});
