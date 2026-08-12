# W12 — Vision audit plan

*Workstream W12. Branch `w12/vision-audit`. Audited commit: `6e5ecee` (origin/main at fetch time).*

**Mandate:** produce the authoritative, evidence-backed answer to *"which parts of
`docs/design/vision.md` are actually implemented?"*, as a checkable list that survives the session.

**Audit only.** Nothing under `packages/` is edited by this workstream. No baseline or golden is
regenerated.

## The reachability oracle

Every `wired` / `implemented-unreached` verdict is made against one fixed definition, stated once
here so that no row uses a private standard:

> A claim is **reachable in a normal run** if it fires on a path starting at
> `makeReferenceExecutor()` (`packages/scenario/src/executor.ts` →
> `reference-universe.ts` → `coordination`'s `worldSystem` and `godSystems`), under **at least one**
> of the eight scripted strategies in `packages/mc-harness/src/strategies.ts`
> (`passive-control`, `uniform-random-legal`, `permissive-breadth`, `narrow-depth`,
> `denial-warden`, `archivist`, `portal-rush`, `worship-maximizer`).

Reachable only from a test file is **not** reachable. Reachable only from a code path no strategy
can select is **not** reachable.

## Status vocabulary

- **wired** — implemented and reachable per the oracle. Row must say what observably changes.
- **implemented-unreached** — code exists, nothing in a normal run calls it. Cite symbol + absent
  call sites.
- **stubbed** — types, constants or data exist; no behaviour.
- **absent** — nothing.
- **contradicted** — the code does something the vision says it should not.

## Steps

- [x] 1.1 Create worktree branch `w12/vision-audit` from `origin/main`, `npm ci`
- [x] 1.2 Read `docs/design/vision.md` in full
- [x] 1.3 Read `docs/design/contracts.md` §4.2 (action list) and §7 (metric registry)
- [x] 1.4 `npm run typecheck` — builds `dist/`, without which no execution proof runs
- [x] 1.5 Re-verify the four calibration examples on the audited commit
- [x] 1.6 Pin the reachability oracle (above) and commit this plan
- [x] 2.1 Dispatch section auditors (§3+§4, §4a+§5, §6+§6a, §7+§7a+§8a, §8, §9+§11+§12)
- [x] 2.2 Execution proof: run the reference long-run / census and record observed facts centrally
- [x] 2.3 Execution proof: enumerate which god actions are ever legal, and which fire
- [x] 2.4 Execution proof: metric registry keys vs `contracts.md` §7's twelve
- [x] 3.1 Synthesise `docs/design/vision-audit.md`: table per section, summary counts, ranked gaps
- [x] 3.2 For each of the ten ranked gaps: smallest wiring change + owning workstream
- [x] 3.3 Record vision-internal contradictions and code-contradicts-vision rows separately
- [ ] 4.1 Commit and push `w12/vision-audit`

## Evidence log

Three execution proofs were run, read-only, against the built `dist/` of the audited commit, and
are transcribed in full in `docs/design/vision-audit.md` under "The three execution proofs":

1. `runLongReference({})` — the 200-year zero-input reference run, seed `0x00090001`, final
   snapshot hash `3a00865d721b377c`.
2. All eight scripted strategies driven for 2,400 ticks each, recording every mask bit ever set,
   every action submitted and every intervention applied.
3. A direct census of the `knowledge-instance` component at tick 2400, by location kind, node and
   mastery.

Every table row in the audit is marked `[executed]`, `[read]`, or `[baseline]` (a committed
measurement read out of `balance/baselines/`, not one taken here).

## What the audit found that changed the brief

Two of the four calibration examples this workstream was briefed with do not survive execution and
are corrected in the audit rather than repeated:

- **Teaching is wired, not contradicted.** The reference tradition is True Naming, whose `acquire`
  hook creates instances at `MASTERY_MAX`. Measured: 3,142 lessons in 2,400 ticks. The 256-vs-512
  problem is real and confined to the `standard` acquire hook, which no reachable run uses.
- **Loss fires, twice.** `nodesLost` totals 2 over 200 years. The *destruction* path (burning,
  looting) remains unreached, and that is a different claim.
