/*
 * TEMPORARY measurement harness — not for merge.
 *
 * Question: does any BOT_POOL strategy that submits `assignRole` actually
 * produce mage combatants, and do its raids therefore contain the combat a
 * no-agent reference run lacks?
 */

import { describe, expect, it } from 'vitest';

import { TIME_MODE } from '@mm/sim-core';
import type { System } from '@mm/sim-core';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { ablationMaskFor } from '@mm/coordination';
import { BOT_POOL_REGISTRY, adaptAgentSession, policyFor, runEpisode } from '@mm/mc-harness';
import { agentRng, createSession, isLegal } from '@mm/agent-api';

import { auditPool, formatAudit, referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();

const ASSIGN_ROLE = 10;
const OPEN_PORTAL = 14;

interface RoleSample {
  readonly tick: number;
  readonly researcher: number;
  readonly warden: number;
  readonly professor: number;
  readonly raider: number;
  readonly living: number;
}

interface ArmResult {
  readonly strategyId: string;
  readonly seed: number;
  readonly ticks: number;
  readonly submittedAssignRole: number;
  readonly appliedAssignRole: number;
  readonly legalOpenPortal: number;
  readonly submittedOpenPortal: number;
  readonly raidCount: number;
  readonly outboundRaids: number;
  readonly casualties: number;
  readonly nodesLost: number;
  readonly nodesGained: number;
  readonly rolesAtRaidTicks: readonly RoleSample[];
  readonly finalRoles: RoleSample;
  readonly peakRaiders: number;
  readonly peakWardens: number;
  readonly raidLog: string;
  readonly snapshotHash: string;
  readonly outboundCasualties: number;
  readonly inboundCasualties: number;
  readonly inboundNodesLost: number;
  readonly raidsWithRaiderFielded: number;
  readonly raidsWithWardenFielded: number;
  readonly inboundRaids: number;
  readonly inboundWithWarden: number;
}

interface PlayOptions {
  readonly horizon: number;
  readonly ablated?: string;
  /** When false, no observer system is installed — the control on the observer. */
  readonly observe?: boolean;
}

function histogram(state: Parameters<typeof collectRecords>[0], tick: number): RoleSample {
  const living = collectRecords(state, MAGE).filter(({ row }) => row.alive === 1);
  const count = (role: number): number => living.filter(({ row }) => row.roleId === role).length;
  return {
    tick,
    researcher: count(MAGE_ROLE.researcher),
    warden: count(MAGE_ROLE.warden),
    professor: count(MAGE_ROLE.professor),
    raider: count(MAGE_ROLE.raider),
    living: living.length,
  };
}

function play(strategyId: string, seed: number, options: PlayOptions): ArmResult {
  const definition = BOT_POOL_REGISTRY.get(strategyId);
  if (definition === undefined) throw new Error(`no strategy ${strategyId}`);

  const run = referenceScenario(content, {
    raids: true,
    telemetry: false,
    ...(options.ablated === undefined ? {} : { ablation: ablationMaskFor([options.ablated]) }),
  });

  const samples: RoleSample[] = [];
  const preRaid: RoleSample[] = [];
  const observe = options.observe ?? true;
  let installed = false;

  const observer: System = {
    name: 'tmp-role-observer',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      samples.push(histogram(ctx.state, ctx.tick));
    },
  };

  // Spliced immediately BEFORE the raid system, so it reports the roster the
  // raid is about to be deployed from — after this tick's god action resolved
  // and before any casualty. The end-of-tick observer above cannot: at a raid
  // tick it reports survivors.
  const preRaidObserver: System = {
    name: 'tmp-pre-raid-role-observer',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      preRaid.push(histogram(ctx.state, ctx.tick));
    },
  };

  const scenario = {
    ...run.scenario,
    create: (runSeed: number, config: Parameters<typeof run.scenario.create>[1]) => {
      const state = run.scenario.create(runSeed, config);
      if (observe && !installed) {
        // Read-only, draws nothing, writes nothing.
        const systems = state.schema.systems as System[];
        const raidIndex = systems.findIndex((system) => system.name === 'raids');
        if (raidIndex < 0) throw new Error('no raids system to splice before');
        systems.splice(raidIndex, 0, preRaidObserver);
        systems.push(observer);
        installed = true;
      }
      return state;
    },
  };

  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
  const session = adaptAgentSession(raw);

  const context = {
    runSeed: seed,
    agentSlotIndex: 0,
    rng: agentRng({ runSeed: seed, agentSlotIndex: 0, strategyId }),
  };

  let submittedAssignRole = 0;
  let submittedOpenPortal = 0;
  let legalOpenPortal = 0;
  let appliedAssignRole = 0;
  let seenTick = -1;

  const drain = (): void => {
    const report = run.lastGodReport();
    if (report === undefined || report.worldTick === seenTick) return;
    seenTick = report.worldTick;
    for (const key of Object.keys(report.interventions.spentByAction)) {
      if (Number(key) === ASSIGN_ROLE) appliedAssignRole += 1;
    }
  };

  const inner = policyFor(definition, context);
  const policy = (observation: Float64Array, mask: Uint8Array, slot: number) => {
    drain();
    if (isLegal(mask, OPEN_PORTAL)) legalOpenPortal += 1;
    const chosen = inner(observation, mask, slot);
    const action = typeof chosen === 'number' ? chosen : chosen.action;
    if (action === ASSIGN_ROLE) submittedAssignRole += 1;
    if (action === OPEN_PORTAL) submittedOpenPortal += 1;
    return chosen;
  };

  const episode = runEpisode({
    session,
    runSeed: seed,
    scenarioConfig: { worldTickCap: options.horizon, options: {} },
    policies: [policy],
    worldTickCap: options.horizon,
  });
  drain();

  const raids = run.raids();
  const byTick = new Map(preRaid.map((sample) => [sample.tick, sample]));
  const rolesAtRaidTicks = raids.map(
    (record) => byTick.get(record.worldTick) ?? { tick: record.worldTick, researcher: -1, warden: -1, professor: -1, raider: -1, living: -1 },
  );
  const last = samples[samples.length - 1];

  return {
    strategyId,
    seed,
    ticks: episode.ticksRun,
    submittedAssignRole,
    appliedAssignRole,
    legalOpenPortal,
    submittedOpenPortal,
    raidCount: raids.length,
    outboundRaids: raids.filter((record) => record.outbound).length,
    casualties: raids.reduce((sum, record) => sum + record.localCasualties, 0),
    nodesLost: raids.reduce((sum, record) => sum + record.nodesLostLocally, 0),
    nodesGained: raids.reduce((sum, record) => sum + record.nodesGainedLocally, 0),
    rolesAtRaidTicks,
    finalRoles: last ?? { tick: -1, researcher: -1, warden: -1, professor: -1, raider: -1, living: -1 },
    peakRaiders: samples.reduce((max, sample) => Math.max(max, sample.raider), 0),
    peakWardens: samples.reduce((max, sample) => Math.max(max, sample.warden), 0),
    raidLog: JSON.stringify(raids),
    snapshotHash: raw.snapshotHash(),
    outboundCasualties: raids.filter((r) => r.outbound).reduce((sum, r) => sum + r.localCasualties, 0),
    inboundCasualties: raids.filter((r) => !r.outbound).reduce((sum, r) => sum + r.localCasualties, 0),
    inboundNodesLost: raids.filter((r) => !r.outbound).reduce((sum, r) => sum + r.nodesLostLocally, 0),
    raidsWithRaiderFielded: raids.filter((r, i) => r.outbound && (rolesAtRaidTicks[i]?.raider ?? 0) > 0).length,
    raidsWithWardenFielded: raids.filter((_r, i) => (rolesAtRaidTicks[i]?.warden ?? 0) > 0).length,
    inboundRaids: raids.filter((r) => !r.outbound).length,
    inboundWithWarden: raids.filter((r, i) => !r.outbound && (rolesAtRaidTicks[i]?.warden ?? 0) > 0).length,
  };
}

