/*
 * Multiverse Mages — the macro model. A university system as a shape over time.
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
 * What this is, and what it deliberately is not.
 *
 * This is **not** the world step and must never become it. It steps in world
 * *years*, it uses floating point, and it imports nothing from `@mm/*`. It
 * exists because the campaign has three times now spent hundreds of runs to
 * learn a fact about arithmetic — a flat toll that cannot beat a favor ceiling,
 * a teach cost that completes inside one month, a research cost identical
 * across 300 nodes — and each of those is a statement about *ranges*, which a
 * model answers in seconds and a simulation answers in hours.
 *
 * The two abstractions the brief demanded:
 *
 *   **A raid is a probability**, not an engagement. It arrives at a hazard
 *   rate, consumes an expected number of mage-months, kills an expected share
 *   of the roster and burns an expected number of books. `rules-raid` is not
 *   loaded and must not be.
 *
 *   **The economy is a rate**, not a ledger. Materials arrive and are consumed
 *   per year. There are no stocks, no `material-stock` component, no shortage
 *   semantics. One scalar — `economicRate` — scales inflow and carrying
 *   capacity together, because a richer world both feeds more people and writes
 *   more books.
 *
 * The output is a **need**: a shortfall against a stated objective with its
 * cause attached. Not a table of outputs. See `emitNeeds`.
 *
 * ---------------------------------------------------------------------------
 * THE STATE, AND WHY IT IS THIS SMALL
 *
 * A mage of depth `d` holds **every held node of tier <= d**. That single
 * closure is what collapses a per-node bookkeeping problem into a per-cohort
 * one, and it is not a fudge: it is exactly the graduation rule the owner
 * stated — "they're students until they learn everything that the university
 * they enrolled in can teach them" — read as a steady-state property rather
 * than an event. Its consequences are the ones the design wants:
 *
 *   - holder count of a tier-`t` node = the number of mages at depth >= `t`,
 *     so **deep nodes are automatically the thin end of the pyramid** and the
 *     "single point of failure that is a person" falls out rather than being
 *     asserted;
 *   - the whole portfolio's mind-held instance count is a sum over cohorts,
 *     so the teaching load is computable in closed form.
 *
 * The one place it is deliberately broken is **anti-requisites**. A scholar
 * cannot hold both sides of an exclusion pair, so where the portfolio spans a
 * pair the population splits between branches and each branch's nodes are held
 * by *half* the mages who could otherwise hold them. That is the whole point of
 * the mechanic — "A scholar cannot hold both accounts; a civilization can" —
 * and in this model it shows up as a redundancy need, not as a node count.
 */

import { plain } from './params.mjs';

/* ------------------------------------------------------------------ helpers */

/** Deterministic PRNG. Only the Monte Carlo self-check uses it; the model proper is closed-form. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Content's cost ladder is exactly geometric in tier — verified against all 300
 * nodes by `selftest`. The one exception is a scribe's *desk time*, which is
 * LINEAR, and conflating the two is how the vellum answer comes out an order of
 * magnitude wrong: a tier-5 book costs 5x a tier-1 in scribe-months and 16x in
 * vellum.
 */
export const researchCost = (tier) => 1024 * 2 ** tier;
export const teachCost = (tier) => 256 * 2 ** tier;
/** Vellum a book consumes. `node.scribeCost`. Geometric. */
export const scribeCost = (tier) => 512 * 2 ** tier;
/** Scribe-months a book consumes. `SCRIBE_CAPACITY_PER_TIER * tier`. Linear. */
export const scribeDeskCost = (tier) => 1024 * tier;

const AGE_BINS = 20;

/* -------------------------------------------------------------- the portfolio */

/**
 * The reachable portfolio: the nodes a ruleset lets this universe hold at all.
 *
 * Two ceilings cut it down, and the second one is a finding rather than a
 * parameter:
 *
 *   - the **ruleset**, which for v1 is the twelve-cell rectangle holding 51
 *     nodes with tier histogram {1:12, 2:13, 3:13, 4:11, 5:2};
 *   - the species **depth ceiling**, which for humans is 4. Two of the 51 v1
 *     nodes are tier 5, so **a human universe structurally cannot hold 2 of
 *     the 51 nodes its own ruleset permits**, no matter how many universities
 *     it builds. That is not a shortfall a need can close, and `emitNeeds`
 *     reports it separately as unreachable rather than folding it into one.
 */
