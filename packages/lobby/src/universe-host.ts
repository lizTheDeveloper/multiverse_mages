/*
 * Multiverse Mages — in-process universe host.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * One player's universe: founded on the species, tradition and opening square
 * the player chose, and **ticked only by its owner** — the lobby's clock.
 *
 * Nothing here reads a wall clock. `now` is handed in, and `tick()` is called
 * by `Lobby.tickAll()`, which the bin drives from one interval. A browser can
 * queue one god action per tick and read frames; it cannot move time.
 *
 * Bubble-mates fill this universe's portal seats (`vision.md` §8b): action 14
 * on seat N raids whichever universe the lobby's `seatOf` puts there, and the
 * raid lands in that universe's live state.
 */

import { randomInt, randomUUID } from 'node:crypto';

import { GOD_ACTION, createSession, type AgentSession } from '@mm/agent-api';
import {
  explicitOpeningAxes,
  foundingCandidates,
  participantOf,
  referenceContent,
  referenceScenario,
  speciesTable,
  type RaidRecord,
  type ReferenceContent,
} from '@mm/scenario';
import type { UniverseRef as ServerUniverseRef } from '@mm/server';

import type { FrameDocument, FrameRun } from '../../../scripts/lib/frame-document.mjs';

export interface UniverseRef extends Omit<ServerUniverseRef, 'universeId' | 'bubbleId'> {
  universeId: string;
  bubbleId: string;
}

export interface UniverseConfig {
  species: string;
  tradition: string;
  techniques: string[];
  forms: string[];
  seed?: number;
  tickCap?: number;
  /** 1 founds a mage holding a portal node, so action 14 opens within a few ticks. */
  foundingPortalMagic?: 0 | 1;
}

export interface GodAction {
  kind: number;
  params?: number[];
}

export interface Outcome {
  admitted: boolean;
  rejection?: string;
  status: string;
}

/** A raid another universe opened on this one, as its attacker recorded it. */
export interface InboundRaid {
  readonly fromUniverseId: string;
  readonly record: RaidRecord;
}

/** Who sits in a portal seat of `self`, or `undefined` for an empty seat. */
export type SeatResolver = (self: UniverseHost, seat: number) => UniverseHost | undefined;

export interface PeerSeats {
  /** How many portal seats: the bubble's size less one. Fixed at creation. */
  readonly seats: number;
  readonly seatOf: SeatResolver;
}

/** A god picks up to two techniques and two forms (the setup screen). */
const OPENING_MAX = 2;
/** The tick cap, and the most an HTTP caller may ask for: memory is sized on it. */
export const DEFAULT_CAP = 4000;
const shipped = referenceContent();

const strings = (v: unknown, field: string, allowed: readonly string[]): string[] => {
  if (
    !Array.isArray(v) ||
    v.length < 1 ||
    v.length > OPENING_MAX ||
    new Set(v).size !== v.length ||
    v.some((x) => typeof x !== 'string' || !allowed.includes(x))
  ) {
    throw new Error(`${field} must be 1-${String(OPENING_MAX)} distinct ids from: ${allowed.join(', ')}`);
  }
  return v as string[];
};

/**
 * Checks a create request. Throws an `Error` naming the bad field.
 *
 * @param maxTickCap - The largest `tickCap` accepted. {@link DEFAULT_CAP} for
 *   anything that arrived over HTTP — the lobby's memory budget assumes it, and
 *   a 100000-tick spine would not even serialise. Raised only by tests.
 */
export function validateConfig(raw: unknown, maxTickCap = DEFAULT_CAP): UniverseConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config must be a JSON object');
  }
  const c = raw as Record<string, unknown>;
  const ids = (list: readonly { record: { id: string } }[]): string[] => list.map((e) => e.record.id);
  const r = shipped.registry;
  if (typeof c.species !== 'string' || !ids(r.species).includes(c.species)) {
    throw new Error(`species must be one of: ${ids(r.species).join(', ')}`);
  }
  if (typeof c.tradition !== 'string' || !ids(r.traditions).includes(c.tradition)) {
    throw new Error(`tradition must be one of: ${ids(r.traditions).join(', ')}`);
  }
  const out: UniverseConfig = {
    species: c.species,
    tradition: c.tradition,
    techniques: strings(c.techniques, 'techniques', ids(r.techniques)),
    forms: strings(c.forms, 'forms', ids(r.forms)),
  };
  if (c.seed !== undefined) {
    if (typeof c.seed !== 'number' || !Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffff_ffff) {
      throw new Error('seed must be a uint32');
    }
    out.seed = c.seed;
  }
  if (c.tickCap !== undefined) {
    if (typeof c.tickCap !== 'number' || !Number.isInteger(c.tickCap) || c.tickCap < 1 || c.tickCap > maxTickCap) {
      throw new Error(`tickCap must be 1..${String(maxTickCap)}`);
    }
    out.tickCap = c.tickCap;
  }
  if (c.foundingPortalMagic !== undefined) {
    if (c.foundingPortalMagic !== 0 && c.foundingPortalMagic !== 1) {
      throw new Error('foundingPortalMagic must be 0 or 1');
    }
    out.foundingPortalMagic = c.foundingPortalMagic;
  }
  return out;
}

