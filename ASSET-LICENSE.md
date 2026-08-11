# Asset licensing

Code in this repository is AGPL-3.0-or-later (see `LICENSE`). Assets are licensed
separately, because the AGPL does not cover non-software assets cleanly.

## Written material — CC BY-SA 4.0

The voice-line text in `docs/design/sound-design.md` §8 and
`packages/content/data/audio/voice-line.json`, the §9 generation prompts carried verbatim in
`packages/content/data/audio/audio-cue.json`'s `prompt` and `post` fields, and the design prose
throughout `docs/design/`, are © Ann Kelner and licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

These were written by a human author, are unambiguously ours to license, and the
share-alike term is the natural copyleft counterpart to the AGPL.

## Generated audio — no rights asserted

Audio files under `assets/` are machine-generated from the prompts in
`docs/design/sound-design.md` §9. **No copyright is asserted over them**, and they
may be used by anyone for any purpose.

This is a deliberate position rather than an oversight. Whether machine-generated
audio attracts copyright at all is unsettled, and it is likely in several
jurisdictions that it does not. A copyleft licence needs ownership to attach to;
claiming CC BY-SA over output we may not own would be an empty claim that a
downstream user could not rely on. Asserting nothing is the honest version, and it
is the same posture taken by projects that have algorithmically enumerated a
creative space in order to place it beyond enclosure.

The *prompts* that produced the audio are written material and are CC BY-SA 4.0
under the section above.

## Third-party assets

None at present. Any added must be AGPL-compatible for code and compatibly
licensed for assets, and must be recorded here with its source and licence.
