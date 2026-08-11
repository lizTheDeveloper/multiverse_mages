# Multiverse Mages — Sound Design

*Status: design ahead of implementation, drafted 2026-08-10.*

**Read this alongside `vision.md`, which remains the vision of record.** Vision §12 lists audio as
deliberately out of scope for v1, and the renderer that would play any of this (`electron-client`,
0.13.0) is held at proposal depth. Nothing here is scheduled, and this document is deliberately
*not* an OpenSpec change — filing one would put a capability in `openspec list` that the vision
says we are not building, and the roadmap table's whole value is that it does not lie.

What this is: the sound bible `electron-client` consumes when it is written, plus generation-ready
prompts so the asset library can be produced as a batch job. It is written now because the sound
design has a real dependency on decisions being made *today* — §10 lists what the client's read
path must expose, and one of those findings has consequences for the explain channel that are
easier to honour in `agent-interface` than to retrofit afterwards.

If audio is ever pulled into scope formally, that is an edit to vision §12, and it is the repo
owner's edit to make. This document works either way.

---

## 0. Constraints

These are not preferences. Each one comes from something already fixed, and violating any of them
breaks something that will not be noticed for months.

### 0.1 Audio is a projection of state, and computes no rules

Contracts §5: `client-electron` reads snapshots and computes no rules. Audio is downstream of the
simulation in exactly the same way the renderer is. No sound may be the *reason* anything happens,
and no rules computation may depend on whether audio is enabled, muted, or dropped.

The practical form of this rule: **the audio system is a pure function of (snapshot, previous
snapshot, explain-channel emission)**. It never asks the core a question. If the audio system wants
to know something, that something must be in the snapshot, and §10 is the list of what that means.

### 0.2 Audio randomness must never touch a simulation RNG stream

Contracts §6 makes the stream registry append-only, and states plainly that reusing or renumbering
an ID invalidates every committed balance baseline. There must be no stream 12 for audio. Ever.
The temptation is real — bark selection wants a random draw, and there is a perfectly good seeded
PRNG sitting right there — and taking it would silently rot every balance baseline in the project
the first time somebody added a sound.

**Instead, derive audio variation from state by hash.** Bark selection, click round-robin index,
and every other "random" audio choice is computed as

```
audioChoice = hash(rootSeed, tick, entityId, audioEventKind, repeatCount) mod n
```

This costs nothing, consumes no draws, and buys a property worth having on its own: **replays
sound identical to the run they recorded.** Two playbacks of the same golden fixture produce the
same barks in the same order. That makes recorded video reproducible and makes "it sounded wrong
here" a bug report someone can act on. A wall-clock-seeded `Math.random` in the renderer would have
been defensible under §0.1 and would have thrown this away for nothing.

**Implemented and pinned.** `audioSelect()` in `packages/content/src/audio.ts`, with committed
vectors at `packages/content/test/fixtures/audio-select-vectors.json`. The vectors exist because the
client is a different package written later, and a function that is only described gets
reimplemented subtly differently. Regenerating them is a claim that audio selection changed on
purpose, and reviewers should read it as one.

### 0.3 Audio must not become a second source of truth

Anything the player can learn by listening must also be visible. This is an accessibility floor —
deaf and hard-of-hearing players must not be playing a different, worse game — but it is also a
design constraint, because §6 of this document deliberately loads knowledge loss with more
information than any other event. If loss is only audible, loss is invisible to a large fraction of
players, and it is the emotional core of the design.

Rule: **every sonified state change has a visual equivalent in the same frame.** Where this
document says "you hear X," read it as "X is also shown, and the sound is what makes you *feel* it."

### 0.4 Population scale forbids per-entity sound

The 0.1.0 benchmark (vision §13) sustains 10,000 entities at ~712 world ticks/sec. A universe at
that scale generates far more events per tick than can be played as discrete sounds — and at 4×
speed a tick is a fraction of a second.

**The density rule:** each event class has a threshold *N*. Below it, events play as discrete
sounds. At or above it, the class switches to a continuous density texture whose intensity tracks
the rate. A scriptorium of four scribes is four pens; a scriptorium of four hundred is *weather*.

Thresholds are per-class and are tuning values, not contracts. Starting points in §6. The rule
itself is structural: **no event class may be discrete without a stated threshold**, because the
one that lacks it is the one that turns a mature universe into noise.

### 0.5 Licensing

`CLAUDE.md`: assets are licensed separately from code, and the AGPL is not assumed to cover
non-software assets cleanly. **Resolved 2026-08-10; the position is recorded in `ASSET-LICENSE.md`
at the repository root.**

- **Written material — the voice lines in §8, the prompts in §9, and this document — is CC BY-SA
  4.0**, copyright Ann Kelner. Human-authored, unambiguously ours to license, share-alike as the
  counterpart to the AGPL.
- **Generated audio carries no asserted rights.** Whether machine-generated audio is copyrightable
  is unsettled and quite possibly no. Copyleft needs ownership to attach to, so claiming CC BY-SA
  over the output would be an empty claim rather than a protective one. Asserting nothing is the
  honest version, and it puts the library beyond enclosure by anyone else too.
- **This unblocks generation.** §9 can be run as a batch job.

### 0.6 Content sourcing

Vision §4a: content draws on historical, literary, and folkloric material and deliberately avoids
living practiced religions. This binds §8 as much as it binds the traditions. Chant-like and
liturgical *textures* are fine and appropriate; recognisable liturgy from a living tradition is
not, and neither is a species voice that reads as an accent belonging to a real people.

### 0.7 This is a public repository

The voice lines are readable by anyone, forever, including by people who might build the same game.
Write them knowing that. It is also worth saying that jokes age worse than mechanics: a line that
depends on a 2026 reference will read as a fossil in 2031, and the lines below are deliberately
built out of the game's own material — tenure, citation, mortality, retention stats — rather than
out of anything external.

---

## 1. The palette: what "futuristic fantasy" resolves to

The brief was "futuristic feeling, but this is a fantasy game." That reads as a contradiction and
isn't, once you locate what is actually futuristic about this world.

Nothing in Multiverse Mages is technological. But the *game* is about knowledge as a physical,
engineered, catalogued, transmissible substance — a civilization that treats magic as
infrastructure and runs universities to produce it. That is a fundamentally modern posture toward
knowledge, wearing pre-industrial clothes.

So:

> **The futurism is in the articulation. The fantasy is in the material.**

Concretely: transients are razor-precise, timing is quantized to the sample, spectral detail is
high-resolution, and everything is tuned. But every *source* is pre-industrial — stone, ink,
vellum, glass, brass, wood, water, breath, bone, bell, fired clay, wet clay, rope under tension.

The production technique that does this is granular resynthesis of foley, not synthesis from
oscillators. A click should sound like a fingernail on glazed ceramic, recorded at 96k, gated to
4ms, and pitched to the root. Not like a UI blip. The moment a sound reads as *synthesizer*, the
fantasy leaves the room; the moment it reads as *unprocessed field recording*, the precision
leaves.

**Antipatterns, stated so they don't creep in:** no sci-fi whooshes, no reverse-cymbal risers, no
sub-drops borrowed from trailer music, no orchestral stingers, no "mystical choir" pad. Every one
of those is a genre signal from a different genre.

### 1.1 The universe has a key, derived from its seed

Each universe is tuned to a root and a mode, computed as a pure function of `rootSeed` — no RNG
draw, per §0.2:

```
root = SEMITONES[hash(rootSeed, 'audio:root') mod 12]
mode = MODES[hash(rootSeed, 'audio:mode') mod 4]     // dorian, aeolian, phrygian, lydian
```

Four modes, all of them modal rather than common-practice major/minor, because the goal is "old
and strange" rather than "heroic." Lydian is the bright one and should be rare enough to feel like
a good omen; consider weighting it to one universe in eight.

This buys three things for free. Universes are sonically distinct without authoring anything.
Prestige runs (§8a of the vision) can *change key* on ascension, so a new universe audibly is a new
universe. And in multiplayer, a raid puts two keys in contact — see §3.4.

### 1.2 Tuning is a health readout

UI elements are equal-tempered and locked, so nothing ever clashes with anything. The ambient
beds are not.

**As a universe stagnates, the bed detunes.** Tie cents-of-drift to the balance metric that
measures knowledge half-life: a civilization that is losing knowledge faster than it produces it
goes progressively, subtly flat. Nobody will consciously notice at 5 cents. Everybody will feel
wrong at 20.

Cap the drift, and make it recoverable — this is a warning, not a death spiral, and vision §8a is
explicit that stagnation is an *ending*, not a losing condition. It should sound like an ending:
not violent, just increasingly out of tune with itself.

### 1.3 Frequency budget

Assigned bands, so that a mature universe with every layer active does not turn to mud. This is the
mix contract; a new sound that wants space must be argued into a band, not sprinkled across all of
them.

