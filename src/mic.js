// ═══════════════════════════════════════════
//  mic.js — Microphone + Speech Recognition
//
//  FIXES:
//  1. SELF-LISTENING: STT is gated — it cannot start while
//     SID is speaking. The mic button only arms a "pending"
//     flag during TTS; STT actually starts only after TTS ends
//     + a 300 ms silence buffer. This prevents SID's own voice
//     from triggering the recognizer.
//
//  2. TAP-TO-TALK (mobile): Each session is a fresh SR instance,
//     continuous:false, started inside a click handler.
//
//  3. STOP BUTTON: A red stop button is injected next to the mic.
//     It cancels TTS, aborts any pending LLM call, and resets state.
// ═══════════════════════════════════════════
import { state, dom } from './state.js';
import { setMood } from './eye.js';

export const micCallbacks = {
  updateStatus:       null,  // (text, level?) => void
  processSpokenInput: null,  // (rawText, lower) => void
  onStop:             null,  // () => void  — called when stop btn pressed
};

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let micAnimFrame;
let recogActive  = false;
let pendingListen = false;   // true = user tapped mic while SID was speaking

// ── Public API ──────────────────────────────────────────────
export async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    });
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser     = state.audioContext.createAnalyser();
    state.analyser.fftSize = 64;
    state.audioContext.createMediaStreamSource(stream).connect(state.analyser);
    state.mediaStream  = stream;
    startMicViz();
  } catch (e) {
    console.warn('Mic stream (visualiser):', e);
  }

  injectButtons();
  cb('updateStatus', SR ? 'TAP MIC TO SPEAK' : 'STT NOT SUPPORTED', SR ? 'on' : 'warn');
}

export function stopMic() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  abortSTT();
  cancelAnimationFrame(micAnimFrame);
  animateBars(false);
  cb('updateStatus', 'MIC OFF', 'off');
}

// Called by tts.js onEnd so STT can start after TTS finishes
// (only if the user had already tapped the mic button)
export function onTTSEnd() {
  setMicBtnIdle();
  if (pendingListen) {
    pendingListen = false;
    // 300 ms silence buffer — lets the speaker sound fully clear
    // before the mic opens, preventing self-capture
    setTimeout(() => {
      const btn = document.getElementById('mic-tap-btn');
      startSTT(btn);
    }, 300);
  }
}

// ── Internal helpers ─────────────────────────────────────────
function cb(name, ...args) {
  if (micCallbacks[name]) micCallbacks[name](...args);
}

function animateBars(active, level = 0) {
  if (!dom.micBars) return;
  dom.micBars.forEach((bar, i) => {
    bar.style.height = active
      ? (4 + Math.random() * Math.max(level * 28, 6)) + 'px'
      : ([6, 10, 8, 14, 6, 10, 8][i] || 8) + 'px';
  });
}

function startMicViz() {
  if (!state.analyser) return;
  const data = new Uint8Array(state.analyser.frequencyBinCount);
  function tick() {
    state.analyser.getByteFrequencyData(data);
    const avg = data.slice(0, 10).reduce((a, b) => a + b, 0) / (10 * 255);
    animateBars(true, avg);
    micAnimFrame = requestAnimationFrame(tick);
  }
  tick();
}

function setMicBtnIdle() {
  const b = document.getElementById('mic-tap-btn');
  if (!b) return;
  b.style.background  = 'rgba(0,20,30,0.85)';
  b.style.boxShadow   = '';
  b.style.borderColor = 'rgba(0,245,255,0.4)';
}

function setMicBtnListening() {
  const b = document.getElementById('mic-tap-btn');
  if (!b) return;
  b.style.background  = 'rgba(180,0,0,0.7)';
  b.style.boxShadow   = '0 0 18px #ff2244';
  b.style.borderColor = '#ff2244';
}

function setMicBtnPending() {
  const b = document.getElementById('mic-tap-btn');
  if (!b) return;
  // Amber = "armed, waiting for SID to stop speaking"
  b.style.background  = 'rgba(120,80,0,0.8)';
  b.style.boxShadow   = '0 0 14px #ffaa00';
  b.style.borderColor = '#ffaa00';
}

