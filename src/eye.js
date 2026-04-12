// ═══════════════════════════════════════════════════════
//  eye.js — SVG Eye Renderer
//
//  Replaced CSS div-based eyes with the SVG system.
//  The external API is unchanged — all other modules
//  (main.js, tts.js, mic.js) still call:
//    setMood(key, manual?)
//    doBlink()
//    scheduleBlink()
//    wireTTSCallbacks()
//    setFacePresent(val) / getFacePresent()
// ═══════════════════════════════════════════════════════
import { state, reactions } from './state.js';
import { ttsCallbacks } from './tts.js';

export function wireTTSCallbacks() {
  ttsCallbacks.onStart = () => setMood('speaking');
  ttsCallbacks.onEnd   = () => setMood('neutral');
}

// ── Expression definitions ───────────────────────────────
// Each expression drives: top/bottom lid coverage (0–1),
// pupil scale, brow angle (deg), brow Y offset, brow scale.
// These map 1:1 with the uploaded reference design.
const EXPRESSIONS = {
  neutral:   {
    l: { top:0.08, bot:0.05, pupilScale:1,    browAngle:0,   browY:-1,    browScale:1    },
    r: { top:0.08, bot:0.05, pupilScale:1,    browAngle:0,   browY:-1,    browScale:1    },
    blinkInterval:5000, dur:400,
  },
  happy: {
    l: { top:0.02, bot:0.52, pupilScale:1.18, browAngle:7,   browY:-1.22, browScale:1.08 },
    r: { top:0.02, bot:0.52, pupilScale:1.18, browAngle:-7,  browY:-1.22, browScale:1.08 },
    blinkInterval:3800, dur:280,
  },
  sad: {
    l: { top:0.28, bot:0,    pupilScale:0.9,  browAngle:-12, browY:-0.8,  browScale:0.9  },
    r: { top:0.28, bot:0,    pupilScale:0.9,  browAngle:12,  browY:-0.8,  browScale:0.9  },
    blinkInterval:7000, dur:600,
  },
  angry: {
    l: { top:0.38, bot:0,    pupilScale:0.82, browAngle:14,  browY:-0.7,  browScale:1.1  },
    r: { top:0.38, bot:0,    pupilScale:0.82, browAngle:-14, browY:-0.7,  browScale:1.1  },
    blinkInterval:8000, dur:200,
  },
  surprised: {
    l: { top:0,    bot:0,    pupilScale:1.3,  browAngle:0,   browY:-1.38, browScale:1.1  },
    r: { top:0,    bot:0,    pupilScale:1.3,  browAngle:0,   browY:-1.38, browScale:1.1  },
    blinkInterval:3000, dur:150,
  },
  sleepy: {
    l: { top:0.55, bot:0.08, pupilScale:0.85, browAngle:0,   browY:-0.85, browScale:0.85 },
    r: { top:0.55, bot:0.08, pupilScale:0.85, browAngle:0,   browY:-0.85, browScale:0.85 },
    blinkInterval:3000, dur:800,
  },
  curious: {
    l: { top:0.05, bot:0,    pupilScale:1.1,  browAngle:-5,  browY:-1.22, browScale:1    },
    r: { top:0.15, bot:0,    pupilScale:1.1,  browAngle:8,   browY:-1,    browScale:1    },
    blinkInterval:4500, dur:350,
  },
  excited: {
    l: { top:0.0,  bot:0.0,  pupilScale:1.45, browAngle:5,   browY:-1.50, browScale:1.15 },
    r: { top:0.0,  bot:0.0,  pupilScale:1.45, browAngle:-5,  browY:-1.50, browScale:1.15 },
    blinkInterval:2200, dur:160,
  },
  confused: {
    l: { top:0.28, bot:0,    pupilScale:0.95, browAngle:18,  browY:-0.72, browScale:1.05 },
    r: { top:0.04, bot:0,    pupilScale:0.95, browAngle:-3,  browY:-1.35, browScale:1.05 },
    blinkInterval:4800, dur:380, gazeX:0.08, gazeY:-0.05,
  },
  love: {
    l: { top:0.02, bot:0.50, pupilScale:1.20, browAngle:7,   browY:-1.25, browScale:1.1  },
    r: { top:0.02, bot:0.50, pupilScale:1.20, browAngle:-7,  browY:-1.25, browScale:1.1  },
    blinkInterval:3500, dur:300, gazeX_l:0.20, gazeX_r:-0.20,
  },
  thinking: {
    l: { top:0.20, bot:0.05, pupilScale:0.88, browAngle:-8,  browY:-1.1,  browScale:0.95 },
    r: { top:0.20, bot:0.05, pupilScale:0.88, browAngle:8,   browY:-1.1,  browScale:0.95 },
    blinkInterval:6000, dur:500, gazeX:-0.15, gazeY:-0.08,
  },
  worried: {
    l: { top:0.20, bot:0.18, pupilScale:0.88, browAngle:-10, browY:-0.85, browScale:0.88 },
    r: { top:0.20, bot:0.18, pupilScale:0.88, browAngle:10,  browY:-0.85, browScale:0.88 },
    blinkInterval:3200, dur:480, gazeX:-0.12, gazeY:0.10,
  },
  laughing: {
    l: { top:0.05, bot:0.45, pupilScale:1.15, browAngle:6,   browY:-1.18, browScale:1.06 },
    r: { top:0.05, bot:0.45, pupilScale:1.15, browAngle:-6,  browY:-1.18, browScale:1.06 },
    blinkInterval:2800, dur:260,
  },
  scared: {
    l: { top:0,    bot:0,    pupilScale:1.4,  browAngle:-8,  browY:-1.42, browScale:1.1  },
    r: { top:0,    bot:0,    pupilScale:1.4,  browAngle:8,   browY:-1.42, browScale:1.1  },
    blinkInterval:2000, dur:150,
  },
  bored: {
    l: { top:0.62, bot:0.05, pupilScale:0.80, browAngle:0,   browY:-0.80, browScale:0.78 },
    r: { top:0.62, bot:0.05, pupilScale:0.80, browAngle:0,   browY:-0.80, browScale:0.78 },
    blinkInterval:2500, dur:1100, gazeX:0, gazeY:0.18,
  },
  listening: {
    l: { top:0.0,  bot:0.0,  pupilScale:1.3,  browAngle:-4,  browY:-1.3,  browScale:1.05 },
    r: { top:0.0,  bot:0.0,  pupilScale:1.3,  browAngle:4,   browY:-1.3,  browScale:1.05 },
    blinkInterval:4000, dur:200,
  },
  speaking: {
    l: { top:0.05, bot:0.08, pupilScale:1.1,  browAngle:2,   browY:-1.1,  browScale:1    },
    r: { top:0.05, bot:0.08, pupilScale:1.1,  browAngle:-2,  browY:-1.1,  browScale:1    },
    blinkInterval:4500, dur:300,
  },
};