| Band | Owner |
|---|---|
| 20–60 Hz | Favor and worship. The pulse. Nothing else lives here. |
| 60–200 Hz | Populace and materials. The civilization's body. |
| 200–800 Hz | Universities, ambient bed, harmonic content of the arrangement. |
| 800 Hz – 3 kHz | UI clicks and voice. The player's own layer, always intelligible. |
| 3–8 kHz | Knowledge events — research, teaching, scribing. The sparkle layer. |
| 8 kHz+ | Air, magical shimmer, *Intellego*. |

Voice and clicks share 800 Hz–3 kHz and must not fight: clicks are ≤80 ms and barks duck the click
bus by 3 dB for their duration. The player's own action always wins over a bark.

### 1.4 Loudness and mix bus

- Integrated programme target **−16 LUFS**; true peak ceiling **−1.5 dBTP**.
- Ambient beds sit at −24 LUFS short-term, leaving 8 dB of headroom for events.
- Bus structure: `master → [ui, world-arrangement, events, voice, raid]`, with `ui` post-fader
  exempt from the raid-time duck (§3.3) — the player's clicks are never buried by their own war.
- A hard-of-hearing mix preset (compressed dynamic range, +6 dB on the 800 Hz–3 kHz band, density
  textures raised relative to discrete events) belongs in the client's accessibility options and is
  called out here so §0.3 has a concrete implementation and not just a principle.

---

## 2. The click language

Clicks carry more of the game's feel than any other asset class, because they are the only sounds
the player causes directly. There are six, they are a closed set, and adding a seventh should
require an argument.

| Click | Duration | Character | Fires on |
|---|---|---|---|
| **Tick** | 3–5 ms | Barely present. Dry, no tail, −30 dBFS. Fingernail on ceramic. | Hover, scrub, list traversal |
| **Latch** | 12 ms + sustain | Click plus a quiet pitched hum that *persists while armed*. | Selecting a target, arming an intervention |
| **Commit** | 40 ms | Click with a low body — a thump underneath the transient. Lands on the downbeat. | An action resolving |
| **Deny** | 8 ms | The attack with the body removed. Dry, closed, no tail, no pitch. | Illegal action (the legality mask) |
| **Detent** | 6 ms | Mechanical, rotary-switch. Pitched a semitone up per step. | Crossing a discrete threshold while dragging |
| **Seal** | 700 ms | Slow, heavy, two-stage: a press and a release. Wax and stamp. | Irreversible acts only |

### 2.1 The latch is the signature sound

**Latch is the most important sound in the game**, and it is the one that makes the beat grid
felt rather than merely present.

You click an intervention. It *latches* — a tight click, and then a soft pitched hum that sits
under everything, holding, on the root of the universe's key. It fires on the next downbeat, and
the hum resolves into the commit. Between those two moments you are holding a decision, and you can
hear that you are holding it.

This is why the beat is load-bearing and not decorative: the gap between latch and commit is where
the player *feels* the tempo. At 1× (72 BPM) that gap is up to 3.3 seconds and reads as ceremony;
at 4× (128 BPM) it is under 2 seconds and reads as urgency. The same interaction, differently
weighted, with no additional assets.

**The latch is cosmetic, and this is what makes it legal.** The action resolves on the tick it
always would have. Legality is unchanged. The observation and action space of contracts §4.2 is
untouched, and a Monte Carlo or RL agent is entirely unaffected because it never sees the visual or
audible latency at all. Nothing about this is skill-timed and nothing about it is in the rules path.

The player can cancel during the latch. Cancelling plays the latch hum's release without the
commit — a small unsatisfying non-event, which is exactly right, because you didn't do anything.

### 2.2 Deny is the legality mask, made audible

Contracts §4.2 requires a legality mask over the whole action space and specifies that illegal
actions are cheap, silent no-ops for agents. For humans they are greyed UI, and greyed UI is
famously easy to click anyway.

Deny is the sound of a click that *does not resolve*: the attack transient with the body stripped
off. It is not a buzzer and it is not a negative-sounding sound; it is an incomplete one. The
player learns the shape of legality by feel within a few minutes, and no one is scolded.

Deny is also the correct sound for insufficient favor, with the addition described in §5.6.

### 2.3 Anti-fatigue rules

- Round-robin of 5 variants per click type, indexed by the §0.2 hash — no two consecutive
  identical waveforms, so rapid clicking never phase-combs.
- Pitch varies **±15 cents maximum**. More than that and repeated clicking sounds sloppy rather
  than alive.
- Repeated clicks within 200 ms descend by 8 cents each, floor at −40 cents, resetting after
  400 ms of silence. Machine-gun clicking gets a subtle downward run instead of a flat wall. This
  is also the mechanism that makes the §8 bark escalation feel *earned* — the audio is already
  acknowledging the repetition before the mage does.
- **Latency budget: ≤20 ms from input event to first sample.** Above roughly 30 ms a click stops
  reading as caused by you and starts reading as a response to you, and every one of these sounds
  is designed on the assumption that it is instantaneous. This is a hard requirement on
  `electron-client` and is repeated in §10 because it constrains the audio backend choice.

### 2.4 Seal is rationed

Seal is reserved for acts that cannot be undone: changing the universe's tradition, and declaring
ascension. Two uses. That is the entire list, and it should stay that way — the sound means
*there is no version of this you can take back*, and the third thing you attach it to is the thing
that makes the first two mean nothing.

---

## 3. The two clocks

Vision §8 gives world time in months and years, and raids on a fast combat clock, with world time
paused for both participating universes and running on for everyone else. This is the largest
structural fact in the design, and it is the audio system's spine.

> **World time is quantized. Raid time is not.**

Not a music change. A change in the soundscape's whole relationship to time.

### 3.1 World time: the universe is an arrangement

One world tick — one month — is **one bar**. Speed controls set tempo:

| Speed | Tempo | A tick lasts |
|---|---|---|
| 1× | 72 BPM | 3.33 s |
| 2× | 96 BPM | 2.50 s |
| 4× | 128 BPM | 1.88 s |

Tempo changes are ramped over two bars, never snapped, so the player can change speed without the
arrangement stuttering.

Subsystems own subdivisions. This is the arrangement, and it means the busy-ness of the music is
literally the busy-ness of the civilization:

| Position | Subsystem | Character |
|---|---|---|
| Downbeat (bar) | Tick boundary — world state advances | Kick. The heartbeat. |
| Beats 1 & 3 | Economy: materials, populace | Low, felt more than heard |
| **Beats 2 & 4** | **Teaching** | **The backbeat** |
| 8th notes | Research | Searching figure (§6.1) |
| 16th notes | Scribing | Dry pen-strokes; the hi-hat |
| **Off-grid** | **Knowledge loss. Portal events. Nothing else.** | **Wrong** |

Teaching is the backbeat deliberately. It is the healthiest process in the game — mind to mind,
fast, cheap, the thing that keeps knowledge alive against mortality — and in almost all popular
music the backbeat is what makes a rhythm feel *good*. A civilization that is teaching well has a
groove. A civilization that has stopped teaching has a kick and no snare, and it sounds like
something is missing, because something is.

### 3.2 Off-grid means wrong

Exactly two things in world time ignore the beat: knowledge loss, and portal events.

Everything else in the universe — every birth, death, discovery, building, expenditure — is
quantized and lands where it belongs. So when something arrives *between* beats, it does not need
a stinger, a sting, or a volume boost to be noticed. It is the only arrhythmic thing in a world
made of rhythm.

This is the mechanism that makes §6.5 work, and it is worth protecting jealously. Every future
sound that wants to feel important will want to be off-grid. The answer is no.

### 3.3 The transition is the best moment available

Opening a portal pauses world time for both universes. The audio for that transition is the single
most distinctive thing in this document.

**Going in** (≈1.8 s):

1. The arrangement **decelerates** — a genuine ritardando, the bar stretching, not a fade.
2. Layers strip away in reverse order of acquisition: scribing first, then research, then economy,
   then teaching. **Worship — the sub-bass — goes last**, and it goes by itself, in silence.
3. A low-pass sweep closes over the tail.
4. Silence. Then the portal drone, in the *host* universe's key.

**Coming out** is where the design earns everything:

The metronome restarts. Layers re-enter, one per bar, in the order they left. And **any layer whose
underlying knowledge was destroyed during the raid does not come back.**

You do not get a casualty report. You get a bar of silence where the scribing used to be. You find
out what you lost by noticing what does not return, and you have three or four bars of dawning
comprehension while the arrangement rebuilds itself around a hole.

That is what vision §5 means when it says losing hurts in a way that losing units never does, and
it is the reason this document treats the two-clock split as the spine rather than the music.

Per §0.3, the casualty report exists and is on screen. The sound is not the information. The sound
is why you will remember it.

