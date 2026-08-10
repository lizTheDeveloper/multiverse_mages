# Project Context

## Purpose

**Multiverse Mages** is a real-time strategy game in which the player is the god or goddess
of magic for a single universe. The player does not command units. They decide which schools
of magic *exist*, shape how knowledge propagates, and nudge a population of autonomous mage
academics — who research, teach, write, age, and die on their own — toward the shape of
civilization the player wants. Eventually mages discover portal magic, and universes raid
each other.

The load-bearing rule of the game: **the host universe's ruleset governs all magic cast
inside it, for both sides.** Enabling a school at home lets your mages learn and defend with
it, and lets invaders who know it use it against you. Disabling it denies invaders that tool
and denies you it too — and you cannot carry it offensively into a realm that lacks it.

## Design Priorities

1. **Balance before beauty.** The simulation must be measurable by automated play long before
   the interface is attractive. Monte Carlo balance sweeps and scripted-agent play are
   first-class deliverables, not tooling afterthoughts.
2. **Determinism is a test, not a promise.** Every rules-path computation is reproducible from
   `(state, actions, seed)`. Golden-replay tests guard it continuously.
3. **Authored flavor, primitive-level balance.** The game targets 40+ schools of magic. Those
   schools are authored compositions of a small set (~15) of tunable effect primitives.
   Balance is asserted over the primitives, where Monte Carlo has enough samples to be
   truthful; schools are flavor, magnitude, and cost.
4. **Machine-playable from day one.** The observation/action interface that a Monte Carlo run
   uses is the same one a reinforcement-learning agent will use.

## Tech Stack

- **Language:** TypeScript throughout (Node 22+), npm workspaces monorepo.
- **Simulation core:** a pure, dependency-free package. No I/O, no framework imports, no
  floating-point arithmetic in the rules path, no `Math.random`, no `Date.now`. Written so it
  could be ported to Rust later without touching game design.
- **Balance harness:** Node `worker_threads` pool running the core headlessly.
- **Client:** Electron, renderer reads state snapshots and never computes rules.
- **Multiplayer:** authoritative Node server running the same core; raids are lockstep
  deterministic engagements between two persisted universe snapshots.
- **RL bridge:** JSON-over-stdio wrapper exposing the agent interface to Python (staged, later).
- **Testing:** Vitest. Golden replays, property tests over the primitive space, balance
  regression gates.

## Project Conventions

### Code Style

- Strict TypeScript. No `any` in the simulation core.
- The core is a pure function: `step(state, actions, rng) -> state`. Callers own time, I/O,
  persistence, and presentation.
- Fixed-point integers for all rules-path math. Floats are permitted only in presentation and
  in analysis of Monte Carlo output.
- Content (schools, nodes, species, primitives) lives in validated data files, not in code.

### Architecture

Nine capabilities, built in order. Each is one OpenSpec change:

1. `sim-core` — fixed-timestep loop, seeded PRNG, entity store, snapshot save/load, replay tests
2. `knowledge-model` — effect primitives, school/node schema, knowledge instances with location,
   research, teaching, scribing, loss, rediscovery
3. `mages-and-species` — species traits, aging, utility-AI with assignable roles, universities,
   non-magical populace
4. `agent-api` + `mc-harness` — the observation/action interface and the batch balance runner
5. `god-agency` — favor pool, worship feedback loop, interventions, school enable/disable
6. `raid-engagement` — portals, snapshot pairing, host-ruleset arbitration, objectives,
   casualties, knowledge theft
7. `electron-client` — stylized-but-simple presentation
8. `pvp-server` — authoritative lockstep, matchmaking, persistence
9. `gym-bridge` — Python RL wrapper

The balance harness lands fourth deliberately: it is what prevents discovering at school #30
that the primitives were mis-tuned at school #3.

### Testing Strategy

- Unit tests per rules module.
- **Golden replay:** a recorded seed + action log must reproduce a byte-identical final state
  snapshot. Any nondeterminism breaks this test.
- **Balance regression:** committed Monte Carlo baselines. A change that moves a primitive's
  win-rate contribution beyond tolerance fails CI and must be acknowledged deliberately.

### Git Workflow

`main` plus short-lived feature branches named for the OpenSpec change being implemented.

## Domain Glossary

- **God / player** — the single controlling intelligence of one universe. Acts only through
  interventions purchased with favor.
- **Favor** — the god's spendable resource. Regenerates at a rate scaled by worship.
- **School** — a named body of magic (fire, water, mind, portal, …), authored as a graph of nodes.
- **Node** — one discrete technique within a school, gated by prerequisites.
- **Effect primitive** — an atomic, balance-tunable effect (direct-damage, ward, build-rate,
  research-rate, knowledge-steal, …) that nodes are composed from.
- **Knowledge instance** — one copy of a node existing at a location: a mage's mind, a grimoire,
  or a university library. A node exists in a universe while ≥1 instance does.
- **Rediscovery** — re-deriving a node whose last instance was destroyed, at a cost far above
  learning it from a teacher.
- **Raid** — a bounded, objective-based engagement inside one universe, entered through a portal.
  World time is paused for both participants while a raid resolves.
- **Host ruleset** — the set of schools enabled in the universe a raid takes place in. It governs
  what magic functions there, for attacker and defender alike.
