<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The raid, as something you play

**Status: author's design, recorded. Amends `vision.md` §3.** Written from the author's direction on
2026-08-12. Where this contradicts the vision of record, the contradiction is deliberate and named in
§1 below; nothing here is an agent's invention.

## 0. The problem this fixes, in one sentence from the codebase

`ui/raid/`'s own framing question is *"Every action is masked for the duration. What is a player
actually **doing** while a raid runs?"* — and the honest answer today is **nothing**. The author's
verdict: that is the bug, not the design.

The reference point is Vampire Survivors. Agency is **front-loaded**, resolution is **back-loaded**:
you make real decisions constantly early, and by the end the run plays itself and you have earned the
right to watch it. A raid should have the same shape. There is a phase where you only watch — but it
is not the whole raid, and it is not the beginning.

## 1. The amendment to §3

`vision.md` §3 currently ends:

> **Rules changes are a world-time action.** Nothing about the ruleset — including portal magic —
> can be altered once a raid has begun. A raid in progress is frozen policy.

**That sentence is repealed.** It is the specific rule that makes a raid unplayable: if policy is
frozen, the god has no verbs during the one moment the game is most exciting, and the raid can only
ever be a cutscene over a dice roll.

The replacement keeps what the old rule was protecting — that you cannot fluidly retune the ruleset
mid-fight to counter whatever is being thrown at you — while restoring agency:

> **The ruleset may be changed during a raid, and every change locks until the raid ends.** A cell
> forbidden mid-raid cannot be permitted again while the raid runs. A cell permitted mid-raid cannot
> be forbidden again. Any change made during an engagement is irreversible **for the duration**.
>
> **After the raid, reverting a mid-raid change costs substantially more favor than the change did.**
> A raid leaves a mark on your constitution, and unmaking that mark is expensive.

Everything else in §3 stands unchanged, and the load-bearing sentence — *the host universe's ruleset
governs all magic cast inside it, for both attacker and defender* — is what makes the amendment
interesting rather than merely permissive.

### Why the lock is the whole design

Without the lock, mid-raid policy is a reaction knob and the correct play is to counter whatever you
last saw. With it, every mid-raid change is a **commitment made under uncertainty** — which is the
thing a strategy game is actually made of.

The sharpest case falls straight out of §3's arbitration rule. You are being raided and your library
is about to be unmade, so you **forbid Perdo**. Under host arbitration that works absolutely: nobody
inside your universe can unmake anything, *including the raider*. It also means **your own defenders
cannot use Perdo for the rest of the engagement**, and you cannot take it back when the fight turns.
You have traded your capacity to destroy for a guarantee that nothing of yours is destroyed.

That is a legible, costly, irreversible decision made under time pressure, and it uses only
mechanisms that already exist.

**Measured, and the motive does not hold yet.** W37 implemented this and ran it. The mechanic works
as combat power: forbid Perdo mid-raid and it leaves the raider and your own wardens alike, and W38's
independent trace shows the field does not go quiet — summons and soldiers go from **48.4% to 87.2%**
of hit points removed, cast volume barely moves (119 → 103), and roughly **58 casts a raid are
blocked from your own defenders**. A war of unmaking becomes a war of summoned servants, and you
cannot trade back. That is the design working.

**But the library does not fall to Perdo.** Libraries are lost to *objective capture* and
grimoire-burn rolls, so forbidding Perdo does not protect the thing the worked case says it protects.
The example above is therefore correct about what the lock costs and **wrong about what it buys**, and
it is left standing with this correction rather than quietly rewritten, because the gap is the
finding: a mechanic can be well-formed and still be attached to the wrong outcome.

The deeper version, also measured: **at shipped tuning, raids are decided by objective capture, not
by combat at all.** Survival-regret measures **zero on every seed** — the raider takes all three
objectives and leaves before casting kills anyone. *Mid-raid policy cannot decide a raid that combat
does not decide.* That is the thing to move before anyone tunes a verb, and W37 left it as a passing
test that starts failing the moment it changes.

### And it is a drain, which is what the economy was missing

