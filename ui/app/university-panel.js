/**
 * University detail component.
 * Renders academy state from the §4.4 academy sidecar.
 * `renderUniversity(frame, container, content)` — call per tick.
 */

export function renderUniversity(frame, container, content) {
  const acad = frame.academy();
  const inst = frame.institutions();
  if (!acad) {
    container.innerHTML = `<div class="sb-section"><div class="sb-head">Academy</div>
      <div style="font:italic 11px var(--serif);color:var(--soft)">No academy data this tick</div></div>`;
    return;
  }

  const species = content.species;
  const roles = content.mageRoles;
  const goals = content.goals;
  const nodes = content.nodes;

  let html = '';

  // Per-university cards
  for (const handle of acad.handles) {
    const u = acad.university(handle);
    if (!u) continue;
    const c = u.college;
    const complete = c.buildProgress >= 1024;
    const pct = Math.min(100, (c.buildProgress / 1024) * 100);

    html += `<div class="uni-card">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:baseline">`;
    html += `<span style="font:italic 13px var(--serif);color:var(--ink)">Academy #${handle & 0xFFFF}</span>`;
    html += `<span style="font:9px var(--mono);color:var(--faint)">${complete ? 'COMPLETE' : `${pct.toFixed(0)}%`}</span>`;
    html += `</div>`;

    if (!complete) {
      html += `<div style="height:3px;background:var(--sunk);border-radius:2px;margin:.3rem 0;overflow:hidden">`;
      html += `<div style="width:${pct}%;height:100%;background:var(--god);border-radius:2px"></div></div>`;
    }

    // Stats grid
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px .5rem;margin-top:.3rem;font:10px var(--mono)">`;
    html += `<span style="color:var(--faint)">capacity</span><span style="color:var(--ink);text-align:right">${c.capacity}</span>`;
    html += `<span style="color:var(--faint)">affiliated</span><span style="color:var(--ink);text-align:right">${c.affiliatedMages}</span>`;
    html += `<span style="color:var(--faint)">staff</span><span style="color:var(--ink);text-align:right">${c.staffCohorts} cohorts</span>`;
    html += `<span style="color:var(--faint)">library</span><span style="color:var(--ink);text-align:right">${c.libraryNodes} nodes</span>`;
    html += `<span style="color:var(--faint)">grimoires</span><span style="color:var(--ink);text-align:right">${inst.grimoires}</span>`;
    html += `</div>`;

    // Roster — mages grouped by role
    if (u.roster && u.roster.length > 0) {
      const byRole = {};
      for (const entry of u.roster) {
        const m = acad.mage(entry.handle);
        if (!m) continue;
        const role = roles[m.roleId] || 'unknown';
        if (!byRole[role]) byRole[role] = [];
        byRole[role].push({ ...m, knownNodes: entry.nodeIds });
      }

      html += `<div style="margin-top:.4rem;border-top:1px solid var(--edge);padding-top:.3rem">`;
      html += `<div style="font:9px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:.2rem">Roster</div>`;

      for (const [role, mages] of Object.entries(byRole)) {
        html += `<div style="font:9px var(--mono);color:var(--god);margin:.25rem 0 .1rem;text-transform:uppercase;letter-spacing:.08em">${role} (${mages.length})</div>`;
        for (const m of mages) {
          const sp = species[m.speciesId] || `sp${m.speciesId}`;
          const ageYears = Math.floor(m.ageTicks / 12);
          const goalName = goals[m.goal?.goalId] || 'idle';
          const targetNode = m.goal?.targetNodeId != null ? nodes[m.goal.targetNodeId] : null;
          const targetStr = targetNode ? targetNode.name || targetNode.id : '';

          html += `<div style="display:grid;grid-template-columns:1fr auto;gap:.15rem;padding:.15rem 0;border-bottom:1px solid color-mix(in srgb,var(--edge) 50%,transparent);font:10px var(--mono)">`;
          html += `<div>`;
          html += `<span style="color:var(--ink)">${sp}</span> `;
          html += `<span style="color:var(--faint)">${ageYears}y · ${m.nodesKnown} nodes</span>`;
          if (goalName !== 'idle') {
            html += `<div style="font:italic 9px var(--serif);color:var(--soft);margin-top:1px">${goalName}${targetStr ? ': ' + targetStr : ''}</div>`;
          }
          html += `</div>`;
          html += `<span style="font:8px var(--mono);color:var(--faint);align-self:start">t${m.deepestTier}</span>`;
          html += `</div>`;
        }
      }
      html += `</div>`;
    }

    // Unaffiliated
    if (acad.unaffiliated > 0) {
      html += `<div style="font:10px var(--mono);color:var(--warn);margin-top:.3rem">${acad.unaffiliated} unaffiliated mage${acad.unaffiliated > 1 ? 's' : ''}</div>`;
    }

    html += `</div>`;
  }

  container.innerHTML = html;
}
