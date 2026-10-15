/* tiktok-loader.js
   Lazy-loads TikTok embeds one at a time as they approach the carousel,
   retries failures up to MAX_RETRIES times, then shows a fallback card. */

(function () {
  'use strict';

  var EMBED_SRC   = 'https://www.tiktok.com/embed.js';
  var CHECK_DELAY = 5000;  // ms before checking whether the iframe appeared
  var MAX_RETRIES = 2;

  /* ── Load embed.js once ──────────────────────────────────────────────────── */
  var scriptReady   = false;
  var scriptPending = false;
  var queue         = [];

  function withScript(cb) {
    if (scriptReady)   { cb(); return; }
    queue.push(cb);
    if (scriptPending) { return; }
    scriptPending = true;
    var s    = document.createElement('script');
    s.src    = EMBED_SRC;
    s.async  = true;
    s.onload = function () {
      scriptReady = true;
      queue.splice(0).forEach(function (fn) { fn(); });
    };
    s.onerror = function () {
      scriptPending = false;   // allow a future retry to re-load
      queue.splice(0);
    };
    document.head.appendChild(s);
  }

  /* ── Ask TikTok's script to render one element ───────────────────────────── */
  function render(el) {
    if (window.tiktokEmbed && window.tiktokEmbed.lib) {
      try { window.tiktokEmbed.lib.render(el); return; } catch (_) {}
    }
    /* Fallback: embed.js auto-processes on first load; for later cards
       (added after first load) inject a fresh tag — the browser serves
       it from cache and TikTok's script only touches un-processed elements. */
    var s = document.createElement('script');
    s.src = EMBED_SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  /* ── Did the embed produce an iframe? ────────────────────────────────────── */
  function hasIframe(el) { return !!el.querySelector('iframe'); }

  /* ── Escape helpers ──────────────────────────────────────────────────────── */
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ── Fallback card (shown after all retries fail) ────────────────────────── */
  function showFallback(el) {
    var url   = escAttr(el.getAttribute('cite') || '#');
    var title = escHtml(el.getAttribute('data-title') || 'Watch on TikTok');
    var fb    = document.createElement('div');
    fb.className = 'tiktok-fallback';
    fb.innerHTML =
      '<div class="tiktok-fallback__inner">' +
        '<p class="tiktok-fallback__title">' + title + '</p>' +
        '<a href="' + url + '" target="_blank" rel="noopener noreferrer"' +
           ' class="btn btn--primary">Watch on TikTok</a>' +
      '</div>';
    if (el.parentNode) el.parentNode.replaceChild(fb, el);
  }

  /* ── Check + retry loop ──────────────────────────────────────────────────── */
  function scheduleCheck(el, retriesLeft) {
    setTimeout(function () {
      if (hasIframe(el)) return;  // success

      if (retriesLeft > 0) {
        /* Replace with a completely fresh node — TikTok's script skips
           elements it has already seen, so a new node forces re-processing. */
        var next = document.createElement('blockquote');
        next.className = 'tiktok-embed';
        next.setAttribute('cite',          el.getAttribute('cite'));
        next.setAttribute('data-video-id', el.getAttribute('data-video-id'));
        next.setAttribute('data-title',    el.getAttribute('data-title') || '');
        next.innerHTML = '<section></section>';
        if (el.parentNode) el.parentNode.replaceChild(next, el);
        render(next);
        scheduleCheck(next, retriesLeft - 1);
      } else {
        showFallback(el);
      }
    }, CHECK_DELAY);
  }

  /* ── Activate a pending card ─────────────────────────────────────────────── */
  function activate(el) {
    /* Switch from our pending class to TikTok's expected class */
    el.className = 'tiktok-embed';
    el.innerHTML = '<section></section>';

    withScript(function () {
      render(el);
      scheduleCheck(el, MAX_RETRIES);
    });
  }

  /* ── IntersectionObserver: lazy-init cards as they near the viewport ─────── */
  var cards = document.querySelectorAll('.tiktok-card');
  if (!cards.length) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      activate(entry.target);
    });
  }, {
    /* Fire when a card is within 300px of the visible carousel area
       (horizontal margin) so it starts loading before the user swipes to it. */
    rootMargin: '0px 300px 0px 300px'
  });

  cards.forEach(function (el) { io.observe(el); });

}());