export function buildPortfolio(v1Nodes, species, exclusions) {
  const byTier = new Map();
  for (const n of v1Nodes) byTier.set(n.tier, (byTier.get(n.tier) ?? 0) + 1);
  const maxTier = Math.max(...byTier.keys());

  const reachable = [];
  const unreachable = [];
  for (let t = 1; t <= maxTier; t += 1) {
    const count = byTier.get(t) ?? 0;
    if (t <= species.depthCeiling) reachable.push({ tier: t, count });
    else unreachable.push({ tier: t, count });
  }

  /* Which reachable nodes sit inside an exclusion pair whose *other* side is
   * also reachable. Only then does a scholar have to choose. */
  const v1CellIds = new Set(v1Nodes.map((n) => n.cell));
  let splitNodes = 0;
  for (const pair of exclusions) {
    if (v1CellIds.has(pair.a) && v1CellIds.has(pair.b)) {
      splitNodes += v1Nodes.filter((n) => n.cell === pair.a || n.cell === pair.b).length;
    }
  }

  return {
    reachable,
    unreachable,
    reachableCount: reachable.reduce((s, r) => s + r.count, 0),
    unreachableCount: unreachable.reduce((s, r) => s + r.count, 0),
    maxReachableTier: reachable.length > 0 ? reachable[reachable.length - 1].tier : 0,
    splitNodes,
    /** Nodes a mage of depth `d` holds, given how much of the portfolio is actually held. */
    cumulativeTo(depth, heldByTier) {
      let s = 0;
      for (let t = 1; t <= depth; t += 1) s += heldByTier[t] ?? 0;
      return s;
    },
  };
}

/* ----------------------------------------------------------------- the model */

/**
 * Step a universe forward `horizonYears` world years and return the trajectory
 * plus everything `emitNeeds` reads.
 */
