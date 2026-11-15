/** Word-level ASR check of every Kokoro segment (Parakeet via HyperFrames). Writes <dir>/words.json and prints transcript vs script. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const DIR = process.argv[2] || "Z:\\continuity-titan-omega\\v2\\narration";
const HF = "E:\\ia_ultime_storage\\npm-global\\node_modules\\hyperframes\\bin\\hyperframes.mjs";
const man = JSON.parse(readFileSync(path.join(DIR, "narration_manifest.json"), "utf8"));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const out = {};
for (const s of man.segments) {
  const r = spawnSync(process.execPath, [HF, "transcribe", path.join(DIR, s.id + ".wav"), "--engine", "parakeet", "--json"], { encoding: "utf8", cwd: DIR, maxBuffer: 1e8 });
  const lines = (r.stdout + "\n" + r.stderr).split(/\r?\n/).filter((l) => l.startsWith("{"));
  const words = lines.map((l) => { try { return JSON.parse(l); } catch { return {}; } }).filter((o) => o.type === "words").flatMap((o) => o.words);
  out[s.id] = words;
  const heard = words.map((w) => w.text).join(" ");
  const a = norm(s.tts), b = norm(heard);
  const missing = a.filter((w) => !b.includes(w)), extra = b.filter((w) => !a.includes(w));
  console.log(`${s.id} [${s.durationSec}s] heard: ${heard}\n   missing:${JSON.stringify(missing)} extra:${JSON.stringify(extra)}`);
}
writeFileSync(path.join(DIR, "words.json"), JSON.stringify(out, null, 1));
