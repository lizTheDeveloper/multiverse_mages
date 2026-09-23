# Deploying Multiverse Mages

## Single-player play server (Path A)

The fastest path to a playable game on the internet. One play server per
player, no multiplayer, no persistence. Good for playtesting.

### Prerequisites

- A Hetzner VM with Docker and Caddy (or the `games` box)
- A DNS A record pointing a subdomain at the box
- The CI runner must not be disturbed — it runs on the same box

### Deploy

```bash
ssh games

# Clone or update
cd /opt
git clone https://github.com/lizTheDeveloper/multiverse_mages.git mm-play 2>/dev/null || \
  (cd mm-play && git pull)

cd mm-play

# Build and start
docker compose up -d --build

# Verify
curl -s http://localhost:8300/ui/app/ | head -3
```

### HTTPS with Caddy

If Caddy is already running on the box, add the game to its config:

```bash
cp deploy/Caddyfile /etc/caddy/conf.d/mages.conf
systemctl reload caddy
```

If Caddy is not installed:

```bash
apt install -y caddy
mkdir -p /etc/caddy/conf.d
echo 'import /etc/caddy/conf.d/*.conf' >> /etc/caddy/Caddyfile
cp deploy/Caddyfile /etc/caddy/conf.d/mages.conf
systemctl enable --now caddy
```

### What this does NOT do

- No multiplayer. Each browser tab gets its own universe in one server process.
- No persistence. Restarting the container resets the universe.
- No authentication. Anyone with the URL can play.
- No bubble matching, no portal targets, no raids against other players.

Those are `packages/server/` (v0.15.0) concerns. This is the single-player
playtest deployment.

## Multiplayer (Path C — future)

When `packages/server/` gets a WebSocket transport:

1. The browser connects directly to the authoritative server
2. Multiple universes run in one process, matched into bubbles
3. Portal events route between universes on the same server
4. Prestige and tier ladder persist to disk via `storage.ts`

The server code is 39/41 tasks complete. The 2 remaining are ops (this
document and pacing constants). The code is ready.
