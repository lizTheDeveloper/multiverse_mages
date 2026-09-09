# W204 — wires that never bind

Instruments for one defect class: **mechanisms that are wired, reachable, green, and do nothing
measurable.** `check:reachability` cannot see them (they are reached), `check:consumption` cannot
see them (they reach a consumer), and the design audits cannot see them (they are implemented).

Findings: `docs/design/wires-that-never-bind.md`.

Run `npm run typecheck` first — these resolve `@mm/*` through the workspace symlinks into `dist/`.

    node tools/w204/reach.mjs                                  # per primitive: how much is inside the square
    node tools/w204/never-bind.mjs --ticks 600 --seeds 3       # ablate each mechanism in the long run
    node tools/w204/episode-ablate.mjs --strategy worship-maximizer
    node tools/w204/verb-census.mjs --ticks 600                # god verbs: legal/listed/submitted/applied
    node tools/w204/goal-census.mjs 600                        # mage goals: mage-ticks and accrual
    node tools/w204/channel-counter.mjs 600 589825 -           # bonus channels: calls and magnitudes
    node tools/w204/raid-census.mjs --ticks 600 --seeds 2      # raids: combatant-ticks vs combat attempts

`never-bind.mjs` refuses to print a table unless four self-checks pass. Two of them exist because
this instrument had the exact defect it hunts: the snapshot hash moves on a content-only edit, so
the amplification direction is judged on a behavioural trace instead; and an arm can replace a
policy with itself, which reports a perfect byte-identical null. Both are documented at their call
sites.
