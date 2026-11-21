/**
 * CONTINUITY — "wow" layer (presentation only, no business logic).
 *  1. Hero story: an 8 s animation of the crisis (MoveCo full) and the recovery.
 *  2. Narrated demo: a plain-language caption bar that follows the mission steps.
 *  3. Celebration: confetti + a clear summary when every change is verified.
 *  4. EN / FR switch for the story texts.
 *  5. "Same engine, other lives" scenario chips and provider icons.
 * Everything respects prefers-reduced-motion and never blocks the real controls.
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

const ICONS = { moveco: "🚚", permitflow: "🅿️", homeconnect: "🌐", powerflow: "⚡" };
const PEERS = ["moveco", "permitflow", "homeconnect", "powerflow"];
const STEPS = ["describe", "impact", "plans", "hold", "approve", "verify"];

const T = {
  en: {
    lang: "FR", langTitle: "FR · Voir en français",
    h1: 'Moving day changed.<br><span>Keep the rest on track.</span>',
    sub: "Your Friday moving crew is full. What happens to the van, parking and fiber?",
    lead: "CONTINUITY checks the affected bookings, finds replacements and shows you the price before you decide.",
    cta: 'See how the move is saved <span class="arrow" aria-hidden="true">→</span>',
    cta2: "Open the workspace", topDemo: "Run the live demo",
    hint: "Simulated move · no account or API key needed",
    under: "Under the hood",
    otherLives: "Same engine, other lives:",
    scen: { home_relocation: "🏠 Moving house", outpatient_surgery: "🏥 Surgery day", product_launch_expo: "📦 Product launch" },
    replay: "▶ Replay the story",
    mydate: "Try it with your own new moving day:", go: "Run it →",
    days: { Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday" },
    nav: { workspace: "Try it", mission: "Your bookings", plans: "Plans", network: "Providers", trust: "Proof", assistant: "Ask", kit: "Builder kit" },
    steps: [
      ["Describe the change", "Plain language or a calendar"],
      ["Impact found", "Only affected bookings"],
      ["Plans compared", "Changes · cost · speed"],
      ["Replacements held", "Originals untouched"],
      ["You approve", "Bound to exact terms"],
      ["Verified", "Signed receipts"],
    ],
    story: {
      crisis: "MoveCo: Friday crew full!",
      core0: "Something changed…", core1: "Asking the providers", core2: "All back on track",
      counter: (n) => `${n} calls saved`,
      ok: "Rebooked", skip: "Not needed",
    },
    bar: {
      title: "What CONTINUITY is doing",
      describe: "You asked to move the moving day from Tuesday to Friday, under €700, without cancelling anything.",
      impact: "I worked out which bookings depend on the moving day. Two of them are not affected, so I leave them alone.",
      plans: "MoveCo's usual Friday crew is full. I asked its partner crew instead and compared three plans: fewest changes, lowest cost, fastest.",
      hold: "I reserved the replacement slots for 10 minutes. Your current bookings are still in place.",
      approve: "Your turn: check the plan and the total price, then press Confirm.",
      verify: "Done. Each provider confirmed on its own website with a signed receipt you can check.",
      verifySim: "Done. Every change was applied in this simulation, and nothing was cancelled.",
      close: "Hide", step: (i) => `Step ${i} of 6`,
    },
    win: {
      title: "Your move is back on track 🎉",
      moved: "bookings moved", kept: "left untouched", cancelled: "cancelled",
      line: "Every provider confirmed on its own site. Nothing was cancelled without you.",
      sim: "Simulated in your browser: nothing was cancelled, and the plan you approved is the plan that ran.",
    },
  },
  fr: {
    lang: "EN", langTitle: "EN · Switch to English",
    h1: 'Le déménagement a changé.<br><span>Tout le reste suit.</span>',
    sub: "Votre équipe de déménageurs du vendredi est complète. Que deviennent le camion, le stationnement et la fibre ?",
    lead: "CONTINUITY repère les réservations concernées, trouve des remplaçants et vous montre le prix avant que vous décidiez.",
    cta: 'Voir comment le déménagement est sauvé <span class="arrow" aria-hidden="true">→</span>',
    cta2: "Ouvrir l’espace de travail", topDemo: "Lancer la démo",
    hint: "Déménagement simulé · sans compte ni clé API",
    under: "Sous le capot",
    otherLives: "Le même moteur, d’autres vies :",
    scen: { home_relocation: "🏠 Déménagement", outpatient_surgery: "🏥 Jour d’opération", product_launch_expo: "📦 Lancement produit" },
    replay: "▶ Rejouer l’histoire",
    mydate: "Essayez avec votre nouveau jour de déménagement :", go: "Lancer →",
    days: { Wednesday: "Mercredi", Thursday: "Jeudi", Friday: "Vendredi", Saturday: "Samedi" },
    nav: { workspace: "Essayer", mission: "Vos réservations", plans: "Plans", network: "Prestataires", trust: "Preuves", assistant: "Demander", kit: "Kit" },
    steps: [
      ["Décrire le changement", "En français ou avec un agenda"],
      ["Impact trouvé", "Seulement les réservations concernées"],
      ["Plans comparés", "Changements · prix · rapidité"],
      ["Remplaçants réservés", "Les originaux restent en place"],
      ["Vous validez", "Aux conditions exactes"],
      ["Vérifié", "Reçus signés"],
    ],
    story: {
      crisis: "MoveCo : équipe du vendredi complète !",
      core0: "Un imprévu…", core1: "Je demande aux prestataires", core2: "Tout est rétabli",
      counter: (n) => `${n} appels évités`,
      ok: "Reprogrammé", skip: "Pas besoin",
    },
    bar: {
      title: "Ce que fait CONTINUITY",
      describe: "Vous avez demandé de décaler le déménagement du mardi au vendredi, pour moins de 700 €, sans rien annuler.",
      impact: "J’ai repéré les réservations qui dépendent du jour du déménagement. Deux ne sont pas concernées : je n’y touche pas.",
      plans: "L’équipe habituelle de MoveCo est complète vendredi. J’ai demandé à son équipe partenaire et comparé trois plans : le moins de changements, le moins cher, le plus rapide.",
      hold: "J’ai réservé les créneaux de remplacement pour 10 minutes. Vos réservations actuelles sont toujours en place.",
      approve: "À vous : vérifiez le plan et le prix total, puis appuyez sur Confirm.",
      verify: "C’est fait. Chaque prestataire a confirmé sur son propre site avec un reçu signé vérifiable.",
      verifySim: "C’est fait. Tous les changements ont été appliqués dans cette simulation, sans aucune annulation.",
      close: "Masquer", step: (i) => `Étape ${i} sur 6`,
    },
    win: {
      title: "Votre déménagement est sauvé 🎉",
      moved: "réservations déplacées", kept: "jamais dérangées", cancelled: "annulation",
      line: "Chaque prestataire a confirmé sur son propre site. Rien n’a été annulé sans vous.",
      sim: "Simulé dans votre navigateur : rien n’a été annulé, et le plan validé est celui qui a été exécuté.",
    },
  },
};

let lang = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "fr" || q === "en") return q;
  const saved = store.get("continuity.lang");
  if (saved === "fr" || saved === "en") return saved;
  return "en";
})();
const t = () => T[lang];

/* ---------------- Provider icons ---------------- */
function addIcons() {
  for (const pid of PEERS) {
    const dot = $(`.eco-node[data-peer="${pid}"] .eco-dot`);
    if (dot && !dot.textContent) { dot.textContent = ICONS[pid]; dot.classList.add("wow-icon"); }
  }
}