// ── Mood → iris colour ────────────────────────────────────
const MOOD_COLORS = {
  happy:     '#00ff88', excited:  '#ffaa00', sad:       '#4488ff',
  angry:     '#ff2244', scared:   '#ff6b35', surprised: '#ffffff',
  love:      '#ff0099', confused: '#aa44ff', sleepy:    '#6688aa',
  thinking:  '#00ddff', laughing: '#ffdd00', worried:   '#ff8844',
  curious:   '#00f5ff', bored:    '#556677', listening: '#00ff88',
  speaking:  '#ffffff', neutral:  '#00ccff',
};

// ── State ─────────────────────────────────────────────────
let currentMood   = 'neutral';
let isBlinking    = false;
let blinkTimer    = null;
let wanderTimer   = null;
let gazeX = 0, gazeY = 0;
let reactionTimeout;
let facePresent   = false;

// ── Geometry helper ───────────────────────────────────────
function getGeo() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const R  = Math.min(vw * 0.155, vh * 0.32);
  const sp = R * 2.55;
  const cx = vw / 2, cy = vh * 0.46;
  return { R, lcx: cx - sp / 2, rcx: cx + sp / 2, cy };
}

// ── SVG attribute helper ───────────────────────────────────
function sc(id, cx, cy, r) {
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute('cx', cx);
  el.setAttribute('cy', cy);
  el.setAttribute('r',  r);
}

