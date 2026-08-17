/*
 * Multiverse Mages — no strategy silently fails to use a verb it asks for.
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
 * The standing check behind `strategy-audit.ts`. Two incidents made the class:
 * `permissive-breadth` never founded a university in any sweep ever taken, and
 * `narrow-depth` never asked for `grantFoundingKnowledge`. Both were found by
 * reading a preference list by hand, months apart. This is the thing that finds
 * the third one.
 *
 * ## Why it is born with an allowlist, and what each entry costs
 *
 * Three verbs are shadowed on this build. **Fixing them here is forbidden**, and
 * the reason is the reason PR #70 exists as its own change: a strategy edited in
 * the same branch as the check that found it measures the edit rather than the
 * rule, and a preference-order change moves every balance baseline. So each is
 * named, with the finding, and the check fails on anything that is *not* named.
 *
 * The allowlist is checked in both directions. A stale entry — a verb listed
 * here that is no longer shadowed — fails too, because an allowlist that
 * outlives its finding is how a fixed defect goes back to being invisible. It is
 * the same discipline `POOL_BUILD_LIMITS` states for its own entries: *"delete
 * an entry when the mechanic lands."*
 *
 * ## The audit must not change the run it audits
 *
 * `auditPolicy` walks `effectivePreferences` exactly as `policyFor` does. That
 * is a claim about code, and several of these strategies draw randomness inside
 * `preferences`, so a second tallying call would have advanced the agent
 * generator and produced a different universe. The first test below is what
 * holds the claim to account: the two policies must produce the same run, hash
 * for hash.
 */

import { describe, expect, it } from 'vitest';

import { BOT_POOL_REGISTRY, adaptAgentSession, policyFor, runEpisode } from '@mm/mc-harness';
import { agentRng, createSession } from '@mm/agent-api';

import {
  AUDIT_RUN_SEED,
  AUDIT_WORLD_TICK_CAP,
  VERB_VERDICT,
  actionName,
  auditPool,
  formatAudit,
  referenceContent,
  referenceScenario,
} from '../../src/index.js';

/**
 * Verbs known to be shadowed on this build, each with the finding that owns it.
 *
 * Keyed `strategyId/action`. Delete an entry when the strategy is fixed; the
 * check fails on a stale one.
 */
const KNOWN_SHADOWED: Readonly<Record<string, string>> = Object.freeze({
  // `portal-rush/1` was here and is **gone on `integration/all-branches`**,
  // 2026-08-17, deleted rather than left for the reason the next comment gives:
  // a stale entry says a defect is known and accepted when it is in fact gone.
  //
  // What it said: *"permitTechnique is portal-rush's tempo move and sits
  // fourth, behind openPortal, assignRole and encourageResearch. assignRole is
  // legal on all but one tick of a run, so the tempo line is never reached."*
  //
  // **It is not shadowed now because it is not legal now.** `auditPool` on this
  // tree reports action 1 at `ticksLegal 0 / unreachable` for every strategy
  // that lists it: the campaign's opening square is the whole grid, so a
  // universe founded on it already permits all five techniques and
  // `permitTechnique` is `not-a-change` on every tick of every run. A verb the
  // mask never offers cannot be shadowed by the verb in front of it.
  //
  // So this is **not** the shadow lifting and not a fix. The tempo move is
  // still never played; the reason moved one layer down, from "something ahead
  // of it is always legal" to "there is nothing left to permit". Worth saying
  // plainly, because a reader who sees only the deletion would read it as
  // progress: opening the whole grid did not make `portal-rush`'s ruleset move
  // reachable, it made it meaningless.
  // `portal-rush/12` was here and is **gone on `w190/scribing-fidelity`**, so it
  // is deleted rather than left: this file's own rule is that a stale entry is
  // worse than a missing one, because it says a defect is known and accepted
  // when it is in fact gone and the next reader trusts it.
  //
  // What it said: *"encourageResearch sits third, behind assignRole, which is
  // legal on 599 of 600 ticks… the portal is reachable on 384 of 600 ticks now,
  // and on the other 216 assignRole takes the slot instead."* Nothing on that
  // branch touched `portal-rush`, the mask or the preference order. What moved
  // is the tick arithmetic underneath it — a renumbered node graph and a
  // `seek-teaching` that the shelf can now satisfy — so `encourageResearch`
  // reaches the slot and is submitted.
  //
  // **This is a shadow lifting by accident, not a fix**, and it can come back
  // the same way. The durable reading is the one the entry above it still
  // carries: portal-rush's preference order puts its tempo move behind a verb
  // that is legal almost every tick, and whether that shadows anything depends
  // on numbers no one is holding still.
  //
  // `worship-maximizer/11` was here too, and is **gone on
  // `w247/material-economy-build`** — the second entry this list has lost, on
  // the merge that brought the two removals together. Its finding read:
  // *"fundUniversity is a signature action and is never submitted. Both of its
  // entries sit behind blessMage… and blessMage is legal on 598 of 600 ticks.
  // So the strategy whose thesis is that worship is bought with 'blessings and
  // buildings' buys only blessings, and the buildings half of its hypothesis
  // has never been measured."*
  //
  // `material-economy` prices `blessMage` in `insight`, and the reference
  // universe's founding endowment is eight blessings' worth. So `blessMage`
  // stops being legal on 598 of 600 ticks, the entry behind it is finally
  // reached, and the buildings half of the hypothesis gets measured for the
  // first time.
  //
  // Worth naming because it is a general property rather than luck. A verb that
  // shadows another is one that is *always* legal, and a second currency is the
  // cheapest thing there is for making a verb sometimes illegal.
  //
  // **Both removals are unmeasured on this tree**, and that is stated rather
  // than hidden: each was measured on its own branch, against a build the other
  // branch's change was not in. This file's own check is the instrument — it
  // fails on a shadowed verb that is not listed *and* on a listed verb that is
  // no longer shadowed — so a wrong guess here is loud rather than silent.
  // The alliance pair, and the four entries below are one finding written four
  // times because `allianceGroundwork` is one list shared by both arms.
  //
  // `assignRole` sits ahead of both verbs and is legal on 599 of 600 ticks, so
  // neither is ever reached. The `fundUniversity` half is the third instance of
  // the `permissive-breadth` incident: the list *does* put a founding at the
  // front, but only inside `if (universities === 0)`, and the reference universe
  // is seeded with a completed academy — so that branch never runs, the rotated
  // entry behind `assignRole` never fires, and **neither alliance arm founds or
  // funds a university in any run.** `alliance-abstainer` declares
  // `fundUniversity` as a signature action while doing so, which is what makes
  // it the same defect rather than merely a similar one.
  //
  // Why this is recorded rather than fixed here: both arms shadow *identically*,
  // by construction — they share the function — so the paired difference the
  // w109 measurement reports is unaffected, and changing the build order now
  // would invalidate every number already taken against it. Neither strategy is
  // in a gate pool, so nothing baselined moves either way. The fix belongs with
  // the re-measurement, not with this merge.
  // ---- Three findings recorded on `integration/all-branches`, 2026-08-17. ----
  //
  // These were left unlisted on `integration/group-e` with the argument that
  // *"adding the entries to KNOWN_SHADOWED would convert exactly that report
  // into silence."* **That argument is withdrawn here, and the reason is this
  // file's own header.** An entry is not silence: the list is checked in *both*
  // directions, so a listed verb that stops being shadowed fails
  // `holds the known-shadowed list to its own findings`, and an unlisted one
  // fails the check above. What an unlisted finding buys over a listed one is a
  // red build; what it costs is the ability of the next shadow — the fourth,
  // the one nobody has seen — to be distinguished from these three. The header
  // decided this before any of us: *"Fixing them here is forbidden ... So each
  // is named, with the finding, and the check fails on anything that is not
  // named."*
  //
  // None is fixed here, for the header's reason: a preference-order change
  // measures the edit rather than the rule, and moves every balance baseline.
  // Every number below is from `auditPool` on this tree, printed by the first
  // test in this file.
  'narrow-depth/8':
    'grantFoundingKnowledge is fourth in a four-entry list, behind forbidTechnique (legal on ' +
    '515/600 ticks, submitted on all 515), forbidForm (541/600, submitted 26) and ' +
    'encourageResearch (599/600, submitted 58) — 599 submissions over 600 rounds, so the tail of ' +
    'the list is reached on one round in six hundred and the mask offers action 8 on 11. This is ' +
    "the `narrow-depth` half of the incident that made this file: it is the strategy whose " +
    'preference list was read by hand, months apart, and found never to ask for this verb. It ' +
    'asks now and still never gets it.',
  'denial-warden/2':
    'forbidTechnique is second, behind issueInterdiction, which is legal on 490 of 592 ticks and ' +
    'submitted on every one of them — a superset of the 483 on which forbidTechnique is legal. ' +
    'The warden is a signature-action strategy and this is one of its four: its hypothesis is ' +
    'that it "forbids and interdicts as hard as the edict budget allows", and on this tree it ' +
    'only interdicts. forbidForm still reaches the wire (39/592 legal, 24 submitted), so the ' +
    'strategy is not degenerate — it is narrower than its hypothesis by one axis.',
  'portal-rush/12':
    'encourageResearch is third, behind openPortal (unreachable, 0 legal ticks) and assignRole, ' +
    'which is legal on 599 of 600 ticks and submitted on all 599. Listed here for the second ' +
    'time: it was deleted on `w190/scribing-fidelity` when the shadow lifted, with a note saying ' +
    'it *"can come back the same way"*, and it came back. Both of this strategy\'s tempo moves ' +
    'are now dead — action 1 is `unreachable` because the campaign opened all seventy cells and ' +
    'there is nothing left to permit, and action 12 is shadowed by assignRole. The durable ' +
    'reading is the one the deleted `portal-rush/1` note carried: this preference order puts the ' +
    'tempo moves behind a verb that is legal almost every tick, and whether that shadows anything ' +
    'depends on numbers no one is holding still.',
  'alliance-seeker/11':
    'fundUniversity is listed on every tick and submitted on none. Its front-of-list entry is ' +
    'gated on `universities === 0`, which the reference universe never satisfies, and its rotated ' +
    'entry sits behind assignRole. Shared with alliance-abstainer through allianceGroundwork, so ' +
    'the pairing subtracts it out; see the note above this block.',
  'alliance-seeker/12':
    'encourageResearch is last in allianceGroundwork, behind assignRole, which is legal on 599 of ' +
    '600 ticks. Shared with alliance-abstainer, so the paired difference is unaffected.',
  'alliance-abstainer/11':
    'fundUniversity is a signature action of this arm and is never submitted, for the reason given ' +
    'for alliance-seeker/11 — the two arms play one shared list. This is permissive-breadth\'s ' +
    'incident (w73/pool-build-order, PR #70) for the third time, and worship-maximizer/11 for the ' +
    'second: a strategy declaring a verb load-bearing and never once reaching it.',
  'alliance-abstainer/12':
    'encourageResearch, behind assignRole, exactly as alliance-seeker/12. One list, two arms.',
});

const audits = auditPool();

describe('the pool audit does not disturb the pool', () => {
  it('produces the same run policyFor produces, hash for hash', () => {
    // One strategy is enough and it has to be this one: uniform-random-legal is
    // the only member of the pool that draws randomness on every round, so it is
    // the only one where a duplicated `preferences` call would show up as a
    // different universe rather than as nothing at all. Every other strategy's
    // `preferences` is a pure function of the observation, and would agree here
    // even if the audit called it twice.
    const strategyId = 'uniform-random-legal';
    const definition = BOT_POOL_REGISTRY.get(strategyId);
    expect(definition).toBeDefined();

    const { scenario } = referenceScenario(referenceContent());
    const control = createSession({ scenario, agentSlotIndex: 0, strategyId });
    runEpisode({
      session: adaptAgentSession(control),
      runSeed: AUDIT_RUN_SEED,
      scenarioConfig: { worldTickCap: AUDIT_WORLD_TICK_CAP, options: {} },
      policies: [
        // `policyFor` verbatim — the production path, with nothing wrapped
        // around it and nothing counted.
        policyFor(definition!, {
          runSeed: AUDIT_RUN_SEED,
          agentSlotIndex: 0,
          rng: agentRng({ runSeed: AUDIT_RUN_SEED, agentSlotIndex: 0, strategyId }),
        }),
      ],
      worldTickCap: AUDIT_WORLD_TICK_CAP,
    });

    const audited = audits.find((audit) => audit.strategyId === strategyId);
    expect(audited?.ticks).toBe(AUDIT_WORLD_TICK_CAP);
    // The assertion the module note claims: the instrumented walk produced the
    // *same universe*, not merely a plausible one. An audit that had drawn one
    // extra number from the agent generator would diverge here on the first
    // round and never reconverge.
    expect(audited?.snapshotHash).toBe(control.snapshotHash());
  });
});

describe('every verb a strategy asks for is a verb it can reach', () => {
  it('reports the whole pool, so the inventory exists whatever the verdict', () => {
    // Printed on purpose. The table is a deliverable in its own right: it is the
    // only place in the build that says, per strategy and per verb, how often
    // the mask allowed it against how often the strategy got to use it.
    console.log(`\n${formatAudit(audits)}\n`);
    expect(audits).toHaveLength(BOT_POOL_REGISTRY.definitions.length);
  });

  it('finds no shadowed verb that is not a known finding', () => {
    const found = audits
      .flatMap((audit) => audit.shadowed)
      .map((verb) => ({
        key: `${verb.strategyId}/${String(verb.action)}`,
        detail:
          `${verb.strategyId} listed ${actionName(verb.action)} (action ` +
          `${String(verb.action)}) and never submitted it, though the mask allowed it on ` +
          `${String(verb.ticksLegal)} ticks. Something ahead of it in its preference list is ` +
          'legal every time it is.',
      }));

    // **Three surprises were found here on `integration/group-e`, 2026-08-16,
    // widened on `integration/all-branches`, and they are now in
    // `KNOWN_SHADOWED` with their findings and their measured tick counts.**
    //
    // The note that stood here argued that listing them *"would convert exactly
    // that report into silence"*, and it was left red on that argument. The
    // argument is recorded and withdrawn — see the block above the three
    // entries. In one line: the list is checked in both directions, so an entry
    // is a *recorded* finding rather than a silenced one, and leaving a known
    // shadow unlisted costs the ability to see the next one arrive.
    //
    // Nothing about the findings changed. `narrow-depth` still never plays
    // `grantFoundingKnowledge`, `denial-warden` still never forbids a technique,
    // and every balance number taken from `narrow-depth` is still a number about
    // eight verbs and not nine.
    const surprises = found.filter((verb) => KNOWN_SHADOWED[verb.key] === undefined);
    expect(surprises.map((verb) => verb.detail)).toEqual([]);
  });

  it('holds the known-shadowed list to its own findings', () => {
    const shadowed = new Set(
      audits.flatMap((audit) =>
        audit.shadowed.map((verb) => `${verb.strategyId}/${String(verb.action)}`),
      ),
    );
    // A stale entry is worse than a missing one: it says a defect is known and
    // accepted when it is in fact gone, and the next reader trusts it.
    const stale = Object.keys(KNOWN_SHADOWED).filter((key) => !shadowed.has(key));
    expect(stale).toEqual([]);
  });

  it('never lets a masked verb be mistaken for a shadowed one', () => {
    // The two look identical in a run record — the strategy did not do the
    // thing — and the fixes are opposite: a shadowed verb is a preference-order
    // defect in the pool, an unreachable one is the build not offering the
    // action at all. `openPortal` under portal-rush was the case that made the
    // distinction matter, and `declareAscension` is the standing one.
    for (const audit of audits) {
      for (const verb of audit.verbs) {
        if (verb.verdict === VERB_VERDICT.unreachable) expect(verb.ticksLegal).toBe(0);
        if (verb.verdict === VERB_VERDICT.shadowed) {
          expect(verb.ticksLegal).toBeGreaterThan(0);
          expect(verb.timesListed).toBeGreaterThan(0);
          expect(verb.timesSubmitted).toBe(0);
        }
      }
    }
  });

  it('keeps the passive control with nothing to be shadowed on', () => {
    const control = audits.find((audit) => audit.strategyId === 'passive-control');
    expect(control?.verbs).toEqual([]);
  });
});