/* ---------------- Hero: "under the hood" + scenario chips + replay ---------------- */
function buildHeroExtras() {
  $("#wow-lives")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-wow-scenario]");
    if (!btn) return;
    $(`.scenario-pill[data-scenario-id="${btn.dataset.wowScenario}"]`)?.click();
    $("#workspace")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
    setTimeout(() => $("#analyze-plan-btn")?.click(), 450);
  });
  $("#wow-replay")?.addEventListener("click", () => playHeroStory(true));
  $("#wow-mydate")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const day = $("#wow-mydate-select")?.value || "Friday";
    $('.scenario-pill[data-scenario-id="home_relocation"]')?.click();
    setTimeout(() => {
      const input = $("#mission-input");
      if (input) {
        input.value = `Move my relocation from Tuesday to ${day} under €700 without cancelling anything.`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      startNarration();
      $("#workspace")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
      setTimeout(() => $("#analyze-plan-btn")?.click(), 350);
    }, 300);
  });
}

/* ---------------- Hero story animation ---------------- */
let storyTimer = [];
let storyStopped = false;
function clearStory() {
  storyTimer.forEach(clearTimeout); storyTimer = [];
  const eco = $("#eco");
  eco?.classList.remove("wow-playing", "wow-crisis", "wow-resolved");
  $$(".eco-node").forEach((n) => n.classList.remove("wow-alert", "wow-scan", "wow-ok", "wow-skip"));
  $$(".wow-bubble").forEach((b) => b.remove());
  const c = $("#wow-counter"); if (c) { c.textContent = ""; c.classList.remove("show"); }
}
function bubble(node, text, kind) {
  const b = document.createElement("span");
  b.className = `wow-bubble wow-bubble-${kind}`; b.textContent = text; b.setAttribute("aria-hidden", "true");
  node.append(b);
}
function playHeroStory(force = false) {
  if (storyStopped && !force) return;
  if (reduced() && !force) return;
  const eco = $("#eco"); if (!eco) return;
  clearStory();
  const core = $("#eco-core-state");
  const coreText = core?.textContent;
  const at = (ms, fn) => storyTimer.push(setTimeout(fn, ms));
  const node = (pid) => $(`.eco-node[data-peer="${pid}"]`);
  eco.classList.add("wow-playing");
  at(300, () => { eco.classList.add("wow-crisis"); node("moveco")?.classList.add("wow-alert"); bubble(node("moveco"), t().story.crisis, "alert"); if (core) core.textContent = t().story.core0; });
  at(2000, () => { if (core) core.textContent = t().story.core1; PEERS.forEach((p) => node(p)?.classList.add("wow-scan")); });
  const order = [["moveco", "ok"], ["permitflow", "ok"], ["homeconnect", "ok"], ["powerflow", "skip"]];
  order.forEach(([p, kind], i) => at(3000 + i * 700, () => {
    const n = node(p); if (!n) return;
    n.classList.remove("wow-scan", "wow-alert"); n.classList.add(kind === "ok" ? "wow-ok" : "wow-skip");
    n.querySelector(".wow-bubble")?.remove();
    bubble(n, kind === "ok" ? `✓ ${t().story.ok}` : `— ${t().story.skip}`, kind);
  }));
  at(6000, () => {
    eco.classList.remove("wow-crisis"); eco.classList.add("wow-resolved");
    if (core) core.textContent = t().story.core2;
    const c = $("#wow-counter");
    if (c) {
      c.classList.add("show");
      let n = 0; const target = 16;
      const tick = () => { n += 1; c.textContent = t().story.counter(n); if (n < target) storyTimer.push(setTimeout(tick, 45)); };
      tick();
    }
  });
  at(10500, () => { clearStory(); if (core && coreText) core.textContent = coreText; });
}

/* ---------------- Narrated demo bar ---------------- */
let narrating = false;
let lastStep = "";
function ensureBar() {
  let bar = $("#wow-story");
  if (bar) return bar;
  bar = document.createElement("aside");
  bar.id = "wow-story"; bar.className = "wow-story"; bar.hidden = true;
  bar.setAttribute("role", "status"); bar.setAttribute("aria-live", "polite");
  bar.innerHTML = `
    <div class="wow-story-head"><span class="wow-story-title"></span><span class="wow-story-step"></span>
      <button type="button" class="wow-story-close"></button></div>
    <p class="wow-story-text"></p>
    <ol class="wow-story-dots" aria-hidden="true">${STEPS.map((s) => `<li data-s="${s}"></li>`).join("")}</ol>`;
  bar.querySelector(".wow-story-close").addEventListener("click", () => { narrating = false; bar.hidden = true; });
  document.body.append(bar);
  return bar;
}
function currentStep() {
  const lis = $$("#mission-steps li[data-step]");
  const cur = lis.find((li) => li.dataset.state === "current");
  if (lis.length && lis.every((li) => li.dataset.state === "done")) return "verify";
  if (cur) return cur.dataset.step;
  const done = lis.filter((li) => li.dataset.state === "done").map((li) => li.dataset.step);
  return done.length ? STEPS[Math.min(STEPS.indexOf(done.at(-1)) + 1, 5)] : "describe";
}
function renderBar() {
  if (!narrating) return;
  const bar = ensureBar();
  const step = currentStep();
  const i = STEPS.indexOf(step);
  const b = t().bar;
  bar.hidden = false;
  bar.querySelector(".wow-story-title").textContent = b.title;
  bar.querySelector(".wow-story-step").textContent = b.step(i + 1);
  bar.querySelector(".wow-story-close").textContent = b.close;
  const text = bar.querySelector(".wow-story-text");
  const sim = /simulat/i.test($("#transport-badge")?.textContent || "");
  const msg = step === "verify" && sim ? b.verifySim : b[step];
  if (step !== lastStep || text.textContent !== msg) {
    text.textContent = msg;
    text.classList.remove("wow-in"); void text.offsetWidth; text.classList.add("wow-in");
    lastStep = step;
  }
  $$("li", bar.querySelector(".wow-story-dots")).forEach((li, k) => {
    li.dataset.on = k < i ? "done" : k === i ? "current" : "todo";
  });
}
function startNarration() {
  storyStopped = true; clearStory();
  narrating = true; lastStep = ""; renderBar();
}

