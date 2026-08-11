## 0. Preconditions

- [x] 0.1 Re-base the delta specs against `knowledge-model`'s **archived** text rather than the unmerged branch they were drafted from. Done: `knowledge-model` archived while this change was being written, and its scribing requirement had been refined in the interim — the archived text places the new instance "at the location that grimoire's holder implies" and carries a fifth scenario, "A book scribed onto a shelf is shelved", neither of which existed in the draft. Both are now preserved verbatim in the `MODIFIED` block. `openspec validate --strict` does not catch this class of drift, because it checks structure and not whether `MODIFIED` content is a superset of what it replaces — so **any future delta in this change must be diffed against `openspec/specs/` by hand before it lands**
- [ ] 0.1a Re-run that hand diff for `magic-traditions` and `content-schemas` if either is amended again before this change is implemented
- [ ] 0.2 Confirm the balance harness (`agent-interface`, 0.5.0) is present, since `metisSuccessionRisk` is a registry addition and the sequencing in `proposal.md` holds implementation until it exists
- [ ] 0.3 Re-read `docs/design/vision.md` §5 and §4a and confirm the mētis framing still matches the vision of record after any amendments made since this change was proposed

## 1. Schema and the behaviour-free content migration

- [ ] 1.1 Add `knowledgeKind` to `packages/content/schema/node.schema.json` as a required property constrained to the enumeration `episteme` and `metis`, matching the existing `contentId` and enum idioms in that file
- [ ] 1.2 Write a failing test asserting a node record without `knowledgeKind` fails validation naming its JSON pointer, and a second asserting an out-of-enumeration value fails naming the permitted values
- [ ] 1.3 Add `"knowledgeKind": "episteme"` to all 300 records in `packages/content/data/node.json`, changing nothing else
- [ ] 1.4 Run `npm run verify` and confirm the full suite passes with the new field present
- [ ] 1.5 Run the golden replay fixtures and confirm `contentRevision` changed while no fixture's simulated result changed; record both facts in the commit message, since the revision move is a deliberate compatibility break
- [ ] 1.6 Commit the schema and the uniform `episteme` migration as one commit containing no design judgements

## 2. The instance-store invariant

- [ ] 2.1 Write a failing test asserting that creating an instance of a `metis` node at `locationKind` grimoire is rejected and no instance exists afterward
- [ ] 2.2 Write a failing test asserting the same for `locationKind` library
- [ ] 2.3 Write a failing test that audits the whole instance index and asserts no `metis` instance occupies a grimoire or library location
- [ ] 2.4 Implement the invariant in the instance store in `packages/rules-magic`, so that every operation inherits it rather than each restating it
- [ ] 2.5 Confirm the rejection names the node's knowledge kind, and that a `metis` instance at `mind` and at `palace` is permitted

## 3. Scribing refusal with a distinguishable reason

- [ ] 3.1 Write a failing test asserting scribing a `metis` node is refused in a universe whose tradition permits written storage, with sufficient capacity and materials
- [ ] 3.2 Write a failing test asserting the `metis` refusal and the `palace`-tradition refusal carry different reason codes
- [ ] 3.3 Add the node-kind refusal to the scribe path alongside the existing tradition-level refusal, with its own diagnostic code
- [ ] 3.4 Update the `knowledge-instances` scribing requirement's tests to cover the new refusal without weakening the existing four scenarios

## 4. Transmission and succession loss

- [ ] 4.1 Write a failing test asserting teaching transmits a `metis` node under the ordinary teaching rules
- [ ] 4.2 Write a failing test asserting no teaching operation can name a `metis` node whose only holder is dead
- [ ] 4.3 Write a failing test asserting that the death of the last holder of a `metis` node emits a loss event identifying succession failure and naming the mage
- [ ] 4.4 Write a failing test asserting that a `metis` node taught to a living student survives its teacher's death with no loss event
- [ ] 4.5 Write a failing test asserting succession loss and destruction loss carry different cause identifiers
- [ ] 4.6 Implement the succession cause on the existing last-instance loss path, adding no second loss mechanism
- [ ] 4.7 Confirm no code path branches on `knowledgeKind` to compute rediscovery cost — the multiplier carries it

## 5. The Art of Memory as the all-mētis tradition

- [ ] 5.1 Write a failing test asserting a node authored `episteme` is treated as `metis` for every operation in an Art of Memory universe
- [ ] 5.2 Write a failing test asserting the override is universe-scoped: the same content set under another tradition uses the authored kind, and no content file is rewritten
- [ ] 5.3 Implement the override in the `palace` store hook, keeping the hook within the four licensed extension points
- [ ] 5.4 Confirm all five pre-existing Art of Memory scenarios still pass unchanged
- [ ] 5.5 Record in `design.md` whether an Art of Memory universe's library-depth compounding loop is now materially weaker than other traditions', as a specific comparison for the harness rather than a claim resolved by argument

## 6. The metric

- [ ] 6.1 Add `metisSuccessionRisk` to the metric registry in `docs/design/contracts.md` §7 with its definition, noting that the addition is append-only and baseline-affecting
- [ ] 6.2 Write a failing test asserting the key is present with an unavailable status and a reason when the mechanic is absent
- [ ] 6.3 Write failing tests for the zero case and for the rising case as sole holders age past the final lifespan quantile with no student
- [ ] 6.4 Implement collection in the harness layer, reading species lifespan quantiles rather than a hardcoded age
- [ ] 6.5 Confirm the CI metric-registry equality check passes with the new key

## 7. Content authoring, as a separate reviewable pass

- [ ] 7.1 Draft authoring guidance: what makes a node mētic, with worked examples on both sides, so the judgement is reviewable rather than intuitive
- [ ] 7.2 Reclassify nodes to `metis` in a commit containing only content values
- [ ] 7.3 Confirm every `metis` node's `rediscoveryMultiplier` is no lower than that of `episteme` nodes of the same tier in the same cell, and add the test that asserts it
- [ ] 7.4 Record the resulting counts per cell and per tier in the change's design document, so the distribution is inspectable before any tuning claim is made about it

## 8. Documentation and the vision of record

- [ ] 8.1 Amend `docs/design/vision.md` §5 to name mētis as a knowledge kind and describe succession loss
- [ ] 8.2 Amend `docs/design/vision.md` §4a to restate the Art of Memory as the all-mētis tradition, noting that this renames rather than changes it
- [ ] 8.3 Confirm the roadmap row added to `docs/design/vision.md` §11 at proposal time still matches, and give it a real version once the sequencing after 0.5.0 is settled
- [ ] 8.4 Update `docs/design/vision.md` §13: remove nothing that is still open, and add the four open questions this change's `design.md` raises
- [ ] 8.5 Amend `docs/design/contracts.md` §2.3 for the node schema field
- [ ] 8.6 Add a note to `docs/design/sound-design.md` §6.5 that succession loss and destruction loss are different events and should not share a sound, since §0.3's salience-parity rule binds the client to surface succession risk before it fires

## 9. Verification

- [ ] 9.1 Confirm every scenario in `specs/metis-knowledge/spec.md`, and every added or modified scenario in the three delta specs, has a corresponding passing test
- [ ] 9.2 Run `npm run verify` — typecheck, lint, purity, content validation, audio content validation, and the full suite
- [ ] 9.3 Run `openspec validate metis-knowledge --strict`
- [ ] 9.4 Confirm no spec, task, or release note in this change makes a balance claim, per the measurement pivot in `docs/design/release-plan.md`
- [ ] 9.5 Record the ambiguities this change resolved against `docs/design/contracts.md`, and the ones it deliberately left open
