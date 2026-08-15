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
| [`console/`](console/) | Not a twelfth direction — the composition. Do the surfaces hold together as one screen against one clock, and where does the read path stop being able to feed them? |

## Not a prototype: [`design-dashboard/`](design-dashboard/)

The eleven above each ask one interface question. **This one asks nothing.** It is an instrument for
reading the campaign's own state — the seventy-cell grid and which twelve are enabled, primitive
consumption, the species table and the tensions in it, the `contracts.md` §7 metric registry and
which of those metrics has ever been measured, what the four committed baselines actually hold,
`check:reachability`'s findings, and the design decisions waiting on the owner.

It reads one file, `design-dashboard/data.json`, written by:

    npm run ui:dashboard

**Generated and deliberately not committed** — the same treatment `session.json` gets, and for the
same reasons plus one of its own: the payload embeds all four baselines' provenance, so while it was
committed, every baseline re-record also required `npm run ui:dashboard`, and branches kept getting
that wrong.

The payload takes **no clock reading and makes no `git` call**, deliberately. That is what makes it
a pure function of the repository, which in turn is what makes building it in CI produce the same
file you build locally — and it is why the page can say it is a statement about whatever commit you
are reading it on. Figures lifted from a document carry that document's own stated date and ref and
are labelled historical.

`npm run check:generated` gates the determinism and the untracked-ness;
`packages/content/test/unit/design-dashboard-payload.test.ts` asserts that the payload is one the
page can draw — the grid resolves, every metric row states what would disprove it, all four
baselines carry their seal and revision, and each reachability table's rows carry the keys its
columns read.

It counts as a prototype for `ui-index.test.ts` and `ui-theme.test.ts` — both sweep every directory
here — so it is linked from the index and uses `shared/theme.css` like everything else. It is not
counted as one anywhere a *direction* is being counted.

## What these found

`docs/design/interface-findings.md` consolidates it: twenty-three findings, each with what was found,
how, its status (open / defect / resolved / blocked) and **where it lands**. Most are not client
problems — the majority have to be settled in `agent-interface` at 0.5.0 or they become a retrofit at
0.13.0.

Four of them, and one correction to an earlier one, came from wiring the prototypes to a real
session rather than to their own invented data. That is written up in
[`shared/README.md`](shared/README.md), which also maps which prototype can be fed today and which
cannot.

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
| 14 | open portal | `commitments/`, `raid/` | 3 for the decision, 3 for watching it — and see `raid/`: `raid-engagement.md` repeals the total action mask, which `contracts.md` §4.2 still enforces |
| 15 | declare ascension | `ascension/` | 3 — button, ladders, reckoning |

Surfaces that are not actions, and still need directions:

| Surface | Prototypes | Directions |
|---|---|---|
| Why a mage did something | `mage/` | 1 — the panel is one design; the *gaps* it found are the deliverable |
| Where knowledge lives | `knowledge/` | 3 — node, vessel, risk |
| Pacing and interruption | `tempo/` | 3 — speeds, self-slowing, feed-as-clock |
| Playing a raid | `raid/` | 4 — field, muster clock, record cursor, the ledger and cast log |
| The light system | `glow/` | 3 grounds — vellum, aether insets, full dark |

**Known incompleteness.** `mage/` offers one direction rather than three: it was built to find out what
the read path cannot answer, and it found five things, which is a different job from comparing layouts.
Anyone picking a mage-panel design should treat it as one candidate, not as a decision.

**Start at [`index.html`](index.html)** — it lists all eleven with the question each answers, plus
the dashboard. A test
asserts that index links only to prototypes that exist and links to every one of them, in both
directions, because a front door pointing at a missing page is worse than no front door and an
unlinked prototype is invisible.

## Playing one

    npm run play      # a universe that is actually running, on :8300

Opens on [`console/`](console/). This is the one command that makes the game **playable by a
person**: `scripts/play-server.mjs` builds the reference scenario exactly the way the recorder does,
holds one `AgentSession` in memory, and publishes it over HTTP in **the same document shape the
recording has** — so the pages parse it without learning a second format and `no build step` is
still true. Nothing was bundled and no dependency was added; the server is Node's own `http`.

Only `console/` acts on it. It gets a cast panel — pick a verb, pick its parameter, cast — and the
world on the page is the world after the action. Every other page reads the live document exactly as
it read a recording, which is the point of keeping one shape. A page served without a live universe
behind it falls back to the recording and says `Recording` in its source strip; the cast controls are
**not rendered at all** rather than rendered dead.

The honest part is the **control** button next to `cast`. It asks the server to replay the whole run
twice from its seed — once with the action, once with a no-op — settle both thirty ticks, and report
the two snapshot hashes and which observation slots differ. That is the difference between a loop
that is live and a loop that looks live.

## Running them

    npm run ui        # builds both payloads, then serves the repository root on :8200

Then open `http://localhost:8200/ui/ruleset/`. They are static files, so any static server works;
the script exists so nobody has to remember the flags. Serve them rather than opening the files
directly — the recording is fetched, and `file://` will not.

**One command is deliberately enough.** The two payloads these pages read —
`session.json` and `design-dashboard/data.json` — are generated rather than committed
(see below), so a fresh clone has neither. `npm run ui` builds both first, which is
the whole reason it is a script and not an alias for `http-server`. To build one on
its own, without serving:

    npm run ui:record       # ui/session.json
    npm run ui:dashboard    # ui/design-dashboard/data.json

