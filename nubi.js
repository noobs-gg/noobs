(function () {
  'use strict';

  // ── Elements ────────────────────────────────────────────────────────────────

  var mascot  = document.getElementById('nubi');
  var tracker = document.getElementById('nubi-eye-tracker');
  var eyeL    = document.getElementById('nubi-eye-left');
  var eyeR    = document.getElementById('nubi-eye-right');
  var happy   = document.getElementById('nubi-eyes-happy');
  var tikBtn  = document.querySelector('.btn--primary');

  if (!mascot || !tracker || !eyeL || !eyeR || !happy) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Config ──────────────────────────────────────────────────────────────────

  var MAX_X         = 0.03;   // max horizontal eye offset (fraction of mascot width)
  var MAX_Y         = 0.025;  // max vertical eye offset (fraction of mascot height)
  var LERP          = 0.10;   // tracking smoothness per rAF frame
  var BLINK_HALF    = 75;     // ms per blink half (squash / unsquash)
  var HAPPY_MS      = 1200;   // ms for happy reaction
  var DOUBLE_CHANCE = 0.20;   // probability of a double-blink

  // ── State ───────────────────────────────────────────────────────────────────

  var tx = 0, ty = 0;   // target eye offset (normalised fraction of mascot size)
  var cx = 0, cy = 0;   // current interpolated offset
  var isHappy   = false;
  var blinking  = false;
  var isTouch   = false;
  var mouseIdle = true;
  var blinkTid, glanceTid, idleTid;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── rAF tracking loop ────────────────────────────────────────────────────────
  // Runs only when reduced motion is off. Lerps the eye-tracker div towards
  // the target offset so all movement is smoothly eased.

  if (!REDUCED) {
    (function loop() {
      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;
      tracker.style.transform =
        'translate(' + (cx * mascot.offsetWidth).toFixed(2)  + 'px,' +
                       (cy * mascot.offsetHeight).toFixed(2) + 'px)';
      requestAnimationFrame(loop);
    }());
  }

  // ── Mouse / touch input ──────────────────────────────────────────────────────

  function trackPoint(clientX, clientY) {
    var r  = mascot.getBoundingClientRect();
    // Normalise displacement from mascot centre, scale to max offsets.
    // Full deflection is reached when the cursor is ~0.5× the mascot width away.
    var dx = (clientX - (r.left + r.width  * 0.5)) / r.width;
    var dy = (clientY - (r.top  + r.height * 0.5)) / r.height;
    tx = clamp(dx * MAX_X * 2, -MAX_X, MAX_X);
    ty = clamp(dy * MAX_Y * 2, -MAX_Y, MAX_Y);
  }

  if (!REDUCED) {
    window.addEventListener('mousemove', function (e) {
      if (isTouch || isHappy) return;
      mouseIdle = false;
      clearTimeout(idleTid);
      trackPoint(e.clientX, e.clientY);
      idleTid = setTimeout(function () { mouseIdle = true; }, 2500);
    }, { passive: true });

    // Once a touch is detected, disable mouse tracking for this session
    window.addEventListener('touchstart', function () {
      isTouch = true; mouseIdle = true; tx = 0; ty = 0;
    }, { passive: true });
  }

  // ── TikTok button gaze ────────────────────────────────────────────────────────
  // On hover, snap the target towards the button centre; normal mouse tracking
  // resumes naturally on the next mousemove.

  if (!REDUCED && tikBtn) {
    tikBtn.addEventListener('mouseenter', function () {
      if (isHappy || isTouch) return;
      var br = tikBtn.getBoundingClientRect();
      trackPoint(br.left + br.width * 0.5, br.top + br.height * 0.5);
    });
  }

  // ── Blinking ─────────────────────────────────────────────────────────────────
  // Works in both normal and reduced-motion modes.
  // Each eye collapses to scaleY(0.1) around its centre then springs back.

  function setEyeScale(eye, sy, ease) {
    if (REDUCED) {
      eye.style.transition = 'none';
    } else {
      eye.style.transition = 'transform ' + BLINK_HALF + 'ms ' + ease;
    }
    eye.style.transform = 'scaleY(' + sy + ')';
  }

  function doBlink(isDouble) {
    if (isHappy || blinking) { scheduleBlink(); return; }
    blinking = true;
    setEyeScale(eyeL, 0.1, 'ease-in');
    setEyeScale(eyeR, 0.1, 'ease-in');
    setTimeout(function () {
      setEyeScale(eyeL, 1, 'ease-out');
      setEyeScale(eyeR, 1, 'ease-out');
      setTimeout(function () {
        blinking = false;
        if (!isDouble && Math.random() < DOUBLE_CHANCE) {
          // Occasional quick double-blink
          setTimeout(function () { doBlink(true); }, 120);
        } else {
          scheduleBlink();
        }
      }, BLINK_HALF);
    }, BLINK_HALF);
  }

  function scheduleBlink() {
    clearTimeout(blinkTid);
    blinkTid = setTimeout(doBlink, 3000 + Math.random() * 2000);
  }

  // ── Glancing ─────────────────────────────────────────────────────────────────
  // Eyes drift left or right every 8-12 s while the mouse is idle (or always
  // on touch devices), then smoothly return to centre.

  function doGlance() {
    if (isHappy) { scheduleGlance(); return; }
    if (!mouseIdle && !isTouch) { scheduleGlance(); return; }
    tx = (Math.random() < 0.5 ? -1 : 1) * MAX_X;
    ty = 0;
    glanceTid = setTimeout(function () {
      tx = 0; ty = 0;
      scheduleGlance();
    }, 1000);
  }

  function scheduleGlance() {
    clearTimeout(glanceTid);
    glanceTid = setTimeout(doGlance, 8000 + Math.random() * 4000);
  }

  // ── Happy / bounce reaction ───────────────────────────────────────────────────
  // Click/tap: swap to happy eyes, play bounce, then restore after HAPPY_MS.

  mascot.addEventListener('click', function () {
    if (isHappy) return;
    isHappy = true;
    clearTimeout(blinkTid);
    clearTimeout(glanceTid);
    tx = 0; ty = 0;

    eyeL.style.opacity = '0';
    eyeR.style.opacity = '0';
    happy.style.opacity = '1';
    if (!REDUCED) mascot.classList.add('nubi--bouncing');

    setTimeout(function () {
      mascot.classList.remove('nubi--bouncing');
      happy.style.opacity = '0';
      // Brief pause so the eye swap isn't visible mid-bounce
      setTimeout(function () {
        eyeL.style.opacity = '1';
        eyeR.style.opacity = '1';
        isHappy = false;
        scheduleBlink();
        if (!REDUCED) scheduleGlance();
      }, 80);
    }, HAPPY_MS);
  });

  mascot.style.cursor = 'pointer';

  // ── Boot ──────────────────────────────────────────────────────────────────────

  scheduleBlink();
  if (!REDUCED) scheduleGlance();

}());
