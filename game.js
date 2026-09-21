"use strict";
/* ================================================================
   FLOW ART — Touch the Fluid
   Each scene has UNIQUE interaction matching its image content:
   1. Iridescent Pool — pop iridescent bubbles, drag to shift oil-film colors
   2. Lavender Gel — grow gel bubbles, drag to stretch translucent folds
   3. Marble Flow — drag to swirl paint ribbons, tap to drop color
   4. Liquid Chrome — touch to splash mercury, drag to create chrome trails
   All effects sample color FROM the image, blending seamlessly.
   ================================================================ */

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, dpr = 1;
var imgCanvas, imgCtx;

function setupCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!imgCanvas) { imgCanvas = document.createElement('canvas'); imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true }); }
  imgCanvas.width = W; imgCanvas.height = H;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var hue2rgb = function(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s; var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

var settings = { vibration: true, sound: true, currentScene: 0 };

var SCENES = [
  { name: 'Iridescent Pool', file: 'images/scene1.jpg', hint: 'Tap bubbles to pop · Drag to shift iridescent colors' },
  { name: 'Lavender Gel', file: 'images/scene2.jpg', hint: 'Tap to grow gel bubbles · Drag to stretch the gel' },
  { name: 'Marble Flow', file: 'images/scene3.jpg', hint: 'Drag to swirl paint · Tap to drop color' },
  { name: 'Liquid Chrome', file: 'images/scene4.jpg', hint: 'Tap to splash mercury · Drag to create chrome trails' }
];

var currentImage = null, imageLoaded = false;

function loadImage(idx) {
  settings.currentScene = idx; imageLoaded = false;
  var img = new Image();
  img.onload = function() { currentImage = img; imageLoaded = true; drawImageToCanvas(); updateSceneUI(); updateHint(); };
  img.src = SCENES[idx].file;
}

function drawImageToCanvas() {
  if (!currentImage) return;
  var iw = currentImage.naturalWidth, ih = currentImage.naturalHeight;
  var scale = Math.max(W / iw, H / ih);
  var sw = iw * scale, sh = ih * scale, sx = (W - sw) / 2, sy = (H - sh) / 2;
  imgCtx.clearRect(0, 0, W, H);
  imgCtx.drawImage(currentImage, sx, sy, sw, sh);
}

function sampleColorAt(x, y) {
  if (!imageLoaded) return { r: 200, g: 100, b: 200 };
  x = clamp(Math.floor(x), 0, W - 1); y = clamp(Math.floor(y), 0, H - 1);
  try { var d = imgCtx.getImageData(x, y, 1, 1).data; return { r: d[0], g: d[1], b: d[2] }; }
  catch(e) { return { r: 200, g: 100, b: 200 }; }
}

function rgbToHue(r, g, b) {
  var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta === 0) return 200;
  var h;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  return h < 0 ? h + 360 : h;
}

/* ===== Haptic + Audio ===== */
function haptic(p) { if (!settings.vibration) return; if (navigator.vibrate) { try { navigator.vibrate(p); } catch(e) {} } }

var audioCtx = null, masterGain = null, audioOn = false, ambientNodes = [];
function initAudio() {
  if (audioOn) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.1;
    masterGain.connect(audioCtx.destination); audioOn = true; startAmbient();
  } catch(e) {}
}
function startAmbient() {
  if (!audioOn || !settings.sound) return; stopAmbient();
  var o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
  o1.type = 'sine'; o1.frequency.value = 110; g1.gain.value = 0.025;
  o1.connect(g1); g1.connect(masterGain); o1.start();
  var o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(), lfo = audioCtx.createOscillator(), lfoG = audioCtx.createGain();
  o2.type = 'sine'; o2.frequency.value = 220; lfo.frequency.value = 0.12; lfoG.gain.value = 0.012;
  lfo.connect(lfoG); lfoG.connect(g2.gain); g2.gain.value = 0.012;
  o2.connect(g2); g2.connect(masterGain); o2.start(); lfo.start();
  var bs = Math.floor(audioCtx.sampleRate * 2), buf = audioCtx.createBuffer(1, bs, audioCtx.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  var src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
  var ng = audioCtx.createGain(); ng.gain.value = 0.008;
  src.connect(f); f.connect(ng); ng.connect(masterGain); src.start();
  ambientNodes = [o1, o2, lfo, src];
}
function stopAmbient() { for (var i = 0; i < ambientNodes.length; i++) { try { ambientNodes[i].stop(); } catch(e) {} } ambientNodes = []; }

function tone(freq, dur, type, vol) {
  if (!audioOn || !settings.sound) return; type = type || 'sine'; vol = vol || 0.08;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(masterGain); o.start(); o.stop(audioCtx.currentTime + dur);
}
function noiseBurst(dur, vol, ff) {
  if (!audioOn || !settings.sound) return; vol = vol || 0.04; ff = ff || 2000;
  var bs = Math.floor(audioCtx.sampleRate * dur), buf = audioCtx.createBuffer(1, bs, audioCtx.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = ff;
  var g = audioCtx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(masterGain); src.start(); src.stop(audioCtx.currentTime + dur);
}
function sfxPop() { tone(600 + rand(-100, 200), 0.08, 'sine', 0.08); noiseBurst(0.05, 0.03, 3000); }
function sfxBubble() { tone(300 + rand(-50, 100), 0.12, 'sine', 0.05); }
function sfxSwirl() { tone(200 + rand(-30, 60), 0.15, 'sine', 0.04); }
function sfxDrop() { tone(400 + rand(-80, 160), 0.1, 'sine', 0.06); }
function sfxMercury() { tone(150 + rand(-20, 40), 0.1, 'sawtooth', 0.05); noiseBurst(0.06, 0.03, 1500); }

/* ===== Shared State ===== */
var time = 0;
var shake = 0;
function addShake(a) { shake = Math.max(shake, a); }

/* ===== Scene 1: Iridescent Pool — bubble pop + color shift ===== */
var s1_bubbles = [], s1_trails = [], s1_autoTimer = 0;

function s1_init() { s1_bubbles = []; s1_trails = []; for (var i = 0; i < 8; i++) s1_spawnBubble(); }

function s1_spawnBubble() {
  var x = rand(50, W - 50), y = rand(80, H - 100);
  var col = sampleColorAt(x, y);
  var hue = rgbToHue(col.r, col.g, col.b);
  s1_bubbles.push({
    x: x, y: y, r: 2, targetR: rand(18, 40),
    color: col, hue: hue,
    growSpeed: rand(4, 8), wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5),
    popping: false, popProgress: 0, pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2)
  });
}