### 3.4 Raid time: quantization off

Inside a raid, the grid is gone. No tempo, no subdivisions, no snapping. Combat is reactive and
transient-forward: close-mic'd, dry, short tails, high transient density, the mix ducked hard on
the world buses so the raid bus has the whole frequency range.

What persists is the **key**. The portal drone holds a root, everything pitched is tuned to it, and
that root belongs to the *host* universe — because the host's rules govern (vision §3), and this is
that rule made audible in the most basic way available. A raider in someone else's sky is
listening to someone else's tonic.

If the two universes' keys are a semitone or a tritone apart, the raid is uncomfortable in a way
neither player can quite name. That is a feature. Do not smooth it.

### 3.5 Uninvolved universes keep running

Vision §8: uninvolved universes keep advancing. In a future spectator or multiplayer-lobby context
this means several arrangements at several tempos, and mixing that is a real problem deferred here.
Noted so that whoever builds it knows this document did not solve it.

---

## 4. The grid: 5 techniques × 14 forms

Vision §4 gives 70 cells and calls the grid structure rather than an authoring backlog. The audio
follows exactly the same logic, for exactly the same reason: **a spell sound is assembled, not
authored.**

> **Technique supplies the envelope and gesture. Form supplies the timbre and material.**

5 envelopes + 14 material layers cover all 70 cells. The v1 subset (3×4) uses 3 envelopes and 4
materials and sounds like a genuine subset of the same system rather than an unrelated demo — which
is precisely the failure mode that bespoke per-cell authoring produces.

### 4.1 Techniques are envelopes

| Technique | Envelope | Character |
|---|---|---|
| **Creo** | Reverse-swell into a bloom | The attack is *backwards*. Something arrives that was not there — you hear it approaching its own beginning. The only technique whose energy increases across its duration. |
| **Intellego** | No impact at all; a filter opens | A reveal, not an event. High shelf lifts, reverb *pre*-delay rather than tail. Nothing is struck. Something becomes audible that was always present. |
| **Muto** | Bend mid-flight | Pitch and formant shift across the sound's own duration. It begins as one material and ends as another. The listener hears the change, not the endpoints. |
| **Perdo** | Subtractive | A sound is *removed from the mix*. Brief sidechain duck, downward spectral collapse, and then absence where there was content. Perdo's signature is a hole. |
| **Rego** | Hard-quantized | Snap, lock, gate. Zero attack, gated release, rhythmically rigid even in raid time. The most click-adjacent technique, and the one that shares a language with the player's own interventions — appropriate, since control is what the god does too. |

### 4.2 Forms are materials

| Form | Material | Spectral signature |
|---|---|---|
| **Animal** | Breath, sinew, wet transient | Low-mid body, irregular |
| **Aquam** | Flow, bubble, resonant vessel | Pitched mid, long-ish decay |
| **Auram** | Pressure, movement of air | Wideband noise, no fundamental |
| **Corpus** | Bone, muscle, heartbeat | Sub content, slow |
| **Herbam** | Fibre, splinter, dry crackle | Mid-high, brittle |
| **Ignem** | Crackle over broadband noise | Rising energy, unstable |
| **Imaginem** | *Other sounds* — convolution, doubled and detuned copies | Whatever it imitates, plus a reflection |
| **Mentem** | Pure tone | Sine, inner-ear, **the only form with no reverb at all** |
| **Terram** | Mass, gravel, stone | Low, granular, dense |
| **Vim** | The carrier itself, unfiltered | Raw synthesis — the audio engine showing through |
| **Umbra** | The negative | Everything in the reverb tail, nothing in the dry signal |
| **Fatum** | Pre-echo | **Arrives before it happens.** You hear it an 8th ahead of its own onset. |
| **Limen** | A doorway | Abrupt acoustic-space change mid-sound, no crossfade. Room A becomes room B. |
| **Nomen** | Voice | **The only form using human vocal formants.** Naming is speech. |

Four of these are load-bearing beyond flavour:

- **Mentem has no reverb.** Everything else in the game exists in a space. Mind magic does not, so
  it sounds like it is happening inside the listener's head rather than in the world — which is
  where it is happening. This also makes *Intellego Mentem* and *Perdo Mentem*, the two most
  invasive things in the game, immediately identifiable.
- **Fatum arrives early.** Fate magic pre-echoes, so you hear the effect before the cause. It is
  the only sound in the game that breaks causality, and it is the form for which that is the
  literal mechanic.
- **Umbra is only tail.** Shadow magic has no dry signal — you never hear the thing, only the room's
  response to it. In a raid, in a small space, Umbra is nearly silent; in a cathedral it is
  enormous. Shadow is the one form whose loudness is a property of where you are standing.
- **Nomen is the only voice.** This is what makes True Naming (§4.4) and knowledge theft (§6.4)
  sound like violations rather than transactions.

### 4.3 Composition, with worked examples

| Cell | Result |
|---|---|
| **Creo Ignem** | Backwards attack over rising broadband crackle. Fire assembling itself out of its own future. The evocation sound, and the one most players hear first. |
| **Perdo Mentem** | Subtractive envelope on a pure reverbless tone: a sine in your head that gets a hole taken out of it. Unpleasant, deliberately. Vision §4 uses "none shall unmake a mind" as its example interdiction; it should sound like something worth interdicting. |
| **Rego Limen** | Gated snap plus an abrupt room change. The portal cell: a hard lock, and then you are somewhere else. No travel, no whoosh. |
| **Intellego Mentem** | A filter opening onto a reverbless tone — someone else's thought becoming audible without being struck. The theft cell, and it sounds like eavesdropping because it is. |
| **Muto Corpus** | Bone and heartbeat bending mid-sound into another body. The material changes while you are listening to it. |
| **Creo Nomen** | A voice arriving backwards, assembling into a name. Reserve this one; it should be rare enough to be unsettling. |
| **Perdo Fatum** | A pre-echo of a subtraction — you hear the absence before the thing is gone. Structurally horrible and exactly right. |

### 4.4 Tradition recolours *cast* and *cost*

Vision §4a: a tradition hooks exactly four points, and across a portal, *acquire* and *store* stay
with the mage's home tradition while *cast* and *cost* are host-governed. Audio can only address
cast and cost, since acquire and store are world-time processes with no single moment to sound.

| Tradition | Cast | Cost |
|---|---|---|
| **Vancian memorization** | A page tearing; a slot emptying | **The absence afterward.** Each prepared spell contributes a quiet held partial to the mage's personal tone. Casting removes it. You hear your loadout depleting, and an empty Vancian mage is audibly thin. |
| **True Naming** | The spoken name, pitched into the universe's key | **The caster's own voice thins.** Formants narrow with each use. Naming costs you some of your own. |
| **The Art of Memory** | A spatial move — the sound originates from a fixed position in the stereo field, *the same position for the same node, always* | **The room shrinks.** Reverb decay shortens as the palace is drawn on. |

The Art of Memory's panning is not decoration. Vision §5 makes the memory palace unburnable,
unlootable, un-loanable, and utterly lost when its holder dies. Giving each node a permanent
position in the stereo field means the player builds a spatial map of that mage's knowledge without
ever being told to — and §6.5 describes what happens to that map when she dies.

**And the portal rule becomes audible.** Cast and cost follow the host. So a raider's spells sound
like the host universe: a Vancian raider in an Art of Memory sky tears her own pages, but pays in a
shrinking room. Vision §3 calls the portal rule the single load-bearing mechanic. This is what it
sounds like, and a player who has raided twice will understand the rule without having read it.

---

## 5. God interventions

Contracts §4.2 fixes sixteen actions. They tier by consequence, and the tiers are what keep a
player who founds a university every few ticks from being deafened by ceremony.

### 5.1 The tiers

| Tier | Actions | Treatment |
|---|---|---|
| **0 — no-op** | 0 | **Silence.** RL agents no-op constantly. Never sonify. |
| **1 — clerical** | 10 assign role, 11 fund university, 12 encourage research | Latch + commit. Small, quick, repeatable without fatigue. |
| **2 — consequential** | 9 bless mage, 8 grant founding knowledge, 14 open portal | Ceremonial. Longer latch, commit with a tail. |
| **3 — constitutional** | 1–7: permit/forbid technique or form, dispensation, interdiction, revoke | The ruleset. These change what is *possible*, and must feel like law. |
| **4 — terminal** | 13 change tradition, 15 declare ascension | **Seal.** The only two. |

### 5.2 Tier 3 is the game

Rules-setting is design pillar #1 — the most interesting decision in the game, symmetric and
permanent-feeling. Tier 3 has to carry that.

**Permitting a technique or form re-tunes the world.** The commit is a chord opening in the ambient
bed, and it is durable: that technique's envelope or that form's material now appears in the
ambient texture. Permitting *Ignem* means you occasionally hear fire in your world's background
from that moment on. The bed is a readout of your ruleset, accumulated.

