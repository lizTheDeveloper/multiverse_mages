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
| [`raid/`](raid/) | Muster, contact, resolution — agency spends down as the fight goes on. What is a player *doing*, what does each cast cost them in secrets, and can you look back at what happened without stopping the clock? |
| [`glow/`](glow/) | Cyan is the god's own light and the form hues stay the world's. Does that rule survive a vellum ground, or does light force the client dark? |

## What these found

`docs/design/interface-findings.md` consolidates it: eighteen findings, each with what was found, how,
its status (open / defect / resolved / blocked) and **where it lands**. Most are not client problems —
the majority have to be settled in `agent-interface` at 0.5.0 or they become a retrofit at 0.13.0.

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

**Start at [`index.html`](index.html)** — it lists all eleven with the question each answers. A test
asserts that index links only to prototypes that exist and links to every one of them, in both
directions, because a front door pointing at a missing page is worse than no front door and an
unlinked prototype is invisible.

## Running them

    npm run ui        # serves the repository root on :8200

Then open `http://localhost:8200/ui/ruleset/`. They are static files, so any static server works;
the script exists so nobody has to remember the flags.

## Light and dark

Every prototype carries a theme control — **light / system / dark** — and the choice is remembered
per browser rather than per prototype. All colour lives in [`shared/theme.css`](shared/theme.css);
no prototype declares one.

The two themes are not two skins. On ink, a charged control **emits** light. On vellum it cannot: a
cyan fill bright enough to read measures 1.01:1 against the latent state, a hue difference with no
luminance at all. So on paper charge **blooms downward** — ink drawn to the control rather than light
coming off it. Both resolve from the same `--ctl-charged-*` and `--glow-charged` tokens, so a
prototype writes one rule and gets the right treatment in either theme.

Measured across all eleven prototypes in both themes: **no text below WCAG 4.5:1**, worst case 4.72.
`packages/content/test/unit/ui-theme.test.ts` guards the three ways this breaks silently.

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
