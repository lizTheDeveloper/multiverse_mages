/*
 * Multiverse Mages — the theme control.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Three states, because the viewer has three: an explicit light or dark choice
 * stamps `data-theme` on the root element, and "system" stamps nothing so that
 * `prefers-color-scheme` decides. Anything that stamps a default on load —
 * reading the media query and writing the answer back — destroys the third
 * state, and the page stops following the OS when the OS changes.
 *
 * The choice is remembered per browser, not per prototype, so moving between
 * the eleven does not keep asking.
 */

const KEY = 'mm-ui-theme';
const MODES = ['light', 'system', 'dark'];

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.includes(v) ? v : 'system';
  } catch {
    return 'system';           // private mode, or storage disabled
  }
};

const apply = (mode) => {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
};

/** The resolved theme right now, whatever route it came by. */
export const resolved = () => {
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped === 'light' || stamped === 'dark') return stamped;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Mount the control into `host`. Returns an unsubscribe for `onChange`, which
 * fires on an explicit switch and on an OS change while in system mode — the
 * second is what a page measuring its own contrast needs, and it is easy to
 * forget because it never fires while you are clicking the buttons.
 */
export function mountThemeControl(host, onChange) {
  let mode = read();
  apply(mode);

  const el = document.createElement('div');
  el.className = 'mm-theme';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Theme');

  const buttons = MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m;
    b.setAttribute('aria-pressed', String(m === mode));
    b.addEventListener('click', () => {
      mode = m;
      try { localStorage.setItem(KEY, m); } catch { /* not fatal */ }
      apply(mode);
      buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(MODES[i] === mode)));
      onChange?.(resolved());
    });
    el.append(b);
    return b;
  });

  host.append(el);

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => { if (mode === 'system') onChange?.(resolved()); };
  mq.addEventListener('change', onSystem);
  return () => mq.removeEventListener('change', onSystem);
}

/**
 * Put the control in the top-right of a page that has no obvious home for it.
 * Prototypes with a toolbar should mount it there instead and skip this.
 */
export function floatThemeControl(onChange) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:.7rem;right:.8rem;z-index:50';
  document.body.append(host);
  return mountThemeControl(host, onChange);
}
