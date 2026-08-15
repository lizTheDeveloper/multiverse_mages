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
    // 357, not 300: W20 replaced 51 ladder nodes with 108 compositional ones
    // across the twelve v1 cells, moving the shipped total from 300 to 357.
    // Node ids intern in sort order, so `rn-keep-the-name-close` moves from
    // 285 to 334 and every node after it shifts too — the renumbering these
    // assertions exist to surface.
    expect(registry.intern('node', 'rn-keep-the-name-close')).toBe(334);
    expect(registry.intern('node', 'rv-turn-the-casting')).toBe(357);
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
    // ---- This branch's lineage from a622452a ----------------------------
    //
    // a622452a3b55e38fd902a2d3264b44d7 -> 02b5a898c8fff086f669ce8ddbe8631c, when W20
    // replaced 51 ladder nodes with 108 compositional ones across the twelve v1
    // cells (300 -> 357 nodes) and gave every effect a required `mode`, plus
    // `track.json` (§2.12) — the named routes an exclusion can bind to instead of
    // node by node. Two universes disagreeing about which nodes exist, what their
    // effects fold into, or which routes exclude which would be developing
    // different magic while their revisions agreed they were compatible.
    //
    // 02b5a898c8fff086f669ce8ddbe8631c -> 2fc8c278bee8b8c7e62e645d5c7ebe83, when
    // `ritual.json` (§2.13) shipped two spells that require more than one mage to
    // cast, each naming caster roles on tracks `track.json` already declares
    // mutually exclusive. Two universes disagreeing about which rituals exist, or
    // what caster roles they demand, would be developing different magic while
    // their revisions agreed they were compatible — the same argument every prior
    // entry in this history makes, for the same reason.
    //
    // 2fc8c278bee8b8c7e62e645d5c7ebe83 -> e3d4613284f6d261cac90fe13e80c1a6, when a
    // gloss audit against `docs/design/content/spell-glosses.md` rewrote twenty
    // gloss strings across twelve v1 nodes. **Provenance only: no rule reads a
    // `gloss`, so no metric can move.** The revision changes anyway, and should —
    // §0 makes this a compatibility gate over the whole content set rather than
    // over the mechanical subset of it, precisely so that nobody has to maintain a
    // second opinion about which fields count. The audit's substance was that
    // eight `reveal`-mode Intellego nodes were glossed with the destruction verbs
    // of the nodes they merely unlock, claiming a steal or an erasure at a node
    // that contributes zero magnitude — content asserting a mechanic it does not
    // have, invisible to every test, because a gloss is a string.
    //
    // ---- `main`'s lineage from the same a622452a -------------------------
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
    // ---- W64: the two lineages meet -------------------------------------
    //
    // 6973d2c55f6d7788bbaa6886e507bbde and e3d4613284f6d261cac90fe13e80c1a6
    // -> 542c55de64f8c9348ff6256e5e57bb61, when `w20/compositional-content`
    // was re-cut against current `main` and the two lineages above — which
    // fork at a622452a and had not met until this commit — were merged.
    //
    // Neither parent's literal survives, and for the third time in this list
    // that is the correct outcome rather than a lost claim. `main`'s
    // 6973d2c5 is a digest over a preimage holding the material split, the
    // raid constants, the summons cap and both `node.json` passes, and none
    // of this branch's 108 compositional nodes, `track.json`, `ritual.json`
    // or the effect `mode`. This branch's e3d46132 is a digest over the
    // mirror-image preimage. This tree is the first one holding both, so a
    // third value is exactly what a digest over the union is supposed to
    // produce; a merge that kept either literal would be asserting a
    // revision no tree has.
    //
    // One authoring decision inside that union is recorded here rather than
    // buried in the data, because it is a deferral and not a judgement. The
    // merged `node.json` is 357 records: `main`'s 300, each keeping the
    // `knowledgeKind` it was judged with — all twenty-nine `metis` calls in
    // `docs/design/metis-authoring.md` survive this merge unmoved — plus
    // this branch's 57 new compositional nodes, which are marked `episteme`
    // **uniformly and mechanically, exactly as `d97caaaa`'s pass marked the
    // original 300.** No probe in `metis-authoring.md` §1 was applied to any
    // of the 57, and twenty of them are Intellego, where that document's
    // first pass found 25 of its 29 calls — so the honest reading is that
    // the mētis pass over W20's content has not been done, not that it was
    // done and came back empty. It is deliberately left as a separate,
    // reviewable authoring change for the same reason `d97caaaa` and
    // `5c319f82` were kept apart: a merge is not a defensible place to make
    // 57 new content judgements. Nothing in the rules path reads
    // `knowledgeKind`, so this moves no metric today; what it defers is a
    // design claim, not a number.
    //
    // ---- W64 arrives, and this is the merge that produced the literal below --
    //
    // Both lineages above met here. `main`'s chain (ending d4e30476) is a digest
    // over a preimage holding the material split, the raid constants, the
    // summons cap, the grant budget and `apply-magic`'s two scalars, and none of
    // this branch's compositional nodes, `track.json`, `ritual.json` or the
    // effect `mode`. This branch's chain (ending 542c55de) is the mirror image.
    // This tree is the first holding both, so a third value is exactly what a
    // digest over the union is supposed to produce, and it was **re-measured
    // from the merged tree** rather than taken from either side.
    //
    // One authoring decision inside that union is recorded here rather than
    // buried in the data, because it is a deferral and not a judgement. The
    // merged `node.json` is 357 records: `main`'s 300, each keeping the
    // `knowledgeKind` it was judged with — all twenty-nine `metis` calls in
    // `docs/design/metis-authoring.md` survive this merge unmoved — plus this
    // branch's 57 new compositional nodes, which are marked `episteme`
    // **uniformly and mechanically, exactly as `d97caaaa`'s pass marked the
    // original 300.** No probe in `metis-authoring.md` §1 was applied to any of
    // the 57, and twenty of them are Intellego, where that document's first pass
    // found 25 of its 29 calls — so the honest reading is that the mētis pass
    // over W20's content has not been done, not that it was done and came back
    // empty. Nothing in the rules path reads `knowledgeKind`, so this moves no
    // metric today; what it defers is a design claim, not a number.
    expect(registry.contentRevision).toBe('f7dd80543d8080cc0eee53ed27f1ab84');
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
