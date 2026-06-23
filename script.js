// ── Vatseba Sergeeny · landing logic ─────────────────────────
(function () {
  "use strict";

  const S    = window.SITE || {};
  const body = document.body;
  const $    = (id) => document.getElementById(id);

  // small helper: never inject raw text as HTML (basic safety)
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // only allow safe link schemes (blocks javascript:, data:, etc.)
  function safeUrl(u) {
    try {
      const p = new URL(u, location.href);
      return ["http:", "https:", "mailto:"].includes(p.protocol) ? p.href : "#";
    } catch { return "#"; }
  }

  // ---------- build the page from config ----------
  $("brandName").textContent = S.artist || "";
  const tagline = $("tagline");
  if (S.tagline) tagline.textContent = S.tagline;
  else tagline.style.display = "none";

  function makeLink(item) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = safeUrl(item.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    if (item.color) a.style.setProperty("--brand", item.color);
    const icon = item.icon
      ? `<img class="ic" src="assets/icons/${esc(item.icon)}.svg" alt="" />`
      : "";
    a.innerHTML = `${icon}<span class="ln">${esc(item.label)}</span><span class="ar">↗</span>`;
    return a;
  }

  (S.links || []).forEach((i) => $("links").appendChild(makeLink(i)));

  // extra links go inside an inner wrapper so the container can animate its height
  const moreInner = document.createElement("div");
  moreInner.className = "more-inner";
  (S.more || []).forEach((i) => moreInner.appendChild(makeLink(i)));
  $("more").appendChild(moreInner);

  const showMore = $("showMore");
  if (!(S.more && S.more.length)) showMore.style.display = "none";

  (S.socials || []).forEach((s) => {
    const a = document.createElement("a");
    a.className = "social";
    a.href = safeUrl(s.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", s.label || "");
    a.innerHTML = `<img src="assets/icons/${esc(s.icon)}.svg" alt="${esc(s.label)}" />`;
    $("socials").appendChild(a);
  });

  // ---------- show more / less (animated) ----------
  const more = $("more");
  const smLabel = showMore.querySelector(".sm-label");
  showMore.addEventListener("click", () => {
    const open = more.classList.toggle("open");
    showMore.classList.toggle("open", open);
    if (smLabel) smLabel.textContent = open ? "Show less" : "Show more";
    showMore.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // ---------- background video (intro layer → native-looping loop layer) ----------
  // The intro plays once on top; we cross-fade to the loop layer underneath, which uses
  // the browser's NATIVE loop for a perfectly smooth, gap-free repeat (no seeking → no
  // stutter). Two muted layers; only one decodes at a time apart from a brief cross-fade.
  const vidIntro = $("vidIntro");
  const vidLoop  = $("vidLoop");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SETS = {
    mobile:  { intro: "assets/bg-intro-mobile.mp4", loop: "assets/bg-loop-mobile.mp4", poster: "assets/intro-poster.jpg" },
    desktop: { intro: "assets/bg-intro.mp4",        loop: "assets/bg-loop.mp4",        poster: "assets/intro-poster-desktop.jpg" },
  };

  let currentSet = null;
  let introDone = false;
  let needsGesture = false;

  const isPortrait = () =>
    window.matchMedia("(max-width: 820px)").matches ||
    window.innerHeight > window.innerWidth;

  function tryPlay(v) {
    const p = v.play();
    if (p && typeof p.then === "function") {
      p.then(() => { needsGesture = false; }).catch(() => { needsGesture = true; });
    }
  }

  // reveal the looping layer — but only once it has actually painted a frame, so the intro
  // (holding its last frame) covers any decode gap → no black flash
  function revealLoop() {
    if (introDone) return;
    introDone = true;
    let shown = false;
    const show = () => { if (!shown) { shown = true; body.classList.add("intro-done"); } };
    if ("requestVideoFrameCallback" in vidLoop) {
      try { vidLoop.requestVideoFrameCallback(() => show()); } catch (e) {}
    }
    vidLoop.addEventListener("playing", show, { once: true });
    setTimeout(show, 800);          // safety net
    tryPlay(vidLoop);               // native loop → smooth, gap-free forever
  }

  function startSet(force) {
    const name = isPortrait() ? "mobile" : "desktop";
    if (name === currentSet && !force) return;
    currentSet = name;
    const s = SETS[name];

    // device-correct poster/background → no wrong (portrait-on-desktop) or black flash
    vidIntro.poster = s.poster; vidLoop.poster = s.poster;
    vidIntro.style.backgroundImage = `url("${s.poster}")`;
    vidLoop.style.backgroundImage  = `url("${s.poster}")`;

    vidLoop.src = s.loop;
    vidLoop.load();

    body.classList.remove("no-video");
    if (reduceMotion) { body.classList.add("no-video"); return; }   // honour reduced-motion

    if (introDone) { body.classList.add("intro-done"); tryPlay(vidLoop); return; }

    body.classList.remove("intro-done");
    vidIntro.src = s.intro;
    vidIntro.load();
    tryPlay(vidIntro);
  }

  // cross-fade to the loop just before the intro ends (and guaranteed on 'ended')
  vidIntro.addEventListener("timeupdate", () => {
    const d = vidIntro.duration;
    if (isFinite(d) && d > 0 && vidIntro.currentTime >= d - 0.25) revealLoop();
  });
  vidIntro.addEventListener("ended", revealLoop);
  vidIntro.addEventListener("error", revealLoop);   // no intro → go straight to the loop

  // loop file missing → show the still poster
  vidLoop.addEventListener("error", () => { body.classList.add("no-video"); });

  // if the loop stalls on a phone, nudge it back
  ["stalled", "waiting"].forEach((ev) =>
    vidLoop.addEventListener(ev, () => { if (introDone && vidLoop.paused) vidLoop.play().catch(() => {}); })
  );

  // if autoplay was blocked (iOS Low Power Mode, some in-app browsers), start on first tap
  function resumeOnGesture() {
    if (!needsGesture) return;
    (introDone ? vidLoop : vidIntro).play()
      .then(() => { needsGesture = false; }).catch(() => {});
  }
  ["pointerdown", "touchstart", "keydown"].forEach((e) =>
    window.addEventListener(e, resumeOnGesture, { passive: true })
  );

  startSet();

  // re-pick mobile/desktop set on resize, debounced
  let resizeTimer;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => startSet(), 200); }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // ---------- reveal UI ----------
  window.addEventListener("load", () => { body.classList.remove("loading"); body.classList.add("ready"); });
  setTimeout(() => { body.classList.remove("loading"); body.classList.add("ready"); }, 1200);

  // ---------- offline / connection-error state ----------
  const offlineEl = $("offline");
  const mainEl = document.querySelector("main");
  function setOffline(on) {
    if (!offlineEl) return;
    offlineEl.classList.toggle("show", on);
    offlineEl.setAttribute("aria-hidden", on ? "false" : "true");
    // keep keyboard focus out of the hidden page behind the overlay
    if (mainEl) { on ? mainEl.setAttribute("inert", "") : mainEl.removeAttribute("inert"); }
  }
  window.addEventListener("offline", () => setOffline(true));
  window.addEventListener("online",  () => setOffline(false));
  if (!navigator.onLine) setOffline(true);
})();
