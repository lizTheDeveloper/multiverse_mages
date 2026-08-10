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
- **No license file yet**, so default copyright applies (all rights reserved). Adding a license is
  the author's call; do not add one unprompted.

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

Current state: `sim-core-foundation` is fully specified, not yet implemented. No code exists yet.

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

## Conventions

- Commits are authored with the repo owner's git identity (`lizTheDeveloper`), not an inferred one.
- Branch per OpenSpec change, named for it.
- Content — grid cells, nodes, species, primitives, traditions — lives in validated data files,
  never hardcoded. Tradition hooks are the one licensed exception, confined to four extension
  points: acquire, store, cast, cost.