export function runModel(rawParams, world) {
  const P = plain(rawParams);
  const { species, portfolio, toggles } = world;

  const lifespan = species.lifespanYears;
  const binWidth = (lifespan - species.maturityYears) / AGE_BINS;

  /* Cohorts of activated mages: count, and the depth each has reached. */
  const n = new Float64Array(AGE_BINS);
  const depth = new Float64Array(AGE_BINS);
  const progress = new Float64Array(AGE_BINS);

  /* Held portfolio: how many distinct nodes are held at each tier, and how many
   * written copies exist of them. Books are pooled per tier: a book's identity
   * does not matter, only its tier (which sets its scribe cost) and its count. */
  const heldByTier = {};
  const booksByTier = {};
  for (const r of portfolio.reachable) {
    heldByTier[r.tier] = 0;
    booksByTier[r.tier] = 0;
  }

  /* The founding position: one university, a handful of mages who already hold
   * the shallow end. Without this a universe with zero holders can never teach
   * and never researches, which is a fixed point, not a game. */
  const seedMages = 6;
  n[0] = seedMages;
  depth[0] = 1;
  heldByTier[1] = Math.min(portfolio.reachable[0]?.count ?? 0, 4);

  let population = P.population0;
  let universities = P.universities0;
  let scribes = P.scribes0;
  let researchProgress = 0;

  const raidRate = effectiveRaidRate(P);
  const trajectory = [];
  let cumulativeRaids = 0;
  let cumulativeLost = 0;
  let lastAnnual = null;

  for (let year = 0; year < P.horizonYears; year += 1) {
    /* --- 1. population, logistic against a carrying capacity the economy sets */
    const capacity = P.carryingCapacity * P.economicRate;
    const growth = P.popGrowthAtUnitFertility * species.fertility;
    population += population * growth * (1 - population / capacity);

    /* --- 2. how many mages could exist, and how many the schools reach ------ */
    const latent = population * species.prevalence;
    const maturingLatent = latent / lifespan;

    /* Two different capacities, and the design uses both:
     *   - a university holds `seatsPerUniversity` students (content: 64);
     *   - a *class* holds `classCapacity` (authored: 12 x retention/1024),
     *     which is what sets how many professors those seats need.
     * Administrative golems raise the class figure, not the building — capacity
     * is a base, not a ceiling, and for humans it is a build order. */
    const classCapacity =
      species.classCapacity * (1 + P.adminGolemCapacityGain * Math.log(1 + universities));
    const seats = universities * P.seatsPerUniversity;

    /* A student holds a seat for `yearsInSchoolPerTier` per tier of depth she
     * will gain, so the seats a cohort demands is intake x years held. */
    const yearsInSchool = P.yearsInSchoolPerTier * portfolio.maxReachableTier;
    const seatsDemanded = maturingLatent * P.attendAtFullAccess * yearsInSchool;
    const access = seatsDemanded > 0 ? Math.min(1, seats / seatsDemanded) : 0;
    const intake = maturingLatent * P.attendAtFullAccess * access;

    /* --- 3. age the cohorts, and count what mortality takes with them ------- */
    let instancesLostToDeath = 0;
    let mageDeaths = 0;
    for (let a = AGE_BINS - 1; a >= 0; a -= 1) {
      const advancing = n[a] / binWidth;
      const dying = a === AGE_BINS - 1 ? n[a] : 0;
      const held = portfolio.cumulativeTo(Math.floor(depth[a]), heldByTier);
      /* Everyone who leaves the top bin dies; everyone else advances a bin. */
      if (a === AGE_BINS - 1) {
        instancesLostToDeath += dying * held;
        mageDeaths += dying;
        n[a] -= dying;
      }
      const moved = Math.min(n[a], advancing);
      if (a < AGE_BINS - 1 && moved > 0) {
        const target = a + 1;
        const total = n[target] + moved;
        if (total > 0) {
          depth[target] = (depth[target] * n[target] + depth[a] * moved) / total;
          progress[target] = (progress[target] * n[target] + progress[a] * moved) / total;
        }
        n[target] = total;
        n[a] -= moved;
      }
    }
    n[0] += intake;
    if (n[0] > 0) depth[0] = (depth[0] * (n[0] - intake)) / n[0];

    let mages = 0;
    for (let a = 0; a < AGE_BINS; a += 1) mages += n[a];

    /* --- 4. the raid, as a probability ------------------------------------- */
    let raidedThisYear = 0;
    let booksBurned = 0;
    let raidMageMonths = 0;
    {
      /**
       * The cooldown is a renewal process, not a Bernoulli one, and treating it
       * as Bernoulli overstates the raid rate badly.
       *
       * `inbound-raid-cooldown-world-ticks` forbids any raid for 5 years after
       * one, so the mean gap between raids is `cooldown + 1/p`, not `1/p`, and
       * the long-run arrival rate is `1 / (cooldown + 1/p)`. At p = 0.2 that is
       * one raid per 10 years rather than one per 5 — a factor of two, and the
       * `selftest` Monte Carlo exists precisely to hold this honest.
       *
       * It also means the cooldown is a HARD CEILING on raid pressure: as
       * p -> 1 the rate tends to 1/(cooldown+1) = 0.167/yr and no arrival
       * process can push it higher. Vision 8 asked for the griefing surface to
       * be bounded rather than merely improbable; this is where that bound is.
       */
      raidedThisYear = effectiveRaidRate(P);
      cumulativeRaids += raidedThisYear;
      const committed = Math.min(mages, P.combatantsPerRaid);
      const killed = raidedThisYear * committed * P.raidMageCasualtyFraction;
      raidMageMonths = raidedThisYear * P.raidMageMonthsPerRaid;

      /* Casualties come off the roster proportionally. Permanent (vision 8). */
      if (mages > 0) {
        const share = killed / mages;
        for (let a = 0; a < AGE_BINS; a += 1) {
          instancesLostToDeath += n[a] * share * portfolio.cumulativeTo(Math.floor(depth[a]), heldByTier);
          n[a] *= 1 - share;
        }
        mages -= killed;
        mageDeaths += killed;
      }

      /* Books: four looted off the shelf, the rest face a fire that a 90%
       * resist cap says they mostly survive. Applied to the share of raids
       * that reach the shelves at all. */
      let totalBooks = 0;
      for (const t of Object.keys(booksByTier)) totalBooks += booksByTier[t];
      if (totalBooks > 0) {
        const reaching = raidedThisYear * P.raidReachesLibrary;
        const looted = Math.min(totalBooks, reaching * P.booksLootedPerRaid);
        const burned = Math.max(0, totalBooks - looted) * reaching * (1 - P.bookBurnSurvival);
        booksBurned = looted + burned;
        const frac = booksBurned / totalBooks;
        for (const t of Object.keys(booksByTier)) booksByTier[t] *= 1 - frac;
      }
    }

    /* Mage-months the raid ate are months not spent researching or teaching. */
    const tempoLoss = mages > 0 ? Math.min(0.5, raidMageMonths / (mages * 12)) : 0;
    const effective = 1 - tempoLoss;

    /* --- 5. teaching -------------------------------------------------------- */
    const professors = mages * P.professorFractionOfMages * effective;
    const professorProgress = professors * P.teachProgressPerProfessorMonth * 12;

    /**
     * `teach-rate` is tier-conditional, not inert.
     *
     * The completion gate is a bare `progress < required` with no partial-month
     * carry, and a teaching pair pushes 2048/tick. That clears tier 1 (512),
     * tier 2 (1024) and tier 3 (2048) in ONE TICK at any multiplier — which is
     * why every measurement of `teach-rate` came back flat. But tier 4 costs
     * 4096, tier 5 8192 and tier 6 16384, so above tier 3 the multiplier is
     * live. The toggle therefore applies only to deep teaching, and a universe
     * that never gets past tier 3 cannot tell the two settings apart.
     */
    const TEACH_RATE_FLOOR_TIER = 4;
    const deepMultiplier = toggles.teachRateBites ? (P.teachMultiplier ?? 1) : 1;

    /* Cohorts advance one depth at a time. The cost of advancing a cohort from
     * depth d to d+1 is (nodes held at tier d+1) x teachCost(d+1) per student,
     * and one lesson reaches up to `classCapacity` students at once — which is
     * exactly why `teach-rate` measures inert: throughput per professor is huge
     * and the binding constraint is students, not lessons. */
    let demandProgress = 0;
    const want = [];
    for (let a = 0; a < AGE_BINS; a += 1) {
      const d = Math.floor(depth[a]);
      const next = d + 1;
      if (n[a] <= 0 || next > portfolio.maxReachableTier) continue;
      const nodesAtNext = heldByTier[next] ?? 0;
      if (nodesAtNext <= 0) continue;
      /* Only mages who can be seated learn. A class reaches classCapacity. */
      const taught = Math.min(n[a], professors > 0 ? professors * classCapacity : 0);
      /* Tiers 1-3 complete inside one month whatever the rate, so the deep
       * multiplier only discounts the cost of tier 4 and above. */
      const discount = next >= TEACH_RATE_FLOOR_TIER ? deepMultiplier : 1;
      const need =
        (nodesAtNext * teachCost(next) * Math.ceil(taught / Math.max(1, classCapacity))) / discount;
      want.push({ a, next, taught, need });
      demandProgress += need;
    }
    const teachShare = demandProgress > 0 ? Math.min(1, professorProgress / demandProgress) : 0;
    let instancesTaught = 0;
    for (const w of want) {
      const gained = teachShare * (w.taught / Math.max(1e-9, n[w.a]));
      progress[w.a] += gained;
      if (progress[w.a] >= 1) {
        const advanced = Math.min(1, progress[w.a]);
        depth[w.a] += advanced;
        progress[w.a] -= advanced;
        instancesTaught += n[w.a] * advanced * (heldByTier[w.next] ?? 0);
      }
    }

    /* --- 6. research: new distinct nodes ------------------------------------ */
    const researchers = mages * P.researcherFractionOfMages * effective;
    researchProgress += researchers * P.researchProgressPerResearcherMonth * 12 * species.curiosity;
    let discovered = 0;
    for (const r of portfolio.reachable) {
      while (heldByTier[r.tier] < r.count) {
        /* Only a mage who already stands at tier-1 can derive a tier node. */
        let atDepth = 0;
        for (let a = 0; a < AGE_BINS; a += 1) if (depth[a] >= r.tier - 1) atDepth += n[a];
        if (atDepth < 1) break;
        const cost = researchCost(r.tier);
        if (researchProgress < cost) break;
        researchProgress -= cost;
        heldByTier[r.tier] = Math.min(r.count, heldByTier[r.tier] + 1);
        discovered += 1;

        /**
         * The researcher holds what she derived.
         *
         * Without this the model deadlocks in a way that looks exactly like a
         * finding and is not: a tier-`t` node is discovered, no cohort is yet
         * at depth `t` so it has zero holders and zero books, the loss step
         * destroys it in the same year, and teaching can never start because
         * teaching a tier requires that tier to be held. The universe pins at
         * tier 1 forever and the trace reads as "scribing collapse". It was
         * caught only because `discovered` kept climbing while `heldTotal` sat
         * flat at 70 — a denominator that did not match its numerator.
         *
         * So: deriving a node promotes the deepest eligible cohort to that
         * depth. Mean-field, and it overstates the pioneer count by treating a
         * cohort as one researcher — stated here rather than hidden, and it
         * only ever affects the first year of a tier's life, after which
         * teaching sets the real holder count.
         */
        let best = -1;
        for (let a = 0; a < AGE_BINS; a += 1) {
          if (n[a] > 0 && depth[a] >= r.tier - 1 && (best < 0 || depth[a] > depth[best])) best = a;
        }
        if (best >= 0 && depth[best] < r.tier) depth[best] = r.tier;
      }
    }

    /* --- 7. scribing, and the two costs of a book -------------------------- */
    const laborers = population * P.laborerFractionOfPopulace;
    const vellumGross =
      laborers * P.materialsPerLaborerTick * P.vellumShare * 12 * P.economicRate;

    /* The library charges upkeep in vellum PER INSTANCE, every tick. This is
     * the dynamic friction the economy literature says a converter engine
     * needs, and it is already shipped — it scales with exactly the thing the
     * god is trying to grow, so a deep library taxes its own future. It is
     * charged before scribing, so a big library can starve the scribes who
     * would make it bigger. */
    let instancesHeld = 0;
    for (const t of Object.keys(booksByTier)) instancesHeld += booksByTier[t];
    const libraryUpkeep = instancesHeld * P.libraryUpkeepPerInstanceTick * 12;
    const vellumInflow = Math.max(0, vellumGross - libraryUpkeep);

    /* `world-step.ts` passes scribingQueueDepth: 0 and `demand.ts` multiplies
     * by it, so on `main` today this term is exactly zero and NO BOOK IS EVER
     * WRITTEN. The toggle is the whole reason this model exists in two modes. */
    const queueDepth = toggles.scribingQueue;
    if (!toggles.scribeCohortRefills) {
      /* The cohort only drains: reallocation calls scribe surplus and never
       * wanted, so it decays toward the measured floor of 14. */
      scribes += (14 - scribes) * 0.05;
    } else {
      /* Demand is `SCRIBES_PER_QUEUED_GRIMOIRE * queueDepth`. */
      const wanted = P.scribesPerQueuedGrimoire * queueDepth;
      scribes += (wanted - scribes) * 0.2;
    }

    /* Desk time available, in scribe-months per year. */
    const deskMonths = scribes * P.scribeMonthsPerScribeTick * 12 * species.scribeAffinity;
    let booksWritten = 0;
    const meanTier = Math.max(1, Math.round(weightedMeanTier(heldByTier)));
    if (queueDepth > 0 && deskMonths > 0) {
      const byDesk = deskMonths / scribeDeskCost(meanTier);
      const byVellum = vellumInflow / scribeCost(meanTier);
      booksWritten = Math.max(0, Math.min(queueDepth, byDesk, byVellum));
      /* Books go to the tiers that have the fewest copies relative to holders:
       * a scribe copies what is most nearly lost. */
      distributeBooks(booksByTier, heldByTier, booksWritten);
    }

    /* --- 8. decay ----------------------------------------------------------- */
    for (const t of Object.keys(booksByTier)) booksByTier[t] *= 1 - P.bookDecayPerYear;

    /* --- 9. loss ------------------------------------------------------------ */
    /* How much of what she could hold does one mage actually hold? Vision 4b's
     * per-mage cap, expressed as a fraction of the reachable portfolio. */
     let heldNow = 0;
     for (const t of Object.keys(heldByTier)) heldNow += heldByTier[t];
     const breadthFraction =
       P.breadthCapNodes > 0 && heldNow > 0 ? Math.min(1, P.breadthCapNodes / heldNow) : 1;
    const holders = holdersByTier(n, depth, portfolio, AGE_BINS, breadthFraction);
    let lostThisYear = 0;
    for (const r of portfolio.reachable) {
      const h = holders[r.tier] ?? 0;
      const b = booksByTier[r.tier] ?? 0;
      if (heldByTier[r.tier] > 0 && h < 1 && b < 1) {
        /* No living holder and no book: the last instance is gone. */
        const lose = Math.min(heldByTier[r.tier], heldByTier[r.tier] * (1 - h - b));
        heldByTier[r.tier] -= lose;
        lostThisYear += lose;
      }
    }
    cumulativeLost += lostThisYear;

    let heldTotal = 0;
    for (const t of Object.keys(heldByTier)) heldTotal += heldByTier[t];
    let booksTotal = 0;
    for (const t of Object.keys(booksByTier)) booksTotal += booksByTier[t];

    lastAnnual = {
      year,
      population,
      latent,
      mages,
      universities,
      seats,
      access,
      intake,
      classCapacity,
      professors,
      researchers,
      scribes,
      heldTotal,
      booksTotal,
      holders,
      heldByTier: { ...heldByTier },
      booksByTier: { ...booksByTier },
      instancesLostToDeath,
      instancesTaught,
      mageDeaths,
      discovered,
      lostThisYear,
      booksWritten,
      booksBurned,
      vellumInflow,
      vellumGross,
      libraryUpkeep,
      raidMageMonths,
      tempoLoss,
      yearsInSchool,
      seatsDemanded,
      breadthFraction,
    };
    if (year % 10 === 0 || year === P.horizonYears - 1) trajectory.push(lastAnnual);
  }

  return {
    params: P,
    world,
    trajectory,
    final: lastAnnual,
    cumulativeRaids,
    cumulativeLost,
    raidRate,
  };
}

