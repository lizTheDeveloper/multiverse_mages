/*
 * Multiverse Mages — a tiny element builder that only ever sets text.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the LICENSE file at the repository root.
 */

/**
 * `h('div', {className: 'x', title: '…', onclick}, 'text', child, …)`.
 *
 * Strings become text nodes, never markup: names, ids and labels that arrive
 * from a server — or from another player's universe — cannot inject HTML. A
 * property is assigned as a property (so `textContent`, `title`, `disabled`,
 * `dataset` are safe); a key starting `on` binds a listener; `aria-*`, `role`
 * and `data-*` go through `setAttribute`.
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'role' || key.startsWith('aria-') || key.startsWith('data-')) {
      node.setAttribute(key, String(value));
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else {
      node[key] = value;
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Replaces a host's children. */
export function fill(host, ...children) {
  host.replaceChildren(...children.flat(Infinity).filter((c) => c !== undefined && c !== null && c !== false));
  return host;
}
