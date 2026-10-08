#!/usr/bin/env node
/*
 * Multiverse Mages — browser smoke check for every god action's target click.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Drives `ui/app/` in a real browser against a running lobby: founds a
 * universe through `setup.html`, then for every god action that takes a target
 * opens its candidate panel and clicks a target, and for the three edicts
 * (dispensation, interdiction, revoke) clicks the edict button on a cell.
 *
 * Each click must end in a visible answer — a success toast or a refusal toast
 * in words — and must raise no page error. Exit codes:
 *
 *   0  every click answered, no page error
 *   1  a page error, an error toast that reads like a crash, or a silent click
 *   2  the probe itself is broken (no lobby, no browser, the page never booted)
 *
 * Not in `npm run verify`: it needs a browser. Run it by hand:
 *
 *     node packages/lobby/bin/lobby.mjs --port 8370 --tick-ms 250 &
 *     npx -y -p playwright@1.57.0 node scripts/ui-smoke-actions.mjs --port 8370
 *
 * `--headed` shows the browser. The tick is deliberately shorter than the
 * page's 1 s poll: a page that is several frames behind the server when it
 * submits is the case that broke (`Cannot read properties of undefined
 * (reading 'obs')`), and a slow lobby hides it.
 */

/* global window, document, MutationObserver -- read only inside page.evaluate callbacks, which run in the browser. */

import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const port = Number(flag('port', '8370'));
const headed = args.includes('--headed');
// How long the second pass waits for an action to become legal.
const patienceMs = Number(flag('patience', '120')) * 1000;
const base = `http://localhost:${port}`;

const broken = (msg) => {
  console.error(`probe broken: ${msg}`);
  process.exit(2);
};

/* `import('playwright')` when it is installed; otherwise the package that
   `npx -p playwright@…` put on PATH. The repo takes no dependency on it. */
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      if (!dir.endsWith(path.join('node_modules', '.bin'))) continue;
      const pkg = path.join(dir, '..', 'playwright', 'package.json');
      if (existsSync(pkg)) return createRequire(pkg)('playwright');
    }
  }
  return broken('playwright not found — run under `npx -y -p playwright@1.57.0 node …`');
}

// An error toast that is a stack fragment rather than a sentence for a player.
const CRASH = /Cannot read|undefined|is not a function|TypeError|ReferenceError|\bnull\b/u;

const { chromium } = await loadPlaywright();

try {
  const res = await fetch(`${base}/api/bubbles`);
  if (!res.ok) broken(`lobby at ${base} answered ${res.status}`);
} catch (e) {
  broken(`no lobby at ${base} (${e.message})`);
}

/* Playwright pins a browser build; a machine may have a different one cached.
   `--executable PATH` names one; otherwise the newest cached build is tried. */
function cachedChromium() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const shells = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
    for (const d of shells) {
      for (const sub of readdirSync(path.join(root, d))) {
        const exe = path.join(root, d, sub, 'chrome-headless-shell');
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}
async function launch() {
  const explicit = flag('executable', undefined);
  if (explicit) return chromium.launch({ headless: !headed, executablePath: explicit });
  try {
    return await chromium.launch({ headless: !headed });
  } catch (e) {
    const exe = headed ? undefined : cachedChromium();
    if (exe === undefined) broken(`no browser: ${e.message.split('\n')[0]}`);
    return chromium.launch({ headless: true, executablePath: exe });
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.stack ?? String(e)));

const results = [];
let failed = false;
const fail = (row) => {
  failed = true;
  results.push({ ...row, verdict: 'FAIL' });
};

try {
  await page.goto(`${base}/ui/app/setup.html`);
  // The setup screen's defaults pick techniques and forms; a species is the
  // one choice it leaves to the player.
  await page.click('.species-card');
  await page.click('#begin-btn');
  await page.waitForURL((u) => !u.pathname.endsWith('setup.html'), { timeout: 30_000 });
  await page.waitForSelector('#god-actions .god-action', { timeout: 60_000 });
} catch (e) {
  await browser.close();
  broken(`the game page never booted: ${e.message}`);
}

/* A bubble-mate, so a portal and an invitation have someone to point at. Made
   over the API: it is a second player, not this page. */
await fetch(`${base}/api/create`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ species: 'elf', tradition: 'true-naming', techniques: ['creo'], forms: ['ignem'] }),
}).catch(() => {});

