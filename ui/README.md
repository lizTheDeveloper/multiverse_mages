# `ui/` — interface prototypes

Static, self-contained prototypes of the game's screens. **Nothing here ships**, nothing here is
imported by a package, and nothing here is in a test glob or a `tsconfig`. They exist to answer
questions that can only be settled by operating something — the way the beat-grid prototype settled
whether knowledge loss lands off the beat before 520 assets were generated against that assumption.

| Prototype | Answers |
|---|---|
| [`ruleset/`](ruleset/) | Does vision §4's grid read as nineteen switches with combinatorial consequences, or as seventy independent toggles? |
| [`mage/`](mage/) | Can a player be told *why* an autonomous mage chose what she chose, from state the core already has — and what does the read path still lack? |
| [`glow/`](glow/) | Cyan is the god's own light and the form hues stay the world's. Does that rule survive a vellum ground, or does light force the client dark? |
| [`targets/`](targets/) | Six actions carry an entity handle. How does a person pick one mage out of thousands, and does §4.4's top-*k* candidate list serve a human as well as a policy network? |
| [`tempo/`](tempo/) | What wall-clock pacing does a world tick get, and which events are allowed to interrupt? One question, because speed decides what an event is. |
| [`raid/`](raid/) | The masking was the bug — `raid-engagement.md` §1 repeals it. Given verbs whose agency decays across three phases, can a player watch seven effect primitives resolve *and* still tell what the engine decided from what the page invented? And — §11, which supersedes the priced-pause answer this row used to ask about — can *rewind to view, never to act* be made unambiguous, so that a directive issued while looking back visibly lands on the tick the engagement has actually reached? |

## Running them

    npm run ui        # serves the repository root on :8200

Then open `http://localhost:8200/ui/ruleset/`. They are static files, so any static server works;
the script exists so nobody has to remember the flags.

## What they are allowed to do

- **Load real content.** `ruleset/content.json` is generated from `packages/content/data`, so a
  prototype is never arguing from invented numbers. `raid/` bakes its extract *inline* instead, so
  that it opens from `file://` with nothing to fetch; the regeneration command and the content
  commit are both in its source header, because inlined data drifts silently otherwise.
- **Synthesise audio live.** Per `docs/design/sound-design.md` §0.8's synthesised tier, so a
  prototype runs from a static file with nothing to fetch.

## What they are not

**They are not live against the simulation.** `raid/` is the sharpest case: it animates a
synthetic trace generated in the page, because `packages/rules-raid` is imported by no package and
there is nothing to be live against. `raid-engagement.md` §5 is why that is stated on the page
itself rather than only here — *"a raid view that animates plausible-looking magic unconnected to
what the engine decided is worse than no raid view, because it will be believed."*

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