The post-raid revert cost is a **sink attached to a decision**, not a tax on existing. It scales with
how much you changed under pressure, it competes directly with every other use of favor, and it is
paid in a moment when the player can see exactly what it bought. That is the shape the economy has
never had: *"keeping this legal preserves X but starves Y"* rather than *"your number went down."*

## 2. The engagement's shape

Three phases. The names matter less than the fact that agency decays across them.

| phase | what the player does | what the sim does |
|---|---|---|
| **Muster** | Spends the raid verb set. Real decisions, under a clock. | Portal is open, contact has not happened. |
| **Contact** | Fewer, sharper interventions. Ruleset changes still possible, still locking. | Combatants engage; spells resolve; the animation layer earns its keep. |
| **Resolution** | Watches. | The engagement plays out to a termination condition. |

The author's rule for the split: *"there is a phase of time where you just watch it unfold, but that
isn't until the very end."*

## 3. The raid verb set

Raids get **their own verbs**, live only inside an engagement, distinct from §4's world-time verbs —
plus **forbid and permit**, which carry over from world time under the locking rule above.

The asymmetry is the interesting part, and it is the author's: **the defender spends favor. The
attacker spends something else.**

That asymmetry has a reason ready-made in the fiction and in §3. Favor comes from your populace's
worship. You are the god *of your universe*. When you raid, your mages are on the far side of a
portal, inside a place your worshippers do not live and your ruleset does not govern — so your
domestic currency should not reach cleanly through the door.

### The defender: favor

Favor already exists, already regenerates from worship, and already has nothing worth buying. A
defensive spend that resolves inside seconds and visibly saves a library is the first sink in this
game with a legible payoff.

### The attacker: Vis and exposure, both — ruled by the author

**Vis is the spend.** A portable, physical, lootable stock of magical fuel carried through the portal
with the raiding party. It is spent to help the attack, it can be captured, and running out of it is
what ends an over-extended raid.

**Exposure is the side effect, and it is the more interesting half.** Every spell cast inside the
host's universe is cast *in front of the host's academics*, and casting teaches them. An attacker who
wins by throwing everything they know has handed the defender a curriculum.

Three consequences follow, and they are why exposure earns its place over being flavour:

- **The attacker's power leaks to the defender through use.** Raiding the same universe repeatedly
  gets progressively worse, because you have been teaching them your entire repertoire. That is a
  self-limiting mechanic on the dominant strategy in a persistent multiverse, and it arrives without
  a rule that says "you may not raid too often."
- **It is the only knowledge-transfer channel that costs the source nothing to give and everything to
  have given.** Teaching at home requires a living teacher above the mastery threshold; theft writes
  at `mastery: 0`. Exposure is a third path, and it runs backwards along the attack.
- **It makes a restrained raid a real strategy.** Winning with your cheapest spells preserves your
  edge. Winning with your deepest ones spends it. That is a decision inside the fight rather than
  before it.

The two compose cleanly: **Vis is what you spend, exposure is what you pay.** One is a stock you can
watch drain; the other is a debt you notice next season.

### The spec collision this creates, stated rather than hidden

`openspec/changes/mages-and-species/specs/economy/spec.md:250` is a shipped, validated requirement:
*"The economy SHALL track exactly three inputs — populace, materials, and knowledge-as-capital — and
MUST NOT introduce a fourth resource."*

Vis carried through a portal has to be produced and stored somewhere first, which makes it a fourth
input at world scale. **Choosing Vis is therefore a spec amendment, not just a raid feature**, and it
should be made deliberately in that file rather than discovered later by whoever trips the loader
invariant. It also settles the open `food`/`stone`/`vellum` question in the same direction: the
economy is being told it may name its resources.

## 4. Every spell gets a moment in the world

The author: *"we should be able to see spells actually be animated… every spell needs to have a
moment in the world where it's being used."*

**The event source already exists and is complete.** `packages/rules-raid/src/arbitration.ts`
dispatches seven effect primitives directly off authored node effects
(`requireRegistryNode(...).effects`):

    direct-damage · ward · area-denial · blink · summon · concealment · knowledge-steal

Those are the seven the campaign's consumption gate reports as having a real node-driven path *the
moment anything imports the package*. So the animation layer does not need an event stream invented
for it — it needs the raid engine reachable, and a client that draws what arbitration already
decides.

