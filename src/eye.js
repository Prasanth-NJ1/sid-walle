// ═══════════════════════════════════
//  eye.js — Eye animations & moods
// ═══════════════════════════════════
import { state, dom, reactions } from './state.js';
import { ttsCallbacks } from './tts.js';

// ── Wire TTS callbacks here to avoid circular imports ──
export function wireTTSCallbacks() {
  ttsCallbacks.onStart = () => setMood('speaking');
  ttsCallbacks.onEnd   = () => setMood('neutral');
}

// ═══════════════
//  MOOD SYSTEM
// ═══════════════
let reactionTimeout;
let isBlinking = false;

const MOOD_COLORS = {
  happy:     { main:'#00ff88', iris:'#008844', glow:'#00ff88' },
  excited:   { main:'#ffaa00', iris:'#886600', glow:'#ffaa00' },
  sad:       { main:'#4488ff', iris:'#224499', glow:'#4488ff' },
  angry:     { main:'#ff2244', iris:'#881122', glow:'#ff2244' },
  scared:    { main:'#ff6b35', iris:'#883300', glow:'#ff6b35' },
  surprised: { main:'#ffffff', iris:'#aaaaaa', glow:'#cccccc' },
  love:      { main:'#ff0099', iris:'#880055', glow:'#ff0099' },
  confused:  { main:'#aa44ff', iris:'#662299', glow:'#aa44ff' },
  sleepy:    { main:'#6688aa', iris:'#334455', glow:'#6688aa' },
  thinking:  { main:'#00ddff', iris:'#007788', glow:'#00ddff' },
  laughing:  { main:'#ffdd00', iris:'#887700', glow:'#ffdd00' },
  worried:   { main:'#ff8844', iris:'#884422', glow:'#ff8844' },
  curious:   { main:'#00f5ff', iris:'#0088aa', glow:'#00f5ff' },
  bored:     { main:'#556677', iris:'#334455', glow:'#556677' },
  listening: { main:'#00ff88', iris:'#008844', glow:'#00ff88' },
  speaking:  { main:'#ffffff', iris:'#aaaaaa', glow:'#cccccc' },
  neutral:   { main:'#00f5ff', iris:'#0088aa', glow:'#00f5ff' },
};

export function setMood(key, manual = false) {
  const r = reactions[key];
  if (!r || !dom.eyeLeft || !dom.eyeRight) return;
  state.currentMood = key;

  if (dom.reactionLabel) dom.reactionLabel.textContent = r.label;

  // Pupil size
  const pct = (r.pupil * 35) + '%';
  if (dom.pupilL) { dom.pupilL.style.width = dom.pupilL.style.height = pct; }
  if (dom.pupilR) { dom.pupilR.style.width = dom.pupilR.style.height = pct; }

  // Color
  if (!manual) {
    const mc = MOOD_COLORS[key];
    if (mc) {
      document.documentElement.style.setProperty('--eye-color', mc.main);
      document.documentElement.style.setProperty('--eye-glow',  mc.glow);
      document.documentElement.style.setProperty('--eye-iris',  mc.iris);
    }
  }


  // Clear all animation state
  [dom.eyeLeft, dom.eyeRight].forEach(e => {
    e.style.animation = '';
    e.style.transform = '';
    if (!isBlinking) {
      const top = e.querySelector('.eyelid-top');
      const bot = e.querySelector('.eyelid-bot');
      if (top) { top.style.animation = ''; top.style.transform = 'translateY(-100%)'; }
      if (bot) { bot.style.transform = 'translateY(100%)'; }
    }
    const p = e.querySelector('.eye-pupil');
    if (p) p.style.animation = '';
  });


  // Apply per-mood animation
  switch (key) {
    case 'happy': case 'excited': case 'laughing':
      dom.eyeLeft.style.animation  = 'happy-bounce 0.5s ease infinite';
      dom.eyeRight.style.animation = 'happy-bounce 0.5s ease 0.15s infinite';
      break;
    case 'angry':
      dom.eyeLeft.style.animation  = 'angry-pulse 0.8s ease infinite';
      dom.eyeRight.style.animation = 'angry-pulse 0.8s ease 0.1s infinite';
      document.documentElement.style.setProperty('--eye-color', '#ff2244');
      document.documentElement.style.setProperty('--eye-glow',  '#ff2244');
      break;
    case 'scared': case 'worried':
      dom.eyeLeft.style.animation  = 'scared-shake 0.3s ease infinite';
      dom.eyeRight.style.animation = 'scared-shake 0.3s ease 0.08s infinite';
      break;
    case 'confused': case 'curious':
      dom.eyeLeft.style.animation  = 'confused-tilt 1.5s ease infinite';
      dom.eyeRight.style.animation = 'confused-tilt 1.5s ease 0.5s infinite';
      break;
    case 'thinking': {
      const pl = dom.eyeLeft.querySelector('.eye-pupil');
      const pr = dom.eyeRight.querySelector('.eye-pupil');
      if (pl) pl.style.animation = 'thinking 1.2s ease infinite';
      if (pr) pr.style.animation = 'thinking 1.2s ease 0.4s infinite';
      break;
    }
    case 'sleepy': case 'bored':
      [dom.eyeLeft, dom.eyeRight].forEach(e => {
        const top = e.querySelector('.eyelid-top');
        if (top) top.style.animation = 'sleepy-droop 0.5s ease forwards';
      });
      setTimeout(() => {
        [dom.eyeLeft, dom.eyeRight].forEach(e => {
          const top = e.querySelector('.eyelid-top');
          if (top) { top.style.animation = ''; top.style.transform = 'translateY(-30%)'; }
        });
      }, 500);
      break;
  }

  // Floater particles
  if (key === 'love')     spawnFloaters('❤️', 6);
  if (key === 'excited')  spawnFloaters('✨', 5);
  if (key === 'laughing') spawnFloaters('😂', 3);

  // Auto-revert to neutral
  if (!manual) {
    clearTimeout(reactionTimeout);
    reactionTimeout = setTimeout(() => setMood('neutral'), 8000);
  }
}

function spawnFloaters(emoji, n) {
  const eyeWrap = document.getElementById('eyes-wrap');
  if (!eyeWrap) return;
  const rect = eyeWrap.getBoundingClientRect();
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

// ═══════════
//  BLINK
// ═══════════
export function doBlink() {
  if (!dom.eyeLeft || !dom.eyeRight || isBlinking) return;
  isBlinking = true;
  [dom.eyeLeft, dom.eyeRight].forEach(e => e.classList.add('blink'));
  setTimeout(() => {
    [dom.eyeLeft, dom.eyeRight].forEach(e => e.classList.remove('blink'));
    isBlinking = false;
  }, 180);
}


export function scheduleBlink() {
  const base = 3000 / (state.blinkRate || 4);
  const delay = base * (0.5 + Math.random());
  setTimeout(() => { doBlink(); scheduleBlink(); }, delay);
}

// ═══════════════
//  PUPIL TRACKING
// ═══════════════


// ═══════════════════
//  RANDOM MOTION
// ═══════════════════


// ═══════════════
//  IDLE LOOP
// ═══════════════
let facePresent = false;
let idleTimer   = null;

export function setFacePresent(val) { facePresent = val; }
export function getFacePresent()    { return facePresent; }