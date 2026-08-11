# Error tracking

What is captured, what is deliberately not, and — for now — why nothing is wired up yet.

## Nothing in this repository can report errors, and that is not an oversight

There is no server, no browser client, and no background job here. Every package is either
rules-path code or host-side tooling:

```
agent-api    (none)          rules-magic  (none)
content      (none)          rules-raid   (none)
mc-harness   (none)          rules-world  (none)
primitives   @mm/content, @mm/sim-core    sim-core     (none)
state        (none)
```

Those are the complete runtime dependency lists. The only entries are internal workspace links.

An error-reporting SDK could not be added to the rules path even if there were something to report:

- **It would fail CI.** `npm run check:purity` asserts that `@mm/sim-core` and the rules packages
  carry no runtime dependencies, and it is part of `npm run verify`, which is a required status
  check on `main`. Adding `@sentry/node` to a rules package is rejected before review.
- **It would break determinism.** Every Sentry-compatible SDK reads the wall clock and generates
  random event and trace ids. Constraint 1 in CLAUDE.md forbids `Date.now()` and `Math.random()` in
  the rules path, and constraint 2 forbids I/O. A network call to an error backend is both.

So the SDK attaches at the **host boundary** — the process that owns the clock, the socket and the
user — and never inside `step(state, actions, rng) -> state`. That boundary does not exist yet.

## Where each surface attaches

Mapped to `docs/design/vision.md` §11, so this stays traceable rather than speculative:

| Surface | Attaches at | Change | Notes |
|---|---|---|---|
| **Background jobs** | `@mm/mc-harness` worker pool | 0.5.0 `agent-interface` | The nearest real surface, and the one that fails silently — nobody watches a Monte Carlo sweep. A dead worker looks exactly like a slow one. |
| **Client / browser** | `electron-client` shell + renderer | 0.13.0 `electron-client` | Separate DSN from the server: a renderer crash on a player's machine has a completely different noise profile. |
| **Server** | `pvp-server` process | 0.15.0 `pvp-server` | Also the point at which an availability target stops being hypothetical. |

The harness is first for a reason worth stating: it is the only one of the three where a failure
produces *no signal at all today*. A crashed server gets noticed; a balance sweep that silently
stopped producing results just looks like it is still running.

## What a captured event contains

Not a sketch — the SDK was run for real against a synthetic failure carrying every category the
brief excludes, and the envelope was intercepted in-process. **Twelve** distinct secrets were
planted; the scrubber below removes all twelve.

Removed, and how:

| Removed | Mechanism |
|---|---|
| `Authorization` header, cookies, `x-api-key` | key denylist, at any nesting depth |
| Local variables per stack frame (`frame.vars`) | dropped wholesale — on an auth path these *are* the credential |
| Request bodies, query strings | dropped wholesale, not filtered per route |
| `server_name` (machine hostname) | deleted |
| User email, username, IP | reduced to an opaque `id` |
| Stripe/OpenAI/GitHub/Slack tokens, JWTs, `Bearer` values | value patterns |
| Session tokens, card numbers, long high-entropy strings | value patterns |
| IPv4 addresses | value patterns |

Kept, because it is what makes an event worth having: exception type and message, stack frames with
file/function/line, release, environment, tags such as `universe_id`, and simulation breadcrumbs
like `step() advanced tick 41207, rng stream=raid`.

Three of those rules exist **only because the event was captured for real.** The first draft of the
scrubber passed inspection and still leaked an opaque session token in an error message and a card
number nested inside a breadcrumb body — neither matched any vendor prefix, and neither would have
appeared in a hand-written example of "what an event looks like". That is the argument for
generating this preview from the actual SDK rather than describing it.

### The scrubber

Runs as `beforeSend`. Denylist for structural fields, plus a pattern scan over every remaining
string, because the dangerous secret is usually the one interpolated into an error message rather
than the one sitting in a header.

```js
const DENY_KEYS = new Set([
  'authorization', 'proxy-authorization', 'www-authenticate',
  'cookie', 'cookies', 'set-cookie',
  'x-api-key', 'x-auth-token', 'x-csrf-token', 'x-session-id',
  'password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token',
  'api_key', 'apikey', 'private_key', 'client_secret', 'session',
  'dsn', 'sentry_dsn', 'glitchtip_dsn',
  'email', 'email_address', 'phone', 'phone_number',
  'ip', 'ip_address', 'remote_addr',
  'card', 'card_number', 'credit_card', 'pan', 'cvv', 'cvc', 'ssn',
  'body', 'payload', 'request_body',
]);

const VALUE_PATTERNS = [
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g,            'sk-[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g,              'gh_[redacted]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g,            'xox-[redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{10,}=*/gi,      'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,        '[redacted-email]'],
  [/\bhttps?:\/\/[^:@\s/]+:[^@\s/]+@/g,          'https://[redacted-credentials]@'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,               '[redacted-ip]'],
  [/\b(?:sess|sid|tok|key|secret|auth)_[A-Za-z0-9]{8,}/gi, '[redacted-token]'],
  [/\b\d{13,19}\b/g,                             '[redacted-digits]'],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[redacted-opaque]'],
];
```

Applied recursively, with `frame.vars` deleted, `request.data`/`cookies` deleted,
`request.query_string` redacted, `server_name` deleted, and `user` reduced to `{ id }`.

**Re-verify the twelve after any edit to this list.** A scrubber is only as good as its last test,
and the failure mode is silent — a leak looks exactly like a clean event until someone reads it.

## The DSN is an environment variable, never a commit

A GlitchTip DSN embeds the GlitchTip host URL, so committing one publishes a private endpoint to a
public repository — the same disclosure class that keeps IPs and ports out of
`docs/devops/ci-and-deploy.md`. It is also a write key.

Read it from `GLITCHTIP_DSN` at process start. If unset, the SDK must **not** initialise, and the
process must run normally without it. Telemetry that can prevent a service from booting has made
availability worse, not better.

## No GlitchTip project has been created

GlitchTip currently holds six projects under `Multiverse Studios`, all shipped games, none for this
repository. Creating a `multiverse-mages` project now would produce a dashboard reading "no errors"
that actually means "nothing is wired up" — the same trap as a staging deploy that reports success
having deployed nothing.

The project gets created when the first surface ships, which by the table above is `mc-harness` at
0.5.0.

## What this file cannot yet tell you

The honest gap: **the first real error.** Wiring telemetry usually surfaces a bug that was already
there, and that moment is where the value becomes obvious. Nothing here runs as a service, so there
is no first error to report. Expect one within a day of the harness landing.
