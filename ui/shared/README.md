# `ui/shared/` — the seam between the prototypes and a running game

Three files. `theme.css` and `theme.js` are the light/dark layer. `session.js` is the one place
that turns what `agent-api` emits into what a view wants.

Before this existed, all eleven prototypes invented their own data. That was right while the
questions were about layout, and wrong once the question became **can a client be fed** — a page
arguing from invented numbers cannot discover that the read path is missing something. Wiring them
found five things the read path does not carry and one contradiction inside `agent-api` itself,
which is a better return than the wiring cost.

## How it hangs together

    packages/scenario ──▶ AgentSession ──▶ scripts/record-session.mjs ──▶ ui/session.json
                                                                              │
                                     ui/shared/session.js ◀───────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
        fed prototypes                  partly fed                    drawn, not fed
     glow · ruleset · targets      edicts · knowledge · …         mage · raid · tempo · …

`openSession()` takes a source and returns one view model. Today the only source is a recording;
`{ live: … }` throws with the reason. **The frame shape is what a live transport would carry**, so a
view reads the same model either way and never learns which it got — that is the point of the seam,
and it is why the recording is not a fixture-shaped shortcut.

    import { openSession, mountSourceNote } from '../shared/session.js';

    const session = await openSession({ recording: '../session.json' }).catch(() => null);
    mountSourceNote(document.getElementById('srchost'), session, ['actionMask', 'maskReason']);

    const f = session.frame(200);
    f.resources();       // { favor: 40, worship: 1.6, worshipTier: 2, materials: 2684, … }
    f.ruleset();         // 5 technique flags, 14 form flags, 8 edict slots, tradition id
    f.knowledge();       // all 70 cells: nodes known, deepest tier, instance redundancy
    f.mageBuckets();     // 6 species x 8 tiers of counts — see below
    f.actions();         // the §4.2 mask, named
    f.candidateLists();  // §4.4's slots, as the integers they actually are

### The recording is a golden

`ui/session.json` is committed so a fresh clone can open the prototypes, and it gets the same
discipline as the replay fixtures: **regenerate only by explicit command**, and a diff is a claim
that behaviour changed on purpose.

    npm run ui:record        # 400 ticks, seed 20260813

`packages/scenario/test/unit/ui-recording.test.ts` re-runs the script and compares, so a stale
recording is a red test rather than a prototype quietly showing last month's universe. It checks the
layout digest *and* the frames, because the digest is blind to behaviour — a balance change moves
every number in the file without touching it.

### Every page says where its data came from

`mountSourceNote(host, session, needs)` puts one strip at the top of a prototype. A fed page names
the run it is reading. A page that cannot be fed names the missing capability and its reason, taken
from `capabilities()` rather than from prose that goes stale. That is what makes *wired* a property
of all eleven rather than of the three that were easy.

## What each prototype can be fed

| Prototype | Fed from the read path | Still invented, and why |
|---|---|---|
| [`glow/`](../glow/) | favor, the whole action mask, live cells with their form hues, a tick scrubber over 400 ticks | **latent vs denied** — see finding A below. The five-state legend stays static because a legend must show every state whether or not the world is in one. |
| [`ruleset/`](../ruleset/) | the nineteen switches and eight edict slots, as the seeded starting position | legality itself, which this page recomputes client-side — its standing, already-recorded cost |
| [`targets/`](../targets/) | the real §4.4 candidate lists, as a **control panel** beside the three directions | the cast. Directions A/B/C need names, ages, mastery and sole-copy flags; the read path has two integers per slot. That gap *is* the panel. |
| [`edicts/`](../edicts/) | the eight edict slots and the axes they must be consistent with | nothing structural — but the reference run issues **zero** edicts, so the fed state is eight empty slots |
| [`knowledge/`](../knowledge/) | per-cell nodes known, deepest tier, instance redundancy | which *vessel* holds an instance — mind, palace, grimoire, library — which the read path aggregates away, and the loss events the page is organised around |
| [`commitments/`](../commitments/) | the mask for the four commitment verbs | out-of-reach vs merely expensive, which is finding A again and is the whole question this page asks |
| [`ascension/`](../ascension/) | action 15's mask bit | the moment it lapses. A frame is a state; nothing says *it just became unavailable*. |
| [`ruleset-symmetry/`](../ruleset-symmetry/) | this universe's ruleset | the other universe. §1.1 puts one universe in one instance, so a raider's ruleset is not readable — only its id, as a portal target. |
| [`mage/`](../mage/) | nothing | **individual mages do not exist on the read path.** §4.1's mage block is 6 species x 8 tiers of counts. |
| [`raid/`](../raid/) | nothing — and see finding F, because the reason is not the one this table used to give | the 64-slot engagement block, which is zero in all 25,664 readings even though the run does raid |
| [`tempo/`](../tempo/) | nothing | pacing is about *events*, and a frame is a state |

## What wiring found

Six things. Five came from wiring the prototypes to a real session; the sixth came from opening
one of them and measuring what it drew.

**A. The legality mask is one bit and the interface needs three states.** `mask.ts` masks an action
*"whose cost exceeds the current favor pool"* using the same zero it uses for an action that is
structurally impossible. Those are opposite instructions to a player — *wait* versus *change
something* — and nothing on the read path separates them. Measured in the reference run at tick 0:
**fifteen of the sixteen actions are dark**, fourteen of them only because favor is 0 and the
fifteenth, `declareAscension`, because it costs nothing and the world is simply not ready. By tick
20 the fourteen have lit, `revokeEdict` has gone dark for a different reason — it is affordable and
there are no edicts to revoke — and `changeTradition` is still dark at 64 favor against a cap of 40,
which makes it *permanently* unaffordable at worship tier 2. Three unrelated situations, one bit.