const NO_PEERS: PeerSeats = { seats: 0, seatOf: () => undefined };

export class UniverseHost implements FrameRun {
  readonly id = randomUUID();
  readonly ref: UniverseRef;
  readonly config: UniverseConfig;
  readonly seed: number;
  readonly cap: number;
  readonly session: AgentSession;
  readonly frames: Record<string, unknown>[] = [];
  readonly sandbox = null;
  readonly sheet = null;
  readonly inbound: InboundRaid[] = [];
  /** Portal seats: the bubble's size less one. Fixed, because the candidate list is. */
  readonly seatCount: number;
  lastTouched: number;

  readonly #content: ReferenceContent;
  readonly #raids: () => readonly RaidRecord[];
  readonly #doc: FrameDocument;
  /** This universe's current state: what a peer's raid reads and writes. */
  #state: Parameters<typeof participantOf>[0] | undefined;
  #queued: { action: GodAction; resolve: (o: Outcome) => void } | null = null;

  constructor(config: UniverseConfig, doc: FrameDocument, now: number, peers: PeerSeats = NO_PEERS) {
    this.config = config;
    this.#doc = doc;
    this.ref = { universeId: this.id, bubbleId: '', prestige: 0 };
    this.lastTouched = now;
    this.seatCount = peers.seats;

    const base = referenceContent(undefined, config.tradition);
    const axes = explicitOpeningAxes(base.registry, config.techniques, config.forms);
    const content: ReferenceContent = { ...base, axes, foundingNodeIds: foundingCandidates(base.registry, axes) };
    this.#content = content;

    const run = referenceScenario(content, {
      raids: true,
      onState: (s) => {
        this.#state = s;
      },
      peers: {
        seats: Array.from({ length: peers.seats }, (_, i) => i + 1),
        participant: (seat) => peers.seatOf(this, seat)?.participant(),
        onOutbound: (seat, record) => {
          peers.seatOf(this, seat)?.inbound.push({ fromUniverseId: this.id, record });
        },
      },
    });
    this.#raids = run.raids;
    this.session = createSession({ scenario: run.scenario, strategyId: 'lobby-universe' });

    const { ids } = speciesTable(base.registry);
    const wanted = base.registry.species.find((e) => e.record.id === config.species);
    if (wanted === undefined) throw new Error(`species must be one of the shipped species, not ${config.species}`);
    const foundingSpeciesMask = 1 << ids.indexOf(wanted.contentId);

    // `Date.now()` is not a uint32, and `session.reset` refuses anything else.
    this.seed = config.seed ?? randomInt(0, 0xffff_ffff);
    this.cap = config.tickCap ?? DEFAULT_CAP;
    this.session.reset(this.seed, {
      worldTickCap: this.cap,
      options: { foundingSpeciesMask, foundingPortalMagic: config.foundingPortalMagic === 1 ? 1 : 0 },
    });
    this.frames.push(doc.encodeFrame(this.session));
  }

  /** World ticks stepped so far. */
  get worldTick(): number {
    return this.frames.length - 1;
  }

  get isAlive(): boolean {
    return this.session.status() === 'running';
  }

  /** This universe as a raid target, or `undefined` when it cannot be one. */
  participant(): ReturnType<typeof participantOf> {
    return this.#state === undefined || !this.isAlive ? undefined : participantOf(this.#state, this.#content);
  }

  /**
   * Queues one god action for the next tick. Moves no time.
   *
   * @returns `null` when an action is already queued — one god action per month.
   */
  enqueue(action: GodAction): { from: number; outcome: Promise<Outcome> } | null {
    if (this.#queued !== null) return null;
    let resolve!: (o: Outcome) => void;
    const outcome = new Promise<Outcome>((r) => {
      resolve = r;
    });
    this.#queued = { action, resolve };
    return { from: this.frames.length, outcome };
  }

  /** Whether an action is waiting for the next tick. */
  get hasQueued(): boolean {
    return this.#queued !== null;
  }

  /** One world tick: the queued action or a no-op. Appends one frame. */
  tick(): void {
    const queued = this.#queued;
    this.#queued = null;
    if (!this.isAlive) {
      const status = this.session.status();
      queued?.resolve({ admitted: false, rejection: `episode-${status}`, status });
      return;
    }
    const action = queued?.action ?? { kind: GOD_ACTION.noop };
    const result = this.session.submit({ kind: action.kind, params: action.params ?? [] });
    this.frames.push(this.#doc.encodeFrame(this.session));
    queued?.resolve({
      admitted: result.admitted,
      ...(result.rejection === undefined ? {} : { rejection: String(result.rejection) }),
      status: String(result.status),
    });
  }

  /** Raids this universe resolved, in order — its own outbound and any stand-in inbound. */
  raidLog(): readonly RaidRecord[] {
    return this.#raids();
  }

  snapshotHash(): string {
    return this.session.snapshotHash();
  }
}