function s1_update(dt) {
  s1_autoTimer += dt;
  if (s1_bubbles.length < 12 && s1_autoTimer > 1.5) { s1_autoTimer = 0; s1_spawnBubble(); }
  for (var i = s1_bubbles.length - 1; i >= 0; i--) {
    var b = s1_bubbles[i];
    b.wobble += dt * b.wobbleSpeed; b.pulse += dt * b.pulseSpeed;
    if (b.r < b.targetR) b.r += b.growSpeed * dt;
    if (b.popping) { b.popProgress += dt * 3; if (b.popProgress >= 1) s1_bubbles.splice(i, 1); continue; }
    b.x += Math.sin(b.wobble) * 0.15; b.y += Math.cos(b.wobble * 0.7) * 0.1;
  }
  // Trails (color shift streaks from dragging)
  for (var j = s1_trails.length - 1; j >= 0; j--) {
    var t = s1_trails[j];
    t.life -= dt; t.r += dt * 20;
    if (t.life <= 0) s1_trails.splice(j, 1);
  }
}

function s1_render() {
  // Trails (iridescent color streaks)
  ctx.globalCompositeOperation = 'screen';
  for (var i = 0; i < s1_trails.length; i++) {
    var t = s1_trails[i];
    var a = clamp(t.life / t.maxLife, 0, 1);
    var hue = t.hue + time * 30;
    var col = hslToRgb(hue, 0.5, 0.5);
    var grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
    grad.addColorStop(0, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + (a * 0.4) + ')');
    grad.addColorStop(1, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
  }

  // Bubbles (thin-film iridescent)
  for (var i2 = 0; i2 < s1_bubbles.length; i2++) {
    var b = s1_bubbles[i2];
    var pulse = 1 + Math.sin(b.pulse) * 0.04;
    var popS = b.popping ? (1 + b.popProgress * 0.5) * (1 - b.popProgress * 0.3) : pulse;
    var popA = b.popping ? (1 - b.popProgress) : 1;
    var rr = b.r * popS;
    ctx.globalAlpha = popA;
    ctx.globalCompositeOperation = 'screen';

    // Outer iridescent glow
    var oG = ctx.createRadialGradient(b.x, b.y, rr * 0.5, b.x, b.y, rr * 2);
    oG.addColorStop(0, 'rgba(' + b.color.r + ',' + b.color.g + ',' + b.color.b + ',0.12)');
    oG.addColorStop(1, 'rgba(' + b.color.r + ',' + b.color.g + ',' + b.color.b + ',0)');
    ctx.fillStyle = oG;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr * 2, 0, Math.PI * 2); ctx.fill();

    // Bubble body — thin-film iridescence (hue shifts around the ring)
    var segs = 32;
    ctx.beginPath();
    for (var s = 0; s <= segs; s++) {
      var ang = (s / segs) * Math.PI * 2;
      var iridHue = b.hue + Math.sin(ang * 3 + time * 0.5) * 60 + Math.cos(ang * 5 + time * 0.3) * 40;
      var ic = hslToRgb(iridHue, 0.5, 0.55);
      if (s === 0) ctx.moveTo(b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr);
      else ctx.lineTo(b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    // Fill with iridescent gradient
    var bGrad = ctx.createRadialGradient(b.x - rr * 0.3, b.y - rr * 0.35, 0, b.x, b.y, rr);
    var ic0 = hslToRgb(b.hue + 0, 0.4, 0.6);
    var ic1 = hslToRgb(b.hue + 60, 0.5, 0.5);
    var ic2 = hslToRgb(b.hue + 120, 0.4, 0.4);
    bGrad.addColorStop(0, 'rgba(' + ic0.r + ',' + ic0.g + ',' + ic0.b + ',0.4)');
    bGrad.addColorStop(0.5, 'rgba(' + ic1.r + ',' + ic1.g + ',' + ic1.b + ',0.3)');
    bGrad.addColorStop(1, 'rgba(' + ic2.r + ',' + ic2.g + ',' + ic2.b + ',0.15)');
    ctx.fillStyle = bGrad;
    ctx.fill();

    // Rim — iridescent stroke
    ctx.strokeStyle = 'rgba(' + ic0.r + ',' + ic0.g + ',' + ic0.b + ',' + (popA * 0.5) + ')';
    ctx.lineWidth = 1.5; ctx.stroke();

    // Specular highlight
    var sG = ctx.createRadialGradient(b.x - rr * 0.35, b.y - rr * 0.4, 0, b.x - rr * 0.35, b.y - rr * 0.4, rr * 0.3);
    sG.addColorStop(0, 'rgba(255,255,255,0.4)');
    sG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sG;
    ctx.beginPath(); ctx.arc(b.x - rr * 0.35, b.y - rr * 0.4, rr * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function s1_tap(x, y) {
  for (var i = s1_bubbles.length - 1; i >= 0; i--) {
    var b = s1_bubbles[i];
    if (b.popping) continue;
    if (dist(x, y, b.x, b.y) <= b.r * 1.2) {
      b.popping = true; b.popProgress = 0;
      haptic(20); sfxPop(); addShake(2);
      // Color shift trail at pop location
      s1_trails.push({ x: b.x, y: b.y, r: b.r, life: 0.6, maxLife: 0.6, hue: b.hue });
      return true;
    }
  }
  return false;
}

function s1_drag(x, y, speed) {
  var col = sampleColorAt(x, y);
  var hue = rgbToHue(col.r, col.g, col.b);
  s1_trails.push({ x: x, y: y, r: 5 + speed * 0.3, life: 0.8, maxLife: 0.8, hue: hue });
  if (Math.random() < 0.1) { sfxSwirl(); haptic(8); }
}

/* ===== Scene 2: Lavender Gel — grow bubbles + stretch gel ===== */
var s2_blobs = [], s2_bubbles = [];

function s2_init() {
  s2_blobs = []; s2_bubbles = [];
  for (var i = 0; i < 3; i++) {
    var col = sampleColorAt(rand(0, W), rand(0, H));
    s2_blobs.push({
      x: rand(W * 0.25, W * 0.75), y: rand(H * 0.3, H * 0.7),
      r: rand(40, 65), color: col,
      points: [], grabbed: false, grabX: 0, grabY: 0, vx: 0, vy: 0,
      squish: 1, squishV: 0, pulse: rand(0, Math.PI * 2), pulseSpeed: rand(0.5, 1.2)
    });
    var np = 16;
    for (var p = 0; p < np; p++) s2_blobs[i].points.push({ angle: (p / np) * Math.PI * 2, r: s2_blobs[i].r, vr: 0 });
  }
  for (var b = 0; b < 6; b++) s2_spawnBubble();
}

function s2_spawnBubble() {
  var x = rand(50, W - 50), y = rand(80, H - 100);
  var col = sampleColorAt(x, y);
  s2_bubbles.push({ x: x, y: y, r: 2, targetR: rand(12, 28), color: col, growSpeed: rand(3, 6), wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5), popping: false, popP: 0, pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2) });
}

function s2_update(dt) {
  // Bubbles grow and merge
  if (s2_bubbles.length < 10 && Math.random() < dt * 0.5) s2_spawnBubble();
  for (var i = s2_bubbles.length - 1; i >= 0; i--) {
    var b = s2_bubbles[i];
    b.wobble += dt * b.wobbleSpeed; b.pulse += dt * b.pulseSpeed;
    if (b.r < b.targetR) b.r += b.growSpeed * dt;
    if (b.popping) { b.popP += dt * 3; if (b.popP >= 1) s2_bubbles.splice(i, 1); continue; }
    b.x += Math.sin(b.wobble) * 0.1; b.y += Math.cos(b.wobble * 0.7) * 0.08;
  }
  // Merge nearby bubbles
  for (var a = s2_bubbles.length - 1; a >= 0; a--) {
    for (var c = a - 1; c >= 0; c--) {
      if (s2_bubbles[a].popping || s2_bubbles[c].popping) continue;
      var d = dist(s2_bubbles[a].x, s2_bubbles[a].y, s2_bubbles[c].x, s2_bubbles[c].y);
      if (d < (s2_bubbles[a].r + s2_bubbles[c].r) * 0.5) {
        s2_bubbles[c].r = Math.sqrt(s2_bubbles[a].r * s2_bubbles[a].r + s2_bubbles[c].r * s2_bubbles[c].r);
        s2_bubbles[c].targetR = s2_bubbles[c].r + 5;
        s2_bubbles[a].popping = true; s2_bubbles[a].popP = 0;
        haptic(10); sfxBubble();
      }
    }
  }
  // Gel blobs
  for (var bi = 0; bi < s2_blobs.length; bi++) {
    var s = s2_blobs[bi];
    s.pulse += dt * s.pulseSpeed;
    var sqSpring = -s.squish * 20, sqDamp = -s.squishV * 6;
    s.squishV += (sqSpring + sqDamp) * dt; s.squish += s.squishV * dt;
    for (var p = 0; p < s.points.length; p++) {
      var pt = s.points[p];
      var pulse = 1 + Math.sin(s.pulse + pt.angle * 2) * 0.03;
      var tR = s.r * s.squish * pulse;
      if (s.grabbed) {
        var gdx = s.grabX - s.x, gdy = s.grabY - s.y;
        var gAng = Math.atan2(gdy, gdx);
        var aDiff = Math.abs(((pt.angle - gAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        var stretch = Math.max(0, 1 - aDiff / Math.PI);
        tR = s.r + stretch * dist(s.x, s.y, s.grabX, s.grabY) * 0.3;
      }
      var pSpring = -(pt.r - tR) * 15, pDamp = -pt.vr * 6;
      pt.vr += (pSpring + pDamp) * dt; pt.r += pt.vr * dt;
      pt.r = clamp(pt.r, s.r * 0.3, s.r * 3);
    }
    if (!s.grabbed) {
      s.vx *= 0.9; s.vy *= 0.9; s.x += s.vx * dt; s.y += s.vy * dt;
      s.x = clamp(s.x, s.r, W - s.r); s.y = clamp(s.y, s.r, H - s.r);
    }
  }
}

function s2_render() {
  ctx.globalCompositeOperation = 'screen';
  // Gel blobs
  for (var i = 0; i < s2_blobs.length; i++) {
    var s = s2_blobs[i]; var c = s.color;
    var pts = [];
    for (var p = 0; p < s.points.length; p++) {
      pts.push({ x: s.x + Math.cos(s.points[p].angle) * s.points[p].r, y: s.y + Math.sin(s.points[p].angle) * s.points[p].r });
    }
    // Glow
    var gG = ctx.createRadialGradient(s.x, s.y, s.r * 0.5, s.x, s.y, s.r * 1.8);
    gG.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.08)');
    gG.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
    ctx.fillStyle = gG;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.8, 0, Math.PI * 2); ctx.fill();

    // Smooth blob
    ctx.beginPath();
    ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    for (var pi = 0; pi < pts.length; pi++) {
      var p1 = pts[pi], p2 = pts[(pi + 1) % pts.length];
      ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    }
    ctx.closePath();
    var grad = ctx.createRadialGradient(s.x - s.r * 0.25, s.y - s.r * 0.3, 0, s.x, s.y, s.r * 1.5);
    grad.addColorStop(0, 'rgba(' + Math.min(255, c.r + 60) + ',' + Math.min(255, c.g + 60) + ',' + Math.min(255, c.b + 60) + ',0.5)');
    grad.addColorStop(0.4, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.4)');
    grad.addColorStop(1, 'rgba(' + Math.floor(c.r * 0.3) + ',' + Math.floor(c.g * 0.3) + ',' + Math.floor(c.b * 0.3) + ',0.15)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(' + Math.min(255, c.r + 40) + ',' + Math.min(255, c.g + 40) + ',' + Math.min(255, c.b + 40) + ',0.3)';
    ctx.lineWidth = 1.5; ctx.stroke();
    // Highlight
    var hG = ctx.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.35, 0, s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.4);
    hG.addColorStop(0, 'rgba(255,255,255,0.25)'); hG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hG;
    ctx.beginPath(); ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  // Bubbles
  for (var bi2 = 0; bi2 < s2_bubbles.length; bi2++) {
    var b = s2_bubbles[bi2]; var bc = b.color;
    var pulse = 1 + Math.sin(b.pulse) * 0.04;
    var popS = b.popping ? (1 + b.popP * 0.5) * (1 - b.popP * 0.3) : pulse;
    var popA = b.popping ? (1 - b.popP) : 1;
    var rr = b.r * popS;
    ctx.globalAlpha = popA;
    var bG = ctx.createRadialGradient(b.x - rr * 0.3, b.y - rr * 0.35, 0, b.x, b.y, rr);
    bG.addColorStop(0, 'rgba(' + Math.min(255, bc.r + 50) + ',' + Math.min(255, bc.g + 50) + ',' + Math.min(255, bc.b + 50) + ',0.5)');
    bG.addColorStop(0.7, 'rgba(' + bc.r + ',' + bc.g + ',' + bc.b + ',0.3)');
    bG.addColorStop(1, 'rgba(' + bc.r + ',' + bc.g + ',' + bc.b + ',0.1)');
    ctx.fillStyle = bG;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(' + Math.min(255, bc.r + 40) + ',' + Math.min(255, bc.g + 40) + ',' + Math.min(255, bc.b + 40) + ',0.4)';
    ctx.lineWidth = 1; ctx.stroke();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(b.x - rr * 0.35, b.y - rr * 0.4, rr * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

function s2_tap(x, y) {
  // Pop bubble?
  for (var i = s2_bubbles.length - 1; i >= 0; i--) {
    if (!s2_bubbles[i].popping && dist(x, y, s2_bubbles[i].x, s2_bubbles[i].y) <= s2_bubbles[i].r * 1.2) {
      s2_bubbles[i].popping = true; s2_bubbles[i].popP = 0;
      haptic(15); sfxBubble(); return true;
    }
  }
  // Create new bubble
  var col = sampleColorAt(x, y);
  s2_bubbles.push({ x: x, y: y, r: 2, targetR: rand(15, 30), color: col, growSpeed: rand(4, 7), wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5), popping: false, popP: 0, pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2) });
  haptic(15); sfxBubble(); return true;
}

var s2_grabBlob = null;
function s2_down(x, y) {
  // Grab blob?
  for (var i = s2_blobs.length - 1; i >= 0; i--) {
    if (dist(x, y, s2_blobs[i].x, s2_blobs[i].y) <= s2_blobs[i].r * 1.2) {
      s2_grabBlob = s2_blobs[i]; s2_grabBlob.grabbed = true; s2_grabBlob.grabX = x; s2_grabBlob.grabY = y;
      haptic(15); sfxSwirl(); return;
    }
  }
  s2_tap(x, y);
}
function s2_move(x, y) {
  if (s2_grabBlob) {
    s2_grabBlob.grabX = x; s2_grabBlob.grabY = y;
    s2_grabBlob.vx += (x - s2_grabBlob.x) * 0.1; s2_grabBlob.vy += (y - s2_grabBlob.y) * 0.1;
    if (Math.random() < 0.04) sfxSwirl();
  }
}
function s2_up() {
  if (s2_grabBlob) { s2_grabBlob.grabbed = false; s2_grabBlob.squishV += 0.3; haptic(25); s2_grabBlob = null; }
}

/* ===== Scene 3: Marble Flow — drag to swirl paint ribbons ===== */
var s3_trails = [], s3_drops = [], s3_autoTimer = 0;

function s3_init() { s3_trails = []; s3_drops = []; }

function s3_update(dt) {
  s3_autoTimer += dt;
  if (s3_autoTimer > 2 && s3_trails.length < 3) {
    s3_autoTimer = 0;
    var x = rand(50, W - 50), y = rand(80, H - 100);
    var col = sampleColorAt(x, y);
    s3_trails.push({ points: [{ x: x, y: y }], color: col, width: rand(15, 30), life: 1.0, curl: rand(0, Math.PI * 2), curlSpeed: rand(-1, 1) });
  }
  // Trail movement
  for (var i = s3_trails.length - 1; i >= 0; i--) {
    var t = s3_trails[i];
    t.life -= dt * 0.05;
    t.curl += dt * t.curlSpeed;
    // Auto-flow
    if (t.points.length > 0) {
      var last = t.points[t.points.length - 1];
      var nx = last.x + Math.cos(t.curl) * 1.5;
      var ny = last.y + Math.sin(t.curl) * 1.5;
      if (nx > 10 && nx < W - 10 && ny > 10 && ny < H - 10) {
        t.points.push({ x: nx, y: ny });
        if (t.points.length > 80) t.points.shift();
      }
    }
    if (t.life <= 0) s3_trails.splice(i, 1);
  }
  // Drops (from tapping)
  for (var j = s3_drops.length - 1; j >= 0; j--) {
    var d = s3_drops[j];
    d.r += d.growSpeed * dt;
    d.life -= dt * 0.1;
    if (d.life <= 0) s3_drops.splice(j, 1);
  }
}

function s3_render() {
  ctx.globalCompositeOperation = 'screen';
  // Paint trails (flowing ribbons)
  for (var i = 0; i < s3_trails.length; i++) {
    var t = s3_trails[i];
    if (t.points.length < 2) continue;
    var c = t.color;
    var a = clamp(t.life, 0, 1) * 0.5;
    // Draw thick ribbon with gradient
    for (var p = 1; p < t.points.length; p++) {
      var p0 = t.points[p - 1], p1 = t.points[p];
      var segA = a * (p / t.points.length);
      // Glow
      ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (segA * 0.15) + ')';
      ctx.lineWidth = t.width * 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      // Main
      ctx.strokeStyle = 'rgba(' + Math.min(255, c.r + 40) + ',' + Math.min(255, c.g + 40) + ',' + Math.min(255, c.b + 40) + ',' + segA + ')';
      ctx.lineWidth = t.width; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      // Highlight
      ctx.strokeStyle = 'rgba(255,255,255,' + (segA * 0.15) + ')';
      ctx.lineWidth = t.width * 0.3; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
  }
  // Drops (color puddles)
  for (var j2 = 0; j2 < s3_drops.length; j2++) {
    var d = s3_drops[j2]; var dc = d.color;
    var dA = clamp(d.life, 0, 1) * 0.5;
    var dG = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    dG.addColorStop(0, 'rgba(' + Math.min(255, dc.r + 40) + ',' + Math.min(255, dc.g + 40) + ',' + Math.min(255, dc.b + 40) + ',' + dA + ')');
    dG.addColorStop(0.6, 'rgba(' + dc.r + ',' + dc.g + ',' + dc.b + ',' + (dA * 0.5) + ')');
    dG.addColorStop(1, 'rgba(' + dc.r + ',' + dc.g + ',' + dc.b + ',0)');
    ctx.fillStyle = dG;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function s3_tap(x, y) {
  var col = sampleColorAt(x, y);
  s3_drops.push({ x: x, y: y, r: 5, growSpeed: rand(8, 15), color: col, life: 1.0 });
  haptic(20); sfxDrop(); addShake(1);
}

var s3_lastTrailX = 0, s3_lastTrailY = 0;
function s3_drag(x, y, speed) {
  var col = sampleColorAt(x, y);
  // Find existing nearby trail to extend, or create new
  var found = false;
  for (var i = 0; i < s3_trails.length; i++) {
    var t = s3_trails[i];
    if (t.points.length > 0) {
      var last = t.points[t.points.length - 1];
      if (dist(last.x, last.y, x, y) < 40) {
        t.points.push({ x: x, y: y });
        if (t.points.length > 100) t.points.shift();
        t.life = 1.0;
        found = true;
        break;
      }
    }
  }
  if (!found) {
    s3_trails.push({ points: [{ x: x, y: y }], color: col, width: rand(12, 25), life: 1.0, curl: rand(0, Math.PI * 2), curlSpeed: rand(-0.5, 0.5) });
  }
  if (Math.random() < 0.08) { sfxSwirl(); haptic(6); }
}

/* ===== Scene 4: Liquid Chrome — splash mercury + chrome trails ===== */
var s4_blobs = [], s4_splashes = [], s4_autoTimer = 0;

function s4_init() { s4_blobs = []; s4_splashes = []; for (var i = 0; i < 5; i++) s4_spawnBlob(); }

function s4_spawnBlob() {
  var x = rand(50, W - 50), y = rand(80, H - 100);
  s4_blobs.push({
    x: x, y: y, vx: rand(-1, 1), vy: rand(-1, 1),
    r: rand(15, 30), color: { r: 180, g: 200, b: 220 },
    wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5),
    pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2),
    metalness: 1.0, life: 1.0
  });
}

function s4_update(dt) {
  s4_autoTimer += dt;
  if (s4_blobs.length < 8 && s4_autoTimer > 2) { s4_autoTimer = 0; s4_spawnBlob(); }
  for (var i = s4_blobs.length - 1; i >= 0; i--) {
    var b = s4_blobs[i];
    b.wobble += dt * b.wobbleSpeed; b.pulse += dt * b.pulseSpeed;
    b.x += b.vx * dt * 30; b.y += b.vy * dt * 30;
    b.vx *= 0.98; b.vy *= 0.98; b.vy += 5 * dt;
    if (b.x < b.r) { b.x = b.r; b.vx *= -0.5; }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx *= -0.5; }
    if (b.y < b.r) { b.y = b.r; b.vy *= -0.5; }
    if (b.y > H - b.r) { b.y = H - b.r; b.vy *= -0.5; }
  }
  // Merge nearby blobs
  for (var a = s4_blobs.length - 1; a >= 0; a--) {
    for (var c = a - 1; c >= 0; c--) {
      var d = dist(s4_blobs[a].x, s4_blobs[a].y, s4_blobs[c].x, s4_blobs[c].y);
      if (d < (s4_blobs[a].r + s4_blobs[c].r) * 0.5) {
        s4_blobs[c].r = Math.sqrt(s4_blobs[a].r * s4_blobs[a].r + s4_blobs[c].r * s4_blobs[c].r);
        s4_blobs.splice(a, 1); break;
      }
    }
  }
  // Splashes
  for (var j = s4_splashes.length - 1; j >= 0; j--) {
    var s = s4_splashes[j];
    s.life -= dt; s.r += dt * 60;
    if (s.life <= 0) s4_splashes.splice(j, 1);
  }
}

function s4_render() {
  ctx.globalCompositeOperation = 'screen';
  // Splashes (mercury ring ripples)
  for (var i = 0; i < s4_splashes.length; i++) {
    var s = s4_splashes[i];
    var a = clamp(s.life / s.maxLife, 0, 1);
    // Chrome ring with specular
    ctx.strokeStyle = 'rgba(200,220,240,' + (a * 0.4) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.2) + ')';
    ctx.lineWidth = 0.5; ctx.stroke();
  }
  // Mercury blobs
  for (var i2 = 0; i2 < s4_blobs.length; i2++) {
    var b = s4_blobs[i2];
    var pulse = 1 + Math.sin(b.pulse) * 0.03;
    var rr = b.r * pulse;
    // Glow
    var gG = ctx.createRadialGradient(b.x, b.y, rr * 0.5, b.x, b.y, rr * 2);
    gG.addColorStop(0, 'rgba(150,180,210,0.1)');
    gG.addColorStop(1, 'rgba(150,180,210,0)');
    ctx.fillStyle = gG;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr * 2, 0, Math.PI * 2); ctx.fill();

    // Metallic body — silver-blue chrome with specular
    var mG = ctx.createRadialGradient(b.x - rr * 0.3, b.y - rr * 0.35, 0, b.x, b.y, rr);
    mG.addColorStop(0, 'rgba(240,250,255,0.6)');
    mG.addColorStop(0.2, 'rgba(200,220,240,0.5)');
    mG.addColorStop(0.5, 'rgba(120,150,180,0.4)');
    mG.addColorStop(0.8, 'rgba(60,80,110,0.3)');
    mG.addColorStop(1, 'rgba(30,40,60,0.15)');
    ctx.fillStyle = mG;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();

    // Chrome rim
    ctx.strokeStyle = 'rgba(220,235,250,0.4)';
    ctx.lineWidth = 1.5; ctx.stroke();

    // Specular highlight
    var sG = ctx.createRadialGradient(b.x - rr * 0.35, b.y - rr * 0.4, 0, b.x - rr * 0.35, b.y - rr * 0.4, rr * 0.35);
    sG.addColorStop(0, 'rgba(255,255,255,0.5)');
    sG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sG;
    ctx.beginPath(); ctx.arc(b.x - rr * 0.35, b.y - rr * 0.4, rr * 0.35, 0, Math.PI * 2); ctx.fill();

    // Small bright spec
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(b.x - rr * 0.38, b.y - rr * 0.42, rr * 0.08, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function s4_tap(x, y) {
  // Splash mercury
  s4_splashes.push({ x: x, y: y, r: 5, life: 0.6, maxLife: 0.6 });
  // Spawn new blob
  s4_blobs.push({ x: x, y: y, vx: rand(-3, 3), vy: rand(-5, -1), r: rand(10, 20), color: { r: 180, g: 200, b: 220 }, wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5), pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2), metalness: 1.0, life: 1.0 });
  haptic(30); sfxMercury(); addShake(2);
}

function s4_drag(x, y, speed) {
  // Create chrome trail blobs
  if (speed > 5) {
    s4_blobs.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-1, 1), vy: rand(-1, 0), r: rand(5, 12), color: { r: 180, g: 200, b: 220 }, wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.5, 1.5), pulse: rand(0, Math.PI * 2), pulseSpeed: rand(1, 2), metalness: 1.0, life: 1.0 });
    if (s4_blobs.length > 40) s4_blobs.shift();
    if (Math.random() < 0.1) { sfxMercury(); haptic(8); }
  }
}

/* ===== Common: touch indicator ===== */
var touchX = -9999, touchY = -9999, touchActive = false;
var prevX = -9999, prevY = -9999;
var touchStartX = 0, touchStartY = 0, touchStartTime = 0;

function getPos(e) {
  var t;
  if (e.touches && e.touches.length > 0) t = e.touches[0];
  else if (e.changedTouches && e.changedTouches.length > 0) t = e.changedTouches[0];
  else t = e;
  return { x: t.clientX, y: t.clientY };
}

function onDown(e) {
  e.preventDefault();
  if (!audioOn && settings.sound) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  var p = getPos(e);
  touchX = p.x; touchY = p.y; prevX = touchX; prevY = touchY;
  touchActive = true; touchStartX = touchX; touchStartY = touchY; touchStartTime = performance.now();
  var hint = document.getElementById('hint'); if (hint) hint.classList.add('fade');
  var sc = settings.currentScene;
  if (sc === 1) s1_tap(touchX, touchY);
  else if (sc === 2) s2_down(touchX, touchY);
  else if (sc === 3) s3_tap(touchX, touchY);
  else if (sc === 0) { /* scene 0 is index 0 = iridescent, but let me check... */ }
}
// Fix: scene indices — 0=Iridescent, 1=Lavender, 2=Marble, 3=Chrome

function onDownFixed(e) {
  e.preventDefault();
  if (!audioOn && settings.sound) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  var p = getPos(e);
  touchX = p.x; touchY = p.y; prevX = touchX; prevY = touchY;
  touchActive = true; touchStartX = touchX; touchStartY = touchY; touchStartTime = performance.now();
  var hint = document.getElementById('hint'); if (hint) hint.classList.add('fade');
  switch (settings.currentScene) {
    case 0: s1_tap(touchX, touchY); break;
    case 1: s2_down(touchX, touchY); break;
    case 2: s3_tap(touchX, touchY); break;
    case 3: s4_tap(touchX, touchY); break;
  }
}

function onMove(e) {
  e.preventDefault();
  var p = getPos(e);
  touchX = p.x; touchY = p.y;
  if (!touchActive) return;
  var dx = touchX - prevX, dy = touchY - prevY;
  var speed = Math.sqrt(dx * dx + dy * dy);
  switch (settings.currentScene) {
    case 0: if (speed > 2) s1_drag(touchX, touchY, speed); break;
    case 1: s2_move(touchX, touchY); break;
    case 2: if (speed > 2) s3_drag(touchX, touchY, speed); break;
    case 3: if (speed > 2) s4_drag(touchX, touchY, speed); break;
  }
  prevX = touchX; prevY = touchY;
}

function onUp(e) {
  e.preventDefault();
  var now = performance.now();
  var elapsed = now - touchStartTime;
  var dx = touchX - touchStartX, dy = touchY - touchStartY;
  var dragDist = Math.sqrt(dx * dx + dy * dy);
  if (dragDist > 80 && elapsed < 500 && Math.abs(dx) > Math.abs(dy)) {
    if (dx > 50) switchScene(-1);
    else if (dx < -50) switchScene(1);
  }
  if (settings.currentScene === 1) s2_up();
  touchActive = false;
}

canvas.addEventListener('mousedown', onDownFixed);
canvas.addEventListener('mousemove', function(e) { if (touchActive) onMove(e); else { touchX = e.clientX; touchY = e.clientY; } });
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('mouseleave', onUp);
canvas.addEventListener('wheel', function(e) { e.preventDefault(); if (e.deltaY > 0) switchScene(1); else switchScene(-1); }, { passive: false });
canvas.addEventListener('touchstart', onDownFixed, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });
canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

