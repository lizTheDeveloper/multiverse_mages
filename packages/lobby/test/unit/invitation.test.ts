/*
 * Multiverse Mages — a second species arrives only through a portal from a universe that holds it.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The author's rule of 2026-10-08: *"Inter-universal travel is the only way to
 * get multiple races."* A lobby universe is founded with one species, and
 * action 16 (invite scholar) may bring a second only from a universe sitting in
 * one of its portal seats that actually holds that species.
 *
 * Before the rule the roster was every species the content declares, gated only
 * on portal magic, so a human universe whose only bubble-mate was human could
 * still invite all five others. The first two tests fail on that build.
 *
 * Every arm submits action 16 on every tick, naming candidate slot 0 — the most
 * eager god there is. Action parameters are slots into the candidate list, so a
 * session cannot be asked for a species its list does not hold; the rules-side
 * half of the rule, which a direct `step` could reach, is held by
 * `packages/scenario/test/unit/invitation.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import { referenceContent } from '@mm/scenario';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { UniverseHost, type UniverseConfig } from '../../src/universe-host.js';

const shipped = referenceContent();
const doc = frameDocument(shipped, 'test');
const RAIDER = Number(
  Object.entries((doc.content() as { mageRoles: Record<string, string> }).mageRoles).find(([, n]) => n === 'raider')![0],
);
const speciesId = (id: string): number => shipped.registry.species.find((e) => e.record.id === id)!.contentId;

/** Holds a portal node from the first tick: `rego-limen` is the portal's cell. */
const portal: UniverseConfig = {
  species: 'human',
  tradition: 'art-of-memory',
  techniques: ['creo', 'rego'],
  forms: ['ignem', 'limen'],
  foundingPortalMagic: 1,
  seed: 7,
  tickCap: 4000,
};

/** Two universes, each the other's only portal seat — a bubble of two. */
function bubble(self: UniverseConfig, mate: UniverseConfig): { self: UniverseHost; mate: UniverseHost } {
  const hosts: { self?: UniverseHost; mate?: UniverseHost } = {};
  const seatOf = (who: UniverseHost): UniverseHost | undefined => (who === hosts.self ? hosts.mate : hosts.self);
  hosts.self = new UniverseHost(self, doc, 0, { seats: 1, seatOf });
  hosts.mate = new UniverseHost(mate, doc, 0, { seats: 1, seatOf });
  return { self: hosts.self, mate: hosts.mate };
}

/** The candidates action 16 offers now, as species ids. */
function offered(host: UniverseHost): number[] {
  return (host.session.candidates().get(GOD_ACTION.inviteScholar) ?? []).map((c) => c.params[0] as number);
}

/**
 * `ticks` months in which `self` asks for a scholar every month and the mate
 * idles. Returns every species `self` was ever seen holding, every species
 * action 16 ever offered, and how many invitations were admitted.
 */
async function invitingEveryMonth(
  self: UniverseHost,
  mate: UniverseHost,
  ticks: number,
): Promise<{ seen: number[]; offers: number[]; admitted: number }> {
  const seen = new Set<number>(self.speciesAlive() ?? []);
  const offers = new Set<number>();
  let admitted = 0;
  // Name the founding portal-holder a raider first, so her readiness drill
  // holds her portal mastery up. At the raid economy's quartered favor
  // regeneration (playtest round 4) the 24-favor invitation is affordable only
  // around tick 63, and an undrilled founding portal node decays shut by ~72:
  // without the drill the gate and the price never overlap and the positive
  // control below would fail for want of favor, not for the roster.
  self.tick();
  mate.tick();
  const holder = (self.frames[self.frames.length - 1] as { portal?: { holders: number[][] } }).portal?.holders[0]?.[0];
  const assign = (self.session.candidates().get(GOD_ACTION.assignRole) ?? []).findIndex(
    (c) => c.params[0] === holder && c.params[1] === RAIDER,
  );
  if (assign >= 0) {
    self.enqueue({ kind: GOD_ACTION.assignRole, params: [assign] });
    self.tick();
    mate.tick();
  }
  for (let t = 0; t < ticks && self.isAlive; t += 1) {
    for (const id of offered(self)) offers.add(id);
    const queued = self.enqueue({ kind: GOD_ACTION.inviteScholar, params: [0] });
    self.tick();
    mate.tick();
    if ((await queued?.outcome)?.admitted === true) admitted += 1;
    for (const id of self.speciesAlive() ?? []) seen.add(id);
  }
  const sorted = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);
  return { seen: sorted(seen), offers: sorted(offers), admitted };
}

describe('action 16 under "travel is the only way to get multiple races"', () => {
  it('never gains a second species when every bubble-mate is its own species', async () => {
    const { self, mate } = bubble(portal, { ...portal, seed: 8 });
    const run = await invitingEveryMonth(self, mate, 240);
    expect(run.offers).toEqual([]);
    expect(run.admitted).toBe(0);
    expect(run.seen).toEqual([speciesId('human')]);
  });

  it('can invite exactly Elves, and does, with an Elf bubble-mate', async () => {
    const { self, mate } = bubble(portal, { ...portal, species: 'elf', seed: 8 });
    const run = await invitingEveryMonth(self, mate, 240);
    // The positive control for the test above: the same eager god, the same
    // portal magic, and an invitation does land — so "nothing arrived" there is
    // the roster's doing, not favor's or the gate's.
    expect(run.offers).toEqual([speciesId('elf')]);
    expect(run.admitted).toBeGreaterThan(0);
    expect(run.seen).toEqual([speciesId('human'), speciesId('elf')].sort((a, b) => a - b));
  });

  it('never invites without portal magic, however many species its bubble-mate holds', async () => {
    const noPortal: UniverseConfig = {
      ...portal,
      techniques: ['intellego', 'rego'],
      forms: ['mentem', 'terram'],
      foundingPortalMagic: 0,
    };
    const { self, mate } = bubble(noPortal, { ...portal, species: 'elf', seed: 8 });
    const run = await invitingEveryMonth(self, mate, 120);
    expect(run.offers).toEqual([]);
    expect(run.seen).toEqual([speciesId('human')]);
  });

  it('reports what a seat holds, and nothing once that universe has ended', () => {
    const { self, mate } = bubble(portal, { ...portal, species: 'elf', seed: 8, tickCap: 2 });
    expect(mate.speciesAlive()).toEqual([speciesId('elf')]);
    expect(self.speciesAlive()).toEqual([speciesId('human')]);
    for (let t = 0; t < 3; t += 1) mate.tick();
    expect(mate.isAlive).toBe(false);
    expect(mate.speciesAlive()).toBeUndefined();
    expect(offered(self)).toEqual([]);
  });
});
