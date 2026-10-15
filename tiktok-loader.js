/* tiktok-loader.js
   Lazy-loads TikTok embeds as they enter the carousel's scroll port,
   patches the iframe allow attribute, retries failures, shows a fallback. */

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
      scriptPending = false;
      queue.splice(0);
    };
    document.head.appendChild(s);
  }

  /* ── Ask TikTok's script to render one element ───────────────────────────── */
  function render(el) {
    if (window.tiktokEmbed && window.tiktokEmbed.lib) {
      try { window.tiktokEmbed.lib.render(el); return; } catch (_) {}
    }
    /* Fallback: fresh cached script tag so TikTok re-scans for new elements. */
    var s = document.createElement('script');
    s.src = EMBED_SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  /* ── Patch the iframe allow attribute ───────────────────────────────────── */
  var ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';

  function patchIframe(iframe) {
    var parts = (iframe.getAttribute('allow') || '').split(';')
                  .map(function (s) { return s.trim(); }).filter(Boolean);
    ALLOW.split(';').forEach(function (d) {
      d = d.trim();
      if (parts.indexOf(d) === -1) parts.push(d);
    });
    iframe.setAttribute('allow', parts.join('; '));
  }

  function watchForIframe(el) {
    var iframe = el.querySelector('iframe');
    if (iframe) { patchIframe(iframe); return; }
    var mo = new MutationObserver(function () {
      var found = el.querySelector('iframe');
      if (found) { mo.disconnect(); patchIframe(found); }
    });
    mo.observe(el, { childList: true, subtree: true });
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function hasIframe(el) { return !!el.querySelector('iframe'); }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Fallback card ───────────────────────────────────────────────────────── */
  /* io is declared below; showFallback is only ever called from async
     setTimeout callbacks, so io is always assigned by then. */
  var io;

  function showFallback(el) {
    var cite  = el.getAttribute('cite') || '#';
    var vid   = el.getAttribute('data-video-id') || '';
    var title = el.getAttribute('data-title') || '';
    var fb    = document.createElement('div');
    fb.className = 'tiktok-fallback';
    /* Store embed data so the observer can retry when it scrolls back in. */
    fb.setAttribute('data-cite',     cite);
    fb.setAttribute('data-video-id', vid);
    fb.setAttribute('data-title',    title);
    fb.innerHTML =
      '<div class="tiktok-fallback__inner">' +
        '<p class="tiktok-fallback__title">' +
          escHtml(title || 'Watch on TikTok') +
        '</p>' +
        '<a href="' + escAttr(cite) + '" target="_blank" rel="noopener noreferrer"' +
           ' class="btn btn--primary">Watch on TikTok</a>' +
      '</div>';
    if (el.parentNode) {
      el.parentNode.replaceChild(fb, el);
      io.observe(fb);  /* re-observe — scrolling into view triggers a retry */
    }
  }

  /* ── Check + retry loop ──────────────────────────────────────────────────── */
  function scheduleCheck(el, retriesLeft) {
    setTimeout(function () {
      if (!el.parentNode) return;  /* element replaced or removed */
      if (hasIframe(el))  return;  /* loaded successfully */

      if (retriesLeft > 0) {
        var next = document.createElement('blockquote');
        next.className = 'tiktok-embed';
        next.setAttribute('cite',          el.getAttribute('cite'));
        next.setAttribute('data-video-id', el.getAttribute('data-video-id'));
        next.setAttribute('data-title',    el.getAttribute('data-title') || '');
        next.innerHTML = '<section></section>';
        el.parentNode.replaceChild(next, el);
        watchForIframe(next);
        render(next);
        scheduleCheck(next, retriesLeft - 1);
      } else {
        showFallback(el);
      }
    }, CHECK_DELAY);
  }

  /* ── Activate a pending card ─────────────────────────────────────────────── */
  function activate(el) {
    el.className = 'tiktok-embed';
    el.innerHTML = '<section></section>';
    withScript(function () {
      watchForIframe(el);
      render(el);
      scheduleCheck(el, MAX_RETRIES);
    });
  }

  /* ── IntersectionObserver ────────────────────────────────────────────────── */
  var grid  = document.querySelector('.videos__grid');
  var cards = document.querySelectorAll('.tiktok-card');
  if (!grid || !cards.length) return;

  io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);

      var t = entry.target;

      if (t.classList.contains('tiktok-fallback')) {
        /* Retry: replace the fallback with a fresh pending card and activate. */
        var bq = document.createElement('blockquote');
        bq.className = 'tiktok-card';
        bq.setAttribute('cite',          t.getAttribute('data-cite') || '');
        bq.setAttribute('data-video-id', t.getAttribute('data-video-id') || '');
        bq.setAttribute('data-title',    t.getAttribute('data-title') || '');
        bq.innerHTML = '<section></section>';
        if (t.parentNode) t.parentNode.replaceChild(bq, t);
        activate(bq);
      } else {
        activate(t);
      }
    });
  }, {
    root:       grid,          /* scoped to the carousel, not the whole page */
    rootMargin: '0px 200px 0px 200px'  /* pre-load one card ahead */
  });

  cards.forEach(function (el) { io.observe(el); });

}());
