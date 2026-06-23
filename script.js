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
  // ONE <video> element — so two videos can NEVER be on screen at once (no overlap / ghost
  // needle). The needle-drop intro plays once, then the spinning loop repeats by seeking the
  // tail back past the intro. The clip's tail dissolves into its start, so the wrap is gentle.
  const video = $("bgvid");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SETS = {
    mobile:  { src: "assets/bg-mobile.mp4",  loopStart: 2.0417, poster: "assets/intro-poster.jpg" },
    desktop: { src: "assets/bg-desktop.mp4", loopStart: 2.6667, poster: "assets/intro-poster-desktop.jpg" },
  };

  let currentSrc = null;
  let loopStart = SETS.mobile.loopStart;
  let needsGesture = false;

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

  function setSrc() {
    const s = isPortrait() ? SETS.mobile : SETS.desktop;
    if (s.src === currentSrc) return;
    currentSrc = s.src;
    loopStart = s.loopStart;
    video.poster = s.poster;                        // device-correct poster → no wrong/black flash
    video.style.backgroundImage = `url("${s.poster}")`;
    body.classList.remove("no-video");
    video.src = s.src;
    video.load();
    if (reduceMotion) { body.classList.add("no-video"); return; }   // honour reduced-motion
    play();
  }

  // Loop ONLY the spin: seek the tail back to loopStart (skipping the intro) WHILE the clip
  // is still playing — well before the end, so the browser never restarts the whole file
  // from 0 (which would replay the needle-drop intro).
  let wrapping = false;
  function wrap() {
    if (wrapping) return;
    wrapping = true;
    try { video.currentTime = loopStart; } catch (e) {}
    video.play().catch(() => {});
    setTimeout(() => { wrapping = false; }, 400);
  }
  // precise wrap where supported
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    const onFrame = (now, meta) => {
      const d = video.duration;
      if (isFinite(d) && d > 0 && meta.mediaTime >= d - 0.12) wrap();
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }
  // reliable safety net: a wide window so a seek ALWAYS happens before the file can end
  video.addEventListener("timeupdate", () => {
    const d = video.duration;
    if (isFinite(d) && d > 0 && video.currentTime >= d - 0.35) wrap();
  });
  // truly last resort: if it ever ends, restart from the loop, never from 0
  video.addEventListener("ended", () => { video.currentTime = loopStart; video.play().catch(() => {}); });

  // file missing → show the still poster
  video.addEventListener("error", () => { body.classList.add("no-video"); });

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
