// CONTINUITY v2 jury film — HyperFrames composition builder.
// Single source of truth: data/timeline.json (VO placement), data/words.json (Kokoro ASR word timings),
// data/bounds.json (measured getBoundingClientRect of the live site, 1920x1080 film px).
// Usage: node build.mjs [--voice-ready] [--out index.html]
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const VOICE_READY = args.includes("--voice-ready");
const BRAG = args.includes("--brag");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "index.html";
const TL = JSON.parse(readFileSync(BRAG ? "data/timeline_brag.json" : "data/timeline.json", "utf8"));
const WORDS = JSON.parse(readFileSync("data/words.json", "utf8"));
const B = JSON.parse(readFileSync("data/bounds.json", "utf8"));
const VO = TL.vo, SC = TL.scenes, END = TL.end;
const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------- word timing ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
function W(seg, word, nth = 0) {
  const list = WORDS[seg]; let k = 0;
  for (const w of list) if (norm(w.text) === norm(word)) { if (k++ === nth) return r3(VO[seg] + w.start); }
  throw new Error(`word ${word}#${nth} not in ${seg}`);
}
const WE = (seg, word, nth = 0) => { const list = WORDS[seg]; let k = 0; for (const w of list) if (norm(w.text) === norm(word)) { if (k++ === nth) return r3(VO[seg] + w.end); } throw new Error(word); };

// ---------- output buffers ----------
const html = []; // elements in z-order
const ops = [];  // timeline ops executed in-page: [kind, selector, time, dur, fromVars, toVars, ease]
const sfx = [];  // [time, file, gain]
const cues = []; // human-readable cue sheet
let uid = 0; const id = (p) => `${p}${++uid}`;
const op = (kind, sel, t, dur, a, b, ease) => ops.push([kind, sel, r3(t), r3(dur || 0), a || null, b || null, ease || null]);
const to = (sel, t, dur, vars, ease = "power3.inOut") => op("to", sel, t, dur, null, vars, ease);
const fromTo = (sel, t, dur, a, b, ease = "power3.out") => op("fromTo", sel, t, dur, a, b, ease);
const set = (sel, t, vars) => op("set", sel, t, 0, null, vars);
const S = (t, file, gain = 1, note = "") => { sfx.push([r3(t), file, gain]); if (note) cues.push(`${r3(t).toFixed(2)}s sfx ${file} ${note}`); };

// ---------- camera math ----------
const clampCam = (x, y, z) => ({ x: Math.min(0, Math.max(1920 * (1 - z), x)), y: Math.min(0, Math.max(1080 * (1 - z), y)), z });
const camOn = (cx, cy, z) => clampCam(960 - z * cx, 540 - z * cy, z);
const screen = (cam, px, py) => ({ x: cam.x + cam.z * px, y: cam.y + cam.z * py });

// ---------- shots ----------
let prevEl = null;
const PUSH = { up: ["y", 1080], down: ["y", -1080], left: ["x", 1920] };
function pushIn(sel, start, dir, dur = 0.62) {
  const [ax, d] = PUSH[dir];
  fromTo(sel, start, dur, { [ax]: d }, { [ax]: 0 }, "power3.inOut");
  if (prevEl) to(prevEl, start, dur, { [ax]: -d }, "power3.inOut");
  S(start - 0.02, "sfx_whoosh_soft.wav", 0.16);
}
// still shot: blurred/dimmed base + sharp copy revealed through an animated clip-path + outline.
function still(name, src, start, end, { fadeIn = 0.3, cam = { x: 0, y: 0, z: 1 }, push } = {}) {
  if (push) fadeIn = 0;
  const sid = id("st");
  const blur = src.replace("assets/stills/", "assets/stills/blur/");
  html.push({ start, el: `<div id="${sid}" class="clip shot" data-start="${r3(start)}" data-duration="${r3(end - start)}" data-layout-allow-overlap data-layout-allow-overflow>
  <div class="fadein" id="${sid}-f"><div class="cam" id="${sid}-cam">
    <img class="plate" src="${blur}" alt="">
    <div class="win" id="${sid}-sh"><img class="plate" id="${sid}-si" src="${src}" alt=""></div>
    <div class="ol" id="${sid}-ol"></div><div class="ol ol2" id="${sid}-ol2"></div>
  </div></div></div>` });
  set(`#${sid}-sh`, 0, { left: 0, top: 0, width: 1920, height: 1080, borderRadius: 0 });
  set(`#${sid}-si`, 0, { x: 0, y: 0 });
  set(`#${sid}-cam`, 0, { x: cam.x, y: cam.y, scale: cam.z, transformOrigin: "0 0" });
  set(`#${sid}-ol`, 0, { opacity: 0 }); set(`#${sid}-ol2`, 0, { opacity: 0 });
  if (fadeIn > 0) fromTo(`#${sid}-f`, start, fadeIn, { opacity: 0 }, { opacity: 1 }, "power2.out");
  if (push) pushIn(`#${sid}-f`, start, push);
  prevEl = `#${sid}-f`;
  const shot = { sid, name, start, end, fadeEnd: start + (push ? 0.62 : Math.max(0, fadeIn)) + 0.05, camKeys: [{ t: 0, ...cam }] };
  cues.push(`${start.toFixed(2)}–${end.toFixed(2)} still ${name}`);
  return shot;
}
// sharp window (no clip-path): window div + counter-offset image
function win(shot, t, dur, X, Y, Wd, H, radius, ease = "power3.inOut") {
  to(`#${shot.sid}-sh`, t, dur, { left: X, top: Y, width: Wd, height: H, borderRadius: radius }, ease);
  to(`#${shot.sid}-si`, t, dur, { x: -X, y: -Y }, ease);
}
function camAt(shot, t) { let c = shot.camKeys[0]; for (const k of shot.camKeys) if (k.t <= t) c = k; return c; }
function camTo(shot, t, cam, dur = 0.9, ease = "power3.inOut") {
  t = Math.max(t, shot.fadeEnd);
  to(`#${shot.sid}-cam`, t, dur, { x: cam.x, y: cam.y, scale: cam.z }, ease);
  shot.camKeys.push({ t: t + dur, ...cam });
}
// focus: sharp area = rect (page px), everything else blurred + dimmed. which: "ol" | "ol2"
function focus(shot, t, rect, { pad = 10, radius = 14, dur = 0.55, which = "ol", z } = {}) {
  t = Math.max(t, shot.fadeEnd);
  const [x, y, w, h] = rect; const X = x - pad, Y = y - pad, Wd = w + 2 * pad, H = h + 2 * pad;
  const zz = z || camAt(shot, t + dur).z;
  win(shot, t, dur, X, Y, Wd, H, radius);
  const sel = `#${shot.sid}-${which}`;
  fromTo(sel, t + dur * 0.35, dur, { opacity: 0, left: X - 6, top: Y - 6, width: Wd + 12, height: H + 12, borderRadius: radius + 4, borderWidth: 3 / zz },
    { opacity: 1, left: X, top: Y, width: Wd, height: H, borderRadius: radius, borderWidth: 3 / zz }, "power3.out");
  cues.push(`${t.toFixed(2)}s focus ${shot.name} [${rect.join(",")}]`);
}
function focusMove(shot, t, rect, { pad = 10, radius = 14, dur = 0.6, which = "ol", z } = {}) {
  t = Math.max(t, shot.fadeEnd);
  const [x, y, w, h] = rect; const X = x - pad, Y = y - pad, Wd = w + 2 * pad, H = h + 2 * pad;
  const zz = z || camAt(shot, t + dur).z;
  win(shot, t, dur, X, Y, Wd, H, radius);
  to(`#${shot.sid}-${which}`, t, dur, { opacity: 1, left: X, top: Y, width: Wd, height: H, borderRadius: radius, borderWidth: 3 / zz }, "power3.inOut");
  cues.push(`${t.toFixed(2)}s focus→ ${shot.name} [${rect.join(",")}]`);
}
function dimAll(shot, t, dur = 0.45) {
  to(`#${shot.sid}-sh`, t, dur, { opacity: 0 }, "power2.inOut");
  to(`#${shot.sid}-ol`, t, dur * 0.6, { opacity: 0 }, "power2.out");
  to(`#${shot.sid}-ol2`, t, dur * 0.6, { opacity: 0 }, "power2.out");
}
function unfocus(shot, t, dur = 0.5, fromDim = false) {
  if (fromDim) { set(`#${shot.sid}-sh`, t, { left: 0, top: 0, width: 1920, height: 1080, borderRadius: 0 }); set(`#${shot.sid}-si`, t, { x: 0, y: 0 }); }
  to(`#${shot.sid}-sh`, t, dur, { opacity: 1 }, "power2.inOut");
  if (!fromDim) win(shot, t, dur, 0, 0, 1920, 1080, 0, "power2.inOut");
  to(`#${shot.sid}-ol`, t, dur * 0.6, { opacity: 0 }, "power2.out");
  to(`#${shot.sid}-ol2`, t, dur * 0.6, { opacity: 0 }, "power2.out");
}
// video shot (real screencast). Wrapper is untimed (lint: no timed ancestor for video).
function video(name, src, start, end, mediaStart = 0, { fadeIn = 0.25, cam, push } = {}) {
  const vid = id("v");
  if (push) fadeIn = 0;
  html.push({ start, el: `<div class="vwrap" id="${vid}-o"><div class="vwrap" id="${vid}-w"><video id="${vid}" class="plate" src="${src}" muted playsinline data-start="${r3(start)}" data-duration="${r3(end - start)}" data-media-start="${r3(mediaStart)}"></video></div></div>` });
  set(`#${vid}-w`, 0, { opacity: fadeIn > 0 ? 0 : 1, transformOrigin: "0 0", x: cam ? cam.x : 0, y: cam ? cam.y : 0, scale: cam ? cam.z : 1 });
  if (fadeIn > 0) fromTo(`#${vid}-w`, start, fadeIn, { opacity: 0 }, { opacity: 1 }, "power2.out");
  if (push) pushIn(`#${vid}-o`, start, push);
  prevEl = `#${vid}-o`;
  cues.push(`${start.toFixed(2)}–${end.toFixed(2)} video ${name} @${mediaStart}`);
  return { vid, start, end };
}
// screen-space callout chip
function chip(text, start, end, x, y, { tone = "teal", anchor = "left", size = 26 } = {}) {
  const cid = id("chip");
  const tx = anchor === "center" ? "translateX(-50%)" : anchor === "right" ? "translateX(-100%)" : "none";
  html.push({ start, z: 2, el: `<div id="${cid}" class="clip chipwrap" data-start="${r3(start)}" data-duration="${r3(end - start)}" data-layout-allow-overlap style="left:${Math.round(x)}px;top:${Math.round(y)}px;"><div class="chipbox" style="transform:${tx}"><div class="chip ${tone}" id="${cid}-i" style="font-size:${size}px">${text}</div></div></div>` });
  fromTo(`#${cid}-i`, start, 0.45, { opacity: 0, y: 10 }, { opacity: 1, y: 0 }, "power3.out");
  to(`#${cid}-i`, end - 0.3, 0.25, { opacity: 0 }, "power2.in");
  cues.push(`${start.toFixed(2)}s chip "${text.replace(/<[^>]+>/g, "")}"`);
}
// virtual cursor window; path = [[t,x,y], ...]; clicks = [t,...]
function cursor(start, end, path, clicks, { cut = false } = {}) {
  const cid = id("cur");
  html.push({ start, z: 3, el: `<div id="${cid}" class="clip curlayer" data-start="${r3(start)}" data-duration="${r3(end - start)}" data-layout-allow-overlap>
    <div class="ripple" id="${cid}-rp"></div>
    <div class="cursor" id="${cid}-c"><svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 31 L10.5 24.5 L15.5 36 L20.5 33.8 L15.6 22.6 L25.5 22.6 Z" fill="#fff" stroke="#0B1220" stroke-width="2" stroke-linejoin="round"/></svg></div></div>` });
  const [t0, x0, y0] = path[0];
  set(`#${cid}-c`, 0, { x: x0, y: y0, opacity: 0, scale: 1, transformOrigin: "3px 2px" });
  fromTo(`#${cid}-c`, start, 0.3, { opacity: 0 }, { opacity: 1 }, "power2.out");
  for (let i = 1; i < path.length; i++) {
    const [ta, , ] = path[i - 1]; const [tb, xb, yb] = path[i];
    to(`#${cid}-c`, ta, tb - ta, { x: xb }, "power2.inOut");
    to(`#${cid}-c`, ta, tb - ta, { y: yb }, "sine.inOut");
  }
  for (const tc of clicks) {
    const p = [...path].reverse().find((q) => q[0] <= tc) || path[0];
    to(`#${cid}-c`, tc - 0.08, 0.08, { scale: 0.86 }, "power2.in");
    to(`#${cid}-c`, tc, 0.16, { scale: 1 }, "power2.out");
    fromTo(`#${cid}-rp`, tc, 0.55, { x: p[1] - 40, y: p[2] - 40, scale: 0.2, opacity: 0.9 }, { x: p[1] - 40, y: p[2] - 40, scale: 1.3, opacity: 0 }, "power2.out");
    S(tc, "sfx_click.wav", 0.45, "click");
  }
  if (!cut) to(`#${cid}-c`, end - 0.3, 0.25, { opacity: 0 }, "power2.in");
}
// generic timed overlay layer with raw inner html
function layer(start, end, inner, cls = "", style = "", top = false) {
  const lid = id("ly");
  html.push({ start, z: top ? 1 : 0, el: `<div id="${lid}" class="clip layer ${cls}" data-start="${r3(start)}" data-duration="${r3(end - start)}" data-layout-allow-overlap data-layout-allow-overflow style="${style}">${inner(lid)}</div>` });
  return lid;
}

