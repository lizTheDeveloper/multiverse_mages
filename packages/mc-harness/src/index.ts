/*
 * Multiverse Mages — Monte Carlo harness package public surface.
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
 * `@mm/mc-harness` — the worker pool, parameter sweeps, ablation runs, and the
 * balance-metric registry of `contracts.md` §7. Empty until `balance-harness`.
 *
 * It reaches the simulation only through `@mm/agent-api` (§5). That is not
 * tidiness: the harness and a trained policy must observe the same universe
 * through the same interface, or a baseline measured by the harness would not
 * describe what an agent actually sees.
 *
 * Unlike the rules packages this one is host-side tooling — it owns processes,
 * reads a wall clock to report throughput, and writes result files — so it sees
 * Node's ambient types and is deliberately outside the rules-path purity block.
 */

export {};