// ── Render one eye ────────────────────────────────────────
function renderEye(p, ecx, ecy, R, cfg, gx, gy) {
  const { top, bot, pupilScale, browAngle, browY, browScale } = cfg;
  const irisR  = R * 0.62;
  const pupilR = irisR * 0.52 * pupilScale;
  const hlR    = pupilR * 0.35;
  const diam   = R * 2;
  const topH   = diam * top;
  const botH   = diam * bot;

  const isHappy = (currentMood === 'happy' || currentMood === 'love' || currentMood === 'laughing') && !isBlinking;
  const pupilOY = isHappy ? -0.16 : 0;
  const px = ecx + gx * R;
  const py = ecy + (pupilOY + gy) * R;

  sc(p + '-sclera',      ecx, ecy, R);
  sc(p + '-iris',        px,  py,  irisR);
  sc(p + '-iris-inner',  px,  py,  irisR * 0.72);
  sc(p + '-pupil',       px,  py,  pupilR);
  sc(p + '-highlight1',  px - pupilR * 0.3,  py - pupilR * 0.35, hlR);
  sc(p + '-highlight2',  px + pupilR * 0.4,  py + pupilR * 0.3,  hlR * 0.4);
  sc(p + '-border',      ecx, ecy, R);

  // Top lid
  const lt = document.getElementById(p + '-lid-top');
  if (lt) {
    lt.setAttribute('x',      ecx - R);
    lt.setAttribute('y',      ecy - R);
    lt.setAttribute('width',  diam);
    lt.setAttribute('height', Math.max(0, topH));
    lt.setAttribute('rx',     top > 0.5 ? R : R * 0.3);
  }

  // Bottom lid — large rx on happy moods = cartoon cheek arc
  const lb = document.getElementById(p + '-lid-bot');
  if (lb) {
    lb.setAttribute('x',      ecx - R);
    lb.setAttribute('y',      ecy + R - Math.max(0, botH));
    lb.setAttribute('width',  diam);
    lb.setAttribute('height', Math.max(0, botH));
    lb.setAttribute('rx',     isHappy ? R * 0.85 : (bot > 0.3 ? R * 0.5 : R * 0.15));
  }

  // Eyebrow
  const browW  = R * 1.4 * browScale;
  const browH  = R * 0.14;
  const browCY = ecy + browY * R;
  const brow   = document.getElementById(p + '-brow');
  if (brow) {
    brow.setAttribute('x',      ecx - browW / 2);
    brow.setAttribute('y',      browCY - browH / 2);
    brow.setAttribute('width',  browW);
    brow.setAttribute('height', browH);
    brow.setAttribute('rx',     browH / 2);
    brow.style.transform       = `rotate(${browAngle}deg)`;
    brow.style.transformOrigin = `${ecx}px ${browCY}px`;
  }
}

// ── Full render ───────────────────────────────────────────
function renderFrame(key, gx, gy) {
  const expr = EXPRESSIONS[key] || EXPRESSIONS.neutral;
  const { R, lcx, rcx, cy } = getGeo();

  // Per-expression gaze overrides
  let lgx = gx, lgy = gy, rgx = gx, rgy = gy;
  if (key === 'love') {
    lgx =  0.22; rgx = -0.22;
  } else if (expr.gazeX !== undefined) {
    lgx = rgx = expr.gazeX;
    lgy = rgy = expr.gazeY || 0;
  }

  renderEye('l', lcx, cy, R, expr.l, lgx, lgy);
  renderEye('r', rcx, cy, R, expr.r, rgx, rgy);

  // Nose dot
  const nd = document.getElementById('nose-dot');
  if (nd) {
    nd.setAttribute('cx', (lcx + rcx) / 2);
    nd.setAttribute('cy', cy + R * 0.15);
    nd.setAttribute('r',  R * 0.04);
  }

  // Ambient glows
  const al = document.getElementById('amb-l');
  if (al) { al.setAttribute('cx', lcx); al.setAttribute('cy', cy); al.setAttribute('rx', R * 2.5); al.setAttribute('ry', R * 1.8); }
  const ar = document.getElementById('amb-r');
  if (ar) { ar.setAttribute('cx', rcx); ar.setAttribute('cy', cy); ar.setAttribute('rx', R * 2.5); ar.setAttribute('ry', R * 1.8); }
}

// ── CSS transition helper ─────────────────────────────────
function setTransition(ms) {
  const t = `all ${ms}ms cubic-bezier(0.4,0,0.2,1)`;
  ['l-lid-top','l-lid-bot','r-lid-top','r-lid-bot',
   'l-iris','r-iris','l-pupil','r-pupil',
   'l-brow','r-brow'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.transition = t;
  });
}

