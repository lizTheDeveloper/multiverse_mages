// Prints the per-strategy founding table for the reference universe.
// Usage: node tools/w119/founding-table.mjs [worldTickCap]
import { auditFounding, formatFounding, formatAudit } from '../../packages/scenario/dist/index.js';

const cap = Number(process.argv[2] ?? 600);
const audits = auditFounding({ worldTickCap: cap });
console.log(`# founding table — reference universe, ${cap} world ticks\n`);
console.log(formatFounding(audits));
console.log('\n# action 11 rows from the shadowing audit\n');
console.log(
  formatAudit(
    audits.map((audit) => ({ ...audit, verbs: audit.verbs.filter((verb) => verb.action === 11) })),
  ),
);
