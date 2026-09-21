"use strict";
/* =================================================================
   FLOW ART — Iridescent Water Ripples
   HD rendering with GPU-accelerated upscaling.
   Touch creates ripples IN the image pixels.
   5 interaction modes: Tap / Drag / Pinch / Hold / Swipe
   ================================================================= */

/* ===== Canvas Setup ===== */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, dpr = 1;
var imgCanvas, imgCtx;
var renderCanvas, renderCtx, renderData;

/* Render at half resolution for performance, upscale via GPU */
var RENDER_SCALE = 2;
var RW = 0, RH = 0;

function setupCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (!imgCanvas) { imgCanvas = document.createElement('canvas'); imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true }); }
  imgCanvas.width = W; imgCanvas.height = H;
  RW = Math.ceil(W / RENDER_SCALE); RH = Math.ceil(H / RENDER_SCALE);
  if (!renderCanvas) { renderCanvas = document.createElement('canvas'); renderCtx = renderCanvas.getContext('2d'); }
  renderCanvas.width = RW; renderCanvas.height = RH;
  renderData = renderCtx.createImageData(RW, RH);
}

/* ===== Utility ===== */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rand(a, b) { return a + Math.random() * (b - a); }
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

function rgbToHue(r, g, b) {
  var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta === 0) return 200;
  var h;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  return h < 0 ? h + 360 : h;
}

/* ===== Settings ===== */
var settings = {
  vibration: true,
  sound: true,
  currentScene: 0,
  waveSpeed: 'normal'
};

var SCENE_PARAMS = [
  {
    name: 'Iridescent Pool', file: 'images/scene1.jpg',
    baseDamping: 0.985, baseDisplace: 2.5,
    iridStrength: 0.028, iridSpeed: 12, specStrength: 50,
    particleRate: 0.12, particleColors: 'image',
    autoRippleMin: 2.5, autoRippleMax: 5.5, autoRippleStrength: 8,
    hint: 'Tap - Drag - Pinch - Hold'
  },
  {
    name: 'Lavender Gel', file: 'images/scene2.jpg',
    baseDamping: 0.992, baseDisplace: 1.8,
    iridStrength: 0.020, iridSpeed: 7, specStrength: 35,
    particleRate: 0.08, particleColors: 'image',
    autoRippleMin: 3.0, autoRippleMax: 6.0, autoRippleStrength: 4,
    hint: 'Tap - Drag - Pinch - Hold'
  },
  {
    name: 'Marble Flow', file: 'images/scene3.jpg',
    baseDamping: 0.978, baseDisplace: 3.0,
    iridStrength: 0.030, iridSpeed: 18, specStrength: 40,
    particleRate: 0.10, particleColors: 'image',
    autoRippleMin: 2.0, autoRippleMax: 4.5, autoRippleStrength: 10,
    hint: 'Tap - Drag - Pinch - Hold'
  },
  {
    name: 'Liquid Chrome', file: 'images/scene4.jpg',
    baseDamping: 0.972, baseDisplace: 2.8,
    iridStrength: 0.018, iridSpeed: 22, specStrength: 80,
    particleRate: 0.10, particleColors: 'chrome',
    autoRippleMin: 1.5, autoRippleMax: 3.5, autoRippleStrength: 7,
    hint: 'Tap - Drag - Pinch - Hold'
  }
];

function getDamping() {
  var base = SCENE_PARAMS[settings.currentScene].baseDamping;
  if (settings.waveSpeed === 'slow') return Math.min(base + 0.010, 0.996);
  if (settings.waveSpeed === 'fast') return Math.max(base - 0.013, 0.958);
  return base;
}
function getDisplaceScale() {
  var base = SCENE_PARAMS[settings.currentScene].baseDisplace;
  if (settings.waveSpeed === 'slow') return base * 0.75;
  if (settings.waveSpeed === 'fast') return base * 1.25;
  return base;
}

/* ===== Iridescent Color Table ===== */
var IRID_SIZE = 512;
var iridR = new Uint8Array(IRID_SIZE);
var iridG = new Uint8Array(IRID_SIZE);
var iridB = new Uint8Array(IRID_SIZE);
function initIridTable() {
  for (var i = 0; i < IRID_SIZE; i++) {
    var hue = (i / IRID_SIZE) * 360;
    var c = hslToRgb(hue, 0.5, 0.55);
    iridR[i] = c.r; iridG[i] = c.g; iridB[i] = c.b;
  }
}

/* ===== Image Loading ===== */
var currentImage = null, imageLoaded = false;
var imgDataCache = null;

function loadImage(idx) {
  settings.currentScene = idx; imageLoaded = false;
  var img = new Image();
  img.onload = function() {
    currentImage = img; imageLoaded = true;
    drawImageToCanvas();
    cacheImageData();
    initAmbientParticles();
    resetRipples();
    resetFlowField();
    updateSceneUI();
    updateHint();
  };
  img.src = SCENE_PARAMS[idx].file;
}

function drawImageToCanvas() {
  if (!currentImage) return;
  var iw = currentImage.naturalWidth, ih = currentImage.naturalHeight;
  var scale = Math.max(W / iw, H / ih);
  var sw = iw * scale, sh = ih * scale, sx = (W - sw) / 2, sy = (H - sh) / 2;
  imgCtx.clearRect(0, 0, W, H);
  imgCtx.drawImage(currentImage, sx, sy, sw, sh);
}