Two consequences worth stating:

- **`rules-raid` is orphaned.** 4,525 lines across sixteen files, imported by no package. Connecting
  it is what makes six of the twelve currently-unreachable primitives reachable. The raid layer is
  not the last thing to build; it is the largest built thing not plugged in.
- **The raid layer has space.** `geometry.ts`, `movement.ts`, `navigation.ts`, `spatial.ts` and
  `terrain.ts` all exist. §7a's *"at world scale there is no map"* is a statement about the **world**
  layer. The engagement has real positions and real movement, which is exactly where a Vampire
  Survivors-shaped moment-to-moment layer can live without violating anything.

## 5. What has to be true for this to be worth building

Stated as claims that could turn out false, because the campaign's rule is that a mechanic ships with
the measurement that would disprove it:

- **The muster decisions change the outcome.** Two arms, same seed, same forces, different muster
  spend → different survival. If the outcome is identical, the verbs are decoration.
- **The lock creates regret.** Some fraction of raids should feature a mid-raid forbid that the
  player would take back if they could. Zero regret means the lock costs nothing and is not a
  decision.
- **The revert cost binds.** Post-raid, players should sometimes *keep* a ruleset they did not want,
  because reverting is too expensive. If everyone always reverts, the price is too low; if nobody
  ever does, it is too high.
- **The animation is reading real events.** Every drawn spell traces to an arbitration dispatch with
  a node id behind it. A raid view that animates plausible-looking magic unconnected to what the
  engine decided is worse than no raid view, because it will be believed.

## 6. Open for the author

1. ~~**Attacker's resource**~~ — **ruled: both.** Vis is the spend, exposure is the side effect (§3).
2. ~~**Can the attacker forbid?**~~ — **ruled: forbidding is defender-only.** Under §3 the host's
   ruleset governs, so an attacker forbidding their own cells would change nothing inside the host
   universe; making it defender-only turns that from a dead verb into a deliberate asymmetry. The
   attacker holds initiative and chooses the engagement; the defender holds the constitution and can
   close a door on both of them. Those are different kinds of power, which is what makes the
   matchup a matchup.
3. **The revert multiplier.** "Costs a lot" needs a number, and it should be authored as untuned
   content rather than picked here.
5. **Does the muster clock run in world time or engagement time?** The dual-scale clock exists; which
   scale the muster phase uses decides whether a raid is a pause in the world or a thing the world
   keeps running through.
6. **Does exposure teach a node outright, or raise a discovery weight?** Teaching it outright is
   legible and brutal; weighting it is subtler and harder to see. The campaign's own evidence favours
   legible, since a mechanic nobody can observe has repeatedly turned out to be doing nothing.

---

# Part II — the raid has a place

Author's direction, 2026-08-12, after playing the prototype. Recorded as ruled unless marked open.

## 7. The world stays abstract; the raid makes it concrete

§7a's rule holds: **at world scale there is no map — universities, populations, materials and
knowledge are counts and relationships.** Nothing here changes that.

What changes is that **a raid generates a place from those counts, for the duration of the
engagement, and then it is gone.** The world knows it has *n* universities and that university *U*
sits in a `river-delta`; the raid turns that into a floor plan. This is the bridge between the two
scales, and it costs the world layer nothing.

Two pieces already landed that this composes with, and neither was built for it:

- **W24 sited universities in territory kinds** — `university-site {kindId}`, a relationship, no
  coordinates. So the terrain of a generated place comes from the kind its target sits in. Raiding a
  delta academy and a highland one should not look alike, and now it need not.
- **§5 gives knowledge a location** — a mind, a grimoire, a library shelf, a memory palace. So the
  library *building* contains exactly the grimoire rows whose location is that library. **Targeting
  the library and physically carrying out the books is not a new mechanic; it is the existing loss
  channel given a floor plan.**

## 8. What is targeted

> *"They're gonna raid universities because that's where the libraries are and stuff, but they could
> also raid like your supply chain area to wreck up your supply chain."*