**Forbidding is a notch closing.** A filter clamps and the bed loses that colour, permanently,
until revoked. Not a destructive sound — a narrowing one. Denial plays are a real strategic option
per vision §3, not a penalty, and should not sound like self-harm.

**Permitting carries an unease, because permitting arms your enemies.** Vision §3 is explicit:
permitting something arms your defense *and* arms anyone who invades you and happens to know it.
So the permit chord includes one low partial that resolves neither up nor down — a note that does
not belong to the chord and does not leave it. It is a small dissonance, it decays over about eight
bars, and it is the only place in the design where a *beneficial* action is allowed to sound
slightly wrong. The symmetry of the portal rule is the hardest thing in this game to internalise,
and this is the cheapest place to teach it.

**Dispensations and interdictions are single notes.** One cell. A dispensation adds a note to the
chord; an interdiction removes one. The edict budget is small and grows with worship tier, so these
are rare enough that a single note is proportionate — and rare enough that the player will
remember which note.

### 5.3 Grant founding knowledge is a birth

Action 8 is the only way a body of magic can enter a universe that has never held it. Vision §7
calls it out specifically, and it deserves the second-most emotional sound in the game after loss.

Treatment: the cell's composed sound (§4.3), played once, *complete and unhurried*, followed by that
cell's material entering the ambient bed for the first time. Something that did not exist in this
universe now does, and the world's texture changes to accommodate it.

It should be long enough — three bars — that a player cannot spam it without noticing they are
interrupting something. The favor cost will limit this anyway; the sound reinforces it.

### 5.4 Change tradition should be frightening

Vision §4a: a tradition is an identity decision, possible in world time only, at enormous cost,
throwing the civilization into upheaval.

Seal click. Then **the arrangement re-voices**: every layer rebuilds with the new tradition's cast
and cost colouring, over about six bars, and it does not sound comfortable while it is happening.
Under an Art of Memory tradition every mage's knowledge acquires a stereo position it did not have
before; leaving Art of Memory collapses all of that spatial information to centre at once, and it
sounds like it.

### 5.5 Ascension resolves the run

Action 15, and vision §8a: a summit reached, ending the run gloriously.

The whole run's accumulated arrangement — every layer the civilization built, in the universe's key
— resolves onto one cadence. Then, on prestige, **the key changes**, and the next universe opens on
a different root. That is the only key change in the game, and it is what makes prestige feel like a
new world rather than a new save file.

Stagnation, the other ending, is not a cadence. It is §1.2's detuning reaching its cap and the
arrangement simply thinning out until it stops. Vision §8a says defeat is not the opposite of
ascension, and stagnation is its own ending. One resolves. The other runs down.

### 5.6 Favor is the sub-bass pulse

Favor regenerates at a rate scaling with worship (vision §7), and is the meter under every
intervention. It owns 20–60 Hz, exclusively.

- **Pulse rate tracks regeneration.** Growing your world grows your power, and the pulse quickens
  with it — which means the snowball risk the vision flags is a thing the player can *hear
  happening to them*. A runaway leader is running away audibly.
- **Spending dips the pulse**, proportionally, with recovery over the following bars.
- **Insufficient favor** is deny (§2.2) plus one strained pulse — the sub attempting its cycle and
  not completing it. Distinct from ordinary illegality, because "not allowed" and "not yet
  affordable" are different problems with different fixes.

---

## 6. Knowledge: research, teaching, scribing, theft, and loss

Vision §5: knowledge is physical, it occupies minds and books and buildings, and it can be taught,
copied, stolen, and lost. Design pillar #2. This section is where the sound design does its real
work, and §6.5 is the reason the rest of the document is built the way it is.

### 6.1 Research: an unresolved phrase

Research is a mage deriving a new node from prerequisites. It is slow, and slowness is hard to make
satisfying.

**A research project is a repeating 8th-note motif that does not resolve.** Three notes, ascending,
stopping short of the tonic, looping quietly for as long as the project runs. Multiple concurrent
projects are multiple motifs at different transpositions, which is exactly as busy as a university
full of scholars should sound.

**Discovery is the resolution.** The motif completes — lands on the tonic, on the downbeat, once —
and stops. No fanfare. A phrase that has been hanging for forty world-ticks arriving where it was
always going is worth more than a stinger, and it costs one note.

Density threshold: 8 concurrent motifs. Above that, the motifs blur into a running texture and only
resolutions play discretely. A great university sounds like a hive that periodically produces a
clean answer.

### 6.2 Teaching: two voices in unison

Mind to mind, fast, requiring a living teacher and a student with the prerequisites.

Two-voice, on the backbeat: the teacher's pitch, then the student's pitch an 8th later, arriving in
unison. **Successful teaching is the moment two voices agree.** Failed teaching is the second voice
arriving a semitone off and correcting — which is not a punishment sound, because failed teaching
is normal and the correction is the point.

This is the sound that a healthy universe makes constantly, and putting it on 2 and 4 means a
civilization that teaches has a groove and one that has stopped has a hole where the snare goes.

Density threshold: 12 per tick, then a "chorus" texture whose thickness tracks the teaching rate.

### 6.3 Scribing: the scriptorium is a hi-hat

Mind to grimoire. Slow, requires literate non-magical scribes and materials, and some species are
far better at it.

16th notes, dry, pen-on-vellum, low in the mix, no pitch. This is texture from the very first
scribe — the density threshold is 3, because scribing is the one process that is *supposed* to
disappear into the background. Rate maps to density; species scribing bonuses map to *evenness*.
Dwarven scriptoria are metronomically regular. Gnomish ones stutter.

Grimoire completion is a single dry woodblock hit on the downbeat, and dwarven grimoires — which
resist destruction — get a longer, denser body. You can hear that a book is well-made.

### 6.4 Theft: teaching, violated

The `knowledge-steal` primitive, cell-gated to *Intellego Mentem* and *Rego Nomen*, and far more
dangerous in both directions under a True Naming universe.

**Theft is the teaching sound, wrong in three specific ways:**

1. **The response precedes the call.** The thief's voice arrives *before* the source's — borrowing
   Fatum's pre-echo trick. Something is taken before it is offered.
2. **The source cuts off mid-phrase.** In teaching, both voices complete. In theft, the source
   voice stops partway, un-resolved. Nobody agreed to this.
3. **No reverb on either voice** — it is happening in a mind (§4.2), not in a room.

Under a True Naming tradition, add the Nomen formant: theft sounds like your own name in someone
else's mouth. Vision §4a calls the synergy between True Naming and knowledge-theft vicious. It
should sound vicious.

### 6.5 Loss

This is the most carefully specified sound in the document, because it is the mechanic the whole
design exists to make felt. Vision §5: *this is what makes losing hurt in a way that losing units
never does.*

**Rules for last-instance loss** — the node leaves the universe entirely:

1. **It is off-grid.** Per §3.2, one of only two things in world time that ignores the beat. It
   arrives between beats, and in a world made of rhythm it does not need to be loud to be the loudest
   thing you have heard all session.
2. **It is subtractive, and it has no impact transient.** Nothing is struck. The arrangement layer
   that node contributed to *stops*, at a non-boundary, and does not fade. Perdo's envelope (§4.1)
   generalised into the arrangement itself.
3. **One un-tuned tone**, held exactly one bar, then gone. It is the only pitched sound in the game
   outside the universe's key — §1.1 tunes everything, and this is the exception that the tuning
   exists to make possible. It does not belong here, which is the entire point.
4. **The cell's material leaves the ambient bed** and does not return until rediscovery. The world
   is quieter afterward, permanently, in a specific place in the frequency spectrum.

**Instance loss** — a copy destroyed while others survive — is none of that. It is a quiet, on-grid
subtraction, barely a sound. The difference between these two must be instantly, unmistakably
audible, because it is the difference the entire game is about: knowledge that is merely damaged
versus knowledge that is *gone*.

**Mage death is not loss.** Humans live eighty years and a mature universe buries mages constantly;
if every death were an event the game would be exhausting and the real losses would be camouflaged
by the noise. So:

- **An ordinary mage dies:** a soft, on-grid, respectful mark. One note, in key, on the downbeat.
  Density threshold 4 per tick, then a mortality texture. A plague sounds like weather.
- **A mage dies holding the last instance of a node:** ordinary death mark, and then — off-grid,
  after it — loss. The pause between the two is the sound of finding out.

**Tradition-specific variants:**

- **Art of Memory** is the cruellest, and should be. Per §4.4 each node has a permanent position in
  the stereo field. When the holder dies, *that position goes silent.* There is now a place in the
  soundscape where something used to be, and it stays empty. This is un-lootable, un-burnable
  knowledge, dying exactly the way vision §5 says it dies, and it is the strongest argument in this
  document for spatial audio being worth the trouble.
