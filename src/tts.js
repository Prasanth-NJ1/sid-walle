// ═══════════════════════
//  tts.js — Text-to-Speech
// ═══════════════════════
import { state } from './state.js';

export function loadVoices() {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { resolve(v); return; }
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
  });
}

function pickVoice(voices) {
  return (
    voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
    voices.find(v => v.lang.startsWith('en-') && !v.name.toLowerCase().includes('compact')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0]
  );
}

// onStart / onEnd callbacks wired from eye.js after init
export const ttsCallbacks = { onStart: null, onEnd: null };

export async function speak(text) {
  if (!state.synth || !text) return;
  state.synth.cancel();
  await new Promise(r => setTimeout(r, 80));

  const voices = await loadVoices();
  const utt = new SpeechSynthesisUtterance(text);
  utt.volume = state.volume / 100;
  utt.rate   = 1.05;
  utt.pitch  = 1.1;
  const v = pickVoice(voices);
  if (v) utt.voice = v;

  utt.onstart = () => { state.isSpeaking = true;  if (ttsCallbacks.onStart) ttsCallbacks.onStart(); };
  utt.onend   = () => { state.isSpeaking = false; if (ttsCallbacks.onEnd)   ttsCallbacks.onEnd();   };
  utt.onerror = (e) => { state.isSpeaking = false; console.warn('TTS:', e.error); };

  state.synth.speak(utt);
  setTimeout(() => { if (state.synth.speaking && state.synth.paused) state.synth.resume(); }, 200);
}