// Every toast the page shows, in order — they fade, so they are recorded.
await page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.classList?.contains('toast')) window.__toasts.push({ text: n.textContent, error: n.classList.contains('error') });
    }
  }).observe(document.getElementById('toast-container'), { childList: true });
});

const toastCount = () => page.evaluate(() => window.__toasts.length);
const toastsSince = (n) => page.evaluate((k) => window.__toasts.slice(k), n);

/* One god action a month: wait until the page is not holding its controls and
   the clock has moved, so each click is judged on its own. */
/** Thrown when the universe reaches an ending: a real outcome, not a defect. */
class Ended extends Error {}
const hasEnded = () => page.evaluate(() => document.getElementById('end-overlay')?.hidden === false);
async function settle() {
  if (await hasEnded()) throw new Ended('the universe ended');
  await page.waitForFunction(() => !document.body.classList.contains('held'), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

/** The world tick the page is showing, read off the topbar's year title. */
const shownTick = () =>
  page.evaluate(() => Number(/tick (\d+)/u.exec(document.getElementById('tick-val')?.title ?? '')?.[1] ?? NaN));

/**
 * Clicks, then judges the page's answer. A click must raise no page error,
 * produce a toast, and leave the clock running: the year counter froze after
 * a submit in two of three reports, while the server ran on. `expectSuccess`
 * is set when the action was legal at the moment of the click, and then the
 * toast must be the success one, not only an error.
 */
async function judge(label, click, { expectSuccess }) {
  const errorsBefore = pageErrors.length;
  const before = await toastCount();
  await click();
  let toasts = [];
  for (let waited = 0; waited < 8000; waited += 200) {
    await page.waitForTimeout(200);
    toasts = await toastsSince(before);
    if (toasts.length > 0) break;
  }
  await page.waitForTimeout(1500); // a crash in the repaint after the answer
  toasts = await toastsSince(before);
  const tickAfter = await shownTick();
  let moved = false;
  for (let waited = 0; waited < 8000 && !moved; waited += 250) {
    await page.waitForTimeout(250);
    moved = (await shownTick()) > tickAfter;
  }
  const errors = pageErrors.slice(errorsBefore);
  const crashToast = toasts.find((t) => t.error && CRASH.test(t.text));
  const success = toasts.find((t) => !t.error);
  const row = { action: label, toasts: toasts.map((t) => `${t.error ? '[!] ' : ''}${t.text}`) };
  if (errors.length > 0) fail({ ...row, why: `page error: ${errors[0].split('\n').slice(0, 3).join(' | ')}` });
  else if (crashToast) fail({ ...row, why: `crash text in toast: ${crashToast.text}` });
  else if (toasts.length === 0) fail({ ...row, why: 'no feedback at all' });
  else if (expectSuccess && success === undefined) fail({ ...row, why: 'legal when clicked, but no success toast' });
  else if (!moved && !(await hasEnded())) fail({ ...row, why: `the page's clock stopped at tick ${String(tickAfter)} after the click` });
  else results.push({ ...row, verdict: 'ok', why: expectSuccess ? 'admitted, clock running' : 'refused in words, clock running' });
}

const isLegal = (aid) =>
  page.evaluate((id) => document.querySelector(`.god-action[data-action-id="${id}"]`)?.dataset.state === 'legal', aid);

/**
 * Opens action `aid` and clicks its first target. Waits up to `waitMs` for the
 * action to be legal, so the click reaches the server and not the page's own
 * "not available". When `orRefusal` is set and it never became legal, clicks
 * anyway: a refusal in words is still an answer. Returns false when the click
 * was deferred or there was nothing to click.
 */
async function target(aid, waitMs, orRefusal) {
  await settle();
  await page
    .waitForFunction((id) => document.querySelector(`.god-action[data-action-id="${id}"]`)?.dataset.state === 'legal', aid, { timeout: waitMs })
    .catch(() => {});
  if (await hasEnded()) throw new Ended('the universe ended');
  const legal = await isLegal(aid);
  if (!legal && !orRefusal) return false;
  const label = await page.locator(`.god-action[data-action-id="${aid}"] span`).first().textContent();
  await page.click(`.god-action[data-action-id="${aid}"]`);
  await page.waitForTimeout(300);
  const items = page.locator('#cell-detail .cand-item');
  if ((await items.count()) === 0) return false;
  await judge(`${aid} ${label}`, () => items.first().click(), { expectSuccess: legal });
  return true;
}

let endedEarly = false;
try {
  // Actions 8–16 that open a candidate panel. 15 has no targets — it fires from
  // its own button and is only legal at the end of a game.
  const deferred = [];
  for (const aid of [9, 10, 11, 12, 8, 13, 14, 16]) {
    if (!(await target(aid, 20_000, false))) deferred.push(aid);
  }
  // Edicts on a cell: walk the grid until each verb is on offer and enabled.
  for (const want of [5, 6, 7]) {
    await settle();
    const cells = page.locator('#grid70 span.c');
    const n = await cells.count();
    let done = false;
    for (let i = 0; i < n && !done; i++) {
      await cells.nth(i).click();
      const btn = page.locator(`#cell-edicts .edict-btn[data-action="${want}"]:not([disabled])`);
      if ((await btn.count()) === 0) continue;
      await judge(`${want} ${(await btn.first().textContent())?.trim()}`, () => btn.first().click(), { expectSuccess: true });
      done = true;
    }
    if (!done) results.push({ action: `${want} edict`, verdict: 'skip', why: 'no cell offers it enabled' });
  }

  /* A portal from the Raids tab must end in a card — a raid report, or "No raid
     opened" — after the panel's few polls. The submit's repaint threw before the
     panel could record the portal as pending, so the card never came. */
  {
    await settle();
    await page.click('#raids-tab');
    const go = page.locator('#raids-host .raid-go:not([disabled])');
    await go.first().waitFor({ timeout: 10_000 }).catch(() => {});
    if ((await go.count()) === 0) {
      results.push({ action: '14 portal from the Raids tab', verdict: 'skip', why: 'no seat open to raid' });
    } else {
      const cardsBefore = await page.locator('#raid-reports .raid-card').count();
      await judge('14 portal from the Raids tab', () => go.first().click(), { expectSuccess: true });
      const card = await page
        .waitForFunction((k) => document.querySelectorAll('#raid-reports .raid-card').length > k, cardsBefore, { timeout: 20_000 })
        .then(() => true, () => false);
      if (!card) fail({ action: '14 portal from the Raids tab', why: 'no raid report and no "No raid opened" card' });
    }
  }

  await page.click('.topbar .tab[data-tab="grid"]');
  // A second, patient pass: change tradition, for one, costs more favor than a
  // young universe has.
  for (const aid of deferred) {
    if (!(await target(aid, patienceMs, true))) results.push({ action: `${aid}`, verdict: 'skip', why: 'no targets offered within the wait' });
  }
} catch (e) {
  if (!(e instanceof Ended)) {
    for (const r of results) console.log(`${r.verdict.padEnd(4)}  ${r.action}${r.why ? `  — ${r.why}` : ''}`);
    await browser.close();
    broken(`the probe threw: ${e.message.split('\n').slice(0, 12).join('\n')}`);
  }
  endedEarly = true;
}

await browser.close();

for (const r of results) {
  console.log(`${r.verdict.padEnd(4)}  ${r.action}${r.why ? `  — ${r.why}` : ''}`);
  for (const t of r.toasts ?? []) console.log(`        toast: ${t}`);
}
if (pageErrors.length > 0) {
  console.log('\npage errors:');
  for (const e of pageErrors) console.log(e);
}
if (endedEarly) console.log('\nthe universe reached an ending before every action was tried; the rest were not judged');
const judged = results.filter((r) => r.verdict !== 'skip').length;
if (judged === 0) broken('no action could be clicked — every one was skipped');
process.exit(failed || pageErrors.length > 0 ? 1 : 0);