const HORIZON = Number(process.env['MM_HORIZON'] ?? 1200);
const SEEDS: readonly number[] = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000];
const ARMS: readonly string[] = (process.env['MM_ARMS'] ?? 'passive-control,portal-rush,archivist,uniform-random-legal').split(',');

describe('who submits assignRole, and does it field combatants', () => {
  it('the observer system changes nothing', () => {
    const withObserver = play('portal-rush', SEEDS[0]!, { horizon: 200 });
    const without = play('portal-rush', SEEDS[0]!, { horizon: 200, observe: false });
    expect(withObserver.snapshotHash).toBe(without.snapshotHash);
    expect(withObserver.raidLog).toBe(without.raidLog);
    // Positive control on the probe: it must actually have sampled something.
    expect(withObserver.finalRoles.living).toBeGreaterThan(0);
    console.log(`[observer control] hash ${withObserver.snapshotHash} identical with and without the observer`);
  });

  it('audits every pool strategy for action 10', () => {
    const audits = auditPool();
    const rows = audits
      .map((audit) => audit.verbs.filter((verb) => verb.action === ASSIGN_ROLE).map((verb) => ({ ...verb, ticks: audit.ticks })))
      .flat();
    console.log('\n=== pool audit, action 10 assignRole (600 ticks, seed AUDIT_RUN_SEED) ===');
    console.log('strategy                 legal  listed  submitted  applied  verdict');
    for (const row of rows) {
      console.log(
        `${row.strategyId.padEnd(24)} ${String(row.ticksLegal).padStart(5)} ${String(row.timesListed).padStart(7)} ${String(row.timesSubmitted).padStart(10)} ${String(row.timesApplied).padStart(8)}  ${row.verdict}`,
      );
    }
    const named = new Set(rows.map((row) => row.strategyId));
    const missing = audits.filter((audit) => !named.has(audit.strategyId)).map((audit) => audit.strategyId);
    console.log(`strategies with NO action-10 row at all (never listed, not a signature action): ${missing.join(', ') || '(none)'}`);
    console.log('\n=== full audit table ===');
    console.log(formatAudit(audits));
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);

  it('measures the arms', () => {
    const results: ArmResult[] = [];
    for (const arm of ARMS) {
      for (const seed of SEEDS) {
        results.push(play(arm, seed, { horizon: HORIZON }));
      }
    }
    console.log(`\n=== arms at ${String(HORIZON)} ticks ===`);
    console.log(
      'strategy                 seed        ticks  ar-sub ar-app  op-legal op-sub  raids out  cas  lost gain  peakRaid peakWard  finalRoles(r/w/p/R)',
    );
    for (const row of results) {
      console.log(
        [
          row.strategyId.padEnd(24),
          `0x${row.seed.toString(16).padStart(8, '0')}`,
          String(row.ticks).padStart(6),
          String(row.submittedAssignRole).padStart(7),
          String(row.appliedAssignRole).padStart(6),
          String(row.legalOpenPortal).padStart(9),
          String(row.submittedOpenPortal).padStart(6),
          String(row.raidCount).padStart(6),
          String(row.outboundRaids).padStart(4),
          String(row.casualties).padStart(4),
          String(row.nodesLost).padStart(5),
          String(row.nodesGained).padStart(4),
          String(row.peakRaiders).padStart(9),
          String(row.peakWardens).padStart(9),
          `  ${String(row.finalRoles.researcher)}/${String(row.finalRoles.warden)}/${String(row.finalRoles.professor)}/${String(row.finalRoles.raider)} of ${String(row.finalRoles.living)}`,
          ` | outCas ${String(row.outboundCasualties)} inCas ${String(row.inboundCasualties)} inLost ${String(row.inboundNodesLost)} | outbound-with-raider ${String(row.raidsWithRaiderFielded)}/${String(row.outboundRaids)} inbound-with-warden ${String(row.inboundWithWarden)}/${String(row.inboundRaids)}`,
        ].join(' '),
      );
    }
    console.log('\n=== roles at each raid tick ===');
    for (const row of results) {
      for (const sample of row.rolesAtRaidTicks) {
        console.log(
          `${row.strategyId.padEnd(24)} 0x${row.seed.toString(16).padStart(8, '0')} tick ${String(sample.tick).padStart(5)}  r/w/p/R = ${String(sample.researcher)}/${String(sample.warden)}/${String(sample.professor)}/${String(sample.raider)} of ${String(sample.living)}`,
        );
      }
    }
    expect(results.length).toBe(ARMS.length * SEEDS.length);
  }, 1_800_000);

  it('ablation contrast: are combat magnitudes actually applied', () => {
    const primitives = ['direct-damage', 'concealment', 'ward', 'area-denial', 'blink', 'summon', 'knowledge-steal'];
    console.log(`\n=== ablation contrast at ${String(HORIZON)} ticks: does neutralizing a primitive move the raid log? ===`);
    console.log('strategy                 primitive         seeds-moved/seeds  raids  cas lost gain (control)');
    for (const arm of ARMS) {
      const controls = SEEDS.map((seed) => play(arm, seed, { horizon: HORIZON }));
      for (const primitive of primitives) {
        let moved = 0;
        for (const [index, seed] of SEEDS.entries()) {
          const ablated = play(arm, seed, { horizon: HORIZON, ablated: primitive });
          if (ablated.raidLog !== controls[index]!.raidLog) moved += 1;
        }
        console.log(
          `${arm.padEnd(24)} ${primitive.padEnd(17)} ${String(moved)}/${String(SEEDS.length)}              ${String(controls.reduce((sum, row) => sum + row.raidCount, 0))}  ${String(controls.reduce((sum, row) => sum + row.casualties, 0))} ${String(controls.reduce((sum, row) => sum + row.nodesLost, 0))} ${String(controls.reduce((sum, row) => sum + row.nodesGained, 0))}`,
        );
      }
    }
    expect(true).toBe(true);
  }, 3_600_000);
});