- **Dwarven grimoires resist destruction**, so a dwarven library burning has a longer subtraction —
  layers coming off over several bars rather than at once. It takes a while to lose a dwarven
  archive, and you can hear it holding.
- **Rediscovery** (§6.6) is how a lost layer returns. Nothing else does.

### 6.6 Rediscovery: the same thing, rebuilt

Re-deriving a lost node, at a cost far above learning it from a teacher. Gnomes are unusually good
at it.

Research's motif (§6.1), resolving **in a different octave.** It is the same knowledge, and it does
not sound quite like the original, because it was rebuilt by someone who never heard the first one.
The cell's material returns to the ambient bed, and the world is whole again in a slightly different
way than it was.

Gnomish rediscovery runs the motif at a manic tempo — the same phrase, impatient. Vision §6 calls
gnomes erratic geniuses, and the difference between "erratic" and "fast" is that a gnomish motif
occasionally drops a note and carries on regardless.

---

## 7. The raid layer

Raid audio keys to the **effect primitives** (vision §4), not to spells. There are about fifteen
primitives and seventy cells, and balance assertions are made over primitives precisely because
that is where the sample counts are truthful. The same logic applies here: primitives are what a
player needs to *recognise* mid-fight, and a sound per primitive is a vocabulary a player can
actually learn.

Composition: **primitive supplies the function, form supplies the material** (§4.2). Direct damage
from *Ignem* and direct damage from *Terram* are the same event with different substance, and the
player learns "I am being damaged" and "it is fire" as two separable facts.

### 7.1 Combat primitives

| Primitive | Sound |
|---|---|
| **direct-damage** | Transient + form material + body. The baseline. |
| **ward** | A *pitched sustained tone*. Incoming damage collides with it: a blocked hit is consonant, a ward under strain goes sour, and a ward breaking is the tone snapping rather than a shatter. A player can hear how much ward they have left without looking. |
| **area-denial** | A spatial bed with an audible boundary. Crossing it reuses Limen's abrupt room-change (§4.2) — you do not fade into a hazard, you *enter* it. |
| **blink/mobility** | The room-change cut with no travel. Two spaces, no transit, no whoosh. |
| **summon** | Creo's backwards envelope, arriving at a new position. Something assembles where nothing was. |

Economy and social primitives — build-rate, teach-rate, lifespan, worship-yield and the rest — are
world-scale and belong in §3's arrangement. They have no raid presence.

### 7.2 The portal timer is the most important information in a raid

Vision §8: a portal stability timer guarantees the raid ends, and the attacker's whole problem is
doing enough before it collapses.

**The portal drone rises a semitone per stability quartile.** Four quartiles, three rises, no
numbers, no UI clock needed to feel it. By the final quartile the drone is a minor third above where
it started and sitting against the host's tonic, and both players know exactly how much time is
left without either of them looking away from the fight.

The rises are the only pitched events in raid time that are not tied to a caster, which is what
makes them read as environmental rather than as someone's spell.

### 7.3 Objectives sound like futures, not objects

Vision §6a: a university's output scales with the depth of its library, so knowledge is an input to
producing more knowledge, and burning a rival's library is an attack on their rate of future
production.

So a library burning does not sound like a building being destroyed. **It sounds like the
arrangement layers it fed being destroyed** — §6.5's subtraction, several layers at once, heard from
inside a raid where there is no arrangement playing. The attacker hears what they are taking away.
The defender hears their own §3.3 re-entry being written in advance.

An archmage killed as an objective is §6.5's death-plus-loss, with as many losses as she held.

### 7.4 The same collapse, two mixes

The raid ends when the portal collapses, and the audio is the same event mixed two ways — attacker
wins by destroying or looting, defender wins by holding.

- **Attacker's win:** the collapse is a *completion*. It resolves downward onto the raider's own
  home tonic, which is the first time in the raid the raider has heard their own key. You are going
  home, and you are taking something.
- **Defender's win:** the collapse is a *release*. The host tonic — which has been present the
  entire raid — is simply left alone, and the drone's tension resolves by ceasing. The sky is yours
  again and it is quiet.

Same asset, different mix, opposite emotions. This is the cheapest large effect in the document.

---

## 8. Species barks

The StarCraft thing: click a unit repeatedly and it gets progressively less professional about it.
The reason it worked is that the escalation is a *relationship* — the unit knows you are doing it,
and the joke is at the intersection of their character and your rudeness.

The comedic premise here is fixed by vision §1: **the mages are academics with swords.** They have
careers, and lifespans, and they die, sometimes taking the only copy of something irreplaceable with
them. So the jokes are academic-labour jokes — tenure, peer review, citation, funding, the person
who has been "promising" for two centuries — played against six wildly different relationships with
time.

### 8.1 Structure

Per playable species:

| Bank | Count | Trigger |
|---|---|---|
| Selection | 4–6 | First click |
| Acknowledgement | 4–6 | Role assigned (researcher / warden / professor / raider) |
| **Annoyance, tiered** | **12–16** | Repeat clicking |
| Breakthrough | 2–3 | Research resolves (§6.1) |
| Blessed | 2 | Action 9 |
| Death | 1–2 | Mortality |

Annoyance tiers, on the repeat counter, resetting after 8 seconds of not being clicked:

- **Clicks 3–5 — polite.** They think you want something.
- **Clicks 6–10 — irritated.** They know you don't.
- **Clicks 11–15 — cracking.** The professional veneer goes.
- **Clicks 16+ — unhinged.** The good stuff. Weight so that later lines are rarer; the deepest
  line in each species should be genuinely hard to reach.

Delivery note that applies to all six: **these are read dry and sincere, not comic.** Every line
below is funnier delivered by someone who means it. The elf is not doing a bit.

### 8.2 Stateful barks, and the last-copy line

Barks are the explain channel (contracts §4.4) made audible — the channel exists precisely because
vision §7 makes mage autonomy a pillar and without a data path the client can show what mages did
but never why, so autonomy reads as randomness. Barks are the cheapest possible fix for that.

Selection lines should vary on real state: age relative to species lifespan, current role, whether
blessed, whether they just lost a teacher, whether their research is close.

And one line does real mechanical work:

> **A mage holding the only instance of a node in the universe has a distinct selection line.**

It is a single point of failure announcing itself, and it turns idle clicking into a legitimate way
to audit your own fragility — you can find the mages whose death would cost you something by
wandering around clicking on people. It is also, once the player understands what it means, quietly
horrifying to hear, which is the correct response to the fact.

**This is `libraryDependence` made audible.** Contracts §7 defines that metric as the fraction of
known nodes with exactly one surviving instance, and it is one of the numbers the balance harness
watches. The bark is the same fact, per-mage, at the moment the player is looking at her. A player
who has never read a metric in their life will develop an instinct for library dependence purely
from how often they hear this line — which is the best possible outcome for a number that otherwise
only exists in a sweep report.

Per species, in character:

| Species | Line |
|---|---|
| Human | "I'm the only one who knows this. That's — you understand that's a problem, yes?" |
| Elf | "It is only in me. I have not decided whether to write it down." |
| Dwarf | "One copy. *One.* I've requested materials four times." |
| Draconic | "When I go, it goes. I have made my peace. You may wish to make other arrangements." |
| Gnome | "I know something nobody else knows! ...That's bad, isn't it. That's bad." |
| Orc | "Only one who knows it. Me. The one you send through portals." |

Per §0.3 this is visible too: it is on the mage's card. The bark is what makes you look.

### 8.3 Human — ~80 years, high curiosity, high fertility, broad aptitude

*Loses knowledge constantly to mortality.* The anxious, overcommitted, genuinely productive one.
Publish or perish, except perish is on the calendar. **Voice: mid-30s, quick, slightly out of
breath, always mid-thought.**

**Selection**
- "Adjunct, actually."
- "I've read about this."
- "Ready. Ish."
- "I have three papers in progress."
- "Make it quick, I'm mortal."

**Acknowledgement**
- "I'll fit it in."
- "Adding it to the pile."
- "Yes. Yes! ...Yes?"
- "This is fine. This is fine."
- "Sure, I'll just do that *as well*."

**Annoyance**
- *(polite)* "Still here."
- "Did you need something else?"
- "I'm on a deadline. It's a hard one. It's death."
- *(irritated)* "I heard you the first four times."
- "You know I can hear the clicking."
- "Some of us have a *lifespan*."
- "That's four minutes of it. Gone."
- *(cracking)* "Eighty years! I get eighty! The elf gets seven hundred!"
- "Do you know what I could do with seven hundred years?"
- "She's been a junior researcher for two centuries and they still call her *promising*."
- "I'm going to die before this conversation ends."
- *(unhinged)* "I HAVE A WIFE. I THINK. IT'S BEEN A BUSY CENTURY."
- "Ah — no. Sorry, that's gone. That's the mortality. That happens now."
- "I could have written something. I could have written something that *outlived* me."
- "Click me again and I swear the only thing I'll be remembered for is this."

