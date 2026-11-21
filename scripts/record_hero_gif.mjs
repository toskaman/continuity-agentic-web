/**
 * Records the animated hero story of the public CONTINUITY site and turns it into
 * docs/submission/hero.gif (looping, for the top of the README).
 * Usage: node scripts/record_hero_gif.mjs [url]
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const URL_ = process.argv[2] || "https://toskaman.github.io/continuity-agentic-web/?lang=en";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const OUT = path.resolve("docs/submission/hero.gif");
const VW = 1280, VH = 860;
const work = path.join(os.tmpdir(), `hero-gif-${Date.now()}`);
await mkdir(path.join(work, "f"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9471;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--window-size=${VW},${VH}`, "--hide-scrollbars",
  "--no-first-run", "--disable-extensions", "--force-color-profile=srgb", `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });

try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0; const pending = new Map(); const frames = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Page.screencastFrame") {
      const f = path.join(work, "f", String(frames.length).padStart(5, "0") + ".jpg");
      frames.push({ f, t: m.params.metadata.timestamp });
      void writeFile(f, Buffer.from(m.params.data, "base64"));
      send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
    }
  });
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL_ });
  await sleep(1200);
  await send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
  await sleep(11500);
  await send("Page.stopScreencast");
  await sleep(500);
  if (frames.length < 10) throw new Error(`only ${frames.length} frames`);

  let list = "ffconcat version 1.0\n";
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.5;
    list += `file '${frames[i].f.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
  }
  list += `file '${frames.at(-1).f.replace(/\\/g, "/")}'\n`;
  const lf = path.join(work, "list.ffconcat");
  await writeFile(lf, list);
  const vf = "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle";
  const r = spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lf, "-vf", vf, "-loop", "0", OUT]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  console.log(`wrote ${OUT} from ${frames.length} frames`);
} finally {
  chrome.kill();
  await sleep(500);
  await rm(work, { recursive: true, force: true }).catch(() => {});
  process.exit(process.exitCode || 0);
}
