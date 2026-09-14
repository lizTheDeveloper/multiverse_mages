// Economy view component — material stocks, claimant flows, net balance.
// Values from the session are fixed-point at scale 1/1024.
const FP = 1024;
const fmt = (v) => (v / FP).toFixed(v / FP >= 100 ? 0 : 1);

const KIND_META = {
  food:    { label: 'Food',    hue: '#5C9A6B' },
  stone:   { label: 'Stone',   hue: '#9A7A5C' },
  vellum:  { label: 'Vellum',  hue: '#C9A84C' },
  labor:   { label: 'Labor',   hue: '#5B8EBF' },
  essence: { label: 'Essence', hue: '#8B6BAA' },
  insight: { label: 'Insight', hue: '#46A98D' },
  passage: { label: 'Passage', hue: '#7A6BAA' },
};
const KINDS = Object.keys(KIND_META);

// Track observed maxima across calls so bars scale to the run, not the tick.
const peakStock = Object.fromEntries(KINDS.map(k => [k, 1]));

export function renderEconomy(frame, container) {
  const flow = frame.raw.flow;
  const stocks = frame.raw.stocks;
  if (!flow || !stocks) {
    container.innerHTML = '<p style="font:italic 12px var(--serif);color:var(--soft);padding:1rem">No economy data at this tick</p>';
    return;
  }

  // Update peaks
  for (const k of KINDS) {
    if (stocks[k] > peakStock[k]) peakStock[k] = stocks[k];
  }

  let html = '';

  // --- 1. Material stocks ---
  html += '<div style="font:9.5px var(--mono);letter-spacing:.11em;text-transform:uppercase;color:var(--faint);margin-bottom:.35rem">Material Stocks</div>';
  for (const k of KINDS) {
    const level = stocks[k];
    const peak = peakStock[k];
    const pct = Math.min(100, (level / peak) * 100);
    const m = KIND_META[k];
    const net = (flow.faucet[k] || 0) - (flow.sink[k] || 0);
    const arrow = net > 0 ? '▲' : net < 0 ? '▼' : '';
    const netColor = net > 0 ? 'var(--ok)' : net < 0 ? 'var(--loss)' : 'var(--faint)';
    html += `<div style="display:grid;grid-template-columns:4.2rem 1fr 3rem 2.5rem;gap:.2rem;align-items:center;margin-bottom:3px;font:10px var(--mono)">
      <span style="color:${m.hue};text-transform:uppercase;letter-spacing:.04em;font-size:9px">${m.label}</span>
      <span style="height:5px;border-radius:2px;background:var(--sunk);overflow:hidden;position:relative">
        <i style="position:absolute;inset:0 auto 0 0;width:${pct}%;background:${m.hue};border-radius:2px;opacity:.8"></i>
      </span>
      <span style="text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)">${fmt(level)}</span>
      <span style="text-align:right;font-variant-numeric:tabular-nums;color:${netColor};font-size:9px">${arrow}${fmt(Math.abs(net))}</span>
    </div>`;
  }

  // --- 2. Claimant breakdown ---
  html += '<div style="font:9.5px var(--mono);letter-spacing:.11em;text-transform:uppercase;color:var(--faint);margin:.6rem 0 .35rem;padding-top:.4rem;border-top:1px solid var(--edge)">Consumption</div>';

  const claimants = flow.claimants || [];
  if (claimants.length === 0) {
    html += '<span style="font:10px var(--mono);color:var(--faint)">no claimants</span>';
  } else {
    for (const c of claimants) {
      const owedV = fmt(c.owed);
      const paidV = fmt(c.paid);
      const short = c.shortfall > 0;
      const kindM = KIND_META[c.kind] || { label: c.kind, hue: 'var(--soft)' };
      const barPct = c.owed > 0 ? Math.min(100, (c.paid / c.owed) * 100) : 100;
      html += `<div style="display:grid;grid-template-columns:6.5rem 3rem 1fr 3rem;gap:.2rem;align-items:center;margin-bottom:2px;font:9px var(--mono)">
        <span style="color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.claimant}">${c.claimant}</span>
        <span style="color:${kindM.hue};font-size:8px;letter-spacing:.04em;text-transform:uppercase">${kindM.label}</span>
        <span style="height:4px;border-radius:2px;background:var(--sunk);overflow:hidden;position:relative">
          <i style="position:absolute;inset:0 auto 0 0;width:${barPct}%;background:${short ? 'var(--loss)' : kindM.hue};border-radius:2px"></i>
        </span>
        <span style="text-align:right;font-variant-numeric:tabular-nums;color:${short ? 'var(--loss)' : 'var(--ink)'}">${paidV}${short ? '!' : ''}</span>
      </div>`;
    }
  }

  // --- 3. Flow summary ---
  html += '<div style="font:9.5px var(--mono);letter-spacing:.11em;text-transform:uppercase;color:var(--faint);margin:.6rem 0 .35rem;padding-top:.4rem;border-top:1px solid var(--edge)">Net Flow</div>';
  html += '<div style="display:grid;grid-template-columns:4.2rem repeat(2,1fr) 2.5rem;gap:.15rem;font:9px var(--mono);margin-bottom:.15rem">'
    + '<span></span><span style="color:var(--faint);text-align:right">in</span><span style="color:var(--faint);text-align:right">out</span><span style="color:var(--faint);text-align:right">net</span></div>';
  for (const k of KINDS) {
    const fIn = flow.faucet[k] || 0;
    const fOut = flow.sink[k] || 0;
    if (fIn === 0 && fOut === 0) continue;
    const net = fIn - fOut;
    const m = KIND_META[k];
    const netColor = net > 0 ? 'var(--ok)' : net < 0 ? 'var(--loss)' : 'var(--faint)';
    html += `<div style="display:grid;grid-template-columns:4.2rem repeat(2,1fr) 2.5rem;gap:.15rem;font:9px var(--mono);margin-bottom:1px">
      <span style="color:${m.hue};text-transform:uppercase;font-size:8px;letter-spacing:.04em">${m.label}</span>
      <span style="text-align:right;color:var(--ok);font-variant-numeric:tabular-nums">+${fmt(fIn)}</span>
      <span style="text-align:right;color:var(--loss);font-variant-numeric:tabular-nums">−${fmt(fOut)}</span>
      <span style="text-align:right;color:${netColor};font-variant-numeric:tabular-nums;font-weight:600">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</span>
    </div>`;
  }

  container.innerHTML = html;
}