/* ---------------- Celebration ---------------- */
let celebrated = null;
function celebrate(panel) {
  if (!panel.classList.contains("is-ok") || celebrated === panel) return;
  if (!/verified|complete|re-aligned|recovered/i.test(panel.textContent || "") || /hold release|still in place/i.test(panel.textContent || "")) return;
  celebrated = panel;
  panel.classList.add("wow-win");
  const w = t().win;
  const ops = $$("#operations-list [data-op-state], #operations-list .op-card").length;
  const moved = Number((panel.textContent.match(/(\d+)\s+(?:changes verified|demo bookings changed)/) || [])[1] || ops || 3);
  const kept = Number((panel.textContent.match(/(\d+)\s+bookings kept/) || [])[1] || 3);
  const card = document.createElement("div");
  card.className = "wow-win-stats";
  card.innerHTML = `<p class="wow-win-title"></p>
    <div class="wow-win-grid">
      <div><b>${moved}</b><span>${w.moved}</span></div>
      <div><b>${kept}</b><span>${w.kept}</span></div>
      <div><b>0</b><span>${w.cancelled}</span></div>
    </div><p class="wow-win-line"></p>`;
  card.querySelector(".wow-win-title").textContent = w.title;
  card.querySelector(".wow-win-line").textContent = /simulat/i.test(panel.textContent || "") ? w.sim : w.line;
  panel.querySelector(".outcome-body")?.prepend(card);
  if (!reduced()) confetti();
  if (narrating) renderBar();
}
function confetti() {
  const box = document.createElement("div");
  box.className = "wow-confetti"; box.setAttribute("aria-hidden", "true");
  const colors = ["#6E8BFF", "#34D399", "#FBBF24", "#F472B6", "#22D3EE"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--x", `${Math.random() * 100}vw`);
    p.style.setProperty("--d", `${1.8 + Math.random() * 1.6}s`);
    p.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    p.style.setProperty("--delay", `${Math.random() * .5}s`);
    p.style.background = colors[i % colors.length];
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4200);
}

/* ---------------- Live wall stamp ---------------- */
const NAMES = { moveco: "MoveCo", permitflow: "PermitFlow", homeconnect: "HomeConnect", powerflow: "PowerFlow" };
const stamped = new Set();
function watchWall() {
  const labels = $$("[data-live-state]");
  if (!labels.length) return;
  const check = () => labels.forEach((label) => {
    const pid = label.getAttribute("data-live-state");
    const fig = label.closest(".live-site") || $(`.live-site[data-peer="${pid}"]`);
    if (label.dataset.state === "committed" && /verified/i.test(label.textContent || "") && !stamped.has(pid) && fig) {
      stamped.add(pid);
      const st = document.createElement("div");
      st.className = "wow-stamp"; st.setAttribute("aria-hidden", "true");
      st.innerHTML = `✓ ${lang === "fr" ? "Confirmé par" : "Confirmed by"} ${NAMES[pid]}<small>${lang === "fr" ? "sur son propre site · reçu signé" : "on its own site · signed receipt"}</small>`;
      setTimeout(() => { fig.append(st); setTimeout(() => st.remove(), 5000); }, [...stamped].length * 350);
    }
    if (label.dataset.state !== "committed") stamped.delete(pid);
  });
  labels.forEach((l) => new MutationObserver(check).observe(l, { attributes: true, childList: true, characterData: true, subtree: true }));
}

