# Multiverse Mages — Art Plan

*How the game gets a visual identity, using [PixelLab](https://www.pixellab.ai/) as the generation
pipeline. Scheduled against `docs/design/release-plan.md`: the client is **0.13.0**, so almost
nothing here is generated until the balance numbers are settled. This document exists now so the
art direction is a decision rather than an accident when that time comes.*

---

## 1. The organising principle: the art is compositional, because the game is

The single most important art decision falls straight out of the mechanics. Magic is a
**5 × 14 grid of techniques × forms** — 70 cells. The naive art brief is "70 cell icons." That is
the wrong answer for exactly the reason 70 bespoke schools was the wrong answer mechanically:
it is 70 unrelated things to author, tune, and keep consistent.

**Instead: 5 technique glyphs × 14 form glyphs, composited at runtime.** Nineteen assets cover
seventy states. `Perdo Ignem` is the unmaking glyph rendered in fire's palette over fire's motif.
The player learns nineteen visual atoms and can then read a cell they have never seen before — which
is the same cognitive win the grid gives them mechanically.

The same logic governs spell effects: an effect's visual is **primitive shape × form palette**, not
a bespoke animation per node. `direct-damage` has one silhouette; Ignem makes it fire, Umbra makes
it shadow. Sixteen primitives × fourteen palettes, from thirty assets.

**For v1 this is very small.** The v1 subset is `{Intellego, Perdo, Rego} × {Limen, Mentem, Nomen,
Terram}` — **3 technique glyphs and 4 form glyphs**. Seven icons cover the entire playable ruleset.

## 2. Style direction

The game is about **scholars, libraries, and loss**. Not heroic fantasy — academic fantasy, where
the tragedy is a burned archive rather than a slain hero.

- **Palette:** ink, vellum, and lamplight as the ground. Muted, warm-neutral, low saturation, so
  that magic reads as the only saturated thing on screen. Each of the fourteen forms owns one
  signature hue and never lends it to another.
- **Perspective:** world scale has no map (vision §7a), so institutions are presented as
  **isometric building tiles** in a roster, not placed on terrain. Raids are **top-down**, because
  they are positional and legibility beats beauty when reading a battlefield.
- **Resolution:** 64×64 for character sprites, 32×32 for icons and glyphs, 32×32 isometric tiles.
  Small enough to generate cheaply and iterate; large enough that a dwarf reads as a dwarf.
- **The knowledge motif:** every knowledge-bearing object — mind, grimoire, library, memory palace —
  shares a visual language, because the game's core idea is that these are the *same substance in
  different vessels*. A spell in a mage's head and a spell in a book should look related.

**Anti-goal:** no animated ambience, no parallax, no particle systems in v1. The release plan calls
the client "stylized-but-simple," and every hour of polish before `0.12.0` is spent on a game whose
numbers are still moving.

## 3. Asset inventory

### 3.1 Ruleset interface — the core verb

| Asset | Count (v1 / full) | Notes |
|---|---|---|
| Technique glyphs | 3 / 5 | Creo, Intellego, Muto, Perdo, Rego |
| Form glyphs | 4 / 14 | one signature hue each |
| Cell icons | **0** | composited from the two above |
| Edict marks | 2 / 2 | dispensation and interdiction — must read at a glance as *permission* vs *prohibition* |
| Tradition emblems | 3 / 3 | Vancian, True Naming, Art of Memory |
| Primitive icons | 16 / 16 | for tooltips and the balance UI |

### 3.2 Mages and populace

Six species: Human, Elf, Dwarf, Draconic, Gnome, Orc.

- **Portraits**, 3 age brackets each — mages visibly age, and a 700-year elf spending 200 of them as
  a professor should look different at the end. 18 portraits.
- **Combatant sprites**, 8-directional, animations: idle, walk, cast, death. Only species that
  actually enter raids need the full set.
- **Role marks** — researcher, warden, professor, raider — as overlays on the portrait, not separate
  portraits. Four assets instead of twenty-four.
- **Populace** is aggregated (contracts §1.3), so laborers, scribes, and students need *icons only*.
  **Soldiers** need combat sprites, because they fight in raids without magic.

### 3.3 Institutions and knowledge objects

| Asset | Notes |
|---|---|
| University | 3 build states: foundation, partial, complete |
| Library | scaled by depth — a shallow library and a deep one must be distinguishable at a glance |
| **Library, burned** | the emotional core of the game. Deserves the most art attention of any single asset |
| Grimoire | plus a dwarven variant, since dwarven books resist destruction and that should be visible |
| Memory palace | Art of Memory tradition only; unburnable, unlootable, dies with its holder |
| Portal | open, collapsing, closed |

### 3.4 Raid battlefield

- **Wang tilesets** for terrain — PixelLab generates these directly from a lower/upper pair.
  Three biomes maximum for v1.
- **Objective markers**: library, university, archmage.
- **Portal stability indicator** — the raid's clock, and the thing that guarantees termination, so
  it must be readable at all times.

## 4. Pipeline

**Tooling:** the PixelLab MCP server at `https://api.pixellab.ai/mcp`, bearer-token authenticated.
It exposes character creation with 4/8 directions, character animation, Wang tileset generation, and
isometric tiles. For anything the MCP does not cover — forced palettes, style references, inpainting
— call the REST API at `api.pixellab.ai` directly.

**Credentials** live in `.env` as `PIXELLAB_API_KEY`. `.env` and `.env.*` are gitignored; only
`.env.example` is tracked. This repository is public.

**Style consistency is the hard problem**, and it is solved the same way this project solves every
other consistency problem — by pinning the inputs:

1. A **style bible**: one reference image per asset class, generated first, reviewed by a human,
   then frozen. Every subsequent generation passes it as a style reference.
2. **Forced palettes** per form, so Ignem assets cannot drift toward orange over a hundred
   generations.
3. **An asset manifest** committed beside every asset, recording prompt, model, parameters,
   reference image, and date. This is the same discipline as the golden replay fixtures: an asset
   you cannot regenerate from recorded inputs is an asset you cannot iterate on. Regeneration is an
   explicit command, never a side effect.

**Human review is mandatory and non-negotiable.** Generated art is a first draft. The gate is a
person looking at a contact sheet of every asset in a class side by side — style drift is invisible
asset-by-asset and obvious in a grid.

## 5. Budget and scheduling

**The budget is 10,000 generations.** Not credits — generations, and they are not the constraint.

The v1 asset set is roughly: 7 glyphs, 16 primitive icons, 18 portraits, 6 species × 8 directions ×
4 animations, the institution set, and 3 tilesets. Low hundreds of generations. Even at a punishing
ten attempts per accepted asset, v1 costs a few thousand — comfortably inside the allowance, with
room for a full second pass after playtesters tell us what they misread.

**So generation volume is free, and the real constraint is human review throughput.** Every asset
needs a person to look at it, and style drift is only visible when a whole class is viewed side by
side. That reframes the pilot: its job is not to price anything, it is to find out how many attempts
a class needs before it passes review, and therefore *how much looking* the full set will demand.

It also changes the tactics. When generation is cheap, the right move is to **generate a class wide
and pick, rather than generate narrow and refine** — six candidate dwarves reviewed together beat
one dwarf iterated six times, because the contact sheet is where drift shows up anyway. Spend the
allowance on breadth at the review gate.

**Schedule, against the release plan:**

| Release | Art work |
|---|---|
| ≤ 0.10.0 | **None.** Style bible pilot only — one class generated wide (6–8 candidates) to establish direction and measure how much review the full set will need |
| 0.11.0–0.12.0 | Still none. Machines are finding the meta; the game may still change shape |
| **0.13.0** | The v1 asset set, generated and reviewed. This is the client release |
| 0.14.0+ | Iterate on what playtesters actually misread |

Generating the full set before `0.12.0` risks producing art for mechanics the balance harness later
removes.

## 6. Licensing

- **Generated assets are ours.** PixelLab grants copyright in creations, with commercial licensing
  included on paid plans.
- **Assets are licensed separately from the code.** `CLAUDE.md` requires this: the AGPL does not
  cover non-software assets cleanly. **CC BY-SA 4.0** is the copyleft counterpart, matching the
  project's licensing intent.
- **PixelLab forbids training models on its generated images.** Worth stating explicitly because
  this project *does* train reinforcement-learning agents: our agents consume the numeric
  observation vector (contracts §4.1, a `Float64Array`), never pixels. There is no conflict — but a
  future proposal for a vision-based agent would create one, and this is the note that should stop it.
- Programmatic use must go through the official API. No scraping the web app.

## 7. Open questions

- How many candidates per accepted asset? Not a budget question — a question about how many hours of
  human looking the full set costs. Answered by the pilot.
- Do the fourteen form hues survive a colourblind check? They are the primary carrier of meaning in
  the composited cell icons, so if they do not, shape must carry more of the load.
- Can a composited technique×form icon actually be read by a player, or does it need a per-cell
  hand-touch at the top tiers? Testable in the pilot with three cells.
- Does a deep library read as deep without a number beside it?
