# Multiverse Mages — Design Vision

*Status: approved 2026-08-10. This document is the vision of record. Every OpenSpec change
should trace to a section here; anything built that isn't described here is scope creep, and
anything described here that never ships is an unmet promise.*

---

## 1. The Fantasy

You are the god or goddess of magic for one universe. You never cast a spell and you never
command a mage. What you do is decide **what magic is possible at all**, and then watch a
civilization of scholar-warriors discover it, teach it, write it down, forget it, and
eventually carry it through a portal into someone else's sky.

The mages are academics with swords. They have careers. They have curiosity, and species, and
lifespans, and they die — sometimes taking the only copy of something irreplaceable with them.

Your relationship to them is pressure, not control: you bless, you fund, you forbid, you grant
founding knowledge to a chosen scholar so that a school can exist in your world for the first
time. Then you let go and see what they make of it.

## 2. Design Pillars

1. **Rules-setting is the core verb.** The most interesting decision in the game is which
   schools exist in your universe — because that choice is *symmetric* and permanent-feeling.
2. **Knowledge is physical.** It occupies minds and books and buildings. It can be taught,
   copied, stolen, and lost. This is what makes a civilization feel mortal.
3. **You are a god, not a general.** Autonomy of the mages is a feature, not a limitation.
4. **The numbers come first.** The game is balanced by machine play before it is made pretty.

## 3. The Portal Rule

The single load-bearing mechanic:

> **The host universe's ruleset governs all magic cast inside it, for both attacker and
> defender.**

Consequences, which are the whole strategy layer:

- If both universes enable fire, both sides use fire in either realm.
- If you enable water and your rival does not: you defend with water at home, and you *cannot*
  use it when raiding them.
- Enabling a school arms your defense *and* arms anyone who invades you and happens to know it.
- Disabling a school is a real strategic option, not a penalty — it is a denial play.
- **Portal magic itself cannot be disabled during a raid.** Rules changes are a world-time
  action; a raid in progress is frozen policy.

## 4. Magic: Schools, Nodes, Primitives

**Target: 40+ schools.** That is a content goal, and it creates a balance problem — 40 schools
is ~800 interaction pairs, and Monte Carlo signal per bespoke school is too thin to trust.

**The resolution:** schools are *authored compositions of a small set of tunable effect
primitives*. Roughly fifteen:

| Category | Primitives |
|---|---|
| Combat | direct-damage, ward, area-denial, blink/mobility, summon |
| Economy | build-rate, resource-yield, research-rate, teach-rate, scribe-rate |
| Social / meta | lifespan, fertility, worship-yield, concealment, knowledge-steal |
| Special | portal (gates raiding entirely; balanced on its own terms) |

A school is a graph of **nodes**. Each node is one technique, gated by prerequisites, and
expressed as primitives at magnitudes with costs. Balance assertions are made over primitives,
where samples are plentiful. Schools carry flavor, magnitude, cost, and prerequisite shape.

Earth magic making universities build faster is not a special case in code — it's a node
weighted toward `build-rate`.

**v1 ships 8 playable schools** against a schema designed for 40+.

## 5. Knowledge Has a Location

A **knowledge instance** is one copy of a node, existing at exactly one of:

- `mind:<mageId>` — fast to use, dies with the mage
- `grimoire:<itemId>` — portable, lootable, burnable
- `library:<universityId>` — aggregated grimoires; a single high-value raid objective

A node **exists in your universe** while at least one instance does. Operations:

- **Research** — a mage derives a new node from prerequisites they hold. Slow.
- **Teaching** — mind → mind. Fast. Requires a living teacher and a student with prerequisites.
- **Scribing** — mind → grimoire. Slow; requires literate non-magical scribes and materials.
  Some species are far better at it.
- **Loss** — the last instance is destroyed. The node leaves the universe.
- **Rediscovery** — re-deriving a lost node from prerequisites, at a cost far above learning it
  from a teacher. Gnomes are unusually good at this.
- **Theft** — the `knowledge-steal` primitive. Only some schools have it. Reading it from a
  mind mid-raid, or looting the grimoire that holds it.

This is what makes losing hurt in a way that losing units never does.

## 6. Species

Six playable species plus the non-magical populace. Tuned on: lifespan, curiosity (rate of
self-directed research), depth ceiling (deepest node tier reachable), learn rate, retention,
fertility, and school affinities.

| Species | Lifespan | Character |
|---|---|---|
| **Human** | ~80y | High curiosity, high fertility, broad average aptitude. Wins on volume and breadth; loses knowledge constantly to mortality. |
| **Elf** | ~700y | Moderate curiosity, high depth ceiling, slow to learn. Deep specialists. |
| **Dwarf** | ~250y | Low curiosity, exceptional retention and scribing — dwarven grimoires resist destruction. The archivists. |
| **Draconic** | ~1500y | Barely curious, highest depth ceiling, very slow learning, very low fertility. Few, ancient, and terrifying. |
| **Gnome** | ~350y | Highest curiosity, discovery and *rediscovery* bonuses, poor retention. Erratic geniuses. |
| **Orc** | ~60y | Low magical aptitude, high build-rate and martial capability, high fertility. |

