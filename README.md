# Multiverse Mages

A real-time strategy game where you are the god of magic — and your only real power is deciding
what magic is *possible*.

You never cast a spell and you never command a mage. You decide which techniques and which forms
exist in your universe, and then a civilization of autonomous scholar-warriors discovers them,
teaches them, writes them down, forgets them, and eventually carries them through a portal into
someone else's sky.

## The load-bearing idea

**The host universe's ruleset governs all magic cast inside it, for both attacker and defender.**

Permit fire at home and your mages defend with it — and so does anyone who invades you knowing
fire. Forbid it and you deny invaders the tool, but you also cannot carry it into a realm that
forbids it. Every permission is symmetric, which is where the strategy lives.

## Magic is a grid

Five techniques — **Creo** (make), **Intellego** (perceive), **Muto** (transform), **Perdo**
(unmake), **Rego** (control) — across fourteen forms: Animal, Aquam, Auram, Corpus, Herbam, Ignem,
Imaginem, Mentem, Terram, Vim, Umbra, Fatum, Limen, Nomen. Seventy cells.

The god toggles techniques and forms independently — nineteen switches producing seventy outcomes
— plus a small budget of single-cell **edicts** for exceptions. *"Perdo is forbidden in my
universe, save upon the undead."*

Classical school names survive as labels on regions of the grid. Mages still say *she's a
necromancer*; the simulation sees `Rego Corpus`.

## Knowledge is physical

A spell lives somewhere: in a mage's mind, in a grimoire, in a university library, or — under the
Art of Memory tradition — in a memory palace that burns with nothing and dies with its holder. A
technique exists in your universe only while at least one copy of it does.

Kill the last mage who knew it and burn the book, and it is gone. Not disabled. Gone, until
someone rediscovers it from first principles.

## Traditions

A universe has exactly one tradition — how magic is performed at all — and it may hook exactly
four points: how knowledge is **acquired**, **stored**, **cast**, and what it **costs**. v1 ships
Vancian memorization, True Naming, and the Art of Memory, each chosen to stress the knowledge
model in a different direction.

## Status

**Design and specification. No implementation yet.**

- `docs/design/vision.md` — the vision of record
- `openspec/` — specifications, tracked with [OpenSpec](https://github.com/Fission-AI/OpenSpec)
- First change, `sim-core-foundation`, is fully specified: a deterministic, dependency-free
  simulation core with versioned snapshots and golden-replay verification

The project is built balance-first: the simulation is playable by machines, and Monte Carlo
sweeps validate it, long before the interface is attractive. Real-time strategy is hard to get
right, and humans should be discovering the human meta — not the fact that one primitive was
mistuned.

## License

Copyright © 2026 Ann Kelner.

**GNU Affero General Public License v3.0 or later** — see [`LICENSE`](LICENSE).

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. It is distributed in the hope that it will
be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

Chosen for the network clause: if you run a modified version of this game's server as a service,
you must offer your users its source. Forks, derivatives, and hosted versions stay free.

Dependencies must be AGPL-compatible. Assets, when they exist, will be licensed separately.
