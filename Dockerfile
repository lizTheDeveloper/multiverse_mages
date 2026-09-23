# Multiverse Mages — play server
# Copyright (C) 2026 Ann Kelner
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Builds and serves the single-player game on port 8300.
# The server holds one live AgentSession in memory — a full universe
# responding to god actions over HTTP.
#
#   docker build -t multiverse-mages .
#   docker run -p 8300:8300 multiverse-mages

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/sim-core/package.json packages/sim-core/
COPY packages/state/package.json packages/state/
COPY packages/content/package.json packages/content/
COPY packages/primitives/package.json packages/primitives/
COPY packages/rules-magic/package.json packages/rules-magic/
COPY packages/rules-world/package.json packages/rules-world/
COPY packages/rules-raid/package.json packages/rules-raid/
COPY packages/agent-api/package.json packages/agent-api/
COPY packages/coordination/package.json packages/coordination/
COPY packages/scenario/package.json packages/scenario/
COPY packages/mc-harness/package.json packages/mc-harness/
COPY packages/gym-bridge/package.json packages/gym-bridge/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc --build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app .
EXPOSE 8300
CMD ["node", "scripts/play-server.mjs", "--port", "8300"]