`npm run verify` refreshes both too, as a side effect of `npm run check:generated`. If
you open a page and see a "could not load" box, that is the message telling you which
command to run.

## Where the data comes from

`ui/session.json` is a real `AgentSession` driven over the reference scenario for 400 ticks, written
by `npm run ui:record` and read through [`shared/session.js`](shared/session.js). Every prototype
carries a strip at the top saying which run it is reading, or — for the parts the read path does not
carry — which capability is missing and why.

It is **generated and deliberately not committed**, for the same reason `lattices.html` below is
not: a checked-in copy drifts from the tree silently, and the whole value of a recording is that it
is true right now. It is also 1.1 MB of JSON, which conflicts on every branch that moves a rule and
gets "resolved" by regenerating rather than by reading.

Two checks stand in for the byte-for-byte pin it used to have.
`npm run check:generated` gates the properties that make building it safe — the recorder is
deterministic over two runs, and the file stays out of git — with exit 42 for a finding and exit 1
for the recorder itself being broken, which are not the same answer.
`packages/scenario/test/unit/ui-recording.test.ts` runs the recorder and asserts that what comes out
is something the prototypes can decode: the blocks tile the observation end to end, every frame
carries the full observation and mask, the episode reached its cap, and no cell id is duplicated.

## Light and dark

Every prototype carries a theme control — **light / system / dark** — and the choice is remembered
per browser rather than per prototype. Colour lives in [`shared/theme.css`](shared/theme.css), and a
prototype declares a token of its own only where the shared set has no name for it — `raid/` declares
five (`--host`, `--raider`, `--brass`, and two field-scoped cyans that must not follow the theme,
because the engagement field is a dark plate in both). A prototype that redeclares a token the sheet
already names is drifting, and `ui-theme.test.ts` is what catches it.

The two themes are not two skins. On ink, a charged control **emits** light. On vellum it cannot: a
cyan fill bright enough to read measures 1.01:1 against the latent state, a hue difference with no
luminance at all. So on paper charge **blooms downward** — ink drawn to the control rather than light
coming off it. Both resolve from the same `--ctl-charged-*` and `--glow-charged` tokens, so a
prototype writes one rule and gets the right treatment in either theme.

Measured across all eleven prototypes **and `index.html`** in both themes, on `ui-visual-pass`
(2026-08-14), by computing the ratio for every text node against its nearest opaque background, in
each page's default state *and* after visiting every `aria-pressed` toggle on it: **no measurable
text below its WCAG threshold.** Two things are outside "measurable", both named by the sweep rather
than folded into a pass:

- `console/`'s zero-count and outside-the-ruleset cells set `color: transparent`, deliberately —
  an empty cell and a cell holding zero are drawn as different things.
- Four button labels sit on a `linear-gradient` fill, which no computed-style sweep can measure
  (see below). Those were measured by hand against their declared stops: 5.87, 6.62, 7.30, 7.95,
  8.07, 9.81, 14.41, 15.41.

**The two worst failures were not in any page's default state.**
A sweep that loads each page and measures cannot see a control that is masked on load. `ascension/`'s
declare button paints its live treatment in only two of four world states, and
`ruleset-symmetry/`'s commit button is `[disabled]` and flat-filled until a change is staged. Both
set `color: var(--ctl-charged-fg)` over a saturated `linear-gradient`, and on ink that token is
**the same colour as the top stop of the fill**: the word "Commit" measured **1.00:1** against its
own button, and "Declare ascension" **1.47:1**. Both now take `--ground`, which inverts with the
fill — worst case 5.87:1 across all four stops in both themes.

Neither is visible to a computed-style sweep either: an element filled with a gradient has
`backgroundColor: rgba(0,0,0,0)`, so walking up for an opaque ancestor finds the panel *behind* the
button and reports a ratio against a surface the text is not on. The first widened sweep produced
four confident false failures that way. A checker that cannot see its input has to say so rather
than fold it into "fails".

Getting there fixed six failures that had gone unmeasured, three of them on `index.html`. **The
front door was the page the discipline did not cover**: `ui-theme.test.ts` iterates *directories*,
so a file at the top level is invisible to it, and `index.html` declares its own small palette
rather than loading `theme.css`. Its `--faint` measured **2.70:1 on vellum and 3.91:1 on ink** —
carrying the lede, every section heading, every card path and the footer — and its `--brass` ran
3.79:1 as 11px text on paper. The last was a specificity collision: `console/`'s
`.clockbar button[aria-pressed="true"]` also matched the shared theme control mounted inside that
bar, painting `--god` on `--ctl-charged-bg`, so **the selected theme button measured 1.28:1 and
only on vellum**.

`packages/content/test/unit/ui-theme.test.ts` guards the three ways the token setup breaks
silently. It does not measure contrast — that needs a browser, and this repository has no browser
dependency — so the numbers above are a statement about the ref they were taken on and want
re-measuring when colour moves.

`design-dashboard/` is **not** in the measurement above: it was built after that sweep ran, against
the same tokens and screenshotted in both themes, which is a weaker claim and is stated as one. The
token guards in `ui-theme.test.ts` *do* cover it; the contrast numbers do not.

## What they are allowed to do

- **Load real content.** `ruleset/content.json` is generated from `packages/content/data`, so a
  prototype is never arguing from invented numbers.
- **Read a real session.** Through `shared/session.js`, which decodes and computes nothing. The one
  exception — telling *unaffordable* apart from *impossible*, which §4.2's single mask bit cannot —
  is isolated in a function named after what it does wrong, and every control it touches is marked.
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