/**
 * The long-run raid arrival rate, once the cooldown is accounted for.
 *
 * THIS is the number every hazard must use. An earlier draft applied the
 * renewal rate inside the model and the raw Bernoulli `p` inside `emitNeeds`,
 * and the two disagreed by a factor of five at high `p` — the needs layer
 * reported every node in the universe 75% likely to be lost while the model it
 * was reading had lost none. One function, exported, used by both.
 */
export function effectiveRaidRate(P) {
  const p = P.raidProbPerYear;
  return p > 0 ? 1 / (P.raidCooldownYears + 1 / p) : 0;
}

function weightedMeanTier(heldByTier) {
  let s = 0;
  let w = 0;
  for (const [t, c] of Object.entries(heldByTier)) {
    s += Number(t) * c;
    w += c;
  }
  return w > 0 ? s / w : 1;
}

/** A scribe copies what is most nearly lost: books go where copies-per-node is lowest. */
function distributeBooks(booksByTier, heldByTier, total) {
  const tiers = Object.keys(heldByTier).filter((t) => heldByTier[t] > 0);
  if (tiers.length === 0 || total <= 0) return;
  const deficit = tiers.map((t) => ({ t, d: Math.max(0, heldByTier[t] - (booksByTier[t] ?? 0)) }));
  const sum = deficit.reduce((s, x) => s + x.d, 0);
  if (sum <= 0) {
    for (const { t } of deficit) booksByTier[t] += total / tiers.length;
    return;
  }
  for (const { t, d } of deficit) booksByTier[t] += (total * d) / sum;
}

