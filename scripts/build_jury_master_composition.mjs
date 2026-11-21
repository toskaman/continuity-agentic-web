/**
 * Generates the complete 115.94s HyperFrames Jury Master Composition (`Z:\continuity-titan-omega\jury-film\index.html`)
 * and synchronized `.srt` / `.vtt` subtitle files from the exact measured Kokoro WAV durations (`timing_manifest.json`)
 * and exact 1920x1080 `getBoundingClientRect()` coordinates (`ui_bounds.json`).
 */

import { readFile, writeFile } from "node:fs/promises";

const timing = JSON.parse(await readFile("Z:\\continuity-titan-omega\\kokoro\\timing_manifest.json", "utf8"));
const bounds = JSON.parse(await readFile("Z:\\continuity-titan-omega\\footage\\ui_bounds.json", "utf8"));

const S = Object.fromEntries(timing.scenes.map((s) => [s.id, s]));

function fmtSrtTime(sec) {
  const msTotal = Math.round(sec * 1000);
  const hh = String(Math.floor(msTotal / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor((msTotal % 3_600_000) / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((msTotal % 60_000) / 1000)).padStart(2, "0");
  const mmm = String(msTotal % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

// Write exact SRT & VTT caption files
const srtLines = timing.scenes.map(
  (s, idx) => `${idx + 1}\n${fmtSrtTime(s.voStart)} --> ${fmtSrtTime(s.voEnd)}\n${s.caption}\n`,
);
await writeFile("Z:\\continuity-titan-omega\\CONTINUITY_JURY_MASTER_OMEGA.en.srt", srtLines.join("\n"), "utf8");
await writeFile("docs/video-production/CONTINUITY_JURY_MASTER_OMEGA.en.srt", srtLines.join("\n"), "utf8");

const totalDur = timing.totalDurationSec; // 115.94s

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CONTINUITY — Open Agentic Web Challenge (Jury Master)</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1920px;
      height: 1080px;
      background: #080b12;
      color: #f8fafc;
      font-family: Inter, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    #root {
      position: relative;
      width: 1920px;
      height: 1080px;
      background: #080b12;
      overflow: hidden;
    }
    .stage-bg {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 22%, #111c33 0%, #080b12 76%);
      z-index: 0;
    }
    .layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    img.plate, video.plate-vid {
      position: absolute;
      left: 0;
      top: 0;
      width: 1920px;
      height: 1080px;
      object-fit: cover;
    }

    /* Top Chapter Pill (>= 28px readable floor!) */
    .chapter-pill {
      position: absolute;
      left: 192px;
      top: 36px;
      background: rgba(14, 20, 34, 0.94);
      border: 1px solid #334669;
      border-left: 4px solid #60a5fa;
      border-radius: 10px;
      padding: 10px 22px;
      font-size: 28px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.01em;
      z-index: 30;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
    }

    /* Pixel-Accurate Focus Frames with Gentle Dimming Surround */
    .focus-frame-blue {
      position: absolute;
      border: 3px solid #60a5fa;
      border-radius: 10px;
      box-shadow: 0 0 0 9999px rgba(8, 11, 18, 0.56);
      z-index: 18;
    }
    .focus-frame-amber {
      position: absolute;
      border: 3px solid #fbbf24;
      border-radius: 10px;
      box-shadow: 0 0 0 9999px rgba(8, 11, 18, 0.56);
      z-index: 18;
    }
    .focus-frame-green {
      position: absolute;
      border: 3px solid #10b981;
      border-radius: 10px;
      box-shadow: 0 0 0 9999px rgba(8, 11, 18, 0.54);
      z-index: 18;
    }

    /* Scene 1 & Scene 2: 2D Explainer Stage */
    .explainer-stage {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 30%, #101b30 0%, #080b12 75%);
      padding: 86px 192px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 28px;
    }
    .exp-title {
      font-size: 52px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #f8fafc;
    }
    .exp-sub {
      font-size: 30px;
      font-weight: 600;
      color: #cbd5e1;
    }
    .cards-6-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
    }
    .svc-card {
      background: #0e1422;
      border: 1px solid #23304a;
      border-radius: 12px;
      padding: 20px 22px;
    }
    .svc-card.risk {
      border-color: #f59e0b;
      background: #1c160c;
    }
    .svc-card.safe {
      border-color: #10b981;
      background: #091e16;
    }
    .svc-name {
      font-size: 28px;
      font-weight: 800;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    .svc-meta {
      font-size: 28px;
      font-weight: 600;
      color: #cbd5e1;
    }

    /* Before vs After Comparison Cards (No Central Bar!) */
    .ba-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 36px;
      margin-top: 8px;
    }
    .ba-card {
      background: #0e1422;
      border: 2px solid #23304a;
      border-radius: 14px;
      padding: 30px 32px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ba-card.before { border-color: #ef4444; }
    .ba-card.after { border-color: #10b981; background: #0a1826; }
    .ba-badge {
      font-size: 28px;
      font-weight: 800;
      color: #f8fafc;
    }
    .ba-big {
      font-size: 58px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #f8fafc;
    }
    .ba-card.before .ba-big { color: #fca5a5; }
    .ba-card.after .ba-big { color: #6ee7b7; }
    .ba-desc {
      font-size: 28px;
      font-weight: 600;
      color: #cbd5e1;
      line-height: 1.38;
    }

    /* Peer Origin Badges in Scene 3 */
    .peer-float-row {
      position: absolute;
      left: 192px;
      right: 192px;
      bottom: 132px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      z-index: 25;
    }
    .peer-float-pill {
      background: rgba(14, 20, 34, 0.94);
      border: 1px solid #334669;
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
      font-size: 28px;
      font-weight: 800;
      color: #f8fafc;
    }

    /* Burned-In Accessible Caption Bar (Safe Margin Bottom 42px, >= 28px) */
    .caption-bar {
      position: absolute;
      left: 50%;
      bottom: 34px;
      transform: translateX(-50%);
      background: rgba(8, 11, 18, 0.92);
      border: 1px solid #334669;
      border-radius: 10px;
      padding: 10px 26px;
      font-size: 28px;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
      z-index: 60;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
    }

    /* Outro Stage */
    .outro-full {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 40%, #132342 0%, #080b12 75%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 100px 192px;
      gap: 20px;
      z-index: 35;
    }
    .outro-kicker {
      font-family: "JetBrains Mono", monospace;
      font-size: 28px;
      font-weight: 700;
      color: #93c5fd;
      background: #141c2f;
      border: 1px solid #334669;
      padding: 10px 24px;
      border-radius: 8px;
    }
    .outro-h1 {
      font-size: 92px;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: #f8fafc;
    }
    .outro-lead {
      font-size: 38px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .outro-url {
      font-family: "JetBrains Mono", monospace;
      font-size: 28px;
      font-weight: 700;
      color: #6ee7b7;
      background: #091e16;
      border: 1px solid #10b981;
      padding: 12px 26px;
      border-radius: 8px;
      margin-top: 8px;
    }

    /* Virtual Pointer + Click Pulse */
    .v-cursor {
      position: absolute;
      left: 0;
      top: 0;
      width: 36px;
      height: 36px;
      z-index: 70;
      pointer-events: none;
    }
    .click-ring {
      position: absolute;
      left: -12px;
      top: -12px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid #60a5fa;
      opacity: 0;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="jury-main" data-start="0" data-duration="${totalDur}" data-width="1920" data-height="1080">
    <div class="stage-bg"></div>

    <!-- =======================================================================
         SCENE 1 (${S.s1.sceneStart}s – ${S.s1.sceneEnd}s): REAL-WORLD HOOK — 6 COMMITMENTS AT RISK
         ======================================================================= -->
    <div id="s1-scene" class="clip layer" data-start="${S.s1.sceneStart}" data-duration="${S.s1.sceneDur}" data-track-index="1" data-layout-allow-overlap data-hold="true" style="z-index: 4;">
      <div id="s1-stage" class="explainer-stage">
        <div class="exp-title">One Relocation Date Shift: Tuesday → Friday</div>
        <div class="exp-sub">Six independent commitments across autonomous websites suddenly collide:</div>
        <div class="cards-6-grid">
          <div id="s1-c1" class="svc-card risk"><div class="svc-name">MoveCo Van</div><div class="svc-meta">Tue Nov 16 · €390</div></div>
          <div id="s1-c2" class="svc-card risk"><div class="svc-name">PermitFlow Bay</div><div class="svc-meta">Tue Nov 16 · €35</div></div>
          <div id="s1-c3" class="svc-card risk"><div class="svc-name">HomeConnect Fiber</div><div class="svc-meta">Tue Nov 16 · €49</div></div>
          <div id="s1-c4" class="svc-card safe"><div class="svc-name">PowerFlow Grid</div><div class="svc-meta">Tue Nov 16 · €30</div></div>
          <div id="s1-c5" class="svc-card safe"><div class="svc-name">CityVault Pod</div><div class="svc-meta">Nov 15–29 · €75</div></div>
          <div id="s1-c6" class="svc-card safe"><div class="svc-name">NordicLoom Sofa</div><div class="svc-meta">Sat Nov 20 · €45</div></div>
        </div>
      </div>
      <div class="caption-bar">${S.s1.caption}</div>
    </div>

    <!-- =======================================================================
         SCENE 2 (${S.s2.sceneStart}s – ${S.s2.sceneEnd}s): BEFORE VS AFTER TRANSFORMATION
         ======================================================================= -->
    <div id="s2-scene" class="clip layer" data-start="${S.s2.sceneStart}" data-duration="${S.s2.sceneDur}" data-track-index="1" data-layout-allow-overlap data-hold="true" style="z-index: 5;">
      <div class="explainer-stage">
        <div class="exp-title">Measured Transformation on the Same 6-Service Mission</div>
        <div class="ba-row">
          <div id="s2-before" class="ba-card before">
            <div class="ba-badge">BEFORE — MANUAL COORDINATION</div>
            <div class="ba-big">18 Manual Steps</div>
            <div class="ba-desc">6 separate logins, availability checks &amp; rebookings. High risk of premature cancellation fees.</div>
          </div>
          <div id="s2-after" class="ba-card after">
            <div class="ba-badge">AFTER — CONTINUITY ENGINE</div>
            <div class="ba-big">2 User Actions</div>
            <div class="ba-desc">1 natural-language request + 1 SHA-256 bound approval. Zero premature cancellations.</div>
          </div>
        </div>
      </div>
      <div class="caption-bar">${S.s2.caption}</div>
    </div>

    <!-- =======================================================================
         SCENE 3 (${S.s3.sceneStart}s – ${S.s3.sceneEnd}s): BLENDER 3D MESH + LIVE INDEPENDENT PEERS
         ======================================================================= -->
    <video id="s3-mesh-vid" class="clip plate-vid" data-start="${S.s3.sceneStart}" data-duration="11.5" data-playback-rate="0.52" data-track-index="1" src="assets/renders3d/agentic_mesh_3d.mp4" muted playsinline style="z-index: 6;"></video>
    <div id="s3-mesh-part" class="clip layer" data-start="${S.s3.sceneStart}" data-duration="11.5" data-track-index="2" data-layout-allow-overlap data-hold="true" style="z-index: 7;">
      <div class="chapter-pill">Open Agentic Web MVP 0.2 · Browser-Executed Peer Networks</div>
      <div id="s3-peers" class="peer-float-row">
        <div class="peer-float-pill">MoveCo Express</div>
        <div class="peer-float-pill">PermitFlow Civic</div>
        <div class="peer-float-pill">HomeConnect Fiber</div>
        <div class="peer-float-pill">PowerFlow Energy</div>
      </div>
      <div class="caption-bar">${S.s3.caption}</div>
    </div>

    <div id="s3-peer-ui" class="clip layer" data-start="${Number((S.s3.sceneStart + 11.5).toFixed(2))}" data-duration="${Number((S.s3.sceneDur - 11.5).toFixed(2))}" data-track-index="1" data-layout-allow-overlap data-hold="true" style="z-index: 8;">
      <div id="s3-peer-cam" class="layer">
        <img class="plate" src="assets/footage/plate_09_peer_moveco.png" alt="MoveCo Express independent Open Agentic Website">
        <div id="s3-peer-focus" class="focus-frame-blue" style="left: ${bounds.plate09.artifactLinks.x - 10}px; top: ${bounds.plate09.artifactLinks.y - 10}px; width: ${bounds.plate09.artifactLinks.w + 20}px; height: ${bounds.plate09.artifactLinks.h + 20}px;"></div>
      </div>
      <div class="caption-bar">Each peer publishes agent-manifest.json, .network.json &amp; A2A Agent Card.</div>
    </div>

    <!-- =======================================================================
         SCENE 4 (${S.s4.sceneStart}s – ${S.s4.sceneEnd}s): RIPPLE FAILURE ARMED & BOUNDED IMPACT
         ======================================================================= -->
    <div id="s4-arm" class="clip layer" data-start="${S.s4.sceneStart}" data-duration="5.4" data-track-index="1" data-layout-allow-overlap style="z-index: 8;">
      <div id="s4-cam1" class="layer">
        <img class="plate" src="assets/footage/plate_02_ripple_armed.png" alt="Ripple failure armed on CONTINUITY">
        <div id="s4-focus-ripple" class="focus-frame-amber" style="left: ${bounds.plate02.injectRippleBtn.x - 8}px; top: ${bounds.plate02.injectRippleBtn.y - 6}px; width: ${bounds.plate02.injectRippleBtn.w + 16}px; height: ${bounds.plate02.injectRippleBtn.h + 12}px;"></div>
      </div>
      <div class="caption-bar">${S.s4.caption}</div>
    </div>

    <div id="s4-impact" class="clip layer" data-start="${Number((S.s4.sceneStart + 5.4).toFixed(2))}" data-duration="${Number((S.s4.sceneDur - 5.4).toFixed(2))}" data-track-index="1" data-layout-allow-overlap style="z-index: 9;">
      <div id="s4-cam2" class="layer">
        <img class="plate" src="assets/footage/plate_03_prepared_top.png" alt="Bounded impact telemetry 3 affected 3 preserved">
        <div id="s4-focus-kpis" class="focus-frame-blue" style="left: ${bounds.plate03.kpiAffected.x - 10}px; top: ${bounds.plate03.kpiAffected.y - 10}px; width: ${bounds.plate03.kpiPreserved.x + bounds.plate03.kpiPreserved.w - bounds.plate03.kpiAffected.x + 20}px; height: ${bounds.plate03.kpiAffected.h + 20}px;"></div>
      </div>
      <div class="caption-bar">3 / 6 Affected · 3 Preserved Untouched · 2 Unnecessary Providers Never Contacted.</div>
    </div>

    <!-- =======================================================================
         SCENE 5 (${S.s5.sceneStart}s – ${S.s5.sceneEnd}s): OVERFLOW RECOVERY & SLOT HOLDS (€659 <= €700)
         ======================================================================= -->
    <div id="s5-scene" class="clip layer" data-start="${S.s5.sceneStart}" data-duration="${S.s5.sceneDur}" data-track-index="1" data-layout-allow-overlap data-hold="true" style="z-index: 10;">
      <div id="s5-cam" class="layer">
        <img class="plate" src="assets/footage/plate_04_prepared_graph_and_holds.png" alt="Minimal-change plan and temporary holds">
        <div id="s5-focus-pkg" class="focus-frame-amber" style="left: ${bounds.plate04.changeSummary.x - 10}px; top: ${bounds.plate04.changeSummary.y - 10}px; width: ${bounds.plate04.changeSummary.w + 20}px; height: ${bounds.plate04.planA.y + bounds.plate04.planA.h - bounds.plate04.changeSummary.y + 20}px;"></div>
      </div>
      <div class="caption-bar">${S.s5.caption}</div>
    </div>

    <!-- =======================================================================
         SCENE 6 (${S.s6.sceneStart}s – ${S.s6.sceneEnd}s): SHA-256 BOUND APPROVAL -> ED25519 VERIFIED COMMIT
         ======================================================================= -->
    <div id="s6-modal" class="clip layer" data-start="${S.s6.sceneStart}" data-duration="6.6" data-track-index="1" data-layout-allow-overlap data-hold="true" style="z-index: 11;">
      <div id="s6-cam1" class="layer">
        <img class="plate" src="assets/footage/plate_05_approval_modal.png" alt="SHA-256 bound human confirmation dialog">
        <div id="s6-focus-modal" class="focus-frame-blue" style="left: ${bounds.plate05.modalDialog.x - 8}px; top: ${bounds.plate05.modalDialog.y - 8}px; width: ${bounds.plate05.modalDialog.w + 16}px; height: ${bounds.plate05.modalDialog.h + 16}px;"></div>
      </div>
      <div class="caption-bar">${S.s6.caption}</div>
    </div>

    <div id="s6-committed" class="clip layer" data-start="${Number((S.s6.sceneStart + 6.6).toFixed(2))}" data-duration="${Number((S.s6.sceneDur - 6.6).toFixed(2))}" data-track-index="1" data-layout-allow-overlap style="z-index: 12;">
      <div id="s6-cam2" class="layer">
        <img class="plate" src="assets/footage/plate_06_committed_ed25519_verified.png" alt="Green COMMITTED graph and Ed25519 receipts">
        <div id="s6-focus-rcpt" class="focus-frame-green" style="left: ${bounds.plate06.opCard1.x - 10}px; top: ${bounds.plate06.opCard1.y - 10}px; width: ${bounds.plate06.opCard1.w + 20}px; height: ${bounds.plate06.opCard1.h + 20}px;"></div>
      </div>
      <div class="caption-bar">All 3 modified commitments COMMITTED with VERIFIED_ED25519_DEMO_PROVIDER_SIGNATURE.</div>
    </div>

    <!-- =======================================================================
         SCENE 7 (${S.s7.sceneStart}s – ${S.s7.sceneEnd}s): CHAOS LAB (15/15) + OTARI RUNTIME
         ======================================================================= -->
    <div id="s7-chaos" class="clip layer" data-start="${S.s7.sceneStart}" data-duration="9.4" data-track-index="1" data-layout-allow-overlap style="z-index: 13;">
      <div id="s7-cam1" class="layer">
        <img class="plate" src="assets/footage/plate_07_chaos_lab_15_passed.png" alt="Chaos Lab 15/15 scenarios passed">
        <div id="s7-focus-row3" class="focus-frame-green" style="left: ${bounds.plate07.chaosRow3.x - 8}px; top: ${bounds.plate07.chaosRow3.y - 6}px; width: ${bounds.plate07.chaosRow3.w + 16}px; height: ${bounds.plate07.chaosRow3.h + 12}px;"></div>
      </div>
      <div class="caption-bar">${S.s7.caption}</div>
    </div>

    <div id="s7-otari" class="clip layer" data-start="${Number((S.s7.sceneStart + 9.4).toFixed(2))}" data-duration="${Number((S.s7.sceneDur - 9.4).toFixed(2))}" data-track-index="1" data-layout-allow-overlap style="z-index: 14;">
      <div id="s7-cam2" class="layer">
        <img class="plate" src="assets/footage/plate_08_runtime_otari.png" alt="Open Agentic Web browser runtime and Mozilla Otari BYOK">
        <div id="s7-focus-rt" class="focus-frame-blue" style="left: ${bounds.plate08.nsHeader.x - 8}px; top: ${bounds.plate08.nsHeader.y - 8}px; width: ${bounds.plate08.nsHeader.w + 16}px; height: ${bounds.plate08.nsHeader.h + 16}px;"></div>
      </div>
      <div class="caption-bar">Mozilla Otari BYOK Router + 17 Reusable Apache-2.0 Packages + NANDA A2A Cards.</div>
    </div>

    <!-- =======================================================================
         SCENE 8 (${S.s8.sceneStart}s – ${S.s8.sceneEnd}s): MEMORABLE OUTRO LOCKUP
         ======================================================================= -->
    <div id="s8-outro" class="clip layer" data-start="${S.s8.sceneStart}" data-duration="${S.s8.sceneDur}" data-track-index="1" data-layout-allow-overlap style="z-index: 20;">
      <div id="s8-card" class="outro-full" data-hold="true">
        <div class="outro-kicker">COGNIZANT OPEN AGENTIC WEB CHALLENGE · APACHE-2.0</div>
        <div class="outro-h1">CONTINUITY</div>
        <div class="outro-lead">One change. Every commitment re-aligned.</div>
        <div class="outro-url">toskaman.github.io/continuity-agentic-web</div>
      </div>
    </div>

    <!-- =======================================================================
         SYNCHRONIZED VIRTUAL CURSOR OVER UI SCENES (38.2s – 108.4s)
         ======================================================================= -->
    <div id="ui-cursor" class="clip v-cursor" data-start="${Number((S.s3.sceneStart + 11.6).toFixed(2))}" data-duration="${Number((S.s7.sceneEnd - (S.s3.sceneStart + 11.6)).toFixed(2))}" data-track-index="2" data-layout-allow-overlap style="z-index: 70;">
      <div id="click-pulse" class="click-ring"></div>
      <svg id="cursor-arrow" width="36" height="36" viewBox="0 0 36 36">
        <path d="M6 4L29 15L18 19L13 30L6 4Z" fill="#ffffff" stroke="#0f172a" stroke-width="2.4" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- =======================================================================
         AUDIO TRACKS: KOKORO NARRATION + DUCKED MUSIC + SYNCHRONIZED SFX
         ======================================================================= -->
    <audio id="vo-s1" class="clip" data-start="${S.s1.voStart}" data-duration="${S.s1.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s1.wav"></audio>
    <audio id="vo-s2" class="clip" data-start="${S.s2.voStart}" data-duration="${S.s2.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s2.wav"></audio>
    <audio id="vo-s3" class="clip" data-start="${S.s3.voStart}" data-duration="${S.s3.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s3.wav"></audio>
    <audio id="vo-s4" class="clip" data-start="${S.s4.voStart}" data-duration="${S.s4.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s4.wav"></audio>
    <audio id="vo-s5" class="clip" data-start="${S.s5.voStart}" data-duration="${S.s5.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s5.wav"></audio>
    <audio id="vo-s6" class="clip" data-start="${S.s6.voStart}" data-duration="${S.s6.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s6.wav"></audio>
    <audio id="vo-s7" class="clip" data-start="${S.s7.voStart}" data-duration="${S.s7.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s7.wav"></audio>
    <audio id="vo-s8" class="clip" data-start="${S.s8.voStart}" data-duration="${S.s8.voDur}" data-track-index="3" data-volume="1" src="assets/kokoro/s8.wav"></audio>

    <!-- Continuous Licensed Music Bed (ende.app CC BY 4.0) ducked -18dB below dialogue -->
    <audio id="bgm-1" class="clip" data-start="0" data-duration="58" data-track-index="4" data-volume="0.12" data-fade-in="0.6" data-fade-out="1.2" src="assets/music/bed.mp3"></audio>
    <audio id="bgm-2" class="clip" data-start="58" data-duration="${Number((totalDur - 58).toFixed(2))}" data-track-index="5" data-volume="0.12" data-fade-in="1.0" data-fade-out="2.0" src="assets/music/bed.mp3"></audio>

    <!-- Synchronized Genuine Click & Transition Accents (each on clean non-overlapping slot) -->
    <audio id="sfx-s2" class="clip" data-start="${S.s2.sceneStart}" data-duration="0.18" data-track-index="6" data-volume="0.28" src="assets/sfx/impact/impactSoft_medium_001.ogg"></audio>
    <audio id="sfx-s3" class="clip" data-start="${S.s3.sceneStart}" data-duration="0.18" data-track-index="7" data-volume="0.28" src="assets/sfx/impact/impactSoft_medium_001.ogg"></audio>
    <audio id="sfx-click-analyze" class="clip" data-start="${Number((S.s4.sceneStart + 4.9).toFixed(2))}" data-duration="0.02" data-track-index="8" data-volume="0.26" src="assets/sfx/interface/click_002.ogg"></audio>
    <audio id="sfx-click-commit" class="clip" data-start="${Number((S.s6.sceneStart + 6.1).toFixed(2))}" data-duration="0.02" data-track-index="9" data-volume="0.28" src="assets/sfx/interface/click_002.ogg"></audio>
    <audio id="sfx-outro-bell" class="clip" data-start="${S.s8.sceneStart}" data-duration="1.48" data-track-index="10" data-volume="0.30" src="assets/sfx/impact/impactBell_heavy_000.ogg"></audio>
  </div>

  <script>
    const tl = gsap.timeline({ paused: true });

    // Scene 1 progressive card entrance
    tl.fromTo("#s1-c1, #s1-c2, #s1-c3", { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.16, duration: 0.45, ease: "expo.out" }, 0.35);
    tl.fromTo("#s1-c4, #s1-c5, #s1-c6", { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.16, duration: 0.45, ease: "expo.out" }, 2.4);

    // Scene 2 Before -> After cards
    tl.fromTo("#s2-before", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, ease: "expo.out" }, ${S.s2.sceneStart + 0.3});
    tl.fromTo("#s2-after", { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.55, ease: "expo.out" }, ${S.s2.sceneStart + 2.8});

    // Scene 3 peer labels & MoveCo artifact zoom (subtle 3% push-in)
    tl.fromTo("#s3-peers .peer-float-pill", { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.14, duration: 0.45, ease: "expo.out" }, ${S.s3.sceneStart + 1.2});
    tl.fromTo("#s3-peer-cam", { scale: 1, transformOrigin: "${bounds.plate09.artifactLinks.cx}px ${bounds.plate09.artifactLinks.cy}px" }, { scale: 1.03, duration: 1.2, ease: "power2.inOut" }, ${S.s3.sceneStart + 12.0});

    // Virtual Cursor Trajectory — Pixel-Locked to Measured 1920x1080 Bounding Boxes!
    let firstPulse = true;
    const pulseAt = (t) => {
      tl.fromTo(
        "#click-pulse",
        { opacity: 0.95, scale: 0.4 },
        { opacity: 0, scale: 1.5, duration: 0.38, ease: "power2.out", immediateRender: firstPulse },
        t,
      );
      firstPulse = false;
    };

    // MoveCo peer artifact links
    tl.fromTo("#ui-cursor", { x: 960, y: 540 }, { x: ${bounds.plate09.artifactLinks.cx}, y: ${bounds.plate09.artifactLinks.cy}, duration: 0.9, ease: "power3.inOut" }, ${S.s3.sceneStart + 11.8});
    tl.to("#ui-cursor", { x: ${bounds.plate09.bookingCard.cx}, y: ${bounds.plate09.bookingCard.cy}, duration: 1.1, ease: "power3.inOut" }, ${S.s3.sceneStart + 14.8});

    // Scene 4: Inspect Ripple Failure button -> Move to Analyze button & genuine click!
    tl.to("#ui-cursor", { x: ${bounds.plate02.injectRippleBtn.cx}, y: ${bounds.plate02.injectRippleBtn.cy}, duration: 0.85, ease: "power3.inOut" }, ${S.s4.sceneStart + 0.4});
    tl.to("#ui-cursor", { x: ${bounds.plate02.analyzeBtn.cx}, y: ${bounds.plate02.analyzeBtn.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s4.sceneStart + 3.6});
    pulseAt(${S.s4.sceneStart + 4.9});
    tl.fromTo("#s4-cam1", { scale: 1, transformOrigin: "${bounds.plate02.analyzeBtn.cx}px ${bounds.plate02.analyzeBtn.cy}px" }, { scale: 1.028, duration: 0.35, yoyo: true, repeat: 1, ease: "power2.inOut" }, ${S.s4.sceneStart + 4.9});

    // Scene 4B: Point to Affected (3/6) then Preserved Untouched (3)
    tl.to("#ui-cursor", { x: ${bounds.plate03.kpiAffected.cx}, y: ${bounds.plate03.kpiAffected.cy}, duration: 0.85, ease: "power3.inOut" }, ${S.s4.sceneStart + 5.8});
    tl.to("#ui-cursor", { x: ${bounds.plate03.kpiPreserved.cx}, y: ${bounds.plate03.kpiPreserved.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s4.sceneStart + 9.4});
    tl.to("#ui-cursor", { x: ${bounds.plate03.kpiCost.cx}, y: ${bounds.plate03.kpiCost.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s4.sceneStart + 12.0});

    // Scene 5: Overflow Alert -> Plan A (€659.00) -> Active Hold IDs
    tl.fromTo("#s5-cam", { scale: 1, transformOrigin: "${bounds.plate04.changeSummary.cx}px ${bounds.plate04.changeSummary.cy}px" }, { scale: 1.032, duration: 1.4, ease: "power2.inOut" }, ${S.s5.sceneStart + 0.5});
    tl.to("#ui-cursor", { x: ${bounds.plate04.changeSummary.cx}, y: ${bounds.plate04.changeSummary.cy}, duration: 0.9, ease: "power3.inOut" }, ${S.s5.sceneStart + 0.6});
    tl.to("#ui-cursor", { x: ${bounds.plate04.planA.cx}, y: ${bounds.plate04.planA.cy}, duration: 0.9, ease: "power3.inOut" }, ${S.s5.sceneStart + 5.5});
    tl.to("#ui-cursor", { x: ${bounds.plate04.firstOpCard.cx}, y: ${bounds.plate04.firstOpCard.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s5.sceneStart + 10.2});
    tl.to("#ui-cursor", { x: ${bounds.plate04.graphSvg.cx}, y: ${bounds.plate04.graphSvg.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s5.sceneStart + 13.5});

    // Scene 6: Modal Inspection -> Genuine Click on "Approve & commit change package" -> Ed25519 Receipt!
    tl.to("#ui-cursor", { x: ${bounds.plate05.modalDialog.cx}, y: ${bounds.plate05.modalDialog.cy - 40}, duration: 0.85, ease: "power3.inOut" }, ${S.s6.sceneStart + 0.6});
    tl.to("#ui-cursor", { x: ${bounds.plate05.confirmBtn.cx}, y: ${bounds.plate05.confirmBtn.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s6.sceneStart + 4.5});
    pulseAt(${S.s6.sceneStart + 6.1});
    tl.fromTo("#s6-cam1", { scale: 1, transformOrigin: "${bounds.plate05.confirmBtn.cx}px ${bounds.plate05.confirmBtn.cy}px" }, { scale: 1.03, duration: 0.35, ease: "power2.out" }, ${S.s6.sceneStart + 6.1});

    // Scene 6B: Verified Green Graph & Ed25519 Signature Card
    tl.fromTo("#s6-cam2", { scale: 1.025, transformOrigin: "${bounds.plate06.opCard1.cx}px ${bounds.plate06.opCard1.cy}px" }, { scale: 1, duration: 1.2, ease: "power2.out" }, ${S.s6.sceneStart + 6.7});
    tl.to("#ui-cursor", { x: ${bounds.plate06.graphSvg.cx}, y: ${bounds.plate06.graphSvg.cy}, duration: 0.9, ease: "power3.inOut" }, ${S.s6.sceneStart + 7.2});
    tl.to("#ui-cursor", { x: ${bounds.plate06.opCard1.cx}, y: ${bounds.plate06.opCard1.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s6.sceneStart + 10.8});
    tl.to("#ui-cursor", { x: ${bounds.plate06.nodeInspector.cx}, y: ${bounds.plate06.nodeInspector.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s6.sceneStart + 13.5});

    // Scene 7: Chaos Lab Row #3 (Timeout Reconciled) -> Row #5 (Forged Receipt) -> Mozilla Otari Runtime
    tl.to("#ui-cursor", { x: ${bounds.plate07.chaosSummary.cx}, y: ${bounds.plate07.chaosSummary.cy}, duration: 0.8, ease: "power3.inOut" }, ${S.s7.sceneStart + 0.6});
    tl.to("#ui-cursor", { x: ${bounds.plate07.chaosRow3.cx}, y: ${bounds.plate07.chaosRow3.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s7.sceneStart + 3.4});
    tl.to("#ui-cursor", { x: ${bounds.plate07.chaosRow5.cx}, y: ${bounds.plate07.chaosRow5.cy}, duration: 0.95, ease: "power3.inOut" }, ${S.s7.sceneStart + 6.6});
    tl.to("#ui-cursor", { x: ${bounds.plate08.nsHeader.cx}, y: ${bounds.plate08.nsHeader.cy}, duration: 0.9, ease: "power3.inOut" }, ${S.s7.sceneStart + 9.9});
    tl.to("#ui-cursor", { x: ${bounds.plate08.nsAgents.cx}, y: ${bounds.plate08.nsAgents.cy - 180}, duration: 0.95, ease: "power3.inOut" }, ${S.s7.sceneStart + 12.8});

    // Scene 8: Outro Lockup (lands cleanly, holds dead still)
    tl.fromTo("#s8-card", { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.55, ease: "expo.out" }, ${S.s8.sceneStart + 0.15});

    window.__timelines = window.__timelines || {};
    window.__timelines["jury-main"] = tl;
  </script>
</body>
</html>
`;

await writeFile("Z:\\continuity-titan-omega\\jury-film\\index.html", html, "utf8");
console.log(`Generated Z:\\continuity-titan-omega\\jury-film\\index.html (${totalDur}s) + .srt captions.`);