/* ===== Scene switching ===== */
function switchScene(dir) {
  var newIdx = (settings.currentScene + dir + SCENES.length) % SCENES.length;
  settings.currentScene = newIdx;
  loadImage(newIdx);
  haptic(20);
  // Init scene
  switch (newIdx) {
    case 0: s1_init(); break;
    case 1: s2_init(); break;
    case 2: s3_init(); break;
    case 3: s4_init(); break;
  }
}

function updateHint() {
  var hint = document.getElementById('hint');
  hint.textContent = SCENES[settings.currentScene].hint;
  hint.classList.remove('fade');
  setTimeout(function() { hint.classList.add('fade'); }, 3500);
}

function updateSceneUI() {
  var dots = document.querySelectorAll('.scene-dot');
  for (var i = 0; i < dots.length; i++) { if (i === settings.currentScene) dots[i].classList.add('active'); else dots[i].classList.remove('active'); }
  var items = document.querySelectorAll('.scene-item');
  for (var j = 0; j < items.length; j++) { if (j === settings.currentScene) items[j].classList.add('active'); else items[j].classList.remove('active'); }
}

/* ===== Render ===== */
function renderBackground() {
  if (imageLoaded) {
    ctx.drawImage(imgCanvas, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#060410';
    ctx.fillRect(0, 0, W, H);
  }
}

function renderScene() {
  switch (settings.currentScene) {
    case 0: s1_update(0); s1_render(); break;
    case 1: s2_render(); break;
    case 2: s3_render(); break;
    case 3: s4_render(); break;
  }
  // Touch indicator
  if (touchActive && touchX > 0) {
    var col = sampleColorAt(touchX, touchY);
    col = { r: Math.min(255, col.r + 80), g: Math.min(255, col.g + 80), b: Math.min(255, col.b + 80) };
    var tG = ctx.createRadialGradient(touchX, touchY, 0, touchX, touchY, 35);
    tG.addColorStop(0, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0.1)');
    tG.addColorStop(1, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0)');
    ctx.fillStyle = tG;
    ctx.beginPath(); ctx.arc(touchX, touchY, 35, 0, Math.PI * 2); ctx.fill();
  }
}

/* ===== Loop ===== */
var lastT = performance.now();
function loop(ts) {
  var dt = (ts - lastT) / 1000;
  lastT = ts;
  if (dt > 0.05) dt = 0.05;
  time += dt;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (shake > 0) { ctx.translate(rand(-shake, shake), rand(-shake, shake)); shake = Math.max(0, shake - 50 * dt); }

  ctx.clearRect(0, 0, W, H);
  renderBackground();

  // Update scene
  switch (settings.currentScene) {
    case 0: s1_update(dt); break;
    case 1: s2_update(dt); break;
    case 2: s3_update(dt); break;
    case 3: s4_update(dt); break;
  }

  renderScene();
  requestAnimationFrame(loop);
}

/* ===== UI ===== */
function initUI() {
  var dotsContainer = document.getElementById('sceneDots');
  for (var i = 0; i < SCENES.length; i++) {
    var dot = document.createElement('div');
    dot.className = 'scene-dot' + (i === 0 ? ' active' : '');
    dotsContainer.appendChild(dot);
  }
  var listContainer = document.getElementById('sceneList');
  for (var j = 0; j < SCENES.length; j++) {
    var item = document.createElement('div');
    item.className = 'scene-item' + (j === 0 ? ' active' : '');
    var thumb = document.createElement('img');
    thumb.className = 'scene-thumb'; thumb.src = SCENES[j].file;
    var name = document.createElement('span');
    name.className = 'scene-name'; name.textContent = SCENES[j].name;
    item.appendChild(thumb); item.appendChild(name);
    (function(idx) {
      item.addEventListener('click', function() {
        settings.currentScene = idx; loadImage(idx);
        switch (idx) { case 0: s1_init(); break; case 1: s2_init(); break; case 2: s3_init(); break; case 3: s4_init(); break; }
        haptic(15);
      });
    })(j);
    listContainer.appendChild(item);
  }
  document.getElementById('btnSettings').addEventListener('click', function() { document.getElementById('settingsPanel').classList.remove('hidden'); });
  document.getElementById('btnCloseSettings').addEventListener('click', function() { document.getElementById('settingsPanel').classList.add('hidden'); });
  document.getElementById('btnVibOn').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnVibOff').classList.remove('active'); settings.vibration = true; document.getElementById('vibVal').textContent = 'ON'; haptic(25); });
  document.getElementById('btnVibOff').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnVibOn').classList.remove('active'); settings.vibration = false; document.getElementById('vibVal').textContent = 'OFF'; });
  document.getElementById('btnSndOn').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnSndOff').classList.remove('active'); settings.sound = true; document.getElementById('sndVal').textContent = 'ON'; if (!audioOn) initAudio(); else startAmbient(); });
  document.getElementById('btnSndOff').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnSndOn').classList.remove('active'); settings.sound = false; document.getElementById('sndVal').textContent = 'OFF'; stopAmbient(); });
}

/* ===== Init ===== */
setupCanvas();
initUI();
loadImage(0);
s1_init();

window.addEventListener('resize', function() { setupCanvas(); if (currentImage) drawImageToCanvas(); });
window.addEventListener('orientationchange', function() { setTimeout(function() { setupCanvas(); if (currentImage) drawImageToCanvas(); }, 200); });
setTimeout(updateHint, 600);
requestAnimationFrame(loop);
