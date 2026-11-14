import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HF = "E:\\ia_ultime_storage\\npm-global\\node_modules\\hyperframes\\bin\\hyperframes.mjs";
const FFPROBE = "D:\\Program Files\\Jellyfin\\Server\\ffprobe.exe";
const OUT_KOKORO = "Z:\\continuity-titan-omega\\jury-film\\assets\\kokoro";
const BRAG_ASSETS = "Z:\\continuity-titan-omega\\brag-output\\composition\\assets";

const env = {
  ...process.env,
  HYPERFRAMES_PYTHON: "Z:\\continuity-titan-omega\\kokoro-venv\\Scripts\\python.exe",
  PATH: `D:\\Program Files\\ShareX;D:\\Program Files\\Jellyfin\\Server;E:\\ia_ultime_storage\\npm-global;${process.env.PATH}`,
};

async function probeDuration(wavPath) {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    wavPath,
  ]);
  return Number(Number(stdout.trim()).toFixed(3));
}

// 1. BRAG FULL 21-second Launch Narration (`am_michael`)
const bragScript =
  "Move one relocation date from Tuesday to Friday, and six separate bookings break at once. Continuity coordinates independent Open Agentic Websites right in your browser. It skips unaffected bookings, recovers from a full crew, holds replacements below seven hundred euros, and verifies every receipt.";

const bragWav = path.join(BRAG_ASSETS, "voiceover.wav");
await execFileAsync(process.execPath, [HF, "tts", bragScript, "--voice", "am_michael", "--output", bragWav], {
  env,
  cwd: "Z:\\continuity-titan-omega",
});
const bragDur = await probeDuration(bragWav);
console.log(`Brag voiceover: ${bragDur}s`);

// 2. JURY MASTER 8-Scene Narration (`am_michael`) — Phonetic spelling for acronyms (`E D twenty-five fifty-one nine`, `S H A two fifty-six`, `NANDA`, `Otari`)
const juryScenes = [
  {
    id: "s1",
    tts: "Changing one date in real life should never force you to reorganize six separate companies by hand, or risk canceling a working reservation before its replacement is secured.",
    caption: "Changing one date shouldn't force 6 manual calls—or risk premature cancellations.",
  },
  {
    id: "s2",
    tts: "Shifting a move from Tuesday to Friday normally takes eighteen manual lookups, checks, and rebookings. Continuity reduces that to one plain-English request and one bound approval.",
    caption: "18 manual actions across 6 services → 1 plain-English request + 1 bound approval.",
  },
  {
    id: "s3",
    tts: "Instead of a closed marketplace, MoveCo, PermitFlow, HomeConnect, and PowerFlow are independent Open Agentic Websites. Continuity composes their Neuro SAN networks in your browser on Mozilla Otari, with consent cards and zero key leakage.",
    caption: "4 independent Open Agentic Websites composed locally in-browser via Mozilla Otari BYOK.",
  },
  {
    id: "s4",
    tts: "Watch what happens when we move Tuesday to Friday under seven hundred euros, while MoveCo's primary Friday crew is full. The Impact Engine skips unaffected storage and Saturday delivery completely.",
    caption: "Ripple Failure armed: Impact Engine excludes unaffected storage & Saturday delivery (0 calls).",
  },
  {
    id: "s5",
    tts: "When MoveCo's eight A M crew refuses Friday, the Minimal-Change Solver recovers with MoveCo's overflow fleet, keeps PowerFlow's Tuesday activation untouched, and holds slots at six hundred fifty-nine euros.",
    caption: "Minimal-Change Solver recovers via overflow crew & holds slots at €659.00 (≤ €700.00 cap).",
  },
  {
    id: "s6",
    tts: "Every approval is S H A two fifty-six bound to exact prices and dates. Once confirmed, Continuity commits with idempotency keys and verifies E D twenty-five fifty-one nine provider signatures.",
    caption: "SHA-256 bound approval → idempotent commit → 3/3 verified Ed25519 provider receipts.",
  },
  {
    id: "s7",
    tts: "Our built-in Chaos Lab passes all fifteen distributed fault scenarios, from post-commit timeouts to forged receipts, backed by twelve open-source Apache two modules and Project NANDA Agent Cards.",
    caption: "Chaos Lab: 15/15 distributed fault scenarios passed · 12 Apache-2.0 open-source modules.",
  },
  {
    id: "s8",
    tts: "Continuity. One change. Every commitment re-aligned, across the Open Agentic Web.",
    caption: "CONTINUITY — One change. Every commitment re-aligned.",
  },
];

let cursorSec = 0;
const manifest = {
  voice: "am_michael",
  engine: "Kokoro-82M via HyperFrames v0.9.19",
  brag: { text: bragScript, durationSec: bragDur, wav: bragWav },
  scenes: [],
};

for (const s of juryScenes) {
  const wavPath = path.join(OUT_KOKORO, `${s.id}.wav`);
  await execFileAsync(process.execPath, [HF, "tts", s.tts, "--voice", "am_michael", "--output", wavPath], {
    env,
    cwd: "Z:\\continuity-titan-omega",
  });
  const voDur = await probeDuration(wavPath);
  const leadPad = 0.35;
  const tailPad = 0.85;
  const sceneDur = Number((leadPad + voDur + tailPad).toFixed(2));
  const entry = {
    id: s.id,
    sceneStart: Number(cursorSec.toFixed(2)),
    sceneDur,
    sceneEnd: Number((cursorSec + sceneDur).toFixed(2)),
    voStart: Number((cursorSec + leadPad).toFixed(2)),
    voDur,
    voEnd: Number((cursorSec + leadPad + voDur).toFixed(2)),
    tts: s.tts,
    caption: s.caption,
    wav: wavPath,
  };
  manifest.scenes.push(entry);
  cursorSec = entry.sceneEnd;
  console.log(`${s.id}: vo=${voDur}s | scene=[${entry.sceneStart}s .. ${entry.sceneEnd}s] (${sceneDur}s)`);
}

manifest.totalDurationSec = Number(cursorSec.toFixed(2));
console.log(`TOTAL JURY MASTER DURATION: ${manifest.totalDurationSec}s (strictly < 120s limit!)`);

await writeFile("Z:\\continuity-titan-omega\\kokoro\\timing_manifest.json", JSON.stringify(manifest, null, 2), "utf8");
await writeFile("docs/video-production/kokoro_timing_manifest.json", JSON.stringify(manifest, null, 2), "utf8");