/* ---------------- Language ---------------- */
function setHTML(sel, html) { const el = $(sel); if (el && el.innerHTML !== html) el.innerHTML = html; }
function setText(sel, txt) { const el = $(sel); if (el && el.textContent !== txt) el.textContent = txt; }
function applyLang() {
  const L = t();
  document.documentElement.lang = lang;
  setHTML("#hero-heading", L.h1);
  setText(".hero-sub", L.sub);
  setText(".hero-lead", L.lead);
  const cta = $("#hero-demo-btn"); if (cta && cta.getAttribute("aria-busy") !== "true") setHTML("#hero-demo-btn", L.cta);
  setText("#launch-workspace-link", L.cta2);
  const top = $("#guided-demo-btn"); if (top && top.getAttribute("aria-busy") !== "true") setText("#guided-demo-btn", L.topDemo);
  setText(".hero-hint", L.hint);
  setText(".wow-under-label", L.under);
  setText(".wow-lives-label", L.otherLives);
  $$("[data-wow-scenario]").forEach((b) => { b.textContent = L.scen[b.dataset.wowScenario]; });
  setText("#wow-replay", L.replay);
  const navMap = { "#workspace": "workspace", "#mission": "mission", "#plans": "plans", "#network": "network", "#trust": "trust", "#assistant": "assistant", "./community-kit.html": "kit" };
  $$(".site-nav a").forEach((a) => { const k = navMap[a.getAttribute("href")]; if (k) a.textContent = L.nav[k]; });
  $$("#mission-steps li[data-step]").forEach((li, i) => {
    const s = L.steps[i]; if (!s) return;
    const ti = li.querySelector(".st-title"); const de = li.querySelector(".st-desc");
    if (ti && ti.textContent !== s[0]) ti.textContent = s[0];
    if (de && de.textContent !== s[1]) de.textContent = s[1];
  });
  const btn = $("#wow-lang");
  if (btn) { btn.textContent = L.lang; btn.title = L.langTitle; btn.setAttribute("aria-label", L.langTitle); btn.lang = lang === "en" ? "fr" : "en"; }
  setText(".wow-mydate-label", L.mydate);
  setText(".wow-mydate-go", L.go);
  $$("#wow-mydate-select option").forEach((o) => { o.textContent = L.days[o.value] || o.value; });
  renderBar();
}
function buildLangButton() {
  $("#wow-lang")?.addEventListener("click", () => { lang = lang === "en" ? "fr" : "en"; store.set("continuity.lang", lang); applyLang(); });
}

/* ---------------- Wiring ---------------- */
function init() {
  addIcons();
  buildHeroExtras();
  watchWall();
  buildLangButton();
  applyLang();

  const isDemo = /[?&](demo|ask_continuity)=1/.test(location.search);
  ["#guided-demo-btn", "#hero-demo-btn"].forEach((s) => $(s)?.addEventListener("click", startNarration));
  if (isDemo) startNarration();

  const steps = $("#mission-steps");
  if (steps) new MutationObserver(() => renderBar()).observe(steps, { attributes: true, subtree: true, attributeFilter: ["data-state"] });

  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.id === "outcome-panel") celebrate(n);
    }
    // keep the language in place when the app re-renders hero buttons
    const cta = $("#hero-demo-btn");
    if (lang === "fr" && cta && !cta.getAttribute("aria-busy") && /See how/.test(cta.textContent)) applyLang();
  }).observe(document.body, { childList: true, subtree: true });

  // Play the hero story once the page has settled, only when the hero is visible.
  if (!isDemo && "IntersectionObserver" in window) {
    const eco = $("#eco");
    let played = false;
    const io = new IntersectionObserver((entries) => {
      if (!played && entries.some((e) => e.isIntersecting)) { played = true; setTimeout(() => playHeroStory(), 900); io.disconnect(); }
    }, { threshold: .4 });
    if (eco) io.observe(eco);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}