function cacheImageData() {
  if (!imageLoaded) return;
  try { imgDataCache = imgCtx.getImageData(0, 0, W, H); } catch(e) { imgDataCache = null; }
}

function sampleColorAt(x, y) {
  if (!imgDataCache) return { r: 200, g: 100, b: 200 };
  x = clamp(Math.floor(x), 0, W - 1); y = clamp(Math.floor(y), 0, H - 1);
  var i = (y * W + x) * 4;
  return { r: imgDataCache.data[i], g: imgDataCache.data[i + 1], b: imgDataCache.data[i + 2] };
}

/* ===== Ripple Grid (Physics) ===== */
var RIPPLE_W = 0, RIPPLE_H = 0;
var rippleCurrent, ripplePrevious;
var rippleGradX, rippleGradY;
var flowX, flowY;
var rippleActive = false;
var flowActive = false;

function setupRippleGrid() {
  RIPPLE_W = Math.min(Math.max(80, Math.floor(W / 4)), 160);
  RIPPLE_H = Math.min(Math.max(80, Math.floor(H / 4)), 320);
  rippleCurrent = new Float32Array(RIPPLE_W * RIPPLE_H);
  ripplePrevious = new Float32Array(RIPPLE_W * RIPPLE_H);
  rippleGradX = new Float32Array(RIPPLE_W * RIPPLE_H);
  rippleGradY = new Float32Array(RIPPLE_W * RIPPLE_H);
  flowX = new Float32Array(RIPPLE_W * RIPPLE_H);
  flowY = new Float32Array(RIPPLE_W * RIPPLE_H);
}

function resetRipples() {
  if (rippleCurrent) rippleCurrent.fill(0);
  if (ripplePrevious) ripplePrevious.fill(0);
  if (rippleGradX) rippleGradX.fill(0);
  if (rippleGradY) rippleGradY.fill(0);
  rippleActive = false;
}

function resetFlowField() {
  if (flowX) flowX.fill(0);
  if (flowY) flowY.fill(0);
  flowActive = false;
}

/* ===== Ripple Simulation ===== */
function updateRipples(dt) {
  var damping = getDamping();
  var w = RIPPLE_W;
  var maxH = 0;

  for (var y = 1; y < RIPPLE_H - 1; y++) {
    var row = y * w;
    var rowU = row - w;
    var rowD = row + w;
    for (var x = 1; x < w - 1; x++) {
      var i = row + x;
      ripplePrevious[i] = (
        rippleCurrent[i - 1] + rippleCurrent[i + 1] +
        rippleCurrent[rowU + x] + rippleCurrent[rowD + x]
      ) * 0.5 - ripplePrevious[i];
      ripplePrevious[i] *= damping;
      var ah = ripplePrevious[i];
      if (ah < 0) ah = -ah;
      if (ah > maxH) maxH = ah;
    }
  }
  var tmp = rippleCurrent;
  rippleCurrent = ripplePrevious;
  ripplePrevious = tmp;
  rippleActive = maxH > 0.008;

  for (var y2 = 0; y2 < RIPPLE_H; y2++) {
    var row2 = y2 * w;
    for (var x2 = 0; x2 < w; x2++) {
      var i2 = row2 + x2;
      var xl = x2 > 0 ? rippleCurrent[i2 - 1] : rippleCurrent[i2];
      var xr = x2 < w - 1 ? rippleCurrent[i2 + 1] : rippleCurrent[i2];
      var yu = y2 > 0 ? rippleCurrent[i2 - w] : rippleCurrent[i2];
      var yd = y2 < RIPPLE_H - 1 ? rippleCurrent[i2 + w] : rippleCurrent[i2];
      rippleGradX[i2] = xl - xr;
      rippleGradY[i2] = yu - yd;
    }
  }
}

/* ===== Flow Field ===== */
function addFlow(screenX, screenY, dirX, dirY, strength) {
  var gx = Math.floor(screenX / W * RIPPLE_W);
  var gy = Math.floor(screenY / H * RIPPLE_H);
  var radius = 4;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px < 0 || px >= RIPPLE_W || py < 0 || py >= RIPPLE_H) continue;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      var falloff = 1 - d / radius;
      var i = py * RIPPLE_W + px;
      flowX[i] += dirX * strength * falloff;
      flowY[i] += dirY * strength * falloff;
    }
  }
  flowActive = true;
}

function updateFlow(dt) {
  if (!flowActive) return;
  var decay = settings.waveSpeed === 'slow' ? 0.985 : settings.waveSpeed === 'fast' ? 0.955 : 0.970;
  var maxV = 0;
  for (var i = 0; i < flowX.length; i++) {
    flowX[i] *= decay;
    flowY[i] *= decay;
    var v = Math.abs(flowX[i]) + Math.abs(flowY[i]);
    if (v > maxV) maxV = v;
  }
  if (maxV < 0.01) flowActive = false;
}

function rippleAdd(screenX, screenY, strength) {
  var gx = Math.floor(screenX / W * RIPPLE_W);
  var gy = Math.floor(screenY / H * RIPPLE_H);
  if (gx < 1 || gx >= RIPPLE_W - 1 || gy < 1 || gy >= RIPPLE_H - 1) return;
  var i = gy * RIPPLE_W + gx;
  rippleCurrent[i] += strength;
  rippleCurrent[i - 1] += strength * 0.5;
  rippleCurrent[i + 1] += strength * 0.5;
  rippleCurrent[i - RIPPLE_W] += strength * 0.5;
  rippleCurrent[i + RIPPLE_W] += strength * 0.5;
}