The only way to tell them apart from outside is to price the action, and pricing is a rule §5 says
the client may not hold. So `session.js` isolates it in one function named
`reconstructedCharge`, every control it touches is marked **†** on the page, and the fix is a reason
channel on the mask rather than a cleverer client — and `sound-design.md` §7 has been waiting on that
same bit since before this was found: *"'not allowed' and 'not yet affordable' are different problems
with different fixes."*

**B. `session.observe()` drops the integers.** `AgentView` carries `raw: Int32Array` — its own
comment calls it *"the reproducible artefact"* — and the session returns only the normalized
floats. A client therefore reads `0.3125` where the world holds `40.0` favor. Every channel in the
current layout is `ratio` or `flag`, so the recorder reconstructs the integers exactly and
`normalization-inversion.test.ts` pins that it can. **That test is a tripwire, not a solution**:
`NORMALIZATION_RULES` also declares `log-bucket` and `bounded`, and one channel adopting either
makes the reconstruction silently lossy in a renderer. The fix at that point is to expose `raw`.

**C. Candidate lists are shorter than their declared `k`, and the length moves.** `CANDIDATE_SLOTS`
pins 32 for `blessMage`; the reference run returns 6 at tick 0 and 16–20 thereafter. Six of the
seven parameterized actions never fill their list. `candidates.ts` states both rules seven lines
apart — its header says the length *"never [comes] from how many candidates were found"*, and
`truncate` says *"never pads — an absent slot is illegal"*. The measured behaviour is the second.
Nothing in the mask says how many slots are real, because the mask is one bit per **action**, so a
consumer finds the end of the list by submitting into it and taking an `empty-slot` rejection: a
wasted action for a policy network, and a menu that changes length under the cursor for a person.

**D. There are no individual mages, and no explain channel.** Two gaps that were already filed
against `ui/mage/` and are now enforced rather than described — `capabilities()` reports both false,
so the page says so itself. `ExplainProjection` is an exported type with no `explain()` on the
session.

**E. A frame is a state, so nothing carries events.** Diffing two frames cannot tell a last-instance
loss from an ordinary one, and that distinction is what `sound-design.md` §6.5 is built on. The
reference run makes this concrete: **the Human species is alive at tick 273 and extinct at tick
274**, and no consumer of this read path can be told so — only a view that happened to diff the mage
block across those two frames could infer it, and only if it were already watching.

**F. A raid happens, and the read path shows no trace of it.** This one corrects an earlier entry
in this file, which said `raid/` had nothing to draw because *"the reference run never enters
engagement mode"*. That is true of the observation and false of the run. Measured on
`ui-visual-pass` (2026-08-14):

- `scripts/record-session.mjs` builds the scenario with **`{ raids: true }`**, and the run that
  produced `ui/session.json` returns **one `RaidRecord`, at world tick 226**.
- The observation's engagement block — `{ name: 'engagement', offset: 336, size: 64 }`, present in
  the layout and in every frame — is **zero in all 25,664 readings across 401 frames**, and the
  clock's engagement-mode flag is set in **none** of them.

So the block is not empty *in this run*; it is **unobservable** — and structurally, not by
sampling luck. `AgentSession` alternates `observe()` and `submit()`, and `submit()` runs a whole
world step synchronously, so **no consumer of the session can sample while the clock is in
engagement mode**, whatever the seed or tick count. The recorder makes that concrete: its loop is
`record(); for (…) { session.submit(noop); record(); }` — observation strictly between steps, and a
raid opens, resolves and closes inside one of them. This is the observation-side
corollary of the already-recorded finding that the mask's engagement branch is evaluated zero
times: the same single-step resolution that stops the agent being asked also stops the world being
looked at.

Two consequences with different owners:

- **The 64 channels are dead weight until something samples mid-engagement**, which is a decision
  for `agent-interface` — either sample during engagement, or say that engagement is not observable
  and reclaim the block.
- **`RaidRecord.actionEconomy`, added in #145, is not on the read path at all.** It lives on
  `scenario`'s run record and is consumed by `mc-harness` telemetry; `agent-api`'s observation
  layout has its own `ENGAGEMENT_SIDE_CHANNELS` and objective slots and does not carry it. So the
  one thing a raid surface gained this week is the one thing a client reading a session still
  cannot render. Confirmed present on the record — `actionEconomy` is a key on the tick-226
  raid — and absent from `layout.ts`.

All six land in `agent-interface` rather than in a client. `docs/design/interface-findings.md` is
where they are tracked with their status.

## Rules for anything added here

- **Decode, never compute.** `permits()`, pricing and salience each have exactly one home. A second
  one in a renderer is the desync `contracts.md` §5 exists to prevent. The single exception is
  named after what it does wrong.
- **Absence is reported, not filled in.** If the read path lacks something, `capabilities()` says
  false and `WHY_ABSENT` says why in one sentence a reader can go and check. Inventing a plausible
  value is how a gap survives to 0.13.0.
- **No build step.** These are static files served by `npm run ui`. That is why the seam is a
  recording rather than an import of compiled TypeScript.
