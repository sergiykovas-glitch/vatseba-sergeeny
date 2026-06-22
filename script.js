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

  // ---------- background video (one continuous clip: intro → loop) ----------
  // The clip is the needle-drop intro followed by a seamless spinning loop. The loop
  // portion repeats by seeking back to LOOP_START, so the intro plays only once.
  // ONE <video> = one decoder + one autoplay → reliable on Safari / in-app browsers.
  const video = $("bgvid");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SRC_MOBILE  = "assets/bg-mobile.mp4";
  const SRC_DESKTOP = "assets/bg-desktop.mp4";
  const LOOP_START_MOBILE  = 2.0417;   // = mobile intro length
  const LOOP_START_DESKTOP = 2.6667;   // = desktop intro length
  let loopStart = LOOP_START_MOBILE;   // updated to match the active source

  let currentSrc = null;
  let needsGesture = false;     // true if autoplay was blocked and a tap is required

  const isPortrait = () =>
    window.matchMedia("(max-width: 820px)").matches ||
    window.innerHeight > window.innerWidth;

  function play() {
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(() => { needsGesture = false; body.classList.remove("no-video"); })
       .catch(() => { needsGesture = true; });   // blocked → the poster frame stays visible
    }
  }

  let triedFallback = false;

  function setSrc() {
    const portrait = isPortrait();
    const want = portrait ? SRC_MOBILE : SRC_DESKTOP;
    if (want === currentSrc) return;
    currentSrc = want;
    loopStart = portrait ? LOOP_START_MOBILE : LOOP_START_DESKTOP;
    triedFallback = false;
    body.classList.remove("no-video");
    video.src = want;
    video.load();
    if (reduceMotion) { body.classList.add("no-video"); return; }   // honour reduced-motion
    play();
  }

  // loop only the spinning part: jump back past the intro to LOOP_START
  function loopBack() {
    try { video.currentTime = loopStart; } catch (e) {}
    if (video.paused) video.play().catch(() => {});
  }
  // timeupdate only fires ~4×/sec — use a wide window so the wrap is caught reliably…
  video.addEventListener("timeupdate", () => {
    const d = video.duration;
    if (isFinite(d) && d > 0 && video.currentTime >= d - 0.3) loopBack();
  });
  // …and ALWAYS catch it here even if a timeupdate is missed → the loop never stops
  video.addEventListener("ended", loopBack);

  // chosen file missing (desktop video not added yet, or a wrong device guess) → fall
  // back to the mobile clip so there is always animation; only then show the still poster
  video.addEventListener("error", () => {
    if (!triedFallback && currentSrc !== SRC_MOBILE) {
      triedFallback = true;
      currentSrc = SRC_MOBILE;
      loopStart = LOOP_START_MOBILE;
      body.classList.remove("no-video");
      video.src = SRC_MOBILE;
      video.load();
      play();
    } else {
      body.classList.add("no-video");
    }
  });

  // if the clip stalls on a phone, nudge it back to playing
  ["stalled", "waiting"].forEach((ev) =>
    video.addEventListener(ev, () => { if (video.paused) video.play().catch(() => {}); })
  );

  // if autoplay was blocked (iOS Low Power Mode, some in-app browsers), start on first tap
  function resumeOnGesture() {
    if (!needsGesture) return;
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(() => { needsGesture = false; body.classList.remove("no-video"); }).catch(() => {});
    }
  }
  ["pointerdown", "touchstart", "keydown"].forEach((e) =>
    window.addEventListener(e, resumeOnGesture, { passive: true })
  );

  setSrc();

  // re-pick mobile/desktop source on resize, debounced
  let resizeTimer;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(setSrc, 200); }
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