function rippleAddRing(screenX, screenY, strength, gridRadius) {
  var gx = Math.floor(screenX / W * RIPPLE_W);
  var gy = Math.floor(screenY / H * RIPPLE_H);
  for (var a = 0; a < 16; a++) {
    var ang = (a / 16) * Math.PI * 2;
    var rx = gx + Math.round(Math.cos(ang) * gridRadius);
    var ry = gy + Math.round(Math.sin(ang) * gridRadius);
    if (rx >= 1 && rx < RIPPLE_W - 1 && ry >= 1 && ry < RIPPLE_H - 1) {
      rippleCurrent[ry * RIPPLE_W + rx] += strength;
    }
  }
}

/* ===== Water Surface Rendering ===== */
/*
  CRITICAL FIX: Alpha channel bug.
  - createImageData() initializes all pixels to (0,0,0,0) = transparent.
  - Previous code only wrote R,G,B, never A=255 → image disappeared.
  - FIX: Use out.set(src) to copy entire source (including A=255),
    then only modify R,G,B for active pixels. Calm pixels stay as-is.
  PERFORMANCE: Render at half resolution (RW x RH), upscale via GPU.
*/
function renderWaterSurface() {
  if (!imgDataCache) {
    if (imageLoaded) ctx.drawImage(imgCanvas, 0, 0, W, H);
    return;
  }

  /* Calm water: draw full-res source image directly (perfect HD, zero cost) */
  if (!rippleActive && !flowActive) {
    ctx.drawImage(imgCanvas, 0, 0, W, H);
    return;
  }

  var src = imgDataCache.data;
  var out = renderData.data;
  var params = SCENE_PARAMS[settings.currentScene];
  var dispScale = getDisplaceScale() * RENDER_SCALE;
  var iridStr = params.iridStrength;
  var specStr = params.specStrength;
  var hueOffset = time * params.iridSpeed;
  var gw = RIPPLE_W, gh = RIPPLE_H;
  var rw = RW, rh = RH;
  var srcW = W, srcH = H;
  var gxRatio = gw / rw;
  var gyRatio = gh / rh;
  var pxRatio = srcW / rw;
  var pyRatio = srcH / rh;
  var iridScale = IRID_SIZE / 360;

  /* Pre-fill output with a downscaled copy of the source image.
     This copies alpha=255 for ALL pixels, fixing the disappearing bug.
     We use a simple nearest-neighbor downscale (fast). */
  for (var ry = 0; ry < rh; ry++) {
    var srcY = (ry * srcH / rh) | 0;
    var srcRow = srcY * srcW;
    var outRow = ry * rw;
    for (var rx = 0; rx < rw; rx++) {
      var srcX = (rx * srcW / rw) | 0;
      var si = (srcRow + srcX) * 4;
      var di = (outRow + rx) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = 255;
    }
  }

  /* Now modify only pixels with significant displacement */
  for (var y = 0; y < rh; y++) {
    var py = y * gyRatio;
    var gy0 = py | 0;
    var gy1 = gy0 + 1 < gh ? gy0 + 1 : gy0;
    var fy = py - gy0;
    var ify = 1 - fy;
    var row0 = gy0 * gw;
    var row1 = gy1 * gw;
    var outRow2 = y * rw;

    for (var x = 0; x < rw; x++) {
      var px = x * gxRatio;
      var gx0 = px | 0;
      var gx1 = gx0 + 1 < gw ? gx0 + 1 : gx0;
      var fx = px - gx0;
      var ifx = 1 - fx;

      var i00 = row0 + gx0;
      var i10 = row0 + gx1;
      var i01 = row1 + gx0;
      var i11 = row1 + gx1;

      var h00 = rippleCurrent[i00];
      var h10 = rippleCurrent[i10];
      var h01 = rippleCurrent[i01];
      var h11 = rippleCurrent[i11];
      var rH = h00 * ifx * ify + h10 * fx * ify + h01 * ifx * fy + h11 * fx * fy;

      var rGx = rippleGradX[i00] * ifx * ify + rippleGradX[i10] * fx * ify + rippleGradX[i01] * ifx * fy + rippleGradX[i11] * fx * fy;
      var rGy = rippleGradY[i00] * ifx * ify + rippleGradY[i10] * fx * ify + rippleGradY[i01] * ifx * fy + rippleGradY[i11] * fx * fy;

      var f00x = flowX[i00], f10x = flowX[i10], f01x = flowX[i01], f11x = flowX[i11];
      var rFx = f00x * ifx * ify + f10x * fx * ify + f01x * ifx * fy + f11x * fx * fy;
      var f00y = flowY[i00], f10y = flowY[i10], f01y = flowY[i01], f11y = flowY[i11];
      var rFy = f00y * ifx * ify + f10y * fx * ify + f01y * ifx * fy + f11y * fx * fy;

      var absH = rH < 0 ? -rH : rH;
      var absFx = rFx < 0 ? -rFx : rFx;
      var absFy = rFy < 0 ? -rFy : rFy;

      /* Skip calm pixels — they already have the correct source value */
      if (absH < 0.005 && absFx < 0.008 && absFy < 0.008) continue;

      var dx = rGx * dispScale + rFx * RENDER_SCALE;
      var dy = rGy * dispScale + rFy * RENDER_SCALE;

      /* Bilinear sample from full-res source image */
      var sx = x * pxRatio + dx;
      var sy = y * pyRatio + dy;
      sx = sx < 0 ? 0 : sx >= srcW ? srcW - 1 : sx;
      sy = sy < 0 ? 0 : sy >= srcH ? srcH - 1 : sy;
      var sx0 = sx | 0;
      var sy0 = sy | 0;
      var sx1 = sx0 + 1 < srcW ? sx0 + 1 : sx0;
      var sy1 = sy0 + 1 < srcH ? sy0 + 1 : sy0;
      var sfx = sx - sx0;
      var sfy = sy - sy0;
      var isfx = 1 - sfx;
      var isfy = 1 - sfy;

      var si00 = (sy0 * srcW + sx0) * 4;
      var si10 = (sy0 * srcW + sx1) * 4;
      var si01 = (sy1 * srcW + sx0) * 4;
      var si11 = (sy1 * srcW + sx1) * 4;

      var sr = src[si00] * isfx * isfy + src[si10] * sfx * isfy + src[si01] * isfx * sfy + src[si11] * sfx * sfy;
      var sg = src[si00 + 1] * isfx * isfy + src[si10 + 1] * sfx * isfy + src[si01 + 1] * isfx * sfy + src[si11 + 1] * sfx * sfy;
      var sb = src[si00 + 2] * isfx * isfy + src[si10 + 2] * sfx * isfy + src[si01 + 2] * isfx * sfy + src[si11 + 2] * sfx * sfy;

      var blend = absH * iridStr;
      if (blend > 0.35) blend = 0.35;
      var invBlend = 1 - blend;
      var totalHue = (rH * 10 + hueOffset) % 360;
      if (totalHue < 0) totalHue += 360;
      var hIdx = (totalHue * iridScale) | 0;
      if (hIdx >= IRID_SIZE) hIdx = IRID_SIZE - 1;

      var spec = -rGx * 0.5 - rGy * 0.5;
      if (spec < 0) spec = 0;
      spec = spec * spec * spec * specStr;
      if (spec > 180) spec = 180;

      var di2 = (outRow2 + x) * 4;
      var rr = sr * invBlend + iridR[hIdx] * blend + spec;
      var gg = sg * invBlend + iridG[hIdx] * blend + spec;
      var bb = sb * invBlend + iridB[hIdx] * blend + spec * 1.1;
      out[di2] = rr > 255 ? 255 : rr;
      out[di2 + 1] = gg > 255 ? 255 : gg;
      out[di2 + 2] = bb > 255 ? 255 : bb;
      out[di2 + 3] = 255;
    }
  }

  renderCtx.putImageData(renderData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderCanvas, 0, 0, W, H);
}

