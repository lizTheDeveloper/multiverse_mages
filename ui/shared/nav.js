/*
 * Multiverse Mages — the bar that says where else there is.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Fourteen surfaces served 200 from the play server and nothing linked to any
 * of them: `ui/play/` had no navigation at all and `ui/console/` had one
 * unlabelled `../`. Measured 2026-08-15 on `origin/main` at ad7f80c2 — every
 * route rendered, none was reachable by clicking. A prototype nobody can get to
 * is a prototype nobody reads.
 *
 * One list, defined once. A page that grows a new surface adds a row here and
 * every other page gains the link.
 */

/**
 * Every surface, in the order the README argues them: the two that answer what
 * magic *is*, then the verbs, then the things you look at, then the two
 * composites. `href` is relative to `ui/`.
 */
export const SURFACES = [
  { href: 'play/', label: 'play', hint: 'sit down and play the universe', group: 'live' },
  { href: 'console/', label: 'console', hint: 'every pane, one clock', group: 'live' },

  { href: 'ruleset/', label: 'ruleset', hint: 'what magic is possible at all', group: 'rules' },
  { href: 'ruleset-symmetry/', label: 'symmetry', hint: 'the ruleset read as a ledger', group: 'rules' },
  { href: 'edicts/', label: 'edicts', hint: 'eight exceptions to your own policy', group: 'rules' },

  { href: 'targets/', label: 'targets', hint: 'choosing who', group: 'verbs' },
  { href: 'commitments/', label: 'commitments', hint: 'verbs that pay out later', group: 'verbs' },
  { href: 'ascension/', label: 'ascension', hint: 'the ending you have to choose', group: 'verbs' },
  { href: 'raid/', label: 'raid', hint: 'muster, contact, resolution', group: 'verbs' },

  { href: 'mage/', label: 'mage', hint: 'one mage, and why she chose it', group: 'look' },
  { href: 'knowledge/', label: 'knowledge', hint: 'where the knowledge is', group: 'look' },
  { href: 'tempo/', label: 'tempo', hint: 'pacing, and what may interrupt', group: 'look' },
  { href: 'glow/', label: 'glow', hint: 'the light rule', group: 'look' },

  { href: 'design-dashboard/', label: 'dashboard', hint: 'the state of the design', group: 'meta' },
  { href: '', label: 'index', hint: 'all fourteen, with what each answers', group: 'meta' },
];

/*
 * No dark-mode override in here on purpose.
 *
 * `--god` is the god's cyan in both themes and is the one token that stays
 * legible in both: measured on the play page, #0B4B51 on the vellum ground and
 * #12B8C6 on the dark one, the latter at 8.07:1. The first cut swapped in
 * `--god-deep` under dark and measured 2.2:1 — the opposite of what the swap
 * was for.
 *
 * Keep CSS comments out of the template literal below: a backtick inside it
 * closes the string, and the file then fails to parse with a message about
 * postfix operators that says nothing about backticks.
 */
const CSS = `
.mm-nav{display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .1rem;
  margin:0 0 1.1rem;padding:.35rem .1rem .5rem;font-size:.78rem;
  border-bottom:1px solid var(--line,currentColor);line-height:1.6}
.mm-nav a{color:inherit;text-decoration:none;padding:.12rem .42rem;border-radius:3px;
  opacity:.62;white-space:nowrap;border:1px solid transparent}
.mm-nav a:hover{opacity:1;border-color:var(--edge,currentColor)}
.mm-nav a:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.mm-nav a[aria-current=page]{opacity:1;font-weight:600;
  border-color:var(--god,currentColor);color:var(--god,inherit)}
.mm-nav .mm-nav-sep{opacity:.3;padding:0 .3rem;user-select:none}
.mm-nav .mm-nav-home{font-weight:600;opacity:.85;letter-spacing:.02em;padding-right:.5rem}
`;

/**
 * Which surface this page is, from its own URL. Returns the `href` of the
 * matching row, or `null` when the page is served from somewhere unexpected —
 * in which case nothing is marked current, rather than the wrong thing.
 */
export function currentSurface(pathname = window.location.pathname) {
  const path = pathname.replace(/index\.html$/, '');
  const match = /\/ui\/([^/]*\/)?$/.exec(path);
  if (!match) return null;
  const here = match[1] ?? '';
  return SURFACES.some((s) => s.href === here) ? here : null;
}

/**
 * Put the bar at the top of the document.
 *
 * `base` is the path from this page back to `ui/` — every prototype lives one
 * directory down, so the default is right for all of them and `ui/index.html`
 * passes `'./'`.
 */
export function mountNav({ base = '../', host = null } = {}) {
  if (document.querySelector('.mm-nav')) return null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const nav = document.createElement('nav');
  nav.className = 'mm-nav';
  nav.setAttribute('aria-label', 'Interface prototypes');

  const here = currentSurface();
  let previousGroup = null;
  for (const surface of SURFACES) {
    if (previousGroup !== null && surface.group !== previousGroup) {
      const sep = document.createElement('span');
      sep.className = 'mm-nav-sep';
      sep.textContent = '·';
      sep.setAttribute('aria-hidden', 'true');
      nav.append(sep);
    }
    previousGroup = surface.group;

    const a = document.createElement('a');
    a.href = base + surface.href;
    a.textContent = surface.label;
    a.title = surface.hint;
    if (here !== null && surface.href === here) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }

  const target = host ?? document.body;
  target.prepend(nav);
  return nav;
}