// =====================================================================
// BRAG CUT (20 s) — same visual system, Brag Full storyboard
// =====================================================================
function bragScenes() {
  const t = (w, n = 0) => W("brag", w, n);
  // B1 hook
  {
    const st = 0, en = SC.B2 + 0.35;
    const cards = [["Moving crew · 20 m³ van", "MoveCo Express", "#6E8BFF"], ["Loading-bay permit", "PermitFlow Civic", "#34D399"], ["Fiber installation", "HomeConnect Fiber", "#22D3EE"], ["Smart-meter switch-on", "PowerFlow Energy", "#4ADE80"], ["Climate storage · 14 days", "Storage", "#A78BFA"], ["Sofa & desk delivery", "Delivery", "#F0ABFC"]];
    const pos = [[150, 250], [150, 470], [150, 690], [1290, 250], [1290, 470], [1290, 690]];
    const L = layer(st, en, (L) => `<div class="eyebrow-big">Moving house</div>
      <div class="cal" id="${L}-cal"><div class="calface" id="${L}-old"><div class="calhead">NOV</div><div class="calday">17</div><div class="calwk">TUESDAY</div></div><div class="calface calnew" id="${L}-new"><div class="calhead">NOV</div><div class="calday">20</div><div class="calwk">FRIDAY</div></div></div>
      ${cards.map((c, i) => `<div class="bk" id="${L}-bk${i}" style="left:${pos[i][0]}px;top:${pos[i][1]}px"><i style="background:${c[2]}"></i><div><b>${c[0]}</b><span>${c[1]}</span></div><em id="${L}-bt${i}" data-layout-ignore>still Tuesday</em></div>`).join("")}`, "hook");
    set(`#${L}-new`, 0, { rotationX: 90, transformOrigin: "50% 50%" });
    to(`#${L}-old`, t("date") - 0.2, 0.2, { rotationX: -90 }, "power2.in"); to(`#${L}-new`, t("date"), 0.3, { rotationX: 0 }, "power2.out");
    S(t("date") - 0.2, "sfx_flip.wav", 0.5);
    cards.forEach((_, i) => { fromTo(`#${L}-bk${i}`, t("six") - 0.15 + i * 0.06, 0.45, { opacity: 0, x: i < 3 ? -30 : 30 }, { opacity: 1, x: 0 }); S(t("six") - 0.15 + i * 0.06, "sfx_tick.wav", 0.15);
      to(`#${L}-bk${i}`, t("break") + i * 0.04, 0.3, { borderColor: "rgba(248,113,113,.85)", backgroundColor: "rgba(60,16,24,.72)" }, "power2.out");
      fromTo(`#${L}-bt${i}`, t("break") + i * 0.04, 0.3, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }); });
    S(t("break"), "sfx_error.wav", 0.26);
    to(`#${L}`, en - 0.35, 0.3, { opacity: 0 }, "power2.in");
    S(en - 0.45, "sfx_whoosh.wav", 0.35);
  }
  // B2 reveal: 3D origins
  {
    const st = SC.B2, en = SC.B3 + 0.4;
    const panes = [
      { key: "c", img: "assets/stills/01_hero.jpg", label: "toskaman.github.io", sub: "CONTINUITY · coordinator", x: 1200, y: 820, w: 640 },
      { key: "m", img: "assets/stills/peer_moveco-agentic-peer.jpg", label: "…github.io/moveco-agentic-peer", sub: "MoveCo Express", x: 600, y: 420, w: 480 },
      { key: "p", img: "assets/stills/peer_permitflow-agentic-peer.jpg", label: "…github.io/permitflow-agentic-peer", sub: "PermitFlow Civic", x: 1800, y: 420, w: 480 },
      { key: "h", img: "assets/stills/peer_homeconnect-agentic-peer.jpg", label: "…github.io/homeconnect-agentic-peer", sub: "HomeConnect Fiber", x: 600, y: 1180, w: 480 },
      { key: "w", img: "assets/stills/peer_powerflow-agentic-peer.jpg", label: "…github.io/powerflow-agentic-peer", sub: "PowerFlow Energy", x: 1800, y: 1180, w: 480 }];
    const L = layer(st, en, (L) => `<div class="eyebrow-big e3">Four independent websites · one coordinator</div>
      <div class="world" id="${L}-world"><div class="plane" id="${L}-plane"><div class="planegrid"></div>
      <svg class="beams" width="2400" height="1520" viewBox="0 0 2400 1520">${panes.slice(1).map((p, i) => `<path id="${L}-bm${i}" d="M1200 820 L${p.x} ${p.y}" stroke="#5EEAD4" stroke-width="5" fill="none" stroke-linecap="round"/>`).join("")}</svg>
      ${panes.map((p) => `<div class="pane-anchor" style="left:${p.x}px;top:${p.y}px"><div class="pane" id="${L}-pn${p.key}" style="width:${p.w}px;left:${-p.w / 2}px"><img src="${p.img}" alt=""><div class="pane-label" data-layout-ignore><span class="dot"></span>${p.label}</div><div class="pane-sub" data-layout-ignore>${p.sub}</div></div></div>`).join("")}</div></div>`, "s3");
    set(`#${L}-plane`, 0, { rotationX: 58, rotationZ: -12, z: -560, transformOrigin: "50% 50%" });
    fromTo(`#${L}-world`, st, 0.5, { opacity: 0 }, { opacity: 1 }, "power2.out");
    to(`#${L}-plane`, st, en - st, { rotationZ: 6, z: -420 }, "sine.inOut");
    const at = { c: st + 0.1, m: t("four") - 0.2, p: t("four") - 0.02, h: t("four") + 0.16, w: t("four") + 0.34 };
    for (const p of panes) { set(`#${L}-pn${p.key}`, 0, { rotationX: -2, opacity: 0, transformOrigin: "50% 100%" }); fromTo(`#${L}-pn${p.key}`, at[p.key], 0.8, { rotationX: -2, opacity: 0 }, { rotationX: -64, opacity: 1 }, "power3.out"); if (p.key !== "c") S(at[p.key], "sfx_tick.wav", 0.15); }
    panes.slice(1).forEach((p, i) => { const len = Math.hypot(p.x - 1200, p.y - 820); set(`#${L}-bm${i}`, 0, { attr: { "stroke-dasharray": `${len} ${len}`, "stroke-dashoffset": len } }); to(`#${L}-bm${i}`, at[["m", "p", "h", "w"][i]] + 0.3, 0.7, { attr: { "stroke-dashoffset": 0 } }, "power2.out"); });
    to(`#${L}`, en - 0.4, 0.35, { opacity: 0 }, "power2.in");
  }
  // B3 approval dialog (real)
  {
    const st = SC.B3, en = SC.B4 + 0.35;
    const dl = still("09_dialog", "assets/stills/09_dialog_hi.jpg", st, en, { fadeIn: 0.35, cam: camOn(960, 470, 1.18) });
    const rows = B.dialog.strong;
    camTo(dl, st + 0.2, camOn(965, 520, 1.42), 1.2);
    focus(dl, t("holds") + 0.1, [557, rows[1].y - 6, 822, rows[1].h + 12], { pad: 6, radius: 12 });
    const c = camOn(965, 520, 1.42); const p = screen(c, 560, rows[1].y - 70);
    chip("Replacements held · nothing runs before you approve", t("holds") + 0.2, en - 0.2, p.x, p.y, { tone: "solid", size: 30 });
    S(en - 0.4, "sfx_whoosh_soft.wav", 0.3);
  }
  // B4 provider wall
  {
    const st = SC.B4, en = SC.B5 + 0.4;
    const camW = camOn(960, 596, 1.1);
    const wb = still("08_wall_before", "assets/stills/08_wall_before_hi.jpg", st, en, { fadeIn: 0.35, cam: camW });
    const sitesA = B.wallClean.sites;
    const after = layer(st, en, (A) => `<div class="cam" id="${A}-cam">${sitesA.map((s, i) => `<img class="colimg" id="${A}-c${i}" src="assets/stills/cols/after_${i}.jpg" alt="" style="left:${s.x - 2}px;top:${s.y - 2}px;width:${s.w + 4}px;height:${s.h + 4}px"><div class="flash" id="${A}-fl${i}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px"></div>`).join("")}</div>`);
    set(`#${after}-cam`, 0, { x: camW.x, y: camW.y, scale: camW.z, transformOrigin: "0 0" });
    sitesA.forEach((_, i) => { set(`#${after}-c${i}`, 0, { opacity: 0 }); set(`#${after}-fl${i}`, 0, { opacity: 0 }); });
    [t("verifies") - 0.1, t("signed"), t("receipt") + 0.1].forEach((tt, i) => { to(`#${after}-c${i}`, tt, 0.4, { opacity: 1 }, "power2.out"); fromTo(`#${after}-fl${i}`, tt, 0.7, { opacity: 0.85 }, { opacity: 0 }, "power2.out"); S(tt, `sfx_verify_${i + 1}.wav`, 0.24); });
    const tPf = t("own") + 0.1; to(`#${after}-c3`, tPf, 0.4, { opacity: 1 }, "power2.out");
    const s4 = sitesA[3]; const r = screen(camW, s4.x - 10, s4.y - 10);
    const R = layer(tPf, en, (R) => `<div class="ring big" id="${R}-r" style="left:${Math.round(r.x)}px;top:${Math.round(r.y)}px;width:${Math.round(camW.z * (s4.w + 20))}px;height:${Math.round(camW.z * (s4.h + 20))}px"></div>`, "", "", true);
    fromTo(`#${R}-r`, tPf, 0.45, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1 });
    const pp = screen(camW, s4.x + s4.w, s4.y - 54);
    chip("PowerFlow: consulted — nothing to change", tPf + 0.15, en - 0.2, pp.x, pp.y, { tone: "solid", anchor: "right", size: 28 });
    const su = screen(camW, 960, sitesA[0].y - 46);
    chip("Each provider verifies its receipt on its own page", t("Then") - 0.1, tPf - 0.1, su.x, su.y - 6, { tone: "solid", anchor: "center", size: 28 });
  }
  // B5 outro
  {
    const st = SC.B5;
    const he = still("15_hero_after", "assets/stills/15_hero_after.jpg", st, END, { fadeIn: 0.4 });
    to(`#${he.sid}-sh`, st + 0.2, 0.9, { opacity: 0 }, "power2.inOut");
    const L = layer(st, END, (L) => `<div class="veil" id="${L}-veil"></div><div class="lockup">
     <div class="lockrow" id="${L}-mk"><svg width="96" height="96" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#0B1220" stroke="rgba(255,255,255,.18)" stroke-width=".6"/><path d="M10 18a8 8 0 0 1 13.66-5.66M26 18a8 8 0 0 1-13.66 5.66" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="24" cy="12" r="2.6" fill="#34D399"/><circle cx="12" cy="24" r="2.6" fill="#6E8BFF"/></svg><span class="wordmark">CONTINUITY</span></div>
     <div class="tag1" id="${L}-t1">One change.</div><div class="tag2" id="${L}-t2">Every commitment re-aligned.</div>
     <div class="cta" id="${L}-cta"><span class="url">toskaman.github.io/continuity-agentic-web</span><span class="try">Try the live demo — no API key needed</span></div></div>`, "outro");
    fromTo(`#${L}-veil`, st + 0.1, 0.9, { opacity: 0 }, { opacity: 1 }, "power2.inOut");
    fromTo(`#${L}-mk`, st + 0.3, 0.7, { opacity: 0, y: 24 }, { opacity: 1, y: 0 });
    fromTo(`#${L}-t1`, st + 0.8, 0.6, { opacity: 0, y: 18 }, { opacity: 1, y: 0 });
    fromTo(`#${L}-t2`, st + 1.3, 0.6, { opacity: 0, y: 18 }, { opacity: 1, y: 0 });
    fromTo(`#${L}-cta`, st + 2.1, 0.6, { opacity: 0, y: 14 }, { opacity: 1, y: 0 });
    S(st + 0.3, "sfx_final.wav", 0.34);
    op("to", "#fadeout", END - 0.7, 0.65, null, { opacity: 1 }, "power1.in");
  }
}
if (BRAG) bragScenes(); else {
// =====================================================================
// S1 — HOOK (2D explainer): one date moves, six bookings break
// =====================================================================
{
  const st = SC.S1, en = SC.S2 + 0.45;
  const cards = [
    ["Moving crew · 20 m³ van", "MoveCo Express", "#6E8BFF"],
    ["Loading-bay permit", "PermitFlow Civic", "#34D399"],
    ["Fiber installation", "HomeConnect Fiber", "#22D3EE"],
    ["Smart-meter switch-on", "PowerFlow Energy", "#4ADE80"],
    ["Climate storage · 14 days", "Storage", "#A78BFA"],
    ["Sofa & desk delivery", "Delivery", "#F0ABFC"],
  ];
  const pos = [[150, 250], [150, 470], [150, 690], [1290, 250], [1290, 470], [1290, 690]];
  const L = layer(st, en, (L) => `
    <div class="eyebrow-big" id="${L}-eb">Moving house</div>
    <div class="cal" id="${L}-cal">
      <div class="calface" id="${L}-old"><div class="calhead">NOV</div><div class="calday">17</div><div class="calwk">TUESDAY</div></div>
      <div class="calface calnew" id="${L}-new"><div class="calhead">NOV</div><div class="calday">20</div><div class="calwk">FRIDAY</div></div>
    </div>
    ${cards.map((c, i) => `<div class="bk" id="${L}-bk${i}" style="left:${pos[i][0]}px;top:${pos[i][1]}px"><i style="background:${c[2]}"></i><div><b>${c[0]}</b><span>${c[1]}</span></div><em id="${L}-bt${i}" data-layout-ignore>still Tuesday</em></div>`).join("")}
    <svg class="links" id="${L}-links" width="1920" height="1080" viewBox="0 0 1920 1080">${pos.map((p, i) => { const x = i < 3 ? p[0] + 480 : p[0]; const y = p[1] + 52; return `<path id="${L}-ln${i}" d="M${x} ${y} C ${i < 3 ? x + 120 : x - 120} ${y}, ${i < 3 ? 760 : 1160} 520, ${i < 3 ? 830 : 1090} 520" fill="none" stroke="rgba(148,163,255,.35)" stroke-width="2" stroke-dasharray="6 8"/>`; }).join("")}</svg>
    <div class="steps" id="${L}-steps"><div class="stepn" id="${L}-num">0</div><div class="stepl">steps by hand<small>estimate · task model</small></div></div>
    <div class="tabs" id="${L}-tabs">${["moveco", "permitflow", "homeconnect", "powerflow", "storage", "delivery"].map((t, i) => `<span id="${L}-tab${i}">${t}</span>`).join("")}</div>
    <div class="gone" id="${L}-gone">No crew booked</div>
  `, "hook");
  set(`#${L}-new`, 0, { rotationX: 90, transformOrigin: "50% 50%" });
  fromTo(`#${L}-eb`, st + 0.2, 0.6, { opacity: 0, y: 14 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-cal`, st + 0.15, 0.8, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1 });
  const tFri = W("s01", "Friday");
  to(`#${L}-old`, tFri - 0.22, 0.22, { rotationX: -90 }, "power2.in");
  to(`#${L}-new`, tFri, 0.3, { rotationX: 0 }, "power2.out");
  S(tFri - 0.22, "sfx_flip.wav", 0.5, "calendar flip");
  const tSix = W("s01", "six");
  cards.forEach((_, i) => {
    fromTo(`#${L}-bk${i}`, tSix - 0.1 + i * 0.09, 0.55, { opacity: 0, x: i < 3 ? -30 : 30 }, { opacity: 1, x: 0 });
    fromTo(`#${L}-ln${i}`, tSix + 0.1 + i * 0.09, 0.6, { opacity: 0 }, { opacity: 1 }, "power2.out");
    S(tSix - 0.1 + i * 0.09, "sfx_tick.wav", 0.18);
  });
  const tBreak = W("s01", "break");
  cards.forEach((_, i) => {
    to(`#${L}-bk${i}`, tBreak + i * 0.05, 0.3, { borderColor: "rgba(248,113,113,.85)", backgroundColor: "rgba(60,16,24,.72)" }, "power2.out");
    fromTo(`#${L}-bt${i}`, tBreak + i * 0.05, 0.35, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 });
    to(`#${L}-ln${i}`, tBreak + i * 0.05, 0.3, { stroke: "rgba(248,113,113,.55)" }, "power2.out");
  });
  S(tBreak, "sfx_error.wav", 0.26, "bookings break");
  const tBy = W("s01", "By");
  to(`#${L}-cal`, tBy - 0.1, 0.6, { opacity: 0.25, scale: 0.9 });
  fromTo(`#${L}-steps`, tBy, 0.5, { opacity: 0, y: 20 }, { opacity: 1, y: 0 });
  op("count", `#${L}-num`, tBy + 0.1, W("s01", "18") + 0.3 - (tBy + 0.1), { v: 0 }, { v: 18 }, "power2.out");
  const tWeb = W("s01", "websites");
  const tTab = W("s01", "18") + 0.05;
  for (let i = 0; i < 6; i++) { fromTo(`#${L}-tab${i}`, tTab + i * 0.1, 0.35, { opacity: 0, y: 10 }, { opacity: 1, y: 0 }); S(tTab + i * 0.1, "sfx_tick_low.wav", 0.12); }
  const tCancel = W("s01", "Cancel");
  to(`#${L}-steps`, tCancel - 0.2, 0.4, { opacity: 0 }); to(`#${L}-tabs`, tCancel - 0.2, 0.4, { opacity: 0 });
  to(`#${L}-bk0`, tCancel, 0.35, { scale: 1.06 }, "power2.out");
  to(`#${L}-bk0`, W("s01", "left") - 0.1, 0.45, { opacity: 0, scale: 0.9, y: 18 }, "power2.in");
  fromTo(`#${L}-gone`, W("s01", "left") + 0.15, 0.45, { opacity: 0 }, { opacity: 1 });
  S(W("s01", "nothing") - 0.05, "sfx_thud.wav", 0.6, "left with nothing");
  to(`#${L}`, en - 0.45, 0.4, { opacity: 0 }, "power2.in");
}

// =====================================================================
// S2 — the site's own before/after proof row (real UI)
// =====================================================================
{
  const st = SC.S2, en = SC.S3 + 0.5;
  const sh = still("02_proof", "assets/stills/02_proof.jpg", st, en, { fadeIn: 0.45, cam: camOn(960, 596, 1.12) });
  const right = [913, 424, 847, 344];
  focus(sh, W("s02", "two") - 0.25, right, { pad: 8, radius: 22 });
  const c = camAt(sh, st + 2);
  const p1 = screen(c, 1340, 470), p2 = screen(c, 1340, 470);
  chip(`<b>1</b> Say what changed`, W("s02", "Say") - 0.05, en - 0.2, screen(c, 1360, 470).x, screen(c, 1360, 470).y, { tone: "solid" });
  chip(`<b>2</b> Approve the exact plan`, W("s02", "approve") - 0.15, en - 0.2, screen(c, 1360, 470).x, screen(c, 1360, 470).y + 70, { tone: "solid" });
  S(W("s02", "decisions"), "sfx_resolve.wav", 0.24, "two decisions");
  to(`#${sh.sid}-f`, en - 0.5, 0.45, { opacity: 0 }, "power2.in");
  S(en - 0.6, "sfx_whoosh.wav", 0.4, "to 3D");
}

// =====================================================================
// S3 — 3D: five independent origins (real home pages as glass panes)
// =====================================================================
{
  const st = SC.S3, en = SC.S4 + 0.5;
  const panes = [
    { key: "c", img: "assets/stills/01_hero.jpg", label: "toskaman.github.io", sub: "CONTINUITY · coordinator", x: 1200, y: 820, w: 640 },
    { key: "m", img: "assets/stills/peer_moveco-agentic-peer.jpg", label: "…github.io/moveco-agentic-peer", sub: "MoveCo Express", x: 600, y: 420, w: 480 },
    { key: "p", img: "assets/stills/peer_permitflow-agentic-peer.jpg", label: "…github.io/permitflow-agentic-peer", sub: "PermitFlow Civic", x: 1800, y: 420, w: 480 },
    { key: "h", img: "assets/stills/peer_homeconnect-agentic-peer.jpg", label: "…github.io/homeconnect-agentic-peer", sub: "HomeConnect Fiber", x: 600, y: 1180, w: 480 },
    { key: "w", img: "assets/stills/peer_powerflow-agentic-peer.jpg", label: "…github.io/powerflow-agentic-peer", sub: "PowerFlow Energy", x: 1800, y: 1180, w: 480 },
  ];
  const L = layer(st, en, (L) => `
    <div class="eyebrow-big e3" id="${L}-eb">The open agentic web</div>
    <div class="world" id="${L}-world"><div class="plane" id="${L}-plane">
      <div class="planegrid"></div>
      <svg class="beams" width="2400" height="1520" viewBox="0 0 2400 1520">${panes.slice(1).map((p, i) => `<path id="${L}-bm${i}" d="M1200 820 L${p.x} ${p.y}" stroke="url(#g${i})" stroke-width="5" fill="none" stroke-linecap="round"/><defs><linearGradient id="g${i}" gradientUnits="userSpaceOnUse" x1="1200" y1="820" x2="${p.x}" y2="${p.y}"><stop offset="0" stop-color="#6E8BFF"/><stop offset="1" stop-color="#5EEAD4"/></linearGradient></defs>`).join("")}
      ${panes.slice(1).map((p, i) => `<circle id="${L}-pk${i}" cx="1200" cy="820" r="12" fill="#E0FFF9"/>`).join("")}</svg>
      ${panes.map((p) => `<div class="pane-anchor" style="left:${p.x}px;top:${p.y}px"><div class="pane" id="${L}-pn${p.key}" style="width:${p.w}px;left:${-p.w / 2}px"><img src="${p.img}" alt=""><div class="pane-label" data-layout-ignore><span class="dot"></span>${p.label}</div><div class="pane-sub" data-layout-ignore>${p.sub}</div></div><div class="pane-shadow" id="${L}-ps${p.key}" style="width:${p.w}px;left:${-p.w / 2}px"></div></div>`).join("")}
    </div></div>
    <div class="nos" id="${L}-nos"><div class="no" id="${L}-no1"><svg width="64" height="64" viewBox="0 0 64 64"><rect x="10" y="8" width="44" height="14" rx="4" fill="none" stroke="#C7D2FE" stroke-width="3"/><rect x="10" y="26" width="44" height="14" rx="4" fill="none" stroke="#C7D2FE" stroke-width="3"/><rect x="10" y="44" width="44" height="14" rx="4" fill="none" stroke="#C7D2FE" stroke-width="3"/></svg><span>No backend in the middle</span><b class="nox"><i id="${L}-x1"></i></b></div>
    <div class="no" id="${L}-no2"><svg width="64" height="64" viewBox="0 0 64 64"><ellipse cx="32" cy="14" rx="20" ry="7" fill="none" stroke="#C7D2FE" stroke-width="3"/><path d="M12 14 V50 C12 54 21 57 32 57 C43 57 52 54 52 50 V14" fill="none" stroke="#C7D2FE" stroke-width="3"/><path d="M12 32 C12 36 21 39 32 39 C43 39 52 36 52 32" fill="none" stroke="#C7D2FE" stroke-width="3"/></svg><span>No shared database</span><b class="nox"><i id="${L}-x2"></i></b></div></div>
  `, "s3");
  set(`#${L}-plane`, 0, { rotationX: 58, rotationZ: -14, z: -560, transformOrigin: "50% 50%" });
  fromTo(`#${L}-world`, st, 0.8, { opacity: 0 }, { opacity: 1 }, "power2.out");
  to(`#${L}-plane`, st, en - st, { rotationZ: 8, z: -380 }, "sine.inOut");
  fromTo(`#${L}-eb`, st + 0.3, 0.6, { opacity: 0, y: 14 }, { opacity: 1, y: 0 });
  // panes stand up: coordinator first, then providers on "Each provider runs its own site"
  const standAt = { c: W("s03", "open") - 0.2 };
  const tEach = W("s03", "Each");
  ["m", "p", "h", "w"].forEach((k, i) => (standAt[k] = tEach + i * 0.28));
  for (const p of panes) {
    set(`#${L}-pn${p.key}`, 0, { rotationX: -2, opacity: 0, transformOrigin: "50% 100%" });
    fromTo(`#${L}-pn${p.key}`, standAt[p.key], 0.9, { rotationX: -2, opacity: 0 }, { rotationX: -64, opacity: 1 }, "power3.out");
    fromTo(`#${L}-ps${p.key}`, standAt[p.key], 0.9, { opacity: 0 }, { opacity: 1 }, "power2.out");
    if (p.key !== "c") S(standAt[p.key], "sfx_tick.wav", 0.16);
  }
  S(standAt.c, "sfx_whoosh_soft.wav", 0.25);
  // beams draw on "coordinates other companies' agentic websites"
  const tCo = W("s03", "coordinates");
  for (let i = 0; i < 4; i++) {
    const len = Math.hypot(panes[i + 1].x - 1200, panes[i + 1].y - 820);
    set(`#${L}-bm${i}`, 0, { attr: { "stroke-dasharray": `${len} ${len}`, "stroke-dashoffset": len } });
    to(`#${L}-bm${i}`, tEach + i * 0.28 + 0.3, 0.8, { attr: { "stroke-dashoffset": 0 } }, "power2.out");
    set(`#${L}-pk${i}`, 0, { opacity: 0 });
  }
  // packets travel coordinator → provider (consent, then signed receipts)
  for (let rep = 0; rep < 2; rep++) for (let i = 0; i < 4; i++) {
    const t = W("s03", "origin") - 0.4 + rep * 1.35 + i * 0.12;
    fromTo(`#${L}-pk${i}`, t, 1.0, { attr: { cx: 1200, cy: 820 }, opacity: 1 }, { attr: { cx: panes[i + 1].x, cy: panes[i + 1].y }, opacity: 0.2 }, "power1.inOut");
    if (i === 0) S(t, "sfx_pulse.wav", 0.14);
  }
  // origin labels glow on "own origin"
  const tOr = W("s03", "origin");
  for (const p of panes) to(`#${L}-pn${p.key} .pane-label`, tOr - 0.3, 0.4, { backgroundColor: "rgba(94,234,212,.22)", borderColor: "rgba(94,234,212,.9)" }, "power2.out");
  chip("5 separately deployed websites", tOr - 0.35, en - 0.5, 960, 128, { tone: "solid", anchor: "center", size: 30 });
  const tNo1 = W("s03", "No", 0), tNo2 = W("s03", "No", 1);
  fromTo(`#${L}-no1`, tNo1 - 0.1, 0.45, { opacity: 0, y: 16 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-x1`, W("s03", "backend") - 0.05, 0.3, { scaleX: 0 }, { scaleX: 1 }, "power2.out");
  fromTo(`#${L}-no2`, tNo2 - 0.1, 0.45, { opacity: 0, y: 16 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-x2`, W("s03", "database") - 0.05, 0.3, { scaleX: 0 }, { scaleX: 1 }, "power2.out");
  S(W("s03", "backend") - 0.05, "sfx_tick_low.wav", 0.3); S(W("s03", "database") - 0.05, "sfx_tick_low.wav", 0.3);
  to(`#${L}`, en - 0.5, 0.45, { opacity: 0 }, "power2.in");
  S(en - 0.55, "sfx_whoosh.wav", 0.35, "to live site");
}

// =====================================================================
// S4 — live site: request, rules, real failure switched on
// =====================================================================
{
  const st = SC.S4;
  // establishing: browser card with the real origin, expanding to full bleed
  const L = layer(st, st + 2.3, (L) => `<div class="bcard" id="${L}-card"><div class="bbar" id="${L}-bar"><span class="bd"></span><span class="bd"></span><span class="bd"></span><div class="burl"><span class="lock"></span>toskaman.github.io/continuity-agentic-web</div></div><img class="bimg" src="assets/stills/01_hero.jpg" alt=""></div>`, "est");
  fromTo(`#${L}-card`, st, 0.6, { opacity: 0, scale: 0.74 }, { opacity: 1, scale: 0.8 }, "power3.out");
  to(`#${L}-card`, W("s04", "live") + 0.25, 0.9, { scale: 1, borderRadius: 0 }, "power3.inOut");
  to(`#${L}-bar`, W("s04", "live") + 0.25, 0.6, { opacity: 0, y: -40 }, "power2.in");
  const tHeroV = W("s04", "live") + 1.15;
  video("01_hero_idle", "assets/footage/01_hero_idle.mp4", tHeroV, W("s04", "describe") + 0.7, 0.4, { fadeIn: 0.0 });
  video("03_scroll_workspace", "assets/footage/03_scroll_workspace.mp4", W("s04", "describe") - 0.05, W("s04", "describe") + 1.55, 0.7, { push: "up" });
  const tWs = W("s04", "describe") + 1.45;
  const tRippleClick = W("s04", "failure") - 0.45;
  const ws = still("03_workspace", "assets/stills/03_workspace.jpg", tWs, tRippleClick - 0.43 + 0.25, { fadeIn: 0.15 });
  const ib = B.workspace.input; const tags = B.workspace.tags;
  camTo(ws, W("s04", "plain") - 0.3, camOn(ib.x + ib.w / 2, ib.y + ib.h / 2, 1.14), 0.9);
  focus(ws, W("s04", "plain") - 0.2, [ib.x, ib.y, ib.w, ib.h], { pad: 8, radius: 16 });
  const tagR = [tags[0].x, tags[0].y, tags[2].x + tags[2].w - tags[0].x, tags[0].h];
  camTo(ws, W("s04", "becomes") - 0.2, camOn(tagR[0] + tagR[2] / 2 - 60, tagR[1] + 120, 1.55), 0.9);
  focusMove(ws, W("s04", "becomes") - 0.1, tagR, { pad: 9, radius: 22 });
  const ct = camOn(tagR[0] + tagR[2] / 2 - 60, tagR[1] + 120, 1.55);
  const pt = screen(ct, tagR[0], tagR[1] + tagR[3] + 22);
  chip("Rules it can’t break", W("s04", "rules"), W("s04", "Then") + 0.2, pt.x, pt.y, { tone: "solid", size: 28 });
  unfocus(ws, W("s04", "Then") - 0.1); camTo(ws, W("s04", "Then") - 0.1, { x: 0, y: 0, z: 1 }, 0.7);
  // real click on "Simulate a provider failure"
  const rp = B.click_ripple;
  video("04_arm_failure", "assets/footage/04_arm_failure.mp4", tRippleClick - 0.43, tRippleClick + 1.1, 0, { fadeIn: 0 });
  cursor(W("s04", "Then") + 0.5, tRippleClick + 0.9, [[W("s04", "Then") + 0.5, 980, 760], [tRippleClick - 0.15, rp.x, rp.y], [tRippleClick + 0.9, rp.x + 6, rp.y + 4]], [tRippleClick]);
  const ar = still("04_armed", "assets/stills/04_armed.jpg", tRippleClick + 1.0, SC.S5 + 1.4, { fadeIn: 0.15 });
  const sb = B.armed.status, rb = B.armed.ripple;
  const tMov = W("s04", "moving");
  const ca = camOn(sb.x + 420, sb.y - 120, 1.7);
  camTo(ar, tMov - 0.6, ca, 0.9);
  focus(ar, tMov - 0.45, [sb.x, sb.y, sb.w, sb.h], { pad: 10, radius: 12 });
  const pa = screen(ca, sb.x, sb.y - 70);
  chip("Simulated: Friday crew full", tMov - 0.15, W("s04", "Friday") + 0.1, pa.x, pa.y - 24, { tone: "solid", size: 30 });
  S(tMov - 0.45, "sfx_error.wav", 0.18, "failure armed");
  unfocus(ar, W("s04", "Friday") + 0.05, 0.5); camTo(ar, W("s04", "Friday") + 0.05, { x: 0, y: 0, z: 1 }, 0.55);
  globalThis.__S4 = { ar };
}

// =====================================================================
// S5 — analyze: impact, overflow recovery, holds
// =====================================================================
{
  const st = SC.S5;
  const an = B.click_analyze;
  const tClick = W("s05", "three") - 0.45;
  cursor(st - 0.15, tClick + 0.55, [[st - 0.15, 900, 720], [tClick - 0.15, an.x, an.y], [tClick + 0.55, an.x + 6, an.y + 4]], [tClick]);
  video("05_analyze", "assets/footage/05_analyze.mp4", tClick - 0.43, tClick + 1.25, 0, { fadeIn: 0 });
  const kp = still("05b_kpis", "assets/stills/05b_kpis.jpg", tClick + 0.55, W("s05", "crew") - 0.6 + 0.3, { push: "up" });
  const k1 = B.kpis.kpis[0];
  camTo(kp, tClick + 0.6, camOn(k1.x + 520, k1.y + 84, 1.3), 1.0);
  focus(kp, W("s05", "three") + 0.05, [k1.x, k1.y, k1.w, 118], { pad: 8, radius: 18 });
  const c = camOn(k1.x + 520, k1.y + 84, 1.3);
  focusMove(kp, W("s05", "Four") - 0.15, [k1.x, k1.y + 116, k1.w, 50], { pad: 8, radius: 14 });
  const p = screen(c, k1.x + k1.w + 30, k1.y + 112);
  chip("4 providers asked · 2 never contacted", W("s05", "Four") + 0.1, W("s05", "crew") - 0.5, p.x, p.y, { tone: "solid", size: 28 });
  // mission map
  const tM = W("s05", "crew") - 0.6;
  unfocus(kp, tM - 0.85, 0.45); camTo(kp, tM - 0.85, { x: 0, y: 0, z: 1 }, 0.75);
  video("06_scroll_mission", "assets/footage/06_scroll_mission.mp4", tM, tM + 1.75, 0.2, { fadeIn: 0 });
  const ms = still("06_mission", "assets/stills/06_mission.jpg", tM + 1.65, SC.S6 + 0.7, { fadeIn: 0.15 });
  const sm = B.mission.summary, ho = B.mission.holds;
  const cm = camOn(1430, 860, 1.42);
  camTo(ms, tM + 1.7, cm, 1.0);
  focus(ms, W("s05", "overflow") - 0.5, [1132, 795, 572, 88], { pad: 8, radius: 12 });
  focusMove(ms, W("s05", "replacements") - 0.2, [ho.x, ho.y, ho.w, ho.h], { pad: 6, radius: 14 });
  const ph = screen(cm, ho.x, ho.y - 64);
  chip("Originals stay active until you approve", W("s05", "originals") - 0.2, SC.S6 + 0.1, ph.x, ph.y, { tone: "solid", size: 28 });
  S(W("s05", "overflow") - 0.5, "sfx_tick.wav", 0.25);
  S(W("s05", "replacements") - 0.2, "sfx_tick.wav", 0.25);
}

// =====================================================================
// S6 — plans compared; €659 under the €700 cap
// =====================================================================
{
  const st = SC.S6;
  const pl = still("07_plans", "assets/stills/07_plans.jpg", st, SC.S7 + 0.8, { push: "up" });
  const sel = B.plans.selector, A = B.plans.plans[0];
  focus(pl, W("s06", "plans") - 0.2, [sel.x, sel.y, sel.w, sel.h], { pad: 10, radius: 20 });
  const ca = camOn(A.x + A.w / 2 + 260, A.y + A.h / 2 + 40, 1.38);
  camTo(pl, W("s06", "winner") - 0.3, ca, 1.0);
  focusMove(pl, W("s06", "winner") - 0.2, [A.x, A.y, A.w, A.h], { pad: 8, radius: 18 });
  const pm = screen(ca, A.x + A.w + 34, A.y + 40);
  // budget meter (graphic, numbers from the plan card)
  const M = layer(W("s06", "659") - 0.2, SC.S7 + 0.1, (M) => `<div class="meter" id="${M}-m" style="left:${Math.round(pm.x)}px;top:${Math.round(pm.y)}px"><div class="mt">Plan A total</div><div class="mv">€659.00</div><div class="mbar"><div class="mfill" id="${M}-f"></div><div class="mcap"></div></div><div class="mlab"><span>€0</span><span id="${M}-cap">Cap €700 · €41 headroom</span></div></div>`, "", "", true);
  fromTo(`#${M}-m`, W("s06", "659") - 0.2, 0.5, { opacity: 0, x: -16 }, { opacity: 1, x: 0 });
  fromTo(`#${M}-f`, W("s06", "659") + 0.1, 1.0, { scaleX: 0 }, { scaleX: 659 / 700 }, "power3.out");
  fromTo(`#${M}-cap`, W("s06", "under") - 0.1, 0.4, { opacity: 0.35 }, { opacity: 1, color: "#5EEAD4" }, "power2.out");
  to(`#${M}-m`, SC.S7 - 0.3, 0.3, { opacity: 0 }, "power2.in");
  S(W("s06", "under") - 0.1, "sfx_tick.wav", 0.28, "under cap");
}

// =====================================================================
// S7 — bound approval (real dialog)
// =====================================================================
let dlgShot;
{
  const st = SC.S7;
  const ap = B.click_approve;
  const tClick = W("s07", "Nothing") + 0.15;
  const vc = camOn(1180, 560, 1.25);
  video("09_open_approval", "assets/footage/09_open_approval.mp4", tClick - 0.43, tClick + 0.95, 0, { push: "down", cam: vc });
  const aps = screen(vc, ap.x, ap.y);
  cursor(st + 0.05, tClick + 0.8, [[st + 0.05, 1010, 760], [tClick - 0.15, aps.x, aps.y], [tClick + 0.8, aps.x + 8, aps.y + 6]], [tClick]);
  const dl = still("09_dialog", "assets/stills/09_dialog_hi.jpg", tClick + 0.85, SC.S8 + 0.75, { fadeIn: 0.2, cam: vc });
  dlgShot = dl;
  const D = B.dialog; const rows = D.strong;
  const c1 = camOn(960, 470, 1.2);
  camTo(dl, tClick + 0.9, c1, 1.0);
  const ops_ = [557, rows[1].y - 6, 822, rows[1].h + 12];
  const cost = [557, rows[3].y - 6, 822, rows[4].y + rows[4].h - rows[3].y + 12];
  const c2 = camOn(965, 520, 1.42);
  camTo(dl, W("s07", "bound") - 0.3, c2, 0.9);
  focus(dl, W("s07", "operations") - 0.35, ops_, { pad: 6, radius: 12 });
  focusMove(dl, W("s07", "prices") - 0.2, cost, { pad: 6, radius: 12 });
  focusMove(dl, W("s07", "providers") - 0.2, [rows[1].x + rows[1].w + 6, rows[1].y - 4, 616, rows[1].h + 8], { pad: 6, radius: 12 });
  // binding explainer (graphic, values from packages/approval-engine semantics)
  const tCh = W("s07", "Change");
  dimAll(dl, tCh - 0.4, 0.4);
  const X = layer(tCh - 0.25, SC.S8 - 0.05, (X) => `<div class="bind" id="${X}-b">
      <div class="bt">Your approval is a fingerprint of the exact plan</div>
      <div class="brow"><span>HomeConnect price</span><b id="${X}-fee0">€39.00</b><b class="fee1" id="${X}-fee1">€39.01</b></div>
      <div class="brow"><span>SHA-256</span><code id="${X}-h0">a3f91c07 e2b84d55…</code><code class="h1" id="${X}-h1">9e41a07c 55f2b3e8…</code></div>
      <div class="bres"><div class="bok" id="${X}-ok">✓ matches your approval</div><div class="bko" id="${X}-ko">✕ no longer matches — nothing is committed</div></div>
      <div class="bnote" data-layout-ignore>illustration of the check in approval-engine</div></div>`, "", "", true);
  fromTo(`#${X}-b`, tCh - 0.25, 0.5, { opacity: 0, y: 20 }, { opacity: 1, y: 0 });
  set(`#${X}-fee1`, 0, { opacity: 0, y: 14 }); set(`#${X}-h1`, 0, { opacity: 0 }); set(`#${X}-ko`, 0, { opacity: 0 });
  const tFee = W("s07", "fee") - 0.1;
  to(`#${X}-fee0`, tFee, 0.25, { opacity: 0, y: -14 }, "power2.in");
  to(`#${X}-fee1`, tFee + 0.1, 0.3, { opacity: 1, y: 0 }, "power2.out");
  to(`#${X}-h0`, tFee + 0.3, 0.2, { opacity: 0 }); to(`#${X}-h1`, tFee + 0.45, 0.25, { opacity: 1 });
  to(`#${X}-ok`, tFee + 0.5, 0.2, { opacity: 0 });
  to(`#${X}-ko`, tFee + 0.6, 0.3, { opacity: 1 }, "power2.out");
  to(`#${X}-b`, SC.S8 - 0.36, 0.25, { opacity: 0 }, "power2.in");
  S(tFee + 0.1, "sfx_tick.wav", 0.25); S(tFee + 0.6, "sfx_error.wav", 0.22, "hash mismatch");
  unfocus(dl, SC.S8 - 0.31, 0.45, true); camTo(dl, SC.S8 - 0.31, { x: 0, y: 0, z: 1 }, 0.45);
}

// =====================================================================
// S8 — approve; providers verify signed receipts on their own pages
// =====================================================================
{
  const st = SC.S8;
  const cf = B.click_confirm;
  const tClick = W("s08", "approve") - 0.05;
  cursor(st + 0.02, tClick + 0.18, [[st + 0.02, 980, 700], [tClick - 0.12, cf.x, cf.y], [tClick + 0.18, cf.x + 3, cf.y + 2]], [tClick], { cut: true });
  video("10_commit_wall", "assets/footage/10_commit_wall.mp4", tClick - 0.43, tClick + 0.42, 0, { fadeIn: 0 });
  const tW = tClick + 0.18;
  const camW = camOn(960, 596, 1.1);
  const wb = still("08_wall_before", "assets/stills/08_wall_before_hi.jpg", tW, SC.S9 + 0.4, { fadeIn: 0, cam: camW });
  S(tW - 0.1, "sfx_whoosh_soft.wav", 0.3, "to wall");
  const urls = B.wallBefore.urls, sites = B.wallBefore.sites;
  const tOwn = W("s08", "own", 0);
  urls.forEach((u, i) => { const L = layer(tOwn - 0.3 + i * 0.18, W("s08", "Each") - 0.2, (L) => `<div class="ring" id="${L}-r" style="left:${Math.round(camW.x + camW.z * (u.x - 8))}px;top:${Math.round(camW.y + camW.z * (u.y - 6))}px;width:${Math.round(camW.z * (u.w + 16))}px;height:${Math.round(camW.z * (u.h + 12))}px"></div>`, "", "", true);
    fromTo(`#${L}-r`, tOwn - 0.3 + i * 0.18, 0.4, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1 }); S(tOwn - 0.3 + i * 0.18, "sfx_tick_low.wav", 0.14); });
  const su = screen(camW, 960, sites[0].y - 46);
  chip("Each provider’s own page, loaded cross-origin", tOwn, W("s08", "Each") - 0.2, su.x, su.y - 6, { tone: "solid", anchor: "center", size: 28 });
  // after-state revealed per column (real capture of the same frames after approval)
  const sitesA = B.wallClean.sites;
  const after = layer(tW, SC.S9 + 0.4, (A) => `<div class="cam" id="${A}-cam">${sitesA.map((s, i) => `<img class="colimg" id="${A}-c${i}" src="assets/stills/cols/after_${i}.jpg" alt="" style="left:${s.x - 2}px;top:${s.y - 2}px;width:${s.w + 4}px;height:${s.h + 4}px"><div class="flash" id="${A}-fl${i}" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px"></div>`).join("")}</div>`);
  set(`#${after}-cam`, 0, { x: camW.x, y: camW.y, scale: camW.z, transformOrigin: "0 0" });
  sites.forEach((_, i) => { set(`#${after}-c${i}`, 0, { opacity: 0 }); set(`#${after}-fl${i}`, 0, { opacity: 0 }); });
  // receipts travel in
  const tRec = W("s08", "receives") - 0.2;
  const P = layer(tRec, tRec + 1.4, (P) => sites.slice(0, 3).map((s, i) => `<div class="pkt" id="${P}-k${i}"></div>`).join(""), "", "", true);
  sites.slice(0, 3).forEach((s, i) => { const a = screen(camW, 960, 260), b = screen(camW, s.x + s.w / 2, s.y + 30);
    fromTo(`#${P}-k${i}`, tRec + i * 0.12, 0.85, { x: a.x - 9, y: a.y - 9, opacity: 0 }, { x: b.x - 9, y: b.y - 9, opacity: 1 }, "power2.inOut");
    to(`#${P}-k${i}`, tRec + i * 0.12 + 0.85, 0.2, { opacity: 0 }); });
  S(tRec, "sfx_pulse.wav", 0.12, "receipts sent");
  const flips = [W("s08", "checks") - 0.15, W("s08", "itself") - 0.05, W("s08", "and", 0) + 0.1];
  flips.forEach((t, i) => {
    to(`#${after}-c${i}`, t, 0.45, { opacity: 1 }, "power2.out");
    fromTo(`#${after}-fl${i}`, t, 0.7, { opacity: 0.85 }, { opacity: 0 }, "power2.out");
    S(t, `sfx_verify_${i + 1}.wav`, 0.22, `verify ${i + 1}`);
  });
  const cz = camOn(sites[0].x + sites[0].w / 2 + 40, 650, 1.62);
  const tZoom = flips[2] + 0.2;
  to(`#${wb.sid}-cam`, tZoom, 0.9, { x: cz.x, y: cz.y, scale: cz.z }, "power3.inOut");
  to(`#${after}-cam`, tZoom, 0.9, { x: cz.x, y: cz.y, scale: cz.z }, "power3.inOut");
  const pz = screen(cz, sites[0].x, sites[0].y - 10);
  chip("Verified on MoveCo’s own page", tZoom + 0.95, W("s08", "Powerflow") + 0.75, Math.max(40, pz.x), Math.max(30, pz.y - 60), { tone: "solid", size: 28 });
  to(`#${wb.sid}-cam`, W("s08", "Powerflow") + 0.7, 0.75, { x: camW.x, y: camW.y, scale: camW.z }, "power3.inOut");
  to(`#${after}-cam`, W("s08", "Powerflow") + 0.7, 0.75, { x: camW.x, y: camW.y, scale: camW.z }, "power3.inOut");
  wb.camKeys.push({ t: W("s08", "Powerflow") + 1.25, ...camW });
  const tPf = W("s08", "consulted") + 0.4;
  to(`#${after}-c3`, tPf, 0.45, { opacity: 1 }, "power2.out");
  S(tPf, "sfx_tick.wav", 0.3, "powerflow consulted");
  const s4 = sites[3]; const r = screen(camW, s4.x - 10, s4.y - 10);
  const R = layer(tPf - 0.1, SC.S9 + 0.1, (R) => `<div class="ring big" id="${R}-r" style="left:${Math.round(r.x)}px;top:${Math.round(r.y)}px;width:${Math.round(camW.z * (s4.w + 20))}px;height:${Math.round(camW.z * (s4.h + 20))}px"></div>`, "", "", true);
  fromTo(`#${R}-r`, tPf - 0.1, 0.5, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1 });
  const pp = screen(camW, s4.x + s4.w, s4.y - 54);
  chip("Consulted — nothing to change", tPf + 0.2, SC.S9 + 0.1, pp.x, pp.y, { tone: "solid", anchor: "right", size: 28 });
  chip("Real before/after states of the live pages · replayed slower", tW + 0.4, W("s08", "Powerflow") - 0.3, 1872, 34, { tone: "note", size: 22, anchor: "right" });
}

// =====================================================================
// S9 — trust center: hash chain, data minimization, chaos lab, benchmark
// =====================================================================
{
  const st = SC.S9;
  const tl_ = still("13_timeline", "assets/stills/13_timeline.jpg", st, W("s09", "exactly") + 0.25, { fadeIn: 0.35 });
  const bn = B.timeline.banner;
  const cb = camOn(bn.x + 520, bn.y + 30, 1.75);
  camTo(tl_, st + 0.2, cb, 1.3);
  const pb = screen(cb, bn.x, bn.y + bn.h + 22);
  chip("Tamper-evident chain", W("s09", "hash") - 0.1, W("s09", "exactly") + 0.15, pb.x, pb.y, { tone: "solid", size: 30 });
  focus(tl_, W("s09", "hash") - 0.25, [bn.x, bn.y, bn.w, bn.h], { pad: 8, radius: 12 });
  const pv = still("12b_privacy", "assets/stills/12b_privacy.jpg", W("s09", "exactly") - 0.45, W("s09", "15") + 0.95, { push: "left" });
  const row = B.privacy.rows[0];
  const cp = camOn(row.x + 560, row.y + 70, 1.5);
  set(`#${pv.sid}-cam`, 0, { x: cp.x, y: cp.y, scale: cp.z }); pv.camKeys = [{ t: 0, ...cp }];
  focus(pv, W("s09", "exactly") - 0.2, [row.x, row.y, row.w, row.h], { pad: 4, radius: 10 });
  const pr = screen(cp, row.x + 10, row.y - 62);
  chip("MoveCo receives only booking_ref + date", W("s09", "exactly") + 0.25, W("s09", "15") + 0.2, pr.x, pr.y, { tone: "solid", size: 28 });
  // chaos lab: real click on "Run all 15 scenarios"
  const run = B.click_chaosRun;
  const tRun = W("s09", "15") + 0.45;
  const ms0 = 1.95; const clickInClip = 2.72;
  video("12_trust_chaos", "assets/footage/12_trust_chaos.mp4", tRun - (clickInClip - ms0), tRun + 1.3, ms0, { push: "left" });
  cursor(tRun - 0.6, tRun + 0.6, [[tRun - 0.6, 1300, 900], [tRun - 0.12, run.x, run.y], [tRun + 0.6, run.x + 6, run.y + 4]], [tRun]);
  const ch = still("12_chaos", "assets/stills/12_chaos.jpg", tRun + 1.2, W("s09", "Zero") + 0.3, { fadeIn: 0.15 });
  const sm = B.chaos.summary;
  const cc = camOn(sm.x + 520, sm.y + 40, 1.7);
  camTo(ch, tRun + 1.2, cc, 0.8);
  focus(ch, tRun + 1.3, [sm.x, sm.y, sm.w, sm.h], { pad: 6, radius: 12 });
  S(tRun + 1.3, "sfx_verify_2.wav", 0.16, "15/15");
  const pf = still("02_proof_b", "assets/stills/02_proof.jpg", W("s09", "Zero") - 0.4, SC.S10 + 0.45, { push: "down" });
  const cz = camOn(1136, 630, 2.1);
  set(`#${pf.sid}-cam`, 0, { x: cz.x, y: cz.y, scale: cz.z }); pf.camKeys = [{ t: 0, ...cz }];
  focus(pf, W("s09", "Zero") - 0.1, [940, 618, 392, 24], { pad: 6, radius: 10 });
  const chips = ["42 automated tests", "Lighthouse 100 · all categories", "15 / 15 chaos scenarios", "0 cancel calls · 60 runs"];
  const tC = W("s09", "60") - 0.2;
  const CH = layer(tC, SC.S10 + 0.3, (C) => `<div class="proofchips">${chips.map((c, i) => `<span id="${C}-p${i}">${c}</span>`).join("")}</div>`, "", "", true);
  chips.forEach((_, i) => { fromTo(`#${CH}-p${i}`, tC + i * 0.12, 0.4, { opacity: 0, y: -10 }, { opacity: 1, y: 0 }); });
  to(`#${CH}`, SC.S10 - 0.1, 0.35, { opacity: 0 }, "power2.in");
}

// =====================================================================
// S10 — outro lockup over the verified hero
// =====================================================================
{
  const st = SC.S10;
  const he = still("15_hero_after", "assets/stills/15_hero_after.jpg", st, END, { fadeIn: 0.45 });
  to(`#${he.sid}-cam`, st, END - st, { x: -60, y: -30, scale: 1.06 }, "sine.inOut");
  to(`#${he.sid}-sh`, W("s10", "Continuity") + 0.25, 1.0, { opacity: 0 }, "power2.inOut");
  const L = layer(st, END, (L) => `<div class="veil" id="${L}-veil"></div><div class="lockup" id="${L}-lk">
     <div class="lockrow" id="${L}-mk"><svg width="96" height="96" viewBox="0 0 36 36"><rect width="36" height="36" rx="10" fill="#0B1220" stroke="rgba(255,255,255,.18)" stroke-width=".6"/><path d="M10 18a8 8 0 0 1 13.66-5.66M26 18a8 8 0 0 1-13.66 5.66" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="24" cy="12" r="2.6" fill="#34D399"/><circle cx="12" cy="24" r="2.6" fill="#6E8BFF"/></svg><span class="wordmark">CONTINUITY</span></div>
     <div class="tag1" id="${L}-t1">One change.</div>
     <div class="tag2" id="${L}-t2">Every commitment re-aligned.</div>
     <div class="cta" id="${L}-cta"><span class="url">toskaman.github.io/continuity-agentic-web</span><span class="try">Try the live demo — no API key needed</span></div>
     <div class="built" id="${L}-bl">Open Agentic Web Challenge · open source</div></div>`, "outro");
  fromTo(`#${L}-veil`, W("s10", "Continuity") - 0.1, 1.0, { opacity: 0 }, { opacity: 1 }, "power2.inOut");
  fromTo(`#${L}-mk`, W("s10", "Continuity") + 0.05, 0.8, { opacity: 0, y: 24 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-t1`, W("s10", "one") - 0.05, 0.6, { opacity: 0, y: 18 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-t2`, W("s10", "every") - 0.05, 0.7, { opacity: 0, y: 18 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-cta`, W("s10", "realigned") + 0.7, 0.6, { opacity: 0, y: 14 }, { opacity: 1, y: 0 });
  fromTo(`#${L}-bl`, W("s10", "realigned") + 1.2, 0.6, { opacity: 0 }, { opacity: 1 });
  S(W("s10", "Continuity") - 0.02, "sfx_final.wav", 0.34, "final chime");
  op("to", "#fadeout", END - 0.9, 0.85, null, { opacity: 1 }, "power1.in");
}

}
// =====================================================================
// captions (master only) — phrase chunks from ASR word timings
// =====================================================================
const capFix = (s) => s.replace(/\bContinuity\b/g, "CONTINUITY").replace(/\bPowerflow\b/g, "PowerFlow").replace(/\b659 euros\b/, "€659").replace(/hash chained/, "hash-chained").replace(/realigned/, "re-aligned").replace(/\breplans\b/, "re-plans").replace(/cross origin/, "cross-origin");
const captions = [];
if (!VOICE_READY) {
  for (const seg of Object.keys(VO)) {
    const ws = WORDS[seg]; let cur = [];
    const flush = () => { if (!cur.length) return; captions.push({ s: r3(VO[seg] + cur[0].start), e: r3(VO[seg] + cur.at(-1).end), text: capFix(cur.map((w) => w.text).join(" ")) }); cur = []; };
    ws.forEach((w, i) => { cur.push(w); const strong = /[.;:!?]$/.test(w.text); const soft = /,$/.test(w.text);
      if ((strong && cur.length >= 3) || (soft && cur.length >= 5) || cur.length >= 9 || (strong && i === ws.length - 1)) flush(); });
    flush();
  }
  // merge very short chunks with the next one and extend holds to the next start (max +0.6s)
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i], n = captions[i + 1];
    const endHold = n ? Math.min(n.s - 0.04, c.e + 0.9) : c.e + 0.9;
    c.e = r3(Math.max(c.e, endHold));
  }
  captions.forEach((c, i) => {
    const cid = `cap${i}`;
    html.push({ start: c.s, z: 4, el: `<div id="${cid}" class="clip capwrap" data-start="${c.s}" data-duration="${r3(c.e - c.s)}" data-layout-allow-overlap data-layout-allow-caption-zone><div class="cap" id="${cid}-i">${c.text}</div></div>` });
    fromTo(`#${cid}-i`, c.s, 0.14, { opacity: 0, y: 6 }, { opacity: 1, y: 0 }, "power2.out");
  });
}

// =====================================================================
// audio (narration, music, sfx) — preview mix; the master mix is done by mix.mjs
// =====================================================================
const audio = [];
if (!VOICE_READY) for (const [seg, t] of Object.entries(VO)) audio.push(`<audio id="vo-${seg}" src="assets/audio/${seg}.wav" data-start="${t}" data-volume="1"></audio>`);
audio.push(`<audio id="music" src="assets/audio/${BRAG ? "music_brag.wav" : "music_bed.wav"}" data-start="0" data-duration="${END}" data-volume="${VOICE_READY ? 0.22 : 0.16}"></audio>`);
sfx.sort((a, b) => a[0] - b[0]).forEach(([t, f, g], i) => audio.push(`<audio id="sfx${i}" src="assets/audio/${f}" data-start="${t}" data-volume="${g}"></audio>`));

// ---------- write ----------
const elements = html.map((h, i) => ({ ...h, i })).sort((a, b) => (a.z || 0) - (b.z || 0) || a.start - b.start || a.i - b.i).map((h) => h.el).join("\n");
const css = readFileSync("film.css", "utf8");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
<title>CONTINUITY — One change. Every commitment re-aligned. (${VOICE_READY ? "voice-ready" : "Kokoro reference"} cut)</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="${BRAG ? "brag" : "film"}" data-start="0" data-width="1920" data-height="1080" data-duration="${END}">
<div class="stage"><div class="glow"></div><div class="grid"></div></div>
${elements}
<div id="fadeout"></div>
${audio.join("\n")}
</div>
<script>
const OPS = ${JSON.stringify(ops)};
const tl = gsap.timeline({ paused: true });
const seen = new Set();
for (const [kind, sel, t, dur, a, b, ease] of OPS) {
  if (kind === "set") { tl.set(sel, b, t); }
  else if (kind === "to") tl.to(sel, { ...b, duration: dur, ease }, t);
  else if (kind === "fromTo") { tl.fromTo(sel, a, { ...b, duration: dur, ease, immediateRender: !seen.has(sel) }, t); seen.add(sel); }
  else if (kind === "count") { const el = document.querySelector(sel); const o = { v: a.v }; tl.to(o, { v: b.v, duration: dur, ease, onUpdate: () => { el.textContent = Math.round(o.v); } }, t); }
}
window.__timelines["${BRAG ? "brag" : "film"}"] = tl;
</script>
</body>
</html>
`;
writeFileSync(OUT, page);
writeFileSync(BRAG ? "data/cues_brag.json" : VOICE_READY ? "data/cues_voice_ready.json" : "data/cues.json", JSON.stringify({ end: END, vo: VOICE_READY ? {} : VO, sfx, captions, cues }, null, 1));
console.log(`wrote ${OUT}: ${html.length} elements, ${ops.length} ops, ${sfx.length} sfx, ${captions.length} captions`);