/* ===== Holographic Overlay ===== */
function renderHolographicOverlay() {
  var params = SCENE_PARAMS[settings.currentScene];
  ctx.globalCompositeOperation = 'screen';

  var h1 = (time * params.iridSpeed * 0.35) % 360;
  var c1 = hslToRgb(h1, 0.45, 0.5);
  var c2 = hslToRgb((h1 + 120) % 360, 0.45, 0.5);
  var c3 = hslToRgb((h1 + 240) % 360, 0.45, 0.5);

  var grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(' + c1.r + ',' + c1.g + ',' + c1.b + ',0.025)');
  grad.addColorStop(0.5, 'rgba(' + c2.r + ',' + c2.g + ',' + c2.b + ',0.025)');
  grad.addColorStop(1, 'rgba(' + c3.r + ',' + c3.g + ',' + c3.b + ',0.025)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (touchActive && touchX > 0) {
    var tc = sampleColorAt(touchX, touchY);
    var th = rgbToHue(tc.r, tc.g, tc.b) + time * 18;
    var tcc = hslToRgb(th, 0.5, 0.6);
    var tG = ctx.createRadialGradient(touchX, touchY, 0, touchX, touchY, 70);
    tG.addColorStop(0, 'rgba(' + tcc.r + ',' + tcc.g + ',' + tcc.b + ',0.10)');
    tG.addColorStop(1, 'rgba(' + tcc.r + ',' + tcc.g + ',' + tcc.b + ',0)');
    ctx.fillStyle = tG;
    ctx.beginPath(); ctx.arc(touchX, touchY, 70, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
}

/* ===== Particles ===== */
var touchParticles = [];
var ambientParticles = [];
var MAX_TOUCH_PARTICLES = 60;

function spawnTouchParticles(x, y, count, color, mode) {
  if (touchParticles.length >= MAX_TOUCH_PARTICLES) return;
  var params = SCENE_PARAMS[settings.currentScene];
  for (var i = 0; i < count; i++) {
    var col = color;
    if (params.particleColors === 'chrome') {
      col = { r: 210 + Math.random() * 45, g: 220 + Math.random() * 35, b: 235 + Math.random() * 20 };
    }
    var vx, vy, decay, r;
    if (mode === 'pinch') {
      var ang = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      var spd = rand(2, 5);
      vx = Math.cos(ang) * spd; vy = Math.sin(ang) * spd;
      decay = rand(0.012, 0.022); r = rand(3, 7);
    } else if (mode === 'drag') {
      vx = rand(-1, 1); vy = rand(-1.5, -0.2);
      decay = rand(0.01, 0.018); r = rand(2, 5);
    } else if (mode === 'hold') {
      vx = rand(-0.5, 0.5); vy = rand(-1, -0.1);
      decay = rand(0.006, 0.012); r = rand(2, 4);
    } else {
      vx = rand(-1.5, 1.5); vy = rand(-2, -0.3);
      decay = rand(0.01, 0.02); r = rand(2, 5);
    }
    touchParticles.push({
      x: x, y: y, vx: vx, vy: vy, r: r, color: col,
      life: 1.0, decay: decay,
      twinkle: rand(0, Math.PI * 2), twinkleSpeed: rand(2, 5)
    });
  }
}

function updateTouchParticles(dt) {
  for (var i = touchParticles.length - 1; i >= 0; i--) {
    var p = touchParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.03; p.vx *= 0.98;
    p.life -= p.decay;
    p.twinkle += dt * p.twinkleSpeed;
    if (p.life <= 0) touchParticles.splice(i, 1);
  }
}

function renderTouchParticles() {
  ctx.globalCompositeOperation = 'screen';
  for (var i = 0; i < touchParticles.length; i++) {
    var p = touchParticles[i];
    var tw = 0.5 + Math.sin(p.twinkle) * 0.5;
    var alpha = p.life * tw * 0.5;
    var r = p.r * (0.8 + tw * 0.4);
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    g.addColorStop(0, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + alpha + ')');
    g.addColorStop(0.4, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + (alpha * 0.25) + ')');
    g.addColorStop(1, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function initAmbientParticles() {
  ambientParticles = [];
  for (var i = 0; i < 14; i++) {
    var x = rand(0, W), y = rand(0, H);
    var col = sampleColorAt(x, y);
    ambientParticles.push({
      x: x, y: y,
      vx: rand(-0.12, 0.12), vy: rand(-0.2, -0.04),
      r: rand(3, 7), color: col,
      twinkle: rand(0, Math.PI * 2), twinkleSpeed: rand(0.8, 2.5),
      baseAlpha: rand(0.1, 0.25),
      wander: rand(0, Math.PI * 2), wanderSpeed: rand(0.2, 0.6)
    });
  }
}

function updateAmbientParticles(dt) {
  for (var i = 0; i < ambientParticles.length; i++) {
    var p = ambientParticles[i];
    p.wander += dt * p.wanderSpeed;
    p.x += p.vx + Math.sin(p.wander) * 0.1;
    p.y += p.vy + Math.cos(p.wander * 0.7) * 0.06;
    p.twinkle += dt * p.twinkleSpeed;
    if (p.x < -10) p.x = W + 10;
    if (p.x > W + 10) p.x = -10;
    if (p.y < -10) p.y = H + 10;
    if (p.y > H + 10) p.y = -10;
  }
  if (Math.random() < 0.006) {
    var idx = (Math.random() * ambientParticles.length) | 0;
    ambientParticles[idx].color = sampleColorAt(ambientParticles[idx].x, ambientParticles[idx].y);
  }
}

function renderAmbientParticles() {
  ctx.globalCompositeOperation = 'screen';
  for (var i = 0; i < ambientParticles.length; i++) {
    var p = ambientParticles[i];
    var tw = 0.5 + Math.sin(p.twinkle) * 0.5;
    var alpha = p.baseAlpha * tw;
    var r = p.r * (0.8 + tw * 0.4);
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    g.addColorStop(0, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + alpha + ')');
    g.addColorStop(0.4, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + (alpha * 0.2) + ')');
    g.addColorStop(1, 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ===== Audio ===== */
var audioCtx = null, masterGain = null, audioOn = false, ambientNodes = [];

function initAudio() {
  if (audioOn) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.06;
    masterGain.connect(audioCtx.destination); audioOn = true; startAmbient();
  } catch(e) {}
}

function startAmbient() {
  if (!audioOn || !settings.sound) return; stopAmbient();
  var o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
  o1.type = 'sine'; o1.frequency.value = 110; g1.gain.value = 0.015;
  o1.connect(g1); g1.connect(masterGain); o1.start();
  var o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(), lfo = audioCtx.createOscillator(), lfoG = audioCtx.createGain();
  o2.type = 'sine'; o2.frequency.value = 165; lfo.frequency.value = 0.1; lfoG.gain.value = 0.008;
  lfo.connect(lfoG); lfoG.connect(g2.gain); g2.gain.value = 0.008;
  o2.connect(g2); g2.connect(masterGain); o2.start(); lfo.start();
  var bs = Math.floor(audioCtx.sampleRate * 2), buf = audioCtx.createBuffer(1, bs, audioCtx.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
  var src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 250;
  var ng = audioCtx.createGain(); ng.gain.value = 0.004;
  src.connect(f); f.connect(ng); ng.connect(masterGain); src.start();
  ambientNodes = [o1, o2, lfo, src];
}

function stopAmbient() { for (var i = 0; i < ambientNodes.length; i++) { try { ambientNodes[i].stop(); } catch(e) {} } ambientNodes = []; }

function tone(freq, dur, type, vol) {
  if (!audioOn || !settings.sound) return; type = type || 'sine'; vol = vol || 0.05;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(masterGain); o.start(); o.stop(audioCtx.currentTime + dur);
}

function noiseBurst(dur, vol, ff) {
  if (!audioOn || !settings.sound) return; vol = vol || 0.025; ff = ff || 1200;
  var bs = Math.floor(audioCtx.sampleRate * dur), buf = audioCtx.createBuffer(1, bs, audioCtx.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = ff;
  var g = audioCtx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(masterGain); src.start(); src.stop(audioCtx.currentTime + dur);
}

function sfxTap() { tone(rand(300, 500), 0.12, 'sine', 0.025); }
function sfxDrag() { tone(rand(180, 300), 0.1, 'sine', 0.015); }
function sfxPinch() { tone(rand(120, 200), 0.3, 'sine', 0.04); tone(rand(240, 350), 0.2, 'sine', 0.02); }
function sfxHold() { tone(rand(140, 220), 0.4, 'sine', 0.03); }
function sfxSwipe() { noiseBurst(0.2, 0.012, 500); }

/* ===== Haptics ===== */
function haptic(p) { if (!settings.vibration) return; if (navigator.vibrate) { try { navigator.vibrate(p); } catch(e) {} } }

/* ===== Auto Ripples ===== */
var autoRippleTimer = 0;
function autoRipple(dt) {
  autoRippleTimer += dt;
  var params = SCENE_PARAMS[settings.currentScene];
  var interval = rand(params.autoRippleMin, params.autoRippleMax);
  if (autoRippleTimer > interval) {
    autoRippleTimer = 0;
    var x = rand(50, W - 50), y = rand(50, H - 50);
    rippleAdd(x, y, params.autoRippleStrength);
  }
}

/* ===== Touch: 5 Interaction Modes ===== */
var activeTouches = {};
var isPinching = false;
var pinchLastDist = 0;
var primaryTouchId = null;
var primaryStartX = 0, primaryStartY = 0, primaryStartTime = 0;
var primaryLastX = 0, primaryLastY = 0;
var touchX = -9999, touchY = -9999, touchActive = false;
var touchTotalMove = 0;
var isHolding = false;
var lastTouchMoveTime = 0;

function onTap(x, y) {
  var col = sampleColorAt(x, y);
  rippleAdd(x, y, 14);
  spawnTouchParticles(x, y, 3, col, 'tap');
  haptic(12); sfxTap();
}

function onDrag(x, y, prevX, prevY, speed) {
  rippleAdd(x, y, speed * 0.25);
  var dx = x - prevX, dy = y - prevY;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.1) {
    var nx = dx / len, ny = dy / len;
    addFlow(x, y, nx, ny, Math.min(speed * 0.04, 1.5));
  }
  var params = SCENE_PARAMS[settings.currentScene];
  if (Math.random() < params.particleRate) {
    var col = sampleColorAt(x, y);
    spawnTouchParticles(x, y, 1, col, 'drag');
  }
  if (Math.random() < 0.04) haptic(4);
  if (Math.random() < 0.05) sfxDrag();
}

function onPinchStart(cx, cy, d) {
  pinchLastDist = d;
  var col = sampleColorAt(cx, cy);
  rippleAddRing(cx, cy, 20, 5);
  rippleAdd(cx, cy, 30);
  for (var a = 0; a < 8; a++) {
    var ang = (a / 8) * Math.PI * 2;
    addFlow(cx, cy, Math.cos(ang), Math.sin(ang), 0.8);
  }
  spawnTouchParticles(cx, cy, 12, col, 'pinch');
  haptic(30); sfxPinch();
}

function onPinchMove(cx, cy, newDist) {
  var delta = newDist - pinchLastDist;
  pinchLastDist = newDist;
  rippleAdd(cx, cy, Math.abs(delta) * 0.5);
  if (Math.abs(delta) > 1.5) {
    var col = sampleColorAt(cx, cy);
    spawnTouchParticles(cx, cy, 2, col, 'pinch');
    if (Math.random() < 0.12) { haptic(6); sfxDrag(); }
  }
}

function onHold(x, y) {
  var osc = Math.sin(time * 8) * 0.5 + 0.5;
  rippleAdd(x, y, 3 * osc);
  if (Math.random() < 0.02) {
    var col = sampleColorAt(x, y);
    spawnTouchParticles(x, y, 1, col, 'hold');
  }
  if (Math.random() < 0.03) haptic(5);
}

function onSwipe(x, y, dx, dy) {
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.1) {
    var nx = dx / len, ny = dy / len;
    var steps = 8;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      rippleAdd(x - dx * t, y - dy * t, 8);
      addFlow(x - dx * t, y - dy * t, nx, ny, 0.5);
    }
  }
  sfxSwipe(); haptic(20);
}

/* ===== Touch Handlers ===== */
function handleTouchStart(e) {
  e.preventDefault();
  if (!audioOn && settings.sound) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  var hint = document.getElementById('hint');
  if (hint) hint.classList.add('fade');

  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    activeTouches[t.identifier] = { x: t.clientX, y: t.clientY, prevX: t.clientX, prevY: t.clientY };
  }

  var ids = Object.keys(activeTouches);

  if (ids.length === 1) {
    primaryTouchId = ids[0];
    var t0 = activeTouches[ids[0]];
    primaryStartX = t0.x; primaryStartY = t0.y;
    primaryStartTime = performance.now();
    primaryLastX = t0.x; primaryLastY = t0.y;
    touchX = t0.x; touchY = t0.y; touchActive = true;
    touchTotalMove = 0; isHolding = false;
    lastTouchMoveTime = performance.now();
    onTap(t0.x, t0.y);
  } else if (ids.length === 2) {
    isPinching = true; primaryTouchId = null; isHolding = false;
    var t1 = activeTouches[ids[0]], t2 = activeTouches[ids[1]];
    var cx = (t1.x + t2.x) / 2, cy = (t1.y + t2.y) / 2;
    touchX = cx; touchY = cy; touchActive = true;
    onPinchStart(cx, cy, dist(t1.x, t1.y, t2.x, t2.y));
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (activeTouches[t.identifier]) {
      var at = activeTouches[t.identifier];
      at.prevX = at.x; at.prevY = at.y;
      at.x = t.clientX; at.y = t.clientY;
    }
  }

  var ids = Object.keys(activeTouches);

  if (ids.length >= 2 && isPinching) {
    var t1 = activeTouches[ids[0]], t2 = activeTouches[ids[1]];
    var newDist = dist(t1.x, t1.y, t2.x, t2.y);
    var cx = (t1.x + t2.x) / 2, cy = (t1.y + t2.y) / 2;
    touchX = cx; touchY = cy;
    onPinchMove(cx, cy, newDist);
  } else if (ids.length === 1) {
    var at = activeTouches[ids[0]];
    var dx = at.x - at.prevX, dy = at.y - at.prevY;
    var speed = Math.sqrt(dx * dx + dy * dy);
    touchTotalMove += speed;
    touchX = at.x; touchY = at.y; touchActive = true;
    onDrag(at.x, at.y, at.prevX, at.prevY, speed);
    if (ids[0] === primaryTouchId) {
      primaryLastX = at.x; primaryLastY = at.y;
      lastTouchMoveTime = performance.now();
      isHolding = false;
    }
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    delete activeTouches[e.changedTouches[i].identifier];
  }

  var ids = Object.keys(activeTouches);

  if (ids.length === 0) {
    if (isPinching) { isPinching = false; }
    else if (primaryTouchId !== null) {
      var elapsed = performance.now() - primaryStartTime;
      var dx = primaryLastX - primaryStartX, dy = primaryLastY - primaryStartY;
      var dragDist = Math.sqrt(dx * dx + dy * dy);
      if (dragDist > 80 && elapsed < 350 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onSwipe(primaryLastX, primaryLastY, dx, dy);
        if (dx > 50) switchScene(-1);
        else if (dx < -50) switchScene(1);
      }
    }
    primaryTouchId = null; isHolding = false; touchActive = false;
  } else if (ids.length === 1 && isPinching) {
    isPinching = false;
    primaryTouchId = ids[0];
    var t0 = activeTouches[ids[0]];
    primaryStartX = t0.x; primaryStartY = t0.y;
    primaryStartTime = performance.now();
    primaryLastX = t0.x; primaryLastY = t0.y;
    touchTotalMove = 0; isHolding = false;
  }
}

/* ===== Mouse Support ===== */
var mouseDown = false, mouseStartX = 0, mouseStartY = 0, mouseStartTime = 0, mousePrevX = 0, mousePrevY = 0;
var mouseTotalMove = 0, mouseIsHolding = false, lastMouseMoveTime = 0;

function handleMouseDown(e) {
  e.preventDefault();
  if (!audioOn && settings.sound) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  var hint = document.getElementById('hint'); if (hint) hint.classList.add('fade');
  mouseDown = true; mouseStartX = e.clientX; mouseStartY = e.clientY;
  mouseStartTime = performance.now(); mousePrevX = e.clientX; mousePrevY = e.clientY;
  touchX = e.clientX; touchY = e.clientY; touchActive = true;
  mouseTotalMove = 0; mouseIsHolding = false;
  lastMouseMoveTime = performance.now();
  onTap(e.clientX, e.clientY);
}

function handleMouseMove2(e) {
  touchX = e.clientX; touchY = e.clientY;
  if (!mouseDown) return;
  e.preventDefault();
  var dx = e.clientX - mousePrevX, dy = e.clientY - mousePrevY;
  var speed = Math.sqrt(dx * dx + dy * dy);
  mouseTotalMove += speed;
  onDrag(e.clientX, e.clientY, mousePrevX, mousePrevY, speed);
  mousePrevX = e.clientX; mousePrevY = e.clientY;
  lastMouseMoveTime = performance.now();
  mouseIsHolding = false;
}

function handleMouseUp(e) {
  if (!mouseDown) return;
  e.preventDefault(); mouseDown = false;
  var dx = e.clientX - mouseStartX, dy = e.clientY - mouseStartY;
  var elapsed = performance.now() - mouseStartTime;
  var dragDist = Math.sqrt(dx * dx + dy * dy);
  if (dragDist > 80 && elapsed < 350 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    onSwipe(e.clientX, e.clientY, dx, dy);
    if (dx > 50) switchScene(-1);
    else if (dx < -50) switchScene(1);
  }
  mouseIsHolding = false;
  setTimeout(function() { touchActive = false; }, 150);
}

function handleDblClick(e) {
  e.preventDefault();
  var col = sampleColorAt(e.clientX, e.clientY);
  rippleAddRing(e.clientX, e.clientY, 22, 5);
  rippleAdd(e.clientX, e.clientY, 30);
  for (var a = 0; a < 8; a++) {
    var ang = (a / 8) * Math.PI * 2;
    addFlow(e.clientX, e.clientY, Math.cos(ang), Math.sin(ang), 0.8);
  }
  spawnTouchParticles(e.clientX, e.clientY, 12, col, 'pinch');
  haptic(30); sfxPinch();
}

/* ===== Event Listeners ===== */
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove2);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseUp);
canvas.addEventListener('dblclick', handleDblClick);
canvas.addEventListener('wheel', function(e) { e.preventDefault(); if (e.deltaY > 0) switchScene(1); else switchScene(-1); }, { passive: false });
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

/* ===== Scene Switching ===== */
function switchScene(dir) {
  var newIdx = (settings.currentScene + dir + SCENE_PARAMS.length) % SCENE_PARAMS.length;
  switchToScene(newIdx);
}

function switchToScene(idx) {
  settings.currentScene = idx;
  touchParticles = [];
  loadImage(idx);
  haptic(18);
}

function updateHint() {
  var hint = document.getElementById('hint');
  hint.textContent = SCENE_PARAMS[settings.currentScene].hint;
  hint.classList.remove('fade');
  setTimeout(function() { hint.classList.add('fade'); }, 3500);
}

function updateSceneUI() {
  var dots = document.querySelectorAll('.scene-dot');
  for (var i = 0; i < dots.length; i++) { if (i === settings.currentScene) dots[i].classList.add('active'); else dots[i].classList.remove('active'); }
  var items = document.querySelectorAll('.scene-item');
  for (var j = 0; j < items.length; j++) { if (j === settings.currentScene) items[j].classList.add('active'); else items[j].classList.remove('active'); }
}

/* ===== UI ===== */
function initUI() {
  var dotsContainer = document.getElementById('sceneDots');
  for (var i = 0; i < SCENE_PARAMS.length; i++) {
    var dot = document.createElement('div');
    dot.className = 'scene-dot' + (i === 0 ? ' active' : '');
    dotsContainer.appendChild(dot);
  }
  var listContainer = document.getElementById('sceneList');
  for (var j = 0; j < SCENE_PARAMS.length; j++) {
    var item = document.createElement('div');
    item.className = 'scene-item' + (j === 0 ? ' active' : '');
    var thumb = document.createElement('img');
    thumb.className = 'scene-thumb'; thumb.src = SCENE_PARAMS[j].file;
    var name = document.createElement('span');
    name.className = 'scene-name'; name.textContent = SCENE_PARAMS[j].name;
    item.appendChild(thumb); item.appendChild(name);
    (function(idx) {
      item.addEventListener('click', function() { switchToScene(idx); });
    })(j);
    listContainer.appendChild(item);
  }
  document.getElementById('btnSettings').addEventListener('click', function() { document.getElementById('settingsPanel').classList.remove('hidden'); });
  document.getElementById('btnCloseSettings').addEventListener('click', function() { document.getElementById('settingsPanel').classList.add('hidden'); });

  document.getElementById('btnVibOn').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnVibOff').classList.remove('active'); settings.vibration = true; document.getElementById('vibVal').textContent = 'ON'; haptic(20); });
  document.getElementById('btnVibOff').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnVibOn').classList.remove('active'); settings.vibration = false; document.getElementById('vibVal').textContent = 'OFF'; });

  document.getElementById('btnSndOn').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnSndOff').classList.remove('active'); settings.sound = true; document.getElementById('sndVal').textContent = 'ON'; if (!audioOn) initAudio(); else startAmbient(); });
  document.getElementById('btnSndOff').addEventListener('click', function() { this.classList.add('active'); document.getElementById('btnSndOn').classList.remove('active'); settings.sound = false; document.getElementById('sndVal').textContent = 'OFF'; stopAmbient(); });

  function setWaveSpeed(speed, btnId) {
    settings.waveSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById(btnId).classList.add('active');
    var label = speed === 'slow' ? 'Slow' : speed === 'fast' ? 'Fast' : 'Normal';
    document.getElementById('speedVal').textContent = label;
    haptic(15);
  }
  document.getElementById('btnSpeedSlow').addEventListener('click', function() { setWaveSpeed('slow', 'btnSpeedSlow'); });
  document.getElementById('btnSpeedNormal').addEventListener('click', function() { setWaveSpeed('normal', 'btnSpeedNormal'); });
  document.getElementById('btnSpeedFast').addEventListener('click', function() { setWaveSpeed('fast', 'btnSpeedFast'); });
}

/* ===== Main Loop ===== */
var time = 0, lastT = performance.now();

function loop(ts) {
  var dt = (ts - lastT) / 1000;
  lastT = ts;
  if (dt > 0.05) dt = 0.05;
  time += dt;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  updateRipples(dt);
  updateFlow(dt);
  autoRipple(dt);

  if (touchActive && !isPinching) {
    var touchElapsed = (performance.now() - (primaryTouchId !== null ? lastTouchMoveTime : lastMouseMoveTime)) / 1000;
    var mouseElapsed = mouseDown ? (performance.now() - lastMouseMoveTime) / 1000 : 999;
    var stationary = Math.min(touchElapsed, mouseElapsed);
    var totalMove = primaryTouchId !== null ? touchTotalMove : mouseTotalMove;

    if (totalMove < 8 && stationary > 0.35 && !mouseIsHolding) {
      isHolding = true; mouseIsHolding = true;
      haptic(25); sfxHold();
    }
    if (mouseIsHolding && touchActive) {
      onHold(touchX, touchY);
    }
  }

  renderWaterSurface();
  renderHolographicOverlay();
  updateAmbientParticles(dt);
  renderAmbientParticles();
  updateTouchParticles(dt);
  renderTouchParticles();

  requestAnimationFrame(loop);
}

/* ===== Resize ===== */
function onResize() {
  setupCanvas();
  setupRippleGrid();
  if (currentImage) { drawImageToCanvas(); cacheImageData(); }
  initAmbientParticles();
  resetRipples();
  resetFlowField();
}

/* ===== Init ===== */
setupCanvas();
setupRippleGrid();
initIridTable();
initUI();
loadImage(0);

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', function() { setTimeout(onResize, 200); });
setTimeout(updateHint, 600);
requestAnimationFrame(loop);
