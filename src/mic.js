// ═══════════════════════════════════════════
//  mic.js — Microphone + Speech Recognition
// ═══════════════════════════════════════════
import { state, dom } from './state.js';
import { setMood } from './eye.js';

// Injected from main.js after init to avoid circular imports
export const micCallbacks = {
  updateStatus:      null,   // (text, level?) => void
  processSpokenInput: null,  // (rawText, lower) => void
};

let micAnimFrame;

export async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    });
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 64;
    state.audioContext.createMediaStreamSource(stream).connect(state.analyser);
    state.mediaStream = stream;
    cb('updateStatus', 'MIC ACTIVE');
    startMicViz();
    startSTT();
  } catch (e) {
    cb('updateStatus', 'MIC DENIED', 'warn');
    console.warn('Mic:', e);
  }
}

export function stopMic() {
  if (state.mediaStream) { state.mediaStream.getTracks().forEach(t => t.stop()); state.mediaStream = null; }
  if (state.recognition)  { state.recognition.stop(); state.recognition = null; }
  cancelAnimationFrame(micAnimFrame);
  animateBars(false);
  cb('updateStatus', 'MIC OFF', 'off');
}

function cb(name, ...args) {
  if (micCallbacks[name]) micCallbacks[name](...args);
}

// ── Mic visualiser ──
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

// ── Speech Recognition ──
function startSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { cb('updateStatus', 'STT NOT SUPPORTED', 'warn'); return; }

  const rec = new SR();
  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = 'en-US';
  state.recognition  = rec;

  rec.onstart = () => {
    state.isListening = true;
    setMood('listening');
    cb('updateStatus', 'LISTENING...');
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
    if (e.error !== 'no-speech') cb('updateStatus', 'STT: ' + e.error, 'warn');
  };

  rec.onend = () => {
    state.isListening = false;
    if (state.micActive) setTimeout(() => { if (state.micActive && state.recognition) rec.start(); }, 500);
  };

  rec.start();
}
