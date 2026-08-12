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

### The attacker: an open question with a strong candidate

**Proposed, not decided: Vis** — a portable, physical, lootable stock of magical fuel carried through
the portal with the raiding party.

Reasons it fits rather than merely being available:

- **Three of four independently-commissioned economy specs proposed exactly this stock** (GLM's Vis,
  Qwen's Aether, Codex's Vis) and the shipped `food`/`stone`/`vellum` has no analogue. It is the one
  live gap in the resource model.
- Codex's spec made Vis **lootable** on its own reasoning, before any of this was discussed. A
  raiding party that carries fuel and a defender who can capture it is a complete loop.
- It explains why raiding is *expensive*: you burn reagents you cannot replace on the far side.
- It gives Vim and the ritual layer an economy to sit in, which they currently lack.

**The competing answer** — and the reason this is flagged rather than settled — is that the attacker
could instead spend **exposure**: every spell cast in the host's universe is cast in front of the
host's academics, and casting teaches them. That makes attacking a knowledge *transfer* and ties the
raid layer directly to the game's actual subject. It costs no new resource and it is thematically
stronger; it is weaker as a moment-to-moment currency because it is hard to read at speed.

These are not exclusive. Vis as the spend, exposure as a side effect, is probably the right answer,
but the author should rule.

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

1. **Attacker's resource** — Vis, exposure, or both (§3).
2. **The revert multiplier.** "Costs a lot" needs a number, and it should be authored as untuned
   content rather than picked here.
3. **Does the muster clock run in world time or engagement time?** The dual-scale clock exists; which
   scale the muster phase uses decides whether a raid is a pause in the world or a thing the world
   keeps running through.
4. **Can the attacker forbid too?** Under §3 the *host's* ruleset governs — so an attacker forbidding
   their own cells changes nothing inside the host universe. Either attackers get a different lever,
   or forbidding is a defender-only verb and that asymmetry is deliberate.
