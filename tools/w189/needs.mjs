/*
 * Multiverse Mages — turning a modelled universe into a list of needs.
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
 * A **need** is a shortfall against a stated objective, with its cause attached.
 *
 * The objective has to be stated or a shortfall is not defined, and this file
 * states it in one place:
 *
 *   RETENTION — no node the universe holds may exceed `extinctionRiskTarget`
 *   probability of being lost over `retentionHorizonYears`, where the hazard on
 *   a holder is mortality plus raid casualty and the hazard on a book is decay
 *   plus raid burning. This is a *fragility* measure: it asks what happens to
 *   each node if nothing new is taught, which is exactly the right question to
 *   ask about a single point of failure and the wrong one to ask about a
 *   thriving discipline. Both facts are why it is reported per node rather
 *   than as an aggregate.
 *
 *   DISCOVERY — net new retained nodes per year must be at least zero. A
 *   universe discovering three nodes a year and losing four is not growing
 *   slowly, it is dying slowly, and the aggregate node count hides that for
 *   decades.
 *
 * Everything below is a shortfall against one of those two, expressed in the
 * unit a god can actually buy: scribes, professors, universities, vellum.
 */

import { effectiveRaidRate, scribeCost, scribeDeskCost, teachCost } from './macro.mjs';

const EPS = 1e-9;

/**
 * Books required alongside `h` living holders for a node's extinction
 * probability over the horizon to fall under the target.
 *
 * Closed form. `P_ext = (1-e^{-H*mu_h})^h * (1-e^{-H*mu_b})^b <= eps`, so
 * `b >= (ln eps - h ln A) / ln B` with `A`, `B` both in (0,1) so the division
 * flips the inequality. Returns 0 when the holders alone already suffice, and
 * `Infinity` when books cannot help — which happens when a book's own hazard
 * is so high that `B` is 1, i.e. every book is certain to be gone. That case
 * is real (a high raid rate against no scribes) and must not silently become a
 * finite number.
 */
export function booksRequired(h, hazardHolder, hazardBook, horizon, target) {
  const A = 1 - Math.exp(-horizon * hazardHolder);
  const B = 1 - Math.exp(-horizon * hazardBook);
  const fromHolders = A > 0 ? h * Math.log(A) : -Infinity;
  if (Math.exp(fromHolders) <= target) return 0;
  if (B >= 1 - EPS) return Infinity;
  if (B <= EPS) return 0;
  const b = (Math.log(target) - fromHolders) / Math.log(B);
  return Math.max(0, Math.ceil(b));
}

export function extinctionProbability(h, b, hazardHolder, hazardBook, horizon) {
  const A = 1 - Math.exp(-horizon * hazardHolder);
  const B = 1 - Math.exp(-horizon * hazardBook);
  return Math.pow(A, h) * Math.pow(B, b);
}

/**
 * Emit the needs for a finished model run.
 */
