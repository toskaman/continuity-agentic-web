// CONTINUITY ecosystem — shared presentation helpers for peer sites.
// GENERATED copy (source: design-system/peer-ui-kit.js). Presentation only:
// it never changes business state; it reads page.getState() after each render.

export const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function dateParts(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return { wd: "", day: iso, mon: "" };
  return {
    wd: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" }),
    mon: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    long: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
  };
}

/** Wrap page.render so `onRender(state, feedback)` runs after every real render. */
export function afterEachRender(page, onRender) {
  const original = page.render.bind(page);
  page.render = (feedback = "") => {
    original(feedback);
    try {
      onRender(page.getState(), feedback);
    } catch (err) {
      console.warn("[ui] enhancement skipped:", err);
    }
  };
  page.render();
}

/** Turn a native <select> into accessible radio cards. The select stays the source of truth. */
export function choiceCards({ select, container, legend, describe, name }) {
  if (!select || !container) return { refresh() {} };
  const build = () => {
    const opts = Array.from(select.options);
    container.innerHTML = `
      <fieldset class="choice-set">
        <legend class="sr-only">${escapeHtml(legend)}</legend>
        ${opts
          .map((o, i) => {
            const d = describe(o.value) || {};
            const p = dateParts(o.value);
            const id = `${name}-${i}`;
            return `
            <label class="choice-card" for="${id}">
              <input type="radio" id="${id}" name="${name}" value="${escapeHtml(o.value)}" ${o.value === select.value ? "checked" : ""}>
              <span class="date-tile" aria-hidden="true"><span>${escapeHtml(p.wd)}</span><strong>${escapeHtml(p.day)}</strong><span>${escapeHtml(p.mon)}</span></span>
              <span class="choice-body">
                <span class="choice-title">${escapeHtml(p.long)}</span>
                <span class="choice-meta">${escapeHtml(d.meta || "")}</span>
                ${d.note ? `<span class="choice-note">${escapeHtml(d.note)}</span>` : ""}
              </span>
              <span class="choice-side">
                ${d.price ? `<span class="choice-price">${escapeHtml(d.price)}</span>` : ""}
                ${d.badge ? `<span class="badge ${d.badgeClass || "badge-accent"}">${escapeHtml(d.badge)}</span>` : ""}
              </span>
            </label>`;
          })
          .join("")}
      </fieldset>`;
    container.querySelectorAll(`input[name="${name}"]`).forEach((r) => {
      r.addEventListener("change", () => {
        select.value = r.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  };
  build();
  select.closest(".controls-stack")?.classList.add("is-enhanced");
  return { refresh: build };
}

/** Set data-state on <li data-step="..."> items. */
export function setTimeline(listEl, states) {
  if (!listEl) return;
  listEl.querySelectorAll("li[data-step]").forEach((li) => {
    const next = states[li.dataset.step] || "todo";
    if (li.dataset.state !== next) {
      li.dataset.state = next;
      const sr = li.querySelector(".sr-state");
      if (sr) sr.textContent = next === "done" ? "Completed." : next === "current" ? "In progress." : next === "blocked" ? "Needs attention." : "Not started.";
    }
  });
}

/** Append real page events to a visible activity list. */
export function activityLog(listEl) {
  return (message) => {
    if (!listEl || !message) return;
    listEl.querySelector(".log-empty")?.remove();
    const li = document.createElement("li");
    const verified = /^✓/.test(message);
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.className = verified ? "log-item verified" : "log-item";
    li.innerHTML = `<time>${time}</time><span>${escapeHtml(message.replace(/^✓\s*/, ""))}</span>${verified ? '<span class="badge badge-ok">Signed receipt</span>' : ""}`;
    listEl.prepend(li);
    while (listEl.children.length > 8) listEl.lastElementChild.remove();
  };
}

export function flash(el) {
  if (!el) return;
  el.classList.remove("is-updated");
  void el.offsetWidth;
  el.classList.add("is-updated");
}

/** Header shadow + reveal-on-scroll. */
export function chrome() {
  const header = document.querySelector(".site-header");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  // Only animate what starts below the fold; without JS everything stays visible.
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = Array.from(document.querySelectorAll(".reveal")).filter((el) => el.getBoundingClientRect().top > window.innerHeight);
  els.forEach((el) => el.classList.add("reveal-armed"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }),
    { rootMargin: "0px 0px -8% 0px" },
  );
  els.forEach((e) => io.observe(e));
}
