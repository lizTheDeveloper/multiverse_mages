# Multiverse Mages — the image behind mages.multiversegames.ai
# Copyright (C) 2026 Ann Kelner
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Was an untracked file on the host until 2026-10-07; a deploy no one else could
# reproduce. Build from the repo root:
#
#     docker build -t mm-play .
#     docker compose -f deploy/play-compose.yml up -d --build
#
# The serving process is scripts/play-server.mjs: ONE shared universe, timed by
# whichever browsers are open. docs/devops/ci-and-deploy.md says why that is not
# the game yet.

FROM node:22-slim AS build
WORKDIR /app
# Manifests first so `npm ci` caches across source edits. Every workspace must be
# listed or `npm ci` refuses the lock file — guarded by
# packages/content/test/unit/dockerfile-workspaces.test.ts.
COPY package.json package-lock.json ./
COPY packages/agent-api/package.json packages/agent-api/
COPY packages/bubble/package.json packages/bubble/
COPY packages/content/package.json packages/content/
COPY packages/coordination/package.json packages/coordination/
COPY packages/gym-bridge/package.json packages/gym-bridge/
COPY packages/lobby/package.json packages/lobby/
COPY packages/mc-harness/package.json packages/mc-harness/
COPY packages/primitives/package.json packages/primitives/
COPY packages/rules-magic/package.json packages/rules-magic/
COPY packages/rules-raid/package.json packages/rules-raid/
COPY packages/rules-world/package.json packages/rules-world/
COPY packages/scenario/package.json packages/scenario/
COPY packages/server/package.json packages/server/
COPY packages/sim-core/package.json packages/sim-core/
COPY packages/state/package.json packages/state/
COPY packages/universe-host/package.json packages/universe-host/
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc --build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app .
EXPOSE 8300
CMD ["node", "scripts/play-server.mjs", "--port", "8300"]