/**
 * Holder count per tier. A mage of depth `d` holds every held node of tier
 * <= `d`, so the holders of a tier-`t` node are every mage at depth >= `t`.
 * The pyramid is this function, and nothing else in the model asserts it.
 */
export function holdersByTier(n, depth, portfolio, bins, breadthFraction = 1) {
  const out = {};
  for (const r of portfolio.reachable) {
    let h = 0;
    for (let a = 0; a < bins; a += 1) if (depth[a] >= r.tier) h += n[a];
    /* Anti-requisites: where the portfolio spans an exclusion pair a scholar
     * must pick a side, so each side is held by half of who could hold it. */
    /* Two independent thinning terms, and they multiply:
     *   breadthFraction — vision 4b's per-mage cap on how much of the portfolio
     *     one scholar can carry at all;
     *   splitFactor     — anti-requisites, where the portfolio spans an
     *     authored exclusion pair and a scholar must pick a side.
     * Both turn "the universe holds it" into "these particular people hold it",
     * which is the only way a node can ever be one funeral from lost. */
    const thinned = h * breadthFraction;
    out[r.tier] = portfolio.splitNodes > 0 ? thinned * splitFactor(portfolio) : thinned;
  }
  return out;
}

function splitFactor(portfolio) {
  if (portfolio.splitNodes <= 0) return 1;
  const share = portfolio.splitNodes / Math.max(1, portfolio.reachableCount);
  /* Only the excluded share of the portfolio is halved; the rest is untouched. */
  return 1 - share / 2;
}