**Non-magical individuals** exist across all species and matter mechanically: scribes copy
grimoires, laborers build universities, students become the next generation of mages, soldiers
fight in raids without magic. A universe of pure archmages does not function.

## 7. The God's Agency

Everything the player does costs **favor**, drawn from a regenerating pool whose regeneration
scales with **worship** — the number and devotion of mages, universities, and populace revering
you. Growing your world grows your power, which means snowballing is a live risk the balance
harness must specifically watch for.

Interventions include: bless a mage, grant founding knowledge (the only way to introduce a
school nobody in your world knows), fund a university, assign a standing role, enable a school,
disable a school, encourage a research direction.

**Mage autonomy:** mages act on utility-scored goals shaped by species, age, personality, and
their assigned standing **role** (researcher, warden, professor, raider). You set the role; they
decide everything else. You never issue direct orders — including in raids.

## 8. Raids

- **Two clocks.** World time advances in months/years while you tend your universe. Entering a
  raid **pauses world time for both universes** and switches to a fast combat clock.
- **Entry** requires the portal school and favor.
- **Arbitration:** host ruleset governs (§3).
- **Termination:** objective-based, with a portal stability timer that guarantees the raid ends.
  Attacker wins by destroying or looting a target — a library, a university, an archmage.
  Defender wins by holding until the portal collapses.
- **Stakes:** casualties are permanent. Knowledge whose last instance dies with a mage or burns
  in a library is *lost* and must be rediscovered. Theft is school-gated, not universal.

## 9. Balance Methodology

This is a first-class feature, not tooling.

- **Monte Carlo sweeps.** Thousands of headless runs over parameterized universes, played by
  scripted agents. Metrics: win-rate contribution per primitive, time-to-node-tier by species,
  knowledge half-life, snowball detection on the worship loop, raid length distribution.
- **The agent interface is the MC interface.** One observation/action API serves scripted bots,
  Monte Carlo, and later reinforcement learning. Building it twice would guarantee divergence.
- **Balance regression gates.** Committed baselines; a change that moves a primitive's measured
  contribution beyond tolerance fails CI and must be accepted deliberately.
- **Humans last.** Human playtesting discovers the human meta *after* the machine meta says the
  numbers are sane.

## 10. Technical Shape

TypeScript monorepo. A pure, dependency-free simulation core — no I/O, no floats in the rules
path, seeded PRNG only — consumed identically by the Monte Carlo harness, the Electron client,
and the authoritative multiplayer server. Determinism is enforced by golden-replay tests.
Written so the hot loop could be ported to Rust if throughput demands it, without touching game
design. Python RL bridge over JSON-over-stdio, staged for later.

## 11. Roadmap

| # | Capability | Delivers |
|---|---|---|
| 1 | `sim-core` | Deterministic tick loop, entity store, snapshots, replay tests |
| 2 | `knowledge-model` | Primitives, schools, nodes, knowledge instances, loss & rediscovery |
| 3 | `mages-and-species` | Species, aging, utility AI with roles, universities, populace |
| 4 | `agent-api` + `mc-harness` | Machine play and balance measurement |
| 5 | `god-agency` | Favor, worship loop, interventions |
| 6 | `raid-engagement` | Portals, host-ruleset arbitration, objectives, casualties, theft |
| 7 | `electron-client` | Stylized-but-simple playable interface |
| 8 | `pvp-server` | Live real-time PvP, lockstep, persistence |
| 9 | `gym-bridge` | Python RL wrapper |

Steps 1–3 produce a single universe that runs on its own. Step 4 makes it measurable. Steps 5–6
make it a game. Steps 7–9 make it playable by humans and by learning agents.

## 12. Deliberately Out of Scope for v1

- More than 8 authored schools
- Animated RTS presentation, art pipeline, audio
- Reinforcement learning *training* (the interface ships; the training does not)
- Ranked ladder, matchmaking beyond direct challenge, economy/monetization
- Player-authored schools or primitives

## 13. Open Questions

Tracked for resolution during the changes that need them, not blocking:

- How many mages does a mature universe hold? This sets the simulation's performance budget and
  is answered empirically in `sim-core` benchmarking.
- Does world time advance for *spectators* during someone else's raid, or globally pause? Only
  matters once `pvp-server` exists.
- Do universities have specializations, or are they generic capacity? Deferred to
  `mages-and-species`.
- What is the exact worship formula? Deferred to `god-agency`, and expected to be retuned
  repeatedly by the balance harness.
