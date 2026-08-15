const { execSync } = require('child_process');
const SEP = '@@F@@', REC = '@@R@@';
const raw = execSync("git log --format='" + REC + "%s" + SEP + "%ad" + SEP + "%b' --date=short", { maxBuffer: 1e8 }).toString();
const recs = raw.split(REC).slice(1);
function verOf(s) {
  let m = s.match(/\(v(\d+(?:\.\d+)+)\)\s*$/); if (m) return { v: m[1], t: s.slice(0, m.index).trim() };
  m = s.match(/^v(\d+(?:\.\d+)+)\s*(?:—|–|-|:)\s*(.+)$/); if (m) return { v: m[1], t: m[2].trim() };
  return null;
}
const out = [];
for (const r of recs) {
  const parts = r.split(SEP);
  const subj = (parts[0] || '').trim(), date = (parts[1] || '').trim(), body = parts[2] || '';
  const p = verOf(subj); if (!p) continue;
  const lines = body.split('\n');
  const items = []; let cur = null; const prose = [];
  for (const ln of lines) {
    if (/^(Co-Authored-By|Claude-Session|Generated with|🤖)/i.test(ln.trim())) break;
    const b = ln.match(/^\s*[-*•]\s+(.*)$/);
    if (b) { if (cur) items.push(cur); cur = b[1].trim(); }
    else if (cur !== null) { if (ln.trim() === '') { items.push(cur); cur = null; } else cur += ' ' + ln.trim(); }
    else prose.push(ln);
  }
  if (cur) items.push(cur);
  let changes = items.filter(Boolean);
  if (!changes.length) changes = prose.join('\n').split(/\n\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  changes = changes.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 2);
  out.push({ v: 'v' + p.v, date: date, title: p.t, changes: changes });
}
const seen = new Map();
for (const o of out) { if (seen.has(o.v)) { seen.get(o.v).changes = seen.get(o.v).changes.concat(o.changes); } else seen.set(o.v, o); }
const list = [...seen.values()];
const js = "/* Historique des versions — genere depuis l'historique Git (outils/gen-versions.js). */\n" +
  'window.VERSIONS = ' + JSON.stringify(list, null, 2) + ';\n';
require('fs').writeFileSync('js/versions-data.js', js);
console.log(list.length, 'versions,', js.length, 'octets');
console.log(JSON.stringify(list.slice(0, 2), null, 1));