**Breakthrough**
- "It works! Write it down, write it down, write it down—"
- "That's mine. That one's *mine*."

**Blessed** — "Oh. Oh, that's — thank you." / "I felt that. Did everyone feel that?"

**Death** — "I didn't— there was more—"

### 8.4 Elf — ~700 years, high depth ceiling, slow to learn

*Deep specialists.* Unbearably unhurried. Condescending without ever intending to be, which is
worse. **Voice: unplaceable age, very slow, never raises volume, leaves gaps.**

**Selection**
- "Mm."
- "I was mid-thought."
- "Continue."
- "It's early yet."
- "You've come at an interesting moment. It has lasted sixty years."

**Acknowledgement**
- "In time."
- "I'll have an answer for you shortly. ...Within the century."
- "As you like."
- "I had assumed you would ask eventually."

**Annoyance**
- *(polite)* "You're rushing me."
- "You're always rushing me."
- "I have not finished my *introduction*."
- *(irritated)* "That is the ninth time."
- "I began this work before your first mage was born."
- "The humans have published four hundred papers on this. All of them wrong. Charmingly."
- *(cracking)* "That is the fourteenth time. I am counting. I have the time."
- "Do you understand that I will remember this? Not the way they remember. *Properly.*"
- "I have watched six generations of them ask me this same question."
- "Every one of them thought they were the first."
- *(unhinged)* "I WILL OUTLIVE THIS. I WILL OUTLIVE YOU FINDING IT FUNNY."
- "In four hundred years I will still be here, and this will still have happened."
- "...You've stopped. Good. Where was I. Yes. Sixty years ago."

**Breakthrough**
- "There. As expected. Eventually."
- "I said it would come. I did not say when. I never say when."

**Blessed** — "Ah. You've noticed me." / "That was unnecessary. Thank you."

**Death** — "Well. That was abrupt."

### 8.5 Dwarf — ~250 years, exceptional retention and scribing

*The archivists. Dwarven grimoires resist destruction.* Bureaucratic, morally serious about
citation, and correct about everything, which is the annoying part. **Voice: dry, precise,
mid-range, the cadence of someone reading a shelf mark aloud.**

**Selection**
- "Catalogued."
- "It's in the index."
- "Cross-referenced."
- "Where's your source?"
- "You'll want the third shelf."

**Acknowledgement**
- "Logged."
- "I'll want that in writing."
- "Filed."
- "Under what heading?"

**Annoyance**
- *(polite)* "You're disturbing the reading room."
- "Did you write it down? You didn't write it down."
- "There is a *form* for this."
- *(irritated)* "Nothing is real until it's in a book."
- "Three copies. Minimum. This is not negotiable."
- "The elf says she remembers it. The elf is not a backup."
- "The gnome discovered it twice because nobody wrote it down the first time."
- *(cracking)* "I have filed a complaint. With myself. It has been upheld."
- "Every single thing this civilization has lost, it lost because someone was in a hurry."
- "I am not the pedant here. I am the only one who isn't."
- *(unhinged)* "I HAVE RE-SHELVED THIS ENTIRE WING FOUR TIMES BECAUSE OF YOU."
- "There were nine hundred volumes in the east vault. There are eight hundred and forty. I know
  which sixty. I know all sixty."
- "Go on. Click. It'll go in the record. Everything goes in the record."

**Breakthrough**
- "Copied. Twice. Before you ask."
- "Now it exists."

**Blessed** — "Noted, with thanks." / "I'll record that it happened."

**Death** — "The grimoires are in the north vault. Third shelf. ...Please."

### 8.6 Draconic — ~1,500 years, highest depth ceiling, barely curious

*Few, ancient, and terrifying. Very low fertility.* Every interaction is an imposition. Never
hurried, never impressed, occasionally — very rarely — sad. **Voice: enormous, slow, quiet. Never
shouts. The threat is that it never needs to.**

**Selection**
- "...Yes."
- "Speak."
- "You woke me."
- "I know it already."

**Acknowledgement**
- "If you insist."
- "It will be done. Not soon."
- "Very well."
- "I have done this before. It was tedious then."

**Annoyance**
- *(polite)* "Again?"
- "Again."
- "...Again."
- *(irritated)* "Ask the small ones."
- "I knew this before your species had a word for 'know'."
- "I have forgotten more than your libraries contain. Deliberately. It was clutter."
- *(cracking)* "You are a very small god."
- "I slept four hundred years. You have improved nothing."
- "I will answer you. Give me a century to consider the phrasing."
- *(unhinged)* "There were seven of us."
- "There are three."
- "You will not click me into a fourth."
- "I remember the one before you. I remember what became of them. I am not threatening you. I am
  the only one left who remembers, and I am telling you."

**Breakthrough**
- "Obviously."
- "It took longer than I expected. That has not happened in some time."

**Blessed** — "I felt that. Do not do it again without asking." / "...Acknowledged."

**Death** — "Finally."

### 8.7 Gnome — ~350 years, highest curiosity, poor retention

*Erratic geniuses, unusually good at rediscovery.* Manic, brilliant, and constantly re-solving their
own solved problems. The rediscovery bonus is a character trait: they are good at it because they
get so much practice. **Voice: fast, bright, frequently interrupts itself, delighted.**

**Selection**
- "OH. Hello!"
- "I was just— what was I— *yes*!"
- "I've had an idea. I've had another one. That's two."
- "Do we know fire? We should know fire."

**Acknowledgement**
- "Ooh, yes."
- "Already started. Started twice, actually."
- "On it! On what?"
- "Say it again in a minute, I'll have forgotten."

**Annoyance**
- *(polite)* "Yes? Yes. Yes?"
- "Someone already did this. It was me. Last week."
- "I've solved it! I've solved it *again*!"
- *(irritated)* "Yes yes yes yes what."
- "I've forgotten the question but I'm confident in the answer."
- "Every time you click, I lose a fact. That's not a joke. That's my retention."
- *(cracking)* "The dwarf says I should write things down. The dwarf is right. I will not."
- "I HAVE DISCOVERED IT FOR THE SIXTH TIME AND IT IS STILL BEAUTIFUL."
- "Do you know what it's like? To find it? Every time is the first time. Every time!"
- *(unhinged)* "I had it. I had it just then. It was — no. It's gone. You did that."
- "That's four. That's four things I knew when you started."
- "It's fine! It's fine. I'll find them again. I always find them again. That's the — that's my
  whole thing, that's what I'm *for*—"

**Breakthrough**
- "AGAIN! I've done it AGAIN!"
- "Oh, that's *lovely*. Did I know that before? Doesn't matter. Look at it."

**Blessed** — "Ooh! Warm." / "Was that you? That was you. Do it again— no, don't, I'll forget why."

**Death** — "Wait— I remember what it was—"

### 8.8 Orc — ~60 years, low magical aptitude, high build-rate, martial

*High fertility, high build-rate.* The one holding the entire civilization up while the mages
theorise. Not stupid — impatient with theory, and completely justified. Shortest-lived species in
the game and the least precious about it. **Voice: warm, blunt, unbothered, slightly amused at
everyone else.**

**Selection**
- "Ready."
- "It's built."
- "Wall's up."
- "You want it fast, or you want it standing?"

**Acknowledgement**
- "Done by evening."
- "Who's it for?"
- "Right."
- "I'll need materials. I always need materials."

**Annoyance**
- *(polite)* "Still holding this beam, by the way."
- "You clicking, or you helping?"
- "The theory's lovely. The roof leaks."
- *(irritated)* "Sixty years, me. I built four universities. What'd the elf build?"
- "The archmage asked me to move her library. Twice. Same library."
- "I don't cast. I *carry*."
- *(cracking)* "Nobody writes down who built the place. Plenty about what's inside it."
- "You know the north vault? That's mine. All of it. Every stone."
- "I've buried more of my own than any of them. We go quick."
- *(unhinged)* "I HAVE PUT UP EVERY BUILDING YOU HAVE EVER LOVED."
- "Not asking for a statue. Wouldn't mind a *chair*."
- "Sixty years is plenty, if you build. It's nothing if you sit and think."

**Breakthrough**
- "Huh. Look at that."
- "Told you it'd hold."

**Blessed** — "Ta." / "Feels good. Back to it."

**Death** — "Roof's finished, though."

### 8.9 Cross-species lines

Barks that reference another species fire only when a mage of that species is on screen or in the
same university. These are cheap, they make the civilization feel like one place rather than six
rosters, and they are where the funniest material lives — the species are funny *at each other*.

Sample set; the full bank should run 3–4 per ordered pair that matters:

