#!/bin/sh
# W17 founding-species-mask arms. $1 = out dir, $2 = tag.
# Gnome is mask 8 and human mask 16 in content order (draconic, dwarf, elf,
# gnome, human, orc) — the pair `strategy-dimensionality.md` §5 found reaching
# the identical 49 nodes.
set -e
cd "$(dirname "$0")"
mkdir -p "$1"
for m in 8 16; do
  node tools/w15/run-arm.mjs --strategies passive-control,archivist --masks "$m" \
    --replicates 6 --out "$1" --tag "$2" > "$1/log-mask$m.txt" 2>&1 &
done
wait
echo "done $1"