A target is a **site**, and sites are what the world already counts. Universities first, because
that is where the grimoires are. Supply-chain sites second, because wrecking them is a different kind
of win — one that costs the defender production rather than knowledge, and therefore is worth doing
to a rival whose library you cannot reach.

The generated place is **RimWorld-shaped**: an overhead plan of rectangular buildings, laid out from
the target's contents. A university with a deep library and three scriptoria produces a different
plan from one with a shallow library and a barracks. The buildings are not decoration — **what is
inside them is what is in the state**, and it is what can be taken or burned.

`packages/rules-raid` already has `geometry.ts`, `spatial.ts`, `terrain.ts`, `movement.ts` and
`navigation.ts`. The place is new; the space it lives in is not.

## 9. Portal placement is deterministically random, and that is the tension

> *"Portalling directly into a room is probably not something that they can really achieve. So it's
> somewhat random, but there's always a chance they could open a portal in there or right next to the
> library's door, rather than the library's on the other side."*

**You cannot choose where the portal lands.** You choose *what you are coming for*; the arrival is
drawn. Sometimes you open beside the library door. Sometimes the library is across the compound and
you have to cross it while the defenders wake up.

This is the single mechanic that makes a raid a *play* rather than a calculation, and it is why the
muster phase matters: you are committing favor and Vis, and repealing parts of your own constitution,
**before you know how far you will have to walk.**

Determinism is not optional. The draw is stream-split per `CLAUDE.md`'s third constraint — a raid
placement draw must not re-roll any other subsystem — and it is seeded so a replay lands the portal
in the same spot. **Random to the player, fixed to the replay.**

W38 found a live hazard here that buildings will make worse: at 8% impassable, concave pockets exist
that a greedy step cannot leave, and a supercover trace must exclude the endpoints' own cells or two
combatants in the same wood deadlock permanently. **Buildings are concave pockets by construction**,
so `navigation.ts` stops being optional the moment a floor plan exists.

## 10. The god suggests; the mages choose

> *"When you're going to go raid, I think that's like a directive the god should do. And then you
> should suggest targets and then they actually decide what the target is that they'll open the portal
> to."*

This is the §4 constraint applied to the one verb that most tempts you to break it. **The god does not
pick the target.** The god issues the directive — *go raid* — and offers a suggestion. The mages
weigh it against what they know, what they can carry, and what they think they can reach, and they
choose.

So the interface is a *recommendation*, and the recommendation can be declined. That is consistent
with every other verb in the game, it preserves the thing that makes the fiction work, and it makes
the player's real lever the same one it always is: **you shape who they are and what they know, and
then you find out what they do with it.**

**Lootable objects are the raider's choice** for the same reason. You do not order a mage to carry the
third shelf; she decides what is worth the weight.

## 11. Pause is a bid

> *"You should be able to click on any mage and pause the action at any point. But the opponent should
> be able to unpause. And during a raid that costs favor or vis."*

Click a mage, the action stops, you inspect them — **and you pay for it.** Your opponent pays to start
it again. Time becomes something the two sides bid over.

This solves the problem that normally makes pause-to-inspect unshippable in live PvP: one player
freezing the world at will is intolerable, so most games forbid it. Making it **cost** and making it
**contestable** turns it from an exploit into a decision. It also lands naturally on the asymmetry
already ruled: **the defender bids favor, the attacker bids Vis**, so the two sides are spending
different currencies and whoever has more slack in their own economy can hold the clock longer.

**A flat price is the failure mode** — the richer side simply holds the clock forever. Repeated
pausing has to get more expensive, by rising price, cooldown or cap. Which of those is open.

## 12. Open

1. **Do supply-chain sites exist yet?** Universities do. The supply chain is W29's work and is not
   merged. Raiding what is not built is not possible, so this may be a two-stage delivery.
2. **The escalation rule for pause bids** — rising price, cooldown, or cap.
3. **Does the defender see the target before contact?** If the raider chooses the target and the
   arrival is drawn, the defender's muster decisions are made under a different kind of uncertainty
   than the attacker's, which may be exactly right or may be too harsh.
4. **What does a declined suggestion look like?** If the mages can refuse the god's suggested target,
   the player needs to see that they did, and why — otherwise the verb reads as broken rather than as
   autonomous.