- **Human → Elf:** "She's been reading the same page since I was born. I've checked."
- **Human → Draconic:** "We just... work around her. Like weather."
- **Dwarf → Gnome:** "He discovered it. Then he discovered it. Then he discovered it."
- **Dwarf → Elf:** "Her memory is excellent. Her memory is also *one copy*."
- **Gnome → Dwarf:** "He wrote down what I said! Including the wrong bit! It's in the *index* now!"
- **Gnome → Draconic:** "I asked her a question in the spring. I'm very excited about the answer."
- **Elf → Human:** "They burn so brightly. And then they've stopped. It's very rude."
- **Elf → Orc:** "He built this hall in a season. I have not decided what to think about that."
- **Draconic → anyone:** "Which one is that. No. Don't tell me. It won't be relevant long."
- **Orc → Elf:** "Four hundred years and she's still 'settling in'."
- **Orc → Human:** "Now *that* one works. Runs everywhere. Dies tired."
- **Orc → Gnome:** "Best mage we've got. Couldn't tell you where he lives. Neither could he."

### 8.10 Non-magical populace

Vision §6: non-magical individuals exist across all species and matter mechanically — a universe of
pure archmages does not function. Thinner banks, 6–8 lines each, shared across species with light
accent variation. These are the game's ground truth and their lines should be plainer than the
mages'; the joke is that they are the only ones being straightforward.

**Scribe**
- "Copying."
- "My hand hurts."
- "Vellum's expensive. Nobody tells them that."
- "This one's dwarven. It'll outlive us both."
- "She dictates faster than I write. I've stopped saying so."
- "Third copy of this. Ask me what it says. Go on. I've no idea."

**Student**
- "Am I doing it right?"
- "I'm *nearly* a mage."
- "Is this on the exam?"
- "Professor says I have promise. She says that to everyone."
- "I saw an archmage once. She didn't see me."

**Laborer**
- "Materials are low."
- "Another university? Where?"
- "It'll hold."
- "We built the last one twice. Foundations."
- "They study in it. We're in it more than they are."

**Soldier**
- "No magic. Just me."
- "Point me at it."
- "I've held a door before."
- "The mages go through the portal. Someone's got to be on this side."

---

## 9. Generation prompts

Written for a text-to-audio SFX generator (ElevenLabs Sound Effects or equivalent) and a
text-to-speech voice-design model. Every prompt below is a **starting point for a batch job**, not a
finished asset: expect to generate 4–8 candidates per line and select, and expect the click set in
§9.1 to need hand-editing after generation because 4 ms transients are below the resolution most
generators are reliable at.

Per §0.5, resolve the licensing questions before generating at volume.

### 9.1 Clicks (§2)

Generate long, gate hard, tune afterward. Ask for the material, not the UI function — every
generator's idea of "UI click" is a synthesizer, and §1's whole thesis is that it must not be.

| Asset | Prompt | Post |
|---|---|---|
| tick ×5 | "A single fingernail tapping once on glazed ceramic, very close mic, dry room, no reverb, crisp high transient" | Gate to 4 ms, HPF 400 Hz, −30 dBFS |
| latch ×5 | "A small brass mechanism engaging with a precise click, followed by a faint sustained metallic ring" | Split: click to 12 ms; ring becomes the sustain layer, tuned to root |
| commit ×5 | "A wooden stamp pressed firmly onto thick paper on a stone table, single hit, close, dry" | Layer with a 60 Hz sine thump, 40 ms |
| deny ×5 | "A single dry wooden knock with no resonance, damped immediately, dead room" | Gate to 8 ms, remove all tail |
| detent ×5 | "A rotary switch clicking one position, small metal detent, close mic" | Pitch-shift per step |
| seal ×3 | "Hot wax seal pressed onto parchment, slow press and slow release, heavy, close, quiet room tone" | Keep the full 700 ms |

### 9.2 Technique envelopes (§4.1)

Generate as **modifiers over a neutral source**, then apply as processing chains to form materials
rather than as standalone assets. Prompt each with a neutral bell as the source so the envelope is
what varies.

| Technique | Prompt |
|---|---|
| Creo | "A bell strike played backwards, swelling from silence into a full bloom, tail at the start, impact at the end" |
| Intellego | "A quiet sustained tone becoming gradually clearer as if a covering is lifted, no impact, filter opening" |
| Muto | "A struck tone that changes material halfway through, metal becoming glass, continuous morph, no gap" |
| Perdo | "A sustained tone collapsing downward and disappearing, spectrum falling away, ending in silence" |
| Rego | "A tone snapping abruptly on and abruptly off, gated hard, absolutely no attack or release" |

### 9.3 Form materials (§4.2)

Fourteen, generated as 3–4 s sustained beds and 4–6 one-shots each. The four with special rules
carry their rule in the prompt.

| Form | Prompt |
|---|---|
| Animal | "Breath and sinew, wet organic movement, close, irregular" |
| Aquam | "Water in a resonant clay vessel, pitched, bubbling and flowing" |
| Auram | "Moving air and pressure, wideband, no pitch, no fundamental" |
| Corpus | "Bone and heartbeat, slow deep pulse, muscle movement, sub-bass" |
| Herbam | "Dry fibre splintering, brittle plant matter breaking, mid-high crackle" |
| Ignem | "Fire crackle over broadband roar, rising, unstable" |
| Imaginem | "A sound doubled and detuned against itself, like a reflection arriving slightly late" |
| Mentem | "A pure sine tone, absolutely no reverb, completely dry, as if heard inside the head" |
| Terram | "Gravel and stone mass shifting, dense, low, granular" |
| Vim | "Raw unfiltered synthesis, the carrier signal itself, no acoustic character" |
| Umbra | "Only the reverb tail of a sound with the original sound removed entirely, distant, no dry signal" |
| Fatum | "A sound preceded by a faint echo of itself arriving before it, pre-echo, reversed anticipation" |
| Limen | "A sound recorded in one room that abruptly becomes the same sound in a different room, hard cut, no crossfade" |
| Nomen | "A whispered human voice with strong vocal formants, no words, breath and resonance only" |

### 9.4 The arrangement (§3.1)

Generate as **stems at each tempo**, not as one piece — the arrangement is assembled at runtime from
whichever layers the universe's state has earned.

Required stems per tempo (72 / 96 / 128 BPM), per mode (dorian / aeolian / phrygian / lydian),
transposable to any root:

| Stem | Prompt seed |
|---|---|
| Kick / tick boundary | "A soft deep drum struck once, felt more than heard, warm, no click" |
| Economy (1 & 3) | "A low plucked string, single note, dry, unhurried" |
| Teaching backbeat (2 & 4) | "Two voices humming the same note, one arriving slightly after the other, warm, close" |
| Research 8ths | "A small struck metal bar, bright, short decay, played evenly" |
| Scribing 16ths | "Quill pens on vellum, several at once, dry, rhythmic, no room" |
| Worship sub | "A very low sustained pulse, sub-bass, slow, felt through the floor" |
| Bed, per form | Use §9.3 beds, filtered to 200–800 Hz |

That is 6 stems × 3 tempos × 4 modes = 72 core stems, plus the form beds. Large but bounded, and
it is the entire music budget for the game.

### 9.5 Voice design

One voice per species, plus the four populace roles. Direction, not accent — per §0.6, no species
voice may read as a real people's accent.

| Species | Voice design prompt |
|---|---|
| Human | "Mid-thirties, quick and slightly breathless, warm, always sounds like they are already late. Neutral accent. Reads sincerely, never for laughs." |
| Elf | "Age indeterminate, very slow, quiet, never raises volume, leaves long gaps between clauses. Utterly unhurried. Faintly amused at nothing in particular." |
| Dwarf | "Dry, precise, mid-range, the cadence of someone reading a catalogue number aloud. Certain. Not unkind." |
| Draconic | "Enormous and quiet. Extremely slow. Low fundamental with a lot of chest. Never shouts, never needs to. Occasional, unexpected sadness." |
| Gnome | "Fast, bright, interrupts itself constantly, genuinely delighted by everything. Trails off mid-sentence and starts a new one." |
| Orc | "Warm, blunt, unbothered. Working-voice — the sound of someone talking while carrying something. Quietly amused by everyone else." |
| Scribe | "Tired, patient, mid-range, talking while doing something else with their hands." |
| Student | "Young, eager, slightly too loud, checking whether that was right." |
| Laborer | "Practical, level, unhurried. Talking over noise." |
| Soldier | "Steady, low, economical. Says as little as the sentence needs." |

**Direction for the annoyance tiers:** record all four tiers in one session, in order, and let the
performer's actual patience wear through. The unhinged lines should sound like the polite lines
after an hour, not like a different character.

### 9.6 Asset budget

