# Multiverse Mages — working notes

## ⚠️ This is a PUBLIC repository

`lizTheDeveloper/multiverse_mages` is public on GitHub. Everything committed here is visible to
anyone, permanently, including in the history after a later deletion.

Consequences to respect on every commit:

- **No secrets, ever.** No API keys, tokens, `.env` files, credentials, or private endpoints.
  There is no such thing as removing one later — assume anything pushed is compromised.
- **No private information.** No personal details about the author or third parties, no internal
  business context, no material from private repositories or client work.
- **Design discussion is public.** The vision doc and OpenSpec artifacts are readable by anyone,
  including people who might build the same game. That is a deliberate accepted tradeoff, not an
  oversight — but write with an audience in mind.
## License: AGPL-3.0-or-later

The project is licensed **GNU Affero General Public License v3.0 or later**, chosen deliberately
as the most strongly copyleft option available. `LICENSE` holds the verbatim FSF text and must
not be edited.

What this obliges, and what it obliges of *us*:

- **Every dependency must be AGPL-compatible.** Before adding any dependency, check its license.
  Apache-2.0, MIT, BSD, LGPL, GPLv3, and MPL-2.0 are fine. **GPLv2-only is not** — it is
  incompatible with AGPL-3.0 and would make the combined work undistributable. Neither are
  proprietary or source-available licenses (BSL, SSPL, Elastic, "non-commercial", CC BY-NC).
- **The network clause is the point.** Anyone running a modified version of the multiplayer server
  as a service must offer its source to users. Keep the server's source-offer path intact; do not
  design anything that would make compliance impractical.
- **New source files carry the standard AGPL header** (short notice + reference to `LICENSE`),
  and `package.json` files declare `"license": "AGPL-3.0-or-later"`. The copyright holder is
  **Ann Kelner** — not the GitHub handle, not the home-directory name.
- **Assets are licensed separately from code.** When art, audio, or text content is added, license
  it explicitly — CC BY-SA 4.0 is the natural copyleft counterpart. Do not assume the AGPL covers
  non-software assets cleanly.
- **Outside contributions inherit AGPL.** If commercial dual-licensing is ever wanted, that
  requires owning or being assigned all copyright — i.e. a CLA, decided *before* accepting
  contributions, not after. Flag this if a PR from a third party arrives.

## What this project is

A real-time strategy game in which the player is the god of magic for a universe: you set what
magic *can exist*, and autonomous mage academics discover, teach, record, and lose it. Universes
raid each other through portals, arbitrated by the host universe's ruleset.

**`docs/design/vision.md` is the vision of record.** Read it before proposing anything. Work that
isn't traceable to a section there is scope creep; sections that never ship are unmet promises.

## How work is tracked

OpenSpec, at `openspec/`. Roadmap of nine changes is in `docs/design/vision.md` §11, and that
table uses the real change and capability IDs so it stays in sync with `openspec list`.

- `openspec list` — see changes
- `openspec show <change>` / `openspec validate <change> --strict`
- `/opsx:apply` — implement a change's tasks

Current state: released through **0.3.0**. `sim-core-foundation` gave `packages/sim-core` its
deterministic substrate — fixed-point arithmetic, the splittable PRNG, the entity store, the
dual-scale clock, the pure `step` contract, versioned snapshots, replay, golden fixtures and the
benchmark. `core-contracts` added `content` (schemas, loader, v1 data), `state` (the §1 world state
types and the one `permits()`), `primitives` (§3 stacking arithmetic), and `agent-api` (the §4
observation, action space and legality mask), plus skeletons for the `rules-*` packages.
`knowledge-model` added `rules-magic` — the seventy-cell grid and its twelve enabled cells, the
effect pipeline, knowledge instances with decay, loss and 3× rediscovery, and the three v1
traditions confined to their four hooks — plus `rules-world`'s species and mage layers. The whole
grid is pre-authored: 300 nodes across all seventy cells, of which twelve cells are enabled.
Next up is `mages-and-species` (0.4.0).

