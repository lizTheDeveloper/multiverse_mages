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
- [ ] 3.1 Synthesise `docs/design/vision-audit.md`: table per section, summary counts, ranked gaps
- [ ] 3.2 For each of the ten ranked gaps: smallest wiring change + owning workstream
- [ ] 3.3 Record vision-internal contradictions and code-contradicts-vision rows separately
- [ ] 4.1 Commit and push `w12/vision-audit`

## Evidence log

Execution proofs are recorded in `docs/design/vision-audit.md` under "Proved by execution"; every
other row is marked read-proved.
