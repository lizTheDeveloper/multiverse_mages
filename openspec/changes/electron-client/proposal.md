## Why

By 0.9.0 the game runs, is measurable, has verbs, and can fight — but no human has played it. This
change is the first one whose deliverable is *comprehension*: a person has to be able to look at a
universe they do not command and understand what it is doing and what they could do about it.

It ships after the RL bridge on purpose (vision §11). Machines find the machine meta first, so that
human playtesters become the second balance signal rather than the default one.

The presentation target is **stylized-but-simple**: real layout, real typography, real information
hierarchy, and no art pipeline. Animated RTS presentation, art, and audio are out of scope for v1
(vision §12). The renderer reads state snapshots and computes no rules — that is a module-boundary
requirement (contracts §5: `client-electron` depends on `agent-api` on the read path only), not a
stylistic preference, because a client that computes rules will disagree with the authoritative
server and the disagreement will surface as a desync in 0.10.0.

**This proposal is deliberately held at proposal depth** (vision §11). The interface problems below
are genuinely unsolved, and the honest ones cannot be solved on paper.

## What Changes

- Add `packages/client-electron`: a main process that owns the simulation (or the connection to it)
  and a renderer that owns nothing but presentation, with a strict one-way data flow of snapshot →
  view and view → action.
- Present the ruleset the god actually controls: 5 techniques and 14 forms as independent
  permit/forbid switches, plus the edict budget as single-cell dispensations and interdictions
  (vision §4). The 70-cell grid is shown as the derived consequence of those 19 switches rather
  than as 70 controls.
- Present the grid legibly when only 12 cells are live in v1 (contracts §2.2), without implying the
  other 58 are broken, missing, or coming next week.
- Present knowledge as located, not owned: instances in minds, grimoires, libraries, and memory
  palaces (vision §5), including the redundancy signal that tells a player which nodes exist in
  exactly one place and are therefore one death or one fire away from being lost.
- Present the mage population — individuals with species, age, role, and personality, over a
  bucketed populace of cohorts (contracts §1.2, §1.3) — at a level of detail that stays readable
  as the population grows to whatever `sim-core-foundation` benchmarking says it can hold.
- Make autonomous mage behaviour comprehensible. The player cannot issue orders (vision §7), so the
  client must answer "why did she do that?" from observable state, or the autonomy reads as
  randomness and the core pillar fails in presentation.
- Present raids at raid scale: positioned combatants on the 200 m × 200 m reference battlefield
  (contracts §0), objectives, and portal stability as a visible clock — read-only, with rules
  actions masked out for the duration exactly as the action mask already requires (contracts §4.2).
- Surface the action legality mask as interface state. A control the god cannot currently use is
  disabled with a stated reason, which is the same information the mask already carries.
- Establish the visual system: type scale, spacing, colour roles including a legible treatment of
  permitted / forbidden / dispensed / interdicted, and light and dark treatment. No sprites, no
  animation pipeline, no audio.
- Decide and implement the telemetry position for this release (see open questions) — either
  instrument onboarding, or restate the release claim to match what is actually measured.

## Capabilities

### New Capabilities

- `client-shell`: the Electron application itself — process model, main/renderer boundary, snapshot
  transport into the renderer, action submission and mask handling, window and session lifecycle,
  packaging and distribution under Multiverse Games, and the conformance check that the client
  computes no rules.
- `world-presentation`: what the god sees and how — the ruleset and edict interface, the grid view,
  knowledge location and redundancy, mage and cohort views, the raid view, the visual system, and
  the legibility rules that keep them all readable at scale.

### Modified Capabilities

None. The client is a read-path consumer of `agent-api`; it presents the observation and submits
actions from the existing space. If presentation proves the observation is missing something a
human needs, that is a change to `core-contracts`, not a delta filed here — and it is a likely
outcome, since the observation vector was designed for a policy network, not for a person.

## Impact

- **New:** `packages/client-electron/`, its renderer application, a visual system, packaging and
  code-signing configuration, and a snapshot-parity test asserting displayed state matches the
  authoritative snapshot hash.
- **Depends on:** `agent-interface` (0.5.0) for the read path; `god-agency` (0.6.0) for the verbs
  the interface exposes; `raid-engagement` (0.7.0) for the raid view; `core-contracts` (0.2.0) for
  the snapshot and the mask.
- **Downstream:** nothing depends on `client-electron` (contracts §5, rule 2), and nothing may.
- **Cohorts:** from this release, playtest waves become the release boundary (release plan,
  Cohorts). That machinery — knowing which wave played which version — is part of shipping this,
  not a separate concern.
- **Licensing:** every renderer dependency must be AGPL-compatible (`CLAUDE.md`), which rules out
  several common commercial UI and charting components. Assets, including fonts and any authored
  text shown in the interface, are licensed separately from code and must be declared explicitly.
