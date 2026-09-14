// God actions component — tiered intervention buttons.
// Copyright (C) 2026 Ann Kelner. AGPL-3.0-or-later.

const COSTS = {
  5: 6144, 6: 6144, 7: 2048, 8: 12288, 9: 2048,
  10: 256, 11: 3072, 12: 1024, 13: 65536, 14: 16384, 15: 0, 16: 24576,
};

const TIERS = [
  { label: 'Clerical', ids: [10, 11, 12] },
  { label: 'Consequential', ids: [8, 9, 16] },
  { label: 'Edicts', ids: [5, 6, 7] },
  { label: 'Terminal', ids: [13, 15] },
];

const NAMES = {
  5: 'Dispensation', 6: 'Interdiction', 7: 'Revoke Edict',
  8: 'Grant Knowledge', 9: 'Bless Mage', 10: 'Assign Role',
  11: 'Fund University', 12: 'Encourage Research', 13: 'Change Tradition',
  14: 'Open Portal', 15: 'Declare Ascension', 16: 'Invite Scholar',
};

const GLOSS = {
  8: 'Introduce a body of magic nobody knows',
  9: 'Boost research, teaching, lifespan',
  10: 'Researcher · Warden · Professor · Raider',
  11: 'Advance construction or found a new one',
  12: 'Per-cell research emphasis, decays',
  13: 'Ruinous. Costs 65,536 favor.',
  14: 'Open a portal to another universe',
  15: 'End the run gloriously',
  16: 'Recruit a foreign scholar',
  5: 'Permit one cell whose axis is forbidden',
  6: 'Forbid one cell whose axes are permitted',
  7: 'Free an edict slot',
};

export function renderGodActions(frame, container, onAction) {
  const actions = frame.actions();
  const favor = frame.resources().favor;
  const cands = frame.raw.candidates || {};
  let html = '';

  for (const tier of TIERS) {
    html += `<div class="sb-head">${tier.label}</div>`;
    html += '<div class="god-tier">';
    for (const id of tier.ids) {
      const a = actions[id];
      const cost = COSTS[id] || 0;
      const legal = a?.legal ?? 0;
      const affordable = favor >= cost;
      const targets = cands[String(id)];
      const count = Array.isArray(targets) ? targets.length : null;

      let stateClass;
      if (legal && affordable) { stateClass = 'god-legal'; }
      else if (!legal && affordable) { stateClass = 'god-masked'; }
      else if (!affordable) { stateClass = 'god-poor'; }
      else { stateClass = 'god-masked'; }

      html += `<button class="god-btn ${stateClass}" data-action="${id}" title="${GLOSS[id] || ''}">`;
      html += `<span class="god-name">${NAMES[id] || a?.name || id}</span>`;
      if (cost > 0) html += `<span class="god-cost">${cost}</span>`;
      if (count !== null && count > 0) html += `<span class="god-targets">${count}</span>`;
      html += '</button>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
  container.querySelectorAll('.god-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.action);
      if (btn.classList.contains('god-legal') && onAction) onAction(id);
    });
  });
}

export const GOD_ACTIONS_CSS = `
.god-tier { display: flex; flex-direction: column; gap: 2px; margin-bottom: .4rem; }
.god-btn {
  display: flex; align-items: center; gap: .3rem;
  padding: .25rem .4rem; border-radius: 3px; cursor: pointer;
  border: 1px solid var(--edge); background: var(--panel);
  font: 10px var(--mono); color: var(--soft);
  transition: all 120ms ease; text-align: left;
}
.god-btn:hover { border-color: var(--god); }
.god-btn:focus-visible { outline: 2px solid var(--god); outline-offset: 1px; }
.god-btn.god-legal {
  border-color: var(--ctl-charged-border);
  color: var(--ctl-charged-fg);
  background: var(--ctl-charged-bg);
  box-shadow: var(--glow-soft);
}
.god-btn.god-poor { opacity: .5; cursor: default; }
.god-btn.god-masked { opacity: .3; cursor: default; }
.god-name { flex: 1; }
.god-cost { font-size: 9px; color: var(--faint); letter-spacing: .04em; }
.god-btn.god-legal .god-cost { color: var(--ctl-charged-fg); opacity: .6; }
.god-targets {
  font-size: 8px; font-weight: 700; min-width: 14px; text-align: center;
  padding: 1px 3px; border-radius: 2px;
  background: var(--sunk); color: var(--ink);
}
.god-btn.god-legal .god-targets { background: var(--god); color: var(--ground); }
`;
