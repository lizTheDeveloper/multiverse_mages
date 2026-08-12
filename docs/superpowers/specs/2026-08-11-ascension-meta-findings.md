# Machine-meta probe — measured findings (main @ 71261e9)

Instrument: mc-harness sweeps, reference-universe-v1, 8-strategy round-robin pool.
Probes: 400 runs @ 240 ticks (20 y); 80 runs @ 2400 ticks (200 y); balance-full 10,000 runs @ 240 ticks.

## F1 — Ascension is a button, not an achievement  [SEVERITY: highest]
At 2400 ticks, `uniform-random-legal` ascends 10/10 (ticks 700-964), always at exactly
51 nodesKnown — the level `passive-control` reaches doing nothing. Every other strategy
ascends 0/10.
Mechanism: `policyFor` submits the first *legal* preference. Only `portal-rush` lists
`declareAscension` at all, and its earlier preferences (encourageResearch, permitTechnique)
are always legal, so it never falls through. Random play presses action 15 ~1/16 of rounds.
Eligibility is unlocked by *passive accumulation* (ascensionPath flips at the 51-node passive
baseline, ticks ~700+), and from there winning is one button-press.
=> The optimal policy is "do nothing until eligible, then press 15". A learned agent finds
   this quickly and the strategy space collapses to one action.

## F2 — ascensionRate is horizon-dependent, not broken
240 ticks: 0/400 ascend. 2400 ticks: 10/80 = 0.125, inside the declared 0.05-0.20 band.
Both committed gates (60 and 240 ticks) are far too short to see the win condition at all.

## F3 — The strategy space is one axis: permit more vs permit less
At 2400 ticks, mean nodesKnown: permissive-breadth 273.2 | passive/archivist/portal-rush/
worship-maximizer 51.0 | denial-warden 7.8 | narrow-depth 7.0.
denial-warden and narrow-depth are near-duplicates. archivist, portal-rush and
worship-maximizer are indistinguishable from the passive control on this axis.

## F4 — Population is inert to the god
No strategy separates on referenceLivingMages, referencePopulation, referencePeakPopulation
or referencePopulationChange. 4 of 10 reference metrics are blind to every strategy.

## F5 — §7 metrics are half-wired
The 12 §7 metrics cannot be named by a sweep (only the 10 reference* are registered in the
scenario). 5 arm-scoped ones compute automatically into the summary:
  ascensionRate 0.125 | capitalSnowball 0.3498 | worshipSnowball 0.1075
  prestigeAdvantage no-observations | winRateByPrimitive mechanic-absent
capitalSnowball was byte-identical at ticks 60/120/240 in the short probe — worth a look.

## F6 — POOL_BUILD_LIMITS is stale
It claims every god action is effect-degenerate and "a pairwise matrix taken now measures
the harness, not the game". False as of god-agency: coordination/src/god/interventions.ts
implements the interventions, and mask.ts gates declareAscension on ascensionPath.

## Consequence for the stated goal
`mm_gym.rewards.sparse_terminal` scores ascension. Under F1 the reward is maximised by waiting for
eligibility and pressing one button, so PPO converges to "idle, then press 15" and learns
nothing about magic. Fixing the reward/eligibility is a prerequisite for training, not a follow-up.
