/*
 * Multiverse Mages — which universe this browser plays, kept so a crash cannot lose it.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The `{id, token}` pair that ties this browser to its universe.
 *
 * ## Why not localStorage alone
 *
 * Playtest round 3: after "new universe" → setup → Begin, reopening the browser
 * brought back the **old** universe (year 81). Reproduced with a persistent
 * Chromium profile: a localStorage write is committed to disk lazily, seconds
 * later, so a browser that is closed hard soon after Begin loses both the new
 * pair *and* the removal of the old one — and the old pair, flushed long ago,
 * comes back. An IndexedDB transaction that has completed survives the same
 * kill (measured: written, SIGKILL, reopened — IndexedDB kept it, localStorage
 * did not).
 *
 * So the pair is written to both, each stamped with when it was written, and
 * the newest wins on read. Universes this browser has *left* are remembered in
 * IndexedDB too, and a pair naming one of them is never resurrected, whichever
 * store still holds it.
 *
 * Nothing here goes in a URL: the token is what lets this browser act.
 */

const KEY = 'mm.universeId';
const TOKEN_KEY = 'mm.universeToken';
const AT_KEY = 'mm.universeAt';
const DB = 'mm.identity';
const STORE = 'kv';
const RETIRED_MAX = 64;

const storageOf = (name) => { try { return window[name]; } catch { return null; } };

function readStorage(storage) {
  try {
    const id = storage?.getItem(KEY);
    const token = storage?.getItem(TOKEN_KEY);
    if (!id || !token) return null;
    return { id, token, at: Number(storage.getItem(AT_KEY)) || 0 };
  } catch { return null; }
}

function writeStorage(storage, pair) {
  try {
    storage.setItem(KEY, pair.id);
    storage.setItem(TOKEN_KEY, pair.token);
    storage.setItem(AT_KEY, String(pair.at));
    return true;
  } catch { return false; }
}

function clearStorage(storage) {
  try { storage?.removeItem(KEY); storage?.removeItem(TOKEN_KEY); storage?.removeItem(AT_KEY); } catch { /* refused */ }
}

/** The database, or null when this browser refuses IndexedDB (some private windows). */
function openDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Runs `fn(store)` in one transaction and resolves when it has committed. */
async function tx(mode, fn) {
  const db = await openDb();
  if (db === null) return undefined;
  try {
    return await new Promise((resolve) => {
      let out;
      let t;
      try {
        t = db.transaction(STORE, mode, { durability: 'strict' });
      } catch {
        resolve(undefined);
        return;
      }
      const store = t.objectStore(STORE);
      fn(store, (v) => { out = v; });
      t.oncomplete = () => resolve(out ?? true);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    });
  } finally {
    db.close();
  }
}

async function readDb() {
  const out = await tx('readonly', (store, set) => {
    const acc = {};
    const a = store.get('identity');
    a.onsuccess = () => { acc.identity = a.result; set(acc); };
    const b = store.get('retired');
    b.onsuccess = () => { acc.retired = b.result; set(acc); };
  });
  if (out === undefined || out === true) return { identity: null, retired: [] };
  const identity = out.identity && typeof out.identity.id === 'string' && typeof out.identity.token === 'string'
    ? out.identity
    : null;
  return { identity, retired: Array.isArray(out.retired) ? out.retired.filter((x) => typeof x === 'string') : [] };
}

/**
 * The universe this browser plays, or null. `tabOnly` is true when only this
 * tab's sessionStorage holds it (storage refused), so the page can say so.
 */
export async function loadIdentity() {
  const { identity: fromDb, retired } = await readDb().catch(() => ({ identity: null, retired: [] }));
  const fromLocal = readStorage(storageOf('localStorage'));
  const fromSession = readStorage(storageOf('sessionStorage'));
  const left = new Set(retired);
  const candidates = [fromDb, fromLocal, fromSession]
    .filter((c) => c !== null && !left.has(c.id))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const best = candidates[0] ?? null;
  if (best === null) return null;
  // Keep the stores in step, so a stale one cannot win a later read.
  if (fromLocal === null || fromLocal.id !== best.id) writeStorage(storageOf('localStorage'), best);
  return { id: best.id, token: best.token, tabOnly: fromDb === null && fromLocal === null };
}

/**
 * Keeps `{id, token}` as this browser's universe. Resolves only once the
 * IndexedDB write has committed, so a caller that navigates afterwards cannot
 * outrun it. Returns false when nothing at all could be stored.
 */
export async function saveIdentity(id, token) {
  const pair = { id, token, at: Date.now() };
  const local = writeStorage(storageOf('localStorage'), pair);
  const tab = local || writeStorage(storageOf('sessionStorage'), pair);
  const db = await tx('readwrite', (store) => { store.put(pair, 'identity'); }).catch(() => undefined);
  return local || tab || db !== undefined;
}

/**
 * Forgets this browser's universe. With `retired`, also remembers that id as
 * one this browser has left, so no store that still holds it can bring it back.
 */
export async function forgetIdentity(retired) {
  clearStorage(storageOf('localStorage'));
  clearStorage(storageOf('sessionStorage'));
  await tx('readwrite', (store) => {
    store.delete('identity');
    if (typeof retired === 'string' && retired !== '') {
      const r = store.get('retired');
      r.onsuccess = () => {
        const list = Array.isArray(r.result) ? r.result.filter((x) => x !== retired) : [];
        list.push(retired);
        store.put(list.slice(-RETIRED_MAX), 'retired');
      };
    }
  }).catch(() => undefined);
}
