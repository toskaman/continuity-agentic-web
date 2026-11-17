// Summarises the timed user test (docs/impact/USER_TEST_PROTOCOL.md). Usage: node docs/impact/analyze_user_test.mjs RESULTS.csv
import { readFileSync } from "node:fs";
const file = process.argv[2] || new URL("./RESULTS.csv", import.meta.url);
const [head, ...lines] = readFileSync(file, "utf8").trim().split(/\r?\n/);
const cols = head.split(",");
const parseLine = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const rows = lines.map((l) => Object.fromEntries(parseLine(l).map((v, i) => [cols[i], v.trim()]))).filter((r) => r.time_s !== "");
const by = (c) => rows.filter((r) => r.condition === c);
const num = (rs, k) => rs.map((r) => Number(r[k])).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
const median = (a) => (a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const fmt = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
const A = by("A"), B = by("B");
if (!A.length || !B.length) { console.error("Need rows for both conditions A and B."); process.exit(1); }
const report = {};
for (const k of ["time_s", "actions", "sites_touched", "seq", "confidence", "unnecessary_contact"]) {
  const a = num(A, k), b = num(B, k);
  report[k] = { byHand: { median: median(a), min: a[0], max: a.at(-1) }, continuity: { median: median(b), min: b[0], max: b.at(-1) } };
}
const pc = { byHand: sum(num(A, "premature_cancel")), continuity: sum(num(B, "premature_cancel")) };
const ok = { byHand: sum(num(A, "correct_outcome")), continuity: sum(num(B, "correct_outcome")) };
console.table(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { "by hand (median)": v.byHand.median, "range": `${v.byHand.min}–${v.byHand.max}`, "CONTINUITY (median)": v.continuity.median, "range ": `${v.continuity.min}–${v.continuity.max}` }])));
const t = report.time_s; const gain = Math.round((1 - t.continuity.median / t.byHand.median) * 100);
console.log(`\nPremature cancellations: ${pc.byHand}/${A.length} by hand vs ${pc.continuity}/${B.length} with CONTINUITY`);
console.log(`Correct outcome: ${ok.byHand}/${A.length} by hand vs ${ok.continuity}/${B.length} with CONTINUITY`);
console.log(`\nREADY TO PASTE: Measured with ${A.length} people (not a statistical study): median ${fmt(t.byHand.median)} by hand vs ${fmt(t.continuity.median)} with CONTINUITY (−${gain} %), median ${report.actions.byHand.median} vs ${report.actions.continuity.median} actions; ${pc.byHand} of ${A.length} cancelled a booking too early by hand, ${pc.continuity} with CONTINUITY. Ease (1–7): ${report.seq.byHand.median} vs ${report.seq.continuity.median}.`);
const quotes = B.map((r) => r.quote).filter(Boolean);
if (quotes.length) console.log(`\nQuotes:\n- ${quotes.join("\n- ")}`);
