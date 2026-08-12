# `ui/` — interface prototypes

Static, self-contained prototypes of the game's screens. **Nothing here ships**, nothing here is
imported by a package, and nothing here is in a test glob or a `tsconfig`. They exist to answer
questions that can only be settled by operating something — the way the beat-grid prototype settled
whether knowledge loss lands off the beat before 520 assets were generated against that assumption.

| Prototype | Answers |
|---|---|
| [`ruleset/`](ruleset/) | Does vision §4's grid read as nineteen switches with combinatorial consequences, or as seventy independent toggles? |
| [`ruleset-symmetry/`](ruleset-symmetry/) | The host ruleset governs an invader too. Does the portal rule read if the ruleset is a ledger of who can use what, or a staged change priced before commit? |
| [`edicts/`](edicts/) | An edict is an exception to your own policy occupying one of eight slots. Is the scarce thing legible as slots, as sentences, or as marks on the grid? |
| [`mage/`](mage/) | Can a player be told *why* an autonomous mage chose what she chose, from state the core already has — and what does the read path still lack? |
| [`targets/`](targets/) | Six actions carry an entity handle. How does a person pick one mage out of thousands, and does §4.4's top-*k* candidate list serve a human as well as a policy network? |
| [`knowledge/`](knowledge/) | Knowledge lives in minds, palaces, grimoires and libraries, each with a different way of being lost. Which organising principle makes that legible — node, vessel, or risk? |
| [`commitments/`](commitments/) | Four verbs pay out somewhere other than the tick you spend on. How do you show a purchase whose consequence is not now — and one that is out of reach rather than expensive? |
| [`ascension/`](ascension/) | Action 15 appears, may be refused, and can be taken away while you hesitate. How is an ending you have to choose presented — and what happens at the moment it lapses? |
| [`tempo/`](tempo/) | What wall-clock pacing does a world tick get, and which events are allowed to interrupt? One question, because speed decides what an event is. |
| [`raid/`](raid/) | Every action is masked for the duration. What is a player actually *doing* while a raid runs, and what belongs beside the portal timer? |
| [`glow/`](glow/) | Cyan is the god's own light and the form hues stay the world's. Does that rule survive a vellum ground, or does light force the client dark? |

## Coverage against the action space

`contracts.md` §4.2 fixes sixteen actions. This is which prototype covers each and how many
directions it offers, so "is this covered?" is a question with an answer rather than a claim.

| # | Action | Prototypes | Directions |
|---|---|---|---|
| 0 | no-op | — | not a control |
| 1–2 | permit / forbid technique | `ruleset/`, `ruleset-symmetry/` | 3 — grid, ledger, staged |
| 3–4 | permit / forbid form | `ruleset/`, `ruleset-symmetry/` | 3 — grid, ledger, staged |
| 5–6 | issue dispensation / interdiction | `edicts/` | 3 — slots, sentences, grid |
| 7 | revoke edict | `edicts/` | 3 — same three |
| 8 | grant founding knowledge | `targets/`, `knowledge/` | 3 for the mage; the node is chosen in `knowledge/`'s by-node view, which is the only one that can show a node the universe has never held |
| 9 | bless mage | `targets/`, `glow/` | 3 |
| 10 | assign role | `targets/` | 3 |
| 11 | fund / found university | `commitments/` | 3 — price, horizon, reach |
| 12 | encourage research | `commitments/` | 3 — same three |
| 13 | change tradition | `commitments/` | 3 — and only `reach` shows it is structurally unavailable rather than expensive |
| 14 | open portal | `commitments/`, `raid/` | 3 for the decision, 3 for watching it |
| 15 | declare ascension | `ascension/` | 3 — button, ladders, reckoning |

Surfaces that are not actions, and still need directions:

| Surface | Prototypes | Directions |
|---|---|---|
| Why a mage did something | `mage/` | 1 — the panel is one design; the *gaps* it found are the deliverable |
| Where knowledge lives | `knowledge/` | 3 — node, vessel, risk |
| Pacing and interruption | `tempo/` | 3 — speeds, self-slowing, feed-as-clock |
| Watching a raid | `raid/` | 3 — battlefield, clock, ledger |
| The light system | `glow/` | 3 grounds — vellum, aether insets, full dark |

**Known incompleteness.** `mage/` offers one direction rather than three: it was built to find out what
the read path cannot answer, and it found five things, which is a different job from comparing layouts.
Anyone picking a mage-panel design should treat it as one candidate, not as a decision.

## Running them

    npm run ui        # serves the repository root on :8200

Then open `http://localhost:8200/ui/ruleset/`. They are static files, so any static server works;
the script exists so nobody has to remember the flags.

## What they are allowed to do

- **Load real content.** `ruleset/content.json` is generated from `packages/content/data`, so a
  prototype is never arguing from invented numbers.
- **Synthesise audio live.** Per `docs/design/sound-design.md` §0.8's synthesised tier, so a
  prototype runs from a static file with nothing to fetch.

## What they are not

**They are not the client.** `electron-client` is proposal-only, and when it exists it must import
the rules rather than restate them — `contracts.md` §5 puts `permits()` in exactly one place, and a
prototype that reimplements it is a deliberate, temporary exception with a stated cost. Each
prototype records that cost in its own header comment.

## Not prototypes, but next door

`scripts/content-graph.mjs` renders the authored node graph — the same content these prototypes
load — as drawn prerequisite lattices or as dense text:

    npm run content:graph -- --out ui/lattices.html   # then open /ui/lattices.html
    npm run content:map                               # the same graph as text

Its output is **generated and deliberately not committed**: a checked-in copy would drift from
`node.json` silently, and the whole value of the drawing is that it is true right now. `ui/*.html`
at the top level is gitignored for that reason.