export function emitNeeds(result) {
  const P = result.params;
  const { species, portfolio, toggles } = result.world;
  const f = result.final;

  const H = P.retentionHorizonYears;
  const target = P.extinctionRiskTarget;

  /* --- hazards ----------------------------------------------------------- */
  /* The cooldown-adjusted arrival rate, not the raw Bernoulli p. See
   * `effectiveRaidRate` — using the wrong one here overstated every hazard by
   * up to 5x and is the exact "checker answering about the wrong input" shape. */
  const raidRate = effectiveRaidRate(P);
  const hazardHolder = 1 / species.lifespanYears + raidRate * P.raidMageCasualtyFraction;
  const hazardBook =
    P.bookDecayPerYear + raidRate * P.raidReachesLibrary * (1 - P.bookBurnSurvival);

  /* --- per-tier fragility census ----------------------------------------- */
  const census = [];
  let missingBooks = 0;
  let fragileNodes = 0;
  let unsavableNodes = 0;
  for (const r of portfolio.reachable) {
    const held = f.heldByTier[r.tier] ?? 0;
    if (held <= 0) continue;
    const holdersPerNode = f.holders[r.tier] ?? 0;
    const booksPerNode = (f.booksByTier[r.tier] ?? 0) / held;
    const pExt = extinctionProbability(holdersPerNode, booksPerNode, hazardHolder, hazardBook, H);
    const need = booksRequired(holdersPerNode, hazardHolder, hazardBook, H, target);
    const shortPerNode = need === Infinity ? Infinity : Math.max(0, need - booksPerNode);
    if (pExt > target) fragileNodes += held;
    if (shortPerNode === Infinity) unsavableNodes += held;
    else missingBooks += held * shortPerNode;
    census.push({
      tier: r.tier,
      held,
      ofPossible: r.count,
      holdersPerNode,
      booksPerNode,
      extinctionProbability: pExt,
      booksRequiredPerNode: need,
      shortPerNode,
    });
  }

  /* --- the four buyable needs -------------------------------------------- */
  const meanTier = census.length > 0 ? census.reduce((s, c) => s + c.tier * c.held, 0) / Math.max(EPS, census.reduce((s, c) => s + c.held, 0)) : 1;
  const tier = Math.max(1, Math.round(meanTier));

  /* Books that must be produced per year: the backlog spread over the
   * retention horizon, plus steady replacement of decay and burning. */
  const replacementBooks = f.booksTotal * hazardBook;
  const backlogBooks = missingBooks / H;
  const booksPerYearRequired = backlogBooks + replacementBooks;

  /* A scribe's output is bounded by DESK TIME, which is linear in tier
   * (`SCRIBE_CAPACITY_PER_TIER * tier`); the VELLUM a book eats is geometric
   * (`node.scribeCost`). Two different ladders, and the need uses each for the
   * resource it actually governs. */
  const perScribeBooksPerYear =
    (P.scribeMonthsPerScribeTick * 12 * species.scribeAffinity) / scribeDeskCost(tier);
  const scribesRequired = booksPerYearRequired / Math.max(EPS, perScribeBooksPerYear);

  /* Vellum pays twice: once to make each book, and then FOREVER, because the
   * library charges upkeep per instance per tick. The standing charge is the
   * one that grows without bound as the god succeeds. */
  const vellumForNewBooks = booksPerYearRequired * scribeCost(tier);
  const vellumForUpkeep = f.booksTotal * P.libraryUpkeepPerInstanceTick * 12;
  const vellumRequired = vellumForNewBooks + vellumForUpkeep;

  /* Professors: teaching must at minimum replace what mortality takes out of
   * minds each year. `instancesLostToDeath` is the age-weighted figure, which
   * is strictly larger than mortality x instances because the mages who die
   * are the ones who held the most. */
  const teachProgressRequired = f.instancesLostToDeath * teachCost(Math.max(1, Math.round(meanTier)));
  const professorsRequired =
    teachProgressRequired / Math.max(EPS, P.teachProgressPerProfessorMonth * 12 * f.classCapacity);

  /* Universities: seats enough that access reaches 1. */
  const universitiesRequired = f.seatsDemanded / Math.max(EPS, f.classCapacity);

  const needs = [
    mkNeed('scribes', scribesRequired, f.scribes, 'scribes',
      toggles.scribingQueue === 0
        ? 'demand is structurally zero — world-step passes scribingQueueDepth: 0, so no book is ever written and every node rests on living memory alone'
        : `to keep ${fmt(missingBooks)} missing copies written and replace ${fmt(replacementBooks)} lost to decay and burning each year`),
    mkNeed('universities', universitiesRequired, f.universities, 'universities',
      `to seat the ${fmt(f.seatsDemanded)} student-years the latent pool demands; access is currently ${(f.access * 100).toFixed(1)}%`),
    mkNeed('professors', professorsRequired, f.professors, 'professors',
      `to replace the ${fmt(f.instancesLostToDeath)} knowledge instances mortality takes out of minds each year`),
    mkNeed('vellum', vellumRequired, f.vellumGross, 'fp/yr',
      `${fmt(vellumForNewBooks)} to write ${fmt(booksPerYearRequired)} new books a year, and ` +
        `${fmt(vellumForUpkeep)} in standing library upkeep at 2 fp per instance per tick — ` +
        `upkeep is ${((vellumForUpkeep / Math.max(EPS, vellumRequired)) * 100).toFixed(0)}% of the bill and grows with every book ever written`),
  ];

  /* --- discovery balance -------------------------------------------------- */
  const netDiscovery = f.discovered - f.lostThisYear;

  /* --- what is binding ---------------------------------------------------- */
  const binding = needs
    .filter((n) => n.shortfall > 0)
    .sort((a, b) => b.ratio - a.ratio)[0] ?? null;

  return {
    objective: {
      retention: `no held node above ${(target * 100).toFixed(0)}% chance of loss over ${H} years`,
      discovery: 'net new retained nodes per year >= 0',
    },
    hazards: { hazardHolder, hazardBook, raidProbPerYear: P.raidProbPerYear, effectiveRaidRate: raidRate },
    census,
    fragileNodes,
    unsavableNodes,
    missingBooks,
    needs,
    binding,
    netDiscovery,
    unreachable: {
      count: portfolio.unreachableCount,
      reason: `tier > depthCeiling ${species.depthCeiling} for ${species.id}`,
    },
    portfolio: {
      held: f.heldTotal,
      reachable: portfolio.reachableCount,
      permitted: portfolio.reachableCount + portfolio.unreachableCount,
      splitNodes: portfolio.splitNodes,
    },
    sentence: sentence({ needs, binding, netDiscovery, P, f }),
  };
}

function mkNeed(name, required, available, unit, cause) {
  const shortfall = Math.max(0, required - available);
  return {
    name,
    required,
    available,
    shortfall,
    unit,
    cause,
    ratio: available > EPS ? required / available : required > EPS ? Infinity : 1,
  };
}

/**
 * The owner asked for a statement, not a table: *"this universe is short 40
 * scribes and 2 universities to sustain its current rate of discovery against
 * a 15% annual raid probability"*. This builds exactly that.
 */
function sentence({ needs, binding, netDiscovery, P, f }) {
  const short = needs.filter((n) => n.shortfall > 0.5);
  const raid = `${(P.raidProbPerYear * 100).toFixed(1)}% annual raid probability (${(effectiveRaidRate(P) * 100).toFixed(1)}%/yr after the 5-year cooldown)`;
  if (short.length === 0) {
    return `This universe meets every need at a ${raid}, holding ${fmt(f.heldTotal)} nodes with net discovery ${netDiscovery >= 0 ? '+' : ''}${fmt(netDiscovery)}/yr.`;
  }
  const parts = short.map((n) => `${fmt(n.shortfall)} ${n.unit}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const verdict =
    netDiscovery < 0
      ? `it is losing ${fmt(-netDiscovery)} nodes a year more than it discovers`
      : `it sustains discovery at ${fmt(netDiscovery)} nodes a year`;
  return (
    `This universe is short ${list} to sustain its current rate of discovery against a ${raid}; ` +
    `${verdict}, and the binding constraint is ${binding ? binding.name : 'none'}.`
  );
}

export function fmt(x) {
  if (!Number.isFinite(x)) return x > 0 ? 'unboundedly many' : '0';
  if (Math.abs(x) >= 100) return x.toFixed(0);
  if (Math.abs(x) >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