| Class | Count |
|---|---|
| Clicks | 28 |
| Technique envelopes | 5 chains |
| Form materials | 14 beds + ~70 one-shots |
| Arrangement stems | 72 + form beds |
| God interventions | ~20 |
| Knowledge lifecycle | ~25 |
| Raid primitives | ~40 (10 × form variants) |
| Barks — species | 6 × ~31 = ~186 |
| Barks — cross-species | ~40 |
| Barks — populace | ~26 |
| **Total** | **≈520 assets** |

**About 250 of those are voice lines** — genuinely cheap to generate and genuinely expensive to
*select*. At 6 candidates per line that is 1,500 takes to audition. Budget selection time, not
generation time; it is the larger number by an order of magnitude and it is the one that decides
whether the barks are funny.

---

## 10. What `electron-client` has to expose

The audio system is a pure function of state (§0.1), so everything it needs must be in the read
path. This is the list, written now because two of these are cheaper to honour in `agent-interface`
(0.5.0) than to retrofit into a client that already shipped.

1. **Event deltas, classified, per tick.** Not just the new snapshot — *what changed*, keyed by
   class: research started/resolved, teaching succeeded/failed, scribing progressed, grimoire
   completed, node instance destroyed, **node last-instance destroyed**, mage died, building
   completed. §6.5's entire design rests on last-instance loss being distinguishable from instance
   loss *in the delta*, not by the client diffing knowledge tables itself.
2. **Counts alongside events**, so §0.4's density thresholds can be evaluated without the client
   counting event objects.
3. **The universe's `rootSeed`**, for §1.1's key derivation.
4. **Tick boundary timing**, precisely enough to schedule the beat grid ahead of the visual frame.
   Audio scheduling needs to run 50–100 ms ahead; a client that only tells audio about a tick when
   it renders one cannot be quantized.
5. **Knowledge-half-life or the equivalent balance metric**, for §1.2's detuning. Contracts §7
   covers balance metrics; this asks that at least one be on the client's read path rather than
   only in `mc-harness`.
6. **Per-mage: species, age, role, blessed flag, and whether they hold any last-instance node.**
   The last of these drives §8.2's last-copy line and is the one genuinely new requirement in this
   list.
7. **The explain channel** (contracts §4.4) for barks tied to autonomous decisions.
8. **Portal stability quartile**, for §7.2.

### 10.1 One finding worth raising now

Contracts §4.4 makes the explain channel optional, emitted on request, never an input to rules, and
guarantees no simulation behaviour depends on whether it was requested. That is all correct and
should stay.

But **if barks consume the explain channel, it stops being optional in practice for the client** —
not for the *core*, whose guarantee is unaffected, but as a product matter. An `electron-client`
that skips the explain channel to save bandwidth would ship a game where mages are silent about why
they do things, which is the exact failure §4.4 was written to prevent, arriving through a door
nobody was watching.

Two things follow, and neither is urgent, which is why this is a note rather than a proposal:

- `electron-client` should treat the explain channel as **required for its own read path**, while
  the core's contract keeps it optional.
- Whoever specifies the explain channel's payload in `agent-interface` should know that a consumer
  wants *per-mage decision reasons at world-tick granularity*, because that is a different shape
  from *on-demand explanation of one decision*, and it is much cheaper to know that before the
  format is fixed than after.

### 10.2 Deferred, and honestly so

- **Mixing multiple universes' arrangements** in a spectator or lobby context (§3.5). Not solved.
- **Spatial audio requirements** for the Art of Memory's stereo palace (§4.4, §6.5). The design
  assumes stereo panning is enough; whether it needs true HRTF is a question for whoever builds it.
- **Raid-scale audio LOD.** §7 assumes raid combatant counts are small enough for discrete sounds.
  `raid-engagement` has not fixed those counts, so §0.4's density rule may need to extend into
  raids.
- **Whether generated audio may be committed at all** (§0.5). A human decision, not a design one.

---

## 11. If you only implement five things

In order of feel-per-unit-effort:

1. **The click language** (§2), and the latch in particular. It is 28 assets and it is most of what
   the game feels like moment to moment.
2. **Teaching on the backbeat** (§3.1, §6.2). One sound, placed on 2 and 4, and the whole management
   layer acquires a groove that tracks whether the civilization is healthy.
3. **Loss, off-grid** (§3.2, §6.5). The single highest-value sound in the game, and it works even
   with no arrangement to subtract from, because arrhythmia does the work.
4. **The portal transition** (§3.3), especially the re-entry where lost layers do not return.
5. **The species barks** (§8) — cheapest to produce, most quoted, and via §8.2's last-copy line the
   only one of the five that does mechanical work.

Everything else in this document is depth. Those five are the design.

---

## Appendix A — The on-beat input layer

> **Status: designed, not proposed. Nothing in §§0–11 depends on this, and nothing should be built
> from it until the two costs below have been answered by someone with authority to answer them.**
>
> Everything in the main document is output-only: the universe's state drives the arrangement, and
> the latch (§2.1) is cosmetic scheduling with no mechanical effect. This appendix is the other
> thing — rhythm as *input*, where when you act changes what happens. It is written down because it
> is a genuinely appealing idea and because a half-remembered version of it will otherwise get
> reinvented later without its costs attached.

### A.1 What it would be

The latch already holds a decision between click and downbeat. The input layer makes that window
mean something:

- **On-beat commit.** An intervention committed within a tolerance window of the downbeat costs
  less favor — say 10–15%. Miss the window and it still fires, at full cost, on the next bar.
  Nothing is ever *lost* by mistiming; the ceiling moves, not the floor.
- **Chained interventions.** Consecutive on-beat commits build a multiplier that decays after a
  missed bar. Rewards sustained attention during the periods when a player is actively steering.
- **Raid exception.** Raid time is unquantized (§3.4), so the layer is world-time only. This is
  tidy rather than awkward: the god acts in world time anyway (contracts §4.2 masks every action
  during engagement), so there is no beat to be on when it would matter most.

Designed this way it is a *discount*, never a gate. That framing matters — it keeps the mechanic
off the critical path of every strategy, and it means a player who ignores it entirely plays a
slightly more expensive but complete game.

### A.2 What it costs, stated honestly

**Cost 1 — it makes the balance harness measure a different game than humans play.**

This is the serious one. Vision §9 rests on machine play discovering the meta before humans do, and
contracts §4.2 is a discrete masked action space with no timing dimension at all. A Monte Carlo or
RL agent submits an action for a tick; it has no concept of *when within the tick*, and giving it
one would mean adding a continuous timing parameter to an action space that contracts §4.4 already
had to work hard to keep flat and maskable.

So the harness would have to assume something. Two options, both bad:

- **Assume agents always hit the beat.** Then every baseline is computed at a favor rate no human
  sustains, and the balance numbers are systematically optimistic about how much a player can
  afford.
- **Assume agents never hit it.** Then baselines are pessimistic by the same margin, and worse, the
  *variance* between skilled and unskilled humans is invisible to the harness entirely — which is
  exactly the quantity a live-PvP game most needs measured.

There is a third option — make the discount a flat, timing-free rate that the harness models
exactly and that humans obtain by rhythm — but that is a strange design: a mechanic whose expected
value is fixed and whose only variable is whether the player finds it satisfying. Which may in fact
be the right answer, and is at least an honest one. It should be considered before the other two.

**Cost 2 — it contradicts a pillar.**

Design pillar #3 is *you are a god, not a general*. Timing pressure is a general's verb. A god who
must act on the beat to act efficiently is being asked for manual dexterity, and every minute spent
watching for a downbeat is a minute not spent on the decision the game says is its most interesting
one. This is a smaller cost than the first, and it is the kind of thing that could go either way
depending on how the game actually feels in the hand — but it should be argued, not assumed.

**A third cost, smaller and easily missed:** it puts a floor on input latency tolerance. §2.3 asks
for ≤20 ms because clicks should feel caused. A timing mechanic makes that a *fairness* requirement
rather than a feel requirement, and fairness requirements have to hold on the worst hardware anyone
plays on, not the best.

### A.3 What would have to happen first

In order, and none of these are audio work:

1. **A vision §12 amendment.** Audio is currently out of scope for v1 and this would be a *mechanic*,
   not audio — it belongs in the roadmap, with a capability, in `god-agency` or later.
2. **An answer from the balance harness owner** on which of the three assumptions in A.2 the
   baselines would use, before the mechanic exists rather than after. `illegalActionRate` is
   described in contracts §7 as a spec-clarity smell; a timing mechanic needs its own equivalent —
   some measure of how much of the theoretical discount real players actually capture — or it is
   unfalsifiable.
3. **A decision on whether it is a discount or a gate.** This appendix only argues the discount
   version. The gate version — where mistiming fails the action — is a different game and this
   document does not endorse it.

Until all three exist, §2.1's latch is the whole of the rhythm-input surface, and it is the version
that costs nothing and breaks nothing.