- **Risk accepted:** this is the first release with humans in the loop and the first whose headline
  claim is not automatically verifiable. That is called out below rather than smoothed over.

## Open Questions Blocking Specification

**The onboarding claim cannot currently be verified, and the release plan says so.** The 0.9.0
claim — "a new player reaches their first granted founding knowledge without external instruction"
— is flagged **NOT collected**: there is no telemetry. There are exactly two honest resolutions and
this change must pick one before it can be specified. Either instrument the client (the
`wire-telemetry` skill is named in the release plan for this) and define precisely what is
recorded, what consent it requires, what leaves the player's machine, and what the pass threshold
is; or restate the claim as resting on a stated number of observed sessions with a named
observation protocol. Note also that the flagged claim is not falsifiable as written — "without
external instruction" has no measurable definition and no time bound. If telemetry is chosen, it
also collides with the public-repository rule in `CLAUDE.md`: no endpoint, key, or project
identifier may be committed.

**What does the client run against at 0.9.0?** The second 0.9.0 claim is that displayed state
always matches *a server snapshot hash* — but `pvp-server` does not exist until 0.10.0. Does the
client at 0.9.0 run a local simulation in the main process and compare the renderer's view against
that process's snapshot hash, and is the transport between main and renderer therefore the same
transport the server will later use? Designing them as one path makes the 0.10.0 claim nearly free;
discovering at 0.10.0 that they are different paths is a rewrite.

**How is a 19-switch ruleset presented as one decision rather than nineteen?** Permitting *Perdo*
arms unmaking across all fourteen forms at once, for defenders and invaders alike (vision §4, §3).
The consequence of a single toggle is a row or a column of cells, and the interesting part is what
it hands to an attacker. Does the grid preview the delta before commit, and what does it show about
the *opponent's* likely gain when the opponent is unknown? This is the central interface problem of
the game and there is no good prior art, because the symmetry is what makes the decision hard.

**How are 12 live cells shown inside a 70-cell schema?** Contracts §2.2 fixes 70 cells with 12
flagged `v1`. Showing all 70 with 58 greyed out communicates the structure of the design and
mostly communicates absence. Showing only 12 hides the shape that makes the technique/form model
comprehensible. Which is right is a playtest question, not a design-document question, and the
answer may differ between the ruleset interface and the knowledge browser.

**How is autonomy made legible without inventing rules in the renderer?** Mages act on
utility-scored goals shaped by species, age, personality, and role, tie-broken from RNG stream 7
(contracts §6). The obvious presentation — "she is researching X because her curiosity is high and
her university's library is deep" — is a rules computation, and the renderer may not do it. So
either the scores that drove the decision are part of the observation the core emits (a change to
contracts §4, and a large one, since the observation is fixed-shape), or the client shows only what
mages *did* and the player infers motive. The second is much cheaper and may be much worse. This
needs `rules-world`'s utility functions to exist before it can be answered.

**What is the right level of detail for a mage population, and is it bounded?** Vision §13 leaves
"how many mages does a mature universe hold" to `sim-core-foundation` benchmarking. A list view is
fine for 50 and useless for 5,000. Until the number exists, no list, table, or roster design can be
specified — and the answer determines whether the primary view is a roster, an aggregate with
drill-down, or a notification feed of consequential events.

**Which events deserve to interrupt?** Knowledge loss is the emotional core of the design (vision
§5) and it happens silently in the simulation: an old mage dies holding the last instance of a
node. A client that does not surface this loudly removes the game's central feeling; a client that
surfaces every death is noise. The redundancy data needed is already tracked as `libraryDependence`
(contracts §7), so the data exists — the question is the interruption policy and whether it is
computed in the core (allowed) or the renderer (not allowed).

**What wall-clock pacing does a world tick get?** Contracts §0 says real-time pacing is a
client/server concern and never appears in the core, and vision §13 leaves the value to balance
tuning. The client therefore owns a number nobody has chosen, and it interacts with pause, speed
controls, and whether the god can act while time is running. Speed controls also change what
"a new player reaches their first founding knowledge" means as a measurement.

**Do the classical labels appear in the interface, and how are they kept from becoming mechanical?**
Contracts §2.2 marks `classicalLabels` display-only. Players will say *necromancer* and mean
`rego-corpus` (vision §4). Using the labels as navigation aids is intended; letting them become a
grouping the player believes is mechanical would install a second, competing model of magic in the
player's head. Where the line sits is a playtest finding.

**How is a raid watched by someone who cannot intervene?** The god issues no orders during a raid,
rules changes are frozen (vision §3), and the raid runs on a 100 ms engagement tick. What is the
player actually *doing* for the duration, and does the client offer speed control or observation
focus without implying agency it does not have? Answering this needs `raid-engagement` shipped and
a real raid-length distribution (contracts §7) in hand.