Two packages are **deviations from `contracts.md` §5 as originally drawn**, both recorded there with
their reasoning: `state` and `primitives`. §5 was written before anyone tried to satisfy it.

Two commands worth knowing before touching the core:

- `npm run verify` — typecheck, lint, dependency-purity, and the full test suite. This is the gate.
- `npm run goldens:regen` — regenerates the golden replay fixtures. **Never run this to make a
  test pass.** A fixture diff is a claim that behaviour changed on purpose, and reviewers read it
  as one.

## CI, and why there are two of them

`main` is protected: pull request required, no force-push, no deletion, and **two** status checks
must be green. See `docs/devops/ci-and-deploy.md` before changing any of it.

The short version, because the obvious "cleanup" here is a security regression:

- **GitHub Actions** (`.github/workflows/ci.yml`) is free and unmetered — this repo is public — and
  runs in a sandbox holding no credentials. It is the **only** gate that safely sees fork PRs.
- **The self-hosted runner** (`scripts/ci-check.sh`, status context `ci/hetzner-lint`) runs on
  `cto-tycoon-hel1` in a process holding Coolify, Neon, GitHub and Matrix tokens. It therefore
  **refuses fork PRs outright**, and must keep doing so.

Neither can do the other's job. Do not delete the Actions workflow to "move CI off GitHub", and do
not relax the fork guard to make a fork PR go green. `scripts/ci-check.sh` must stay equivalent to
`npm run verify`, or a commit can pass locally and fail on the runner — or worse, the reverse.

## Non-negotiable technical constraints

These come from the balance methodology and the live-PvP requirement, and violating any of them
breaks something that will not be noticed for months:

1. **The simulation core is deterministic.** No `Math.random`, no `Date.now`, no wall-clock reads,
   no floating-point arithmetic in the rules path. Fixed-point integers at scale 1/1024.
2. **The core has zero runtime dependencies** and performs no I/O. It is a pure
   `step(state, actions, rng) -> state`.
3. **Randomness is stream-split per subsystem.** Adding a draw in one subsystem must not re-roll
   any other. Otherwise every committed balance baseline silently rots.
4. **Golden replay fixtures are regenerated only by explicit command,** never as a test side
   effect. A regenerated fixture is a claim that behavior changed on purpose.

## Versioning

`docs/design/release-plan.md` is authoritative. Two rules that are easy to violate by accident:

- **MINOR parity encodes balance validation from 0.5.0 onward.** Odd = in flight, even = Monte
  Carlo baselines committed and green. Never take an even MINOR without the baseline job passing —
  the whole value of the scheme is that an even version is a claim someone could check.
- **Every release gets a tag.** An untagged release is not a rollback target.

Every release states a claim that could turn out to be false, plus the measurement that would
disprove it and whether that measurement is actually collected. "Improved X" is not a claim.

## Always work in a git worktree

**Never edit the shared checkout directly.** Create a worktree, work there, verify there, push from
there. This holds for merges too — merging by checking out `main` in the shared tree yanks the
branch out from under anyone else working in it.

    git worktree add .claude/worktrees/<name> <branch>

`.claude/worktrees/` is gitignored and excluded from eslint. A worktree has no `node_modules` of its
own, so run `npm ci` in it before `npm run verify`, or npm will silently resolve workspace binaries
from the parent checkout and you will be verifying the wrong tree.

The reason is concrete: more than one agent or person may be editing this repository at the same
time. Files changing underneath a running command produce failures that look like real defects and
are not, and `git stash` in a shared tree can sweep up someone else's uncommitted work.

## Conventions

- Commits are authored with the repo owner's git identity (`lizTheDeveloper`), not an inferred one.
- Branch per OpenSpec change, named for it.
- Content — grid cells, nodes, species, primitives, traditions — lives in validated data files,
  never hardcoded. Tradition hooks are the one licensed exception, confined to four extension
  points: acquire, store, cast, cost.
