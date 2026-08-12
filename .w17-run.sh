#!/bin/sh
# W17 sweep launcher. $1 = out dir, $2 = tag. Four processes, two strategies each.
set -e
cd "$(dirname "$0")"
mkdir -p "$1"
for g in "passive-control,uniform-random-legal" "permissive-breadth,narrow-depth" "denial-warden,archivist" "portal-rush,worship-maximizer"; do
  node tools/w15/run-arm.mjs --strategies "$g" --replicates 6 --out "$1" --tag "$2" \
    > "$1/log-$(echo "$g" | tr ',' '_').txt" 2>&1 &
done
wait
echo "done $1"