// ── Button injection ─────────────────────────────────────────
function injectButtons() {
  if (document.getElementById('mic-tap-btn')) return;

  const wrap = document.createElement('div');
  wrap.id = 'mic-stop-wrap';
  Object.assign(wrap.style, {
    position:       'fixed',
    bottom:         '72px',
    left:           '50%',
    transform:      'translateX(-50%)',
    zIndex:         '600',
    display:        'flex',
    gap:            '14px',
    alignItems:     'center',
  });

  // ── Mic / tap-to-talk button ──
  const micBtn = document.createElement('button');
  micBtn.id    = 'mic-tap-btn';
  micBtn.title = 'Tap to speak';
  micBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <rect x="9" y="2" width="6" height="13" rx="3"/>
      <path d="M5 10a7 7 0 0014 0"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>`;
  applyCircleStyle(micBtn, '58px', 'rgba(0,245,255,0.4)');

  micBtn.addEventListener('click', () => {
    if (recogActive) {
      // Second tap = cancel listen session
      abortSTT();
      setMicBtnIdle();
      pendingListen = false;
      return;
    }

    if (state.isSpeaking) {
      // SID is talking — arm pending so STT starts after TTS ends
      // Do NOT cancel TTS here (that's what the stop button is for)
      pendingListen = !pendingListen;
      if (pendingListen) {
        setMicBtnPending();
        cb('updateStatus', 'ARMED — WAITING FOR SID TO FINISH');
      } else {
        setMicBtnIdle();
        cb('updateStatus', 'ARMED CANCELLED');
      }
      return;
    }

    startSTT(micBtn);
  });

  // ── Stop button ──
  const stopBtn = document.createElement('button');
  stopBtn.id    = 'sid-stop-btn';
  stopBtn.title = 'Stop SID';
  stopBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
      <rect x="3" y="3" width="18" height="18" rx="3" ry="3" fill="currentColor"/>
    </svg>`;
  applyCircleStyle(stopBtn, '48px', 'rgba(255,34,68,0.6)');
  stopBtn.style.color = '#ff2244';

  stopBtn.addEventListener('click', () => {
    // 1. Stop TTS
    window.speechSynthesis?.cancel();
    state.isSpeaking = false;

    // 2. Abort any STT in progress
    abortSTT();
    pendingListen = false;
    setMicBtnIdle();

    // 3. Abort in-flight LLM request
    cb('onStop');

    // 4. Reset mood
    setMood('neutral');
    cb('updateStatus', 'STOPPED');

    // Brief red flash on the stop button
    stopBtn.style.background = 'rgba(255,34,68,0.5)';
    stopBtn.style.boxShadow  = '0 0 20px #ff2244';
    setTimeout(() => {
      stopBtn.style.background = 'rgba(0,20,30,0.85)';
      stopBtn.style.boxShadow  = '';
    }, 400);
  });

  wrap.appendChild(micBtn);
  wrap.appendChild(stopBtn);
  document.body.appendChild(wrap);
}

function applyCircleStyle(el, size, borderColor) {
  Object.assign(el.style, {
    width:          size,
    height:         size,
    borderRadius:   '50%',
    border:         `2px solid ${borderColor}`,
    background:     'rgba(0,20,30,0.85)',
    color:          '#00f5ff',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    cursor:         'pointer',
    backdropFilter: 'blur(4px)',
    transition:     'all 0.2s',
    WebkitTapHighlightColor: 'transparent',
    flexShrink:     '0',
  });
}

// ── STT session ──────────────────────────────────────────────
function startSTT(btn) {
  if (!SR) {
    cb('updateStatus', 'STT NOT SUPPORTED ON THIS BROWSER', 'warn');
    return;
  }
  if (recogActive) return;

  const rec = new SR();
  rec.continuous      = false;   // MUST be false on mobile
  rec.interimResults  = true;
  rec.lang            = 'en-US';
  rec.maxAlternatives = 1;
  state.recognition   = rec;

  rec.onstart = () => {
    recogActive = true;
    state.isListening = true;
    setMood('listening');
    cb('updateStatus', 'LISTENING...');
    setMicBtnListening();
  };

  rec.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final  += e.results[i][0].transcript;
      else                      interim += e.results[i][0].transcript;
    }
    if (interim) cb('updateStatus', 'HEARING: ' + interim.substring(0, 40));
    if (final) {
      const lower = final.trim().toLowerCase();
      cb('updateStatus', 'HEARD: ' + lower.substring(0, 40));
      cb('processSpokenInput', final.trim(), lower);
    }
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed') {
      cb('updateStatus', 'MIC PERMISSION DENIED', 'warn');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      cb('updateStatus', 'STT ERR: ' + e.error, 'warn');
    }
  };

  rec.onend = () => {
    recogActive = false;
    state.isListening = false;
    setMicBtnIdle();
    if (state.currentMood === 'listening') setMood('neutral');
    // No auto-restart — mobile needs a fresh gesture each time
  };

  try {
    rec.start();
  } catch (err) {
    cb('updateStatus', 'MIC START FAILED: ' + err.message, 'warn');
    recogActive = false;
  }
}

function abortSTT() {
  recogActive = false;
  state.isListening = false;
  if (state.recognition) {
    try { state.recognition.abort(); } catch (_) {}
    state.recognition = null;
  }
  if (state.currentMood === 'listening') setMood('neutral');
}