/*
 * Multiverse Mages — what the composition root actually asks the content for.
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
 * `check:consumption` is only worth anything if the recorder is genuinely
 * threaded through the wiring — a recorder that stayed empty because nobody
 * passed it would report every primitive as unconsumed and would be right by
 * accident, which is indistinguishable from being right on purpose until the
 * day the wire lands and the check stays red.
 *
 * So this file builds the real universe and asserts the properties that must
 * hold whatever the state of the effect pipeline. The failure *directions* are
 * exercised over synthetic recorders in
 * `packages/rules-magic/test/unit/primitive-consumption.test.ts`; this one is
 * about provenance.
 *
 * Deliberately absent: any assertion that the check currently fails. That fact
 * is the script's to state, and pinning it here would mean the change that
 * connects the pipeline has to delete a test that reads like it wanted the bug.
 */

import { readFileSync } from 'node:fs';

import {
  checkPrimitiveConsumption,
  createConsumptionRecorder,
  formatPrimitiveConsumptionReport,
} from '@mm/rules-magic';
import { scribingTraditionId, shippedContent, worldDeps } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

function recorded(): {
  recorder: ReturnType<typeof createConsumptionRecorder>;
  registry: ReturnType<typeof shippedContent>;
} {
  const registry = shippedContent();
  const recorder = createConsumptionRecorder();
  worldDeps(registry, scribingTraditionId(registry), recorder);
  return { recorder, registry };
}

describe('the recorder is threaded through the composition root', () => {
  it('collects registrations when a universe is assembled', () => {
    expect(recorded().recorder.registrations().length).toBeGreaterThan(0);
  });

  it('registers no primitive the registry does not declare', () => {
    // The invariant that catches a rename: a consumer asking for an id nothing
    // declares gets an empty answer forever and would otherwise go unnoticed.
    const { recorder, registry } = recorded();
    expect(checkPrimitiveConsumption(registry, recorder).unknownPrimitives).toEqual([]);
  });

  it('keeps working for callers that do not want the recording', () => {
    const registry = shippedContent();
    expect(() => worldDeps(registry, scribingTraditionId(registry))).not.toThrow();
  });
});

describe('the two node-driven paths in the assembled simulation', () => {
  it('records worship-yield against the worship loop, with the nodes it found', () => {
    const { recorder } = recorded();
    const entry = recorder
      .registrations()
      .find((registration) => registration.primitiveId === 'worship-yield');

    expect(entry?.kind).toBe('node');
    expect(entry?.consumer).toBe('coordination/god/system.yieldSources');
    // `yieldSources` gates each node's authored magnitudes on
    // `knowledge.instanceCount(nodeId) > 0`, which is the whole point: this is a
    // rate the academics move by knowing things.
    expect(entry?.nodeCount).toBeGreaterThan(0);
  });

  it('records portal against the raid entry point', () => {
    const { recorder } = recorded();
    const entry = recorder
      .registrations()
      .find((registration) => registration.primitiveId === 'portal');

    expect(entry?.kind).toBe('node');
    expect(entry?.consumer).toBe('coordination/god/interventions.portalPlan');
    expect(entry?.nodeCount).toBeGreaterThan(0);
  });
});

describe('god-driven consumption is recorded, and does not count', () => {
  it.each(['research-rate', 'teach-rate', 'lifespan'])(
    'records %s as non-node, because a blessing is not a discovery',
    (primitiveId) => {
      const { recorder } = recorded();
      const entry = recorder
        .registrations()
        .find((registration) => registration.primitiveId === primitiveId);

      expect(entry?.kind).toBe('non-node');
      expect(entry?.nodeCount).toBe(0);
    },
  );

  it('no longer has a god-only primitive to leave out, and says which ones moved', () => {
    const { recorder, registry } = recorded();
    const report = checkPrimitiveConsumption(registry, recorder);
    const consumed = report.consumed.map((entry) => entry.primitiveId);

    // **This assertion has now named three different primitives, and each swap
    // was the point of a change rather than a weakening of the test.** It began
    // on `research-rate` — the loudest case, consumed every tick, by the god,
    // and by nothing a scholar could learn. W18's rate wire gave that one
    // `coordination/academic-effects.academicRateBonuses`, so it moved to
    // `lifespan`, the surviving god-only primitive. The vitality wire gave
    // *that* one `coordination/knowledge-vitality.vitalityBonuses`. There is no
    // third candidate: the registry declares sixteen primitives and all sixteen
    // are node-driven on this tree, which is the campaign's stated exit
    // condition and why `PRIMITIVE_CONSUMPTION_EXCLUSIONS` is empty.
    //
    // So the assertion is inverted rather than retargeted. Naming a fourth
    // primitive would mean asserting a defect; asserting that `nonNode` is
    // *permanently* empty would bake today's content into a structural test,
    // and the next god-only primitive to arrive would find the sentence that
    // explained the section already deleted. The path itself is kept alive one
    // test below, over a synthetic registration.
    expect(report.nonNode).toEqual([]);
    for (const primitiveId of ['research-rate', 'teach-rate', 'scribe-rate', 'lifespan']) {
      expect(consumed).toContain(primitiveId);
    }
  });

  it('still records the god as a non-node consumer, beside the node one', () => {
    // The blessing did not stop existing when knowledge caught up with it. Both
    // registrations are present for `lifespan`, and the check counts the node
    // one — which is exactly the arithmetic that would be wrong if `nonNode`
    // were empty because nothing registered rather than because everything did.
    const kinds = recorded()
      .recorder.registrations()
      .filter((registration) => registration.primitiveId === 'lifespan')
      .map((registration) => registration.kind);

    expect(kinds).toContain('non-node');
    expect(kinds).toContain('node');
  });

  it('explains itself in the report rather than leaving a reader guessing', () => {
    // **A synthetic god-only registration, and not an assertion that the section
    // is empty.** `consumption.ts` argues that `nonNode`'s whole job is to
    // explain why a primitive plainly in use is nonetheless unreachable by an
    // academic — and the day that explanation is needed again is the day a new
    // primitive lands with a god consumer and no node one. A test that asserted
    // the section stays empty would pass on the tree that deleted the section's
    // formatter and fail nothing.
    //
    // So this replays the real universe's registrations with one edit: the
    // vitality wire's node-driven `lifespan` row is dropped, leaving the god's
    // blessing behind. That is a universe this repository shipped four commits
    // ago, and it is the shape the formatter exists for.
    const { recorder, registry } = recorded();
    const godOnly = createConsumptionRecorder();
    for (const registration of recorder.registrations()) {
      if (registration.primitiveId === 'lifespan' && registration.kind === 'node') continue;
      godOnly.register(registration);
    }

    const report = checkPrimitiveConsumption(registry, godOnly, ['lifespan']);
    expect(report.nonNode.map((entry) => entry.primitiveId)).toEqual(['lifespan']);

    const text = formatPrimitiveConsumptionReport(report);
    expect(text).toContain('Consumed, but never from node effects');
    expect(text).toContain('coordination/god/effects.lifespanEffectsFor');
  });

  it.each(['research-rate', 'scribe-rate', 'teach-rate'])(
    'moves %s into the consumed set once knowledge can reach it',
    (primitiveId) => {
      const { recorder, registry } = recorded();
      const report = checkPrimitiveConsumption(registry, recorder);
      const entry = report.consumed.find((row) => row.primitiveId === primitiveId);

      // Registered from the line that reads the authored magnitudes, so a
      // registration cannot outlive the fetch it describes.
      expect(entry?.consumers).toContain('coordination/academic-effects.academicRateBonuses');
      expect(entry?.nodeCount).toBeGreaterThan(0);

      // And the god's explanatory line drops away, which is this check's own
      // design rather than a loss: `nonNode` is filtered to primitives nothing
      // node-driven reached, because its only job is to explain why a primitive
      // that is plainly in use is nonetheless unreachable by an academic. Once it
      // *is* reachable there is nothing left to explain.
      expect(report.nonNode.map((row) => row.primitiveId)).not.toContain(primitiveId);
    },
  );
});

describe('the check is wired in as a non-blocking Actions job, not as part of verify', () => {
  const repoFile = (relative: string): string =>
    readFileSync(new URL(`../../../../${relative}`, import.meta.url), 'utf8');

  const manifest = JSON.parse(repoFile('package.json')) as {
    scripts: Record<string, string>;
  };

  it('is an npm script that runs the check entrypoint', () => {
    expect(manifest.scripts['check:consumption']).toContain('check-primitive-consumption.mjs');
  });

  it('is kept out of verify, so the self-hosted runner stays equivalent to it', () => {
    // Not squeamishness about red. `scripts/ci-check.sh` delegates to
    // `npm run verify` and is required to stay equivalent to it, so a check
    // whose correct current answer is FAIL cannot live there without making
    // `ci/hetzner-lint` red on every commit — including the commits that would
    // fix it. `docs/devops/ci-and-deploy.md` records the reasoning; this pins it.
    expect(manifest.scripts['verify']).not.toContain('check:consumption');
    expect(manifest.scripts['verify:nosweeps']).not.toContain('check:consumption');
    expect(repoFile('scripts/ci-check.sh')).not.toContain('check:consumption');
  });

  it('runs in a job of its own, declared non-blocking', () => {
    const workflow = repoFile('.github/workflows/ci.yml');
    const parts = workflow.slice(workflow.indexOf('\njobs:\n')).split(/^ {2}([\w-]+):$/m).slice(1);
    const jobs = new Map<string, string>();
    for (let index = 0; index + 1 < parts.length; index += 2) {
      jobs.set(parts[index] as string, parts[index + 1] as string);
    }

    const consumption = jobs.get('consumption');
    expect(consumption, 'no "consumption" job in .github/workflows/ci.yml').toBeDefined();
    expect(consumption).toContain('npm run check:consumption');
    expect(consumption).toContain('continue-on-error: true');

    // No other job may run it, because any other job is blocking.
    for (const [name, body] of jobs) {
      if (name === 'consumption' || body.includes('continue-on-error: true')) continue;
      expect(body, `blocking Actions job "${name}" runs the expected-red check`).not.toContain(
        'npm run check:consumption',
      );
    }
  });

  it('writes the condition for making it blocking down at the flip point', () => {
    // The condition, verbatim from the orchestrator brief and from
    // docs/devops/ci-and-deploy.md: *every primitive has a node-driven consumer,
    // or the remaining ones are declared exclusions*. A non-blocking check with
    // no written exit condition is a check that stays non-blocking forever.
    const workflow = repoFile('.github/workflows/ci.yml');
    expect(workflow).toContain('every primitive has a node-driven consumer, or the remaining ones');
    expect(workflow).toContain('declared exclusions');
    expect(repoFile('docs/devops/ci-and-deploy.md')).toContain('every primitive has a node-driven');
  });
});