// ── Apply iris colour ─────────────────────────────────────
function applyColor(mood) {
  const color = MOOD_COLORS[mood] || '#00ccff';
  ['l-iris','r-iris'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('fill', color);
  });
  // Update the CSS variables too so status bar / UI elements stay in sync
  document.documentElement.style.setProperty('--eye-color', color);
  document.documentElement.style.setProperty('--eye-glow',  color);
}

// ── Public: setMood ───────────────────────────────────────
export function setMood(key, manual = false) {
  const expr = EXPRESSIONS[key] || EXPRESSIONS.neutral;

  // Map reactions label (for the reaction-label overlay element)
  const reactionLabel = document.getElementById('reaction-label');
  if (reactionLabel && reactions[key]) {
    reactionLabel.textContent = reactions[key].label;
  }

  currentMood = key;
  setTransition(expr.dur);
  applyColor(key);
  renderFrame(key, gazeX, gazeY);
  scheduleBlink();

  // Spawn floaters for expressive moods
  if (key === 'love')     spawnFloaters('❤️', 6);
  if (key === 'excited')  spawnFloaters('✨', 5);
  if (key === 'laughing') spawnFloaters('😂', 3);

  // Auto-revert to neutral after 8 s (unless manual override)
  if (!manual) {
    clearTimeout(reactionTimeout);
    reactionTimeout = setTimeout(() => setMood('neutral'), 8000);
  }
}

// ── Public: doBlink ───────────────────────────────────────
export function doBlink() {
  if (isBlinking) return;
  isBlinking = true;
  setTransition(100);
  const { R, lcx, rcx, cy } = getGeo();
  const blinkCfg = { top:0.95, bot:0.05, pupilScale:1, browAngle:0, browY:-1, browScale:1 };
  renderEye('l', lcx, cy, R, blinkCfg, 0, 0);
  renderEye('r', rcx, cy, R, blinkCfg, 0, 0);
  setTimeout(() => {
    setTransition(EXPRESSIONS[currentMood]?.dur || 400);
    renderFrame(currentMood, gazeX, gazeY);
    isBlinking = false;
    scheduleBlink();
  }, 180);
}

// ── Public: scheduleBlink ─────────────────────────────────
export function scheduleBlink() {
  if (blinkTimer) clearTimeout(blinkTimer);
  const interval = EXPRESSIONS[currentMood]?.blinkInterval;
  if (!interval) return;
  const delay = interval + (Math.random() - 0.5) * 1500;
  blinkTimer = setTimeout(doBlink, delay);
  // Also honour the legacy state.blinkRate slider
  // (lower blinkRate = faster blinks by shortening the next interval)
}

// ── Idle gaze wander ──────────────────────────────────────
function startWander() {
  if (wanderTimer) clearInterval(wanderTimer);
  wanderTimer = setInterval(() => {
    const expr = EXPRESSIONS[currentMood];
    if (expr && (expr.gazeX !== undefined || currentMood === 'love')) return;
    if (currentMood !== 'neutral' && currentMood !== 'listening' && currentMood !== 'speaking') {
      gazeX = 0; gazeY = 0; return;
    }
    gazeX = (Math.random() - 0.5) * 0.18;
    gazeY = (Math.random() - 0.5) * 0.10;
    setTransition(600);
    renderFrame(currentMood, gazeX, gazeY);
  }, 3000 + Math.random() * 1500);
}

// ── Floaters ──────────────────────────────────────────────
function spawnFloaters(emoji, n) {
  const svg = document.getElementById('eyes-svg');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const f = document.createElement('div');
      f.className = 'floater';
      f.textContent = emoji;
      f.style.left = (rect.left + Math.random() * rect.width) + 'px';
      f.style.top  = (rect.top  + Math.random() * rect.height * 0.5) + 'px';
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 1600);
    }, i * 200);
  }
}

// ── Boot the SVG eye system ───────────────────────────────
export function initEyes() {
  window.addEventListener('resize', () => renderFrame(currentMood, gazeX, gazeY));
  setTransition(0);
  renderFrame('neutral', 0, 0);
  scheduleBlink();
  startWander();
}

// ── Face presence (used by cam.js) ────────────────────────
export function setFacePresent(val) { facePresent = val; }
export function getFacePresent()    { return facePresent; }