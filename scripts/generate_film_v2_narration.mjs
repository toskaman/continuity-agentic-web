/**
 * Kokoro narration for the v2 jury film. Reads docs/video-production/v2/narration.json,
 * writes one WAV per segment + timing manifest. Local/offline (HyperFrames tts = Kokoro-82M).
 * Usage: node scripts/generate_film_v2_narration.mjs <outDir> [voice] [speed]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "Z:\\continuity-titan-omega\\v2\\narration";
const cfg = JSON.parse(readFileSync(new URL("../docs/video-production/v2/narration.json", import.meta.url), "utf8"));
const voice = process.argv[3] || cfg.voice, speed = process.argv[4] || String(cfg.speed);
const HF = "E:\\ia_ultime_storage\\npm-global\\node_modules\\hyperframes\\bin\\hyperframes.mjs";
const FFPROBE = ["C:\\Users\\TheBox\\AppData\\Local\\agy\\bin\\ffprobe.exe", "D:\\Program Files\\Jellyfin\\Server\\ffprobe.exe"].find(existsSync);
const env = { ...process.env, HYPERFRAMES_PYTHON: "Z:\\continuity-titan-omega\\kokoro-venv\\Scripts\\python.exe" };
mkdirSync(OUT, { recursive: true });
const dur = (f) => Number(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).toString().trim());
const manifest = { voice, speed: Number(speed), engine: cfg.engine, generatedAt: new Date().toISOString(), segments: [] };
for (const s of [...cfg.segments, cfg.brag]) {
  const wav = path.join(OUT, `${s.id}.wav`);
  execFileSync(process.execPath, [HF, "tts", s.tts, "--voice", voice, "--speed", speed, "--output", wav], { env, stdio: "pipe" });
  const d = dur(wav);
  manifest.segments.push({ id: s.id, durationSec: Number(d.toFixed(3)), words: s.tts.split(/\s+/).length, tts: s.tts, caption: s.caption, claims: s.claims || [] });
  console.log(`${s.id} ${d.toFixed(2)}s`);
}
writeFileSync(path.join(OUT, "narration_manifest.json"), JSON.stringify(manifest, null, 2));
console.log("total", manifest.segments.filter((s) => s.id !== "brag").reduce((a, s) => a + s.durationSec, 0).toFixed(2));
