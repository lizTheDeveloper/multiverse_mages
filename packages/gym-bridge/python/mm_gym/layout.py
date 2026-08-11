"""The observation layout, verified rather than trusted.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

``agent-api/src/digest.ts`` argues that 64-bit FNV-1a was chosen so that *"a
second implementation can follow [it] from the document rather than from the
source"*, and exports the canonical encoding because *"a digest whose input
cannot be inspected is a digest nobody can debug"*.

This module is that second implementation. It exists so a client can *verify*
the digest a bridge publishes instead of taking its word: a bridge that
misreports its own layout is the one failure a declared digest cannot catch by
itself, and it is exactly the failure a stale deployment produces.

Standard library only, as the whole package is.
"""

from __future__ import annotations

# 64-bit FNV-1a, as `sim-core/src/snapshot/hash.ts` specifies it. The constants
# are the published ones and are not a choice made here.
_FNV_OFFSET_BASIS = 0xCBF2_9CE4_8422_2325
_FNV_PRIME = 0x0000_0100_0000_01B3
_MASK64 = 0xFFFF_FFFF_FFFF_FFFF

#: The header line every valid encoding starts with.
DIGEST_FORMAT = "mm-observation-layout/1"


def fnv1a64(data: bytes) -> int:
    """The 64-bit FNV-1a hash of ``data``."""
    accumulator = _FNV_OFFSET_BASIS
    for byte in data:
        accumulator ^= byte
        accumulator = (accumulator * _FNV_PRIME) & _MASK64
    return accumulator


def digest_of(encoding: str) -> str:
    """The sixteen lowercase hex characters a layout encoding hashes to.

    ``encoding`` is the text a bridge returns from the ``describe`` verb. It is
    ASCII by construction — ``digest.ts`` refuses to encode anything else,
    because *"a digest whose bytes depend on a text encoding is a digest two
    implementations can disagree about"* — and this refuses the same thing for
    the same reason rather than silently encoding UTF-8.
    """
    try:
        data = encoding.encode("ascii")
    except UnicodeEncodeError as error:  # pragma: no cover - defensive
        raise ValueError(
            "The layout encoding must be ASCII. A non-ASCII character means this text did not "
            "come from agent-api's layoutEncoding, which refuses to produce one."
        ) from error
    return f"{fnv1a64(data):016x}"


def slot_count(encoding: str) -> int:
    """How many channels the encoding declares, read from its header line."""
    header = encoding.split("\n", 1)[0]
    fields = header.split("\t")
    if not fields or fields[0] != DIGEST_FORMAT:
        raise ValueError(
            f"The encoding's header is {fields[0]!r}, not {DIGEST_FORMAT!r}. The format version is "
            "part of the hashed text, so a different one is a different encoding rather than a "
            "variation on this one."
        )
    for field in fields[1:]:
        if field.startswith("slots="):
            return int(field[len("slots=") :])
    raise ValueError("The encoding's header declares no slot count.")


def blocks_of(encoding: str) -> dict[str, int]:
    """Channel counts per ``contracts.md`` §4.1 block, in first-seen order.

    Useful for a client that wants to slice the observation without hard-coding
    offsets — the block boundaries come from the bridge, so a rearranged layout
    moves them here too instead of silently mis-slicing.
    """
    counts: dict[str, int] = {}
    for line in encoding.split("\n")[1:]:
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) < 2:
            raise ValueError(f"Malformed slot line: {line!r}")
        counts[fields[1]] = counts.get(fields[1], 0) + 1
    return counts
