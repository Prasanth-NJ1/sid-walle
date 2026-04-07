// ═══════════════════════════════════════════════════════
//  main.js — App orchestrator
//  Wires all modules together after DOM is ready.
//  All cross-module communication goes through callbacks
//  defined here — no circular imports.
// ═══════════════════════════════════════════════════════
import { state, dom, eyeColors, reactions, moodIcons, LOCATIONS, LOCATION_MAP } from './state.js';
import { setMood, wireTTSCallbacks, scheduleBlink } from './eye.js';
import { speak, loadVoices }              from './tts.js';
import { startMic, stopMic, micCallbacks } from './mic.js';
import { startCam, stopCam, captureFrame, camCallbacks } from './cam.js';
import { askLLM, askVision, parseReply } from './llm.js';

// ── LLM abort controller ─────────────────────────────────────
// Replaced on every new LLM call; cancelled by the stop button.
let llmAbortController = new AbortController();
function newLLMAbort() {
  llmAbortController = new AbortController();
  return llmAbortController.signal;
}

// ══════════════════════
//  DOM REF POPULATION
// ══════════════════════
function initDOMRefs() {
  dom.eyeLeft       = document.getElementById('eye-left');
  dom.eyeRight      = document.getElementById('eye-right');
  dom.pupilL        = document.getElementById('pupil-left');
  dom.pupilR        = document.getElementById('pupil-right');
  dom.speechBubble  = document.getElementById('speech-bubble');
  dom.reactionLabel = document.getElementById('reaction-label');
  dom.locationToast = document.getElementById('location-toast');
  dom.rpiStatus     = document.getElementById('rpi-status');
  dom.micBars       = document.querySelectorAll('.mic-bar');
  dom.statusText    = document.getElementById('status-text');
  dom.statusDot     = document.getElementById('status-dot');
  dom.faceIndicator = document.getElementById('face-indicator');
  dom.tapUnlock     = document.getElementById('tap-unlock');
  dom.faceVideo     = document.getElementById('face-video');
  dom.faceCanvas    = document.getElementById('face-canvas');
  dom.cameraOverlay = document.getElementById('camera-overlay');
  dom.camPreview    = document.getElementById('cam-preview');
  dom.captureBtn    = document.getElementById('capture-btn');
  dom.llmStatus     = document.getElementById('llm-status');
}

// ══════════════════════
//  HELPERS
// ══════════════════════
function updateStatus(text, level = 'on') {
  if (dom.statusText) dom.statusText.textContent = '> ' + text;
  if (dom.statusDot)  dom.statusDot.className = 'status-dot' + (level === 'off' ? ' off' : level === 'warn' ? ' warn' : '');
}

function showSpeech(text, isVision = false) {
  if (!dom.speechBubble) return;
  dom.speechBubble.textContent = text;
  dom.speechBubble.classList.add('show');
  dom.speechBubble.classList.toggle('vision-response', isVision);
  clearTimeout(dom.speechBubble._t);
  dom.speechBubble._t = setTimeout(() => dom.speechBubble.classList.remove('show'), text.length * 55 + 3000);
}

function showLocationToast(msg) {
  if (!dom.locationToast) return;
  dom.locationToast.textContent = msg;
  dom.locationToast.classList.add('show');
  setTimeout(() => dom.locationToast.classList.remove('show'), 3000);
}

function applyEyeColor(c) {
  state.eyeColor = c.main; state.eyeGlow = c.glow; state.eyeIris = c.iris;
  document.documentElement.style.setProperty('--eye-color', c.main);
  document.documentElement.style.setProperty('--eye-glow',  c.glow);
  document.documentElement.style.setProperty('--eye-iris',  c.iris);
  document.documentElement.style.setProperty('--text-col',  c.main);
  document.documentElement.style.setProperty('--border-col', c.main + '40');
}

// ══════════════════════
//  ROBOT NAVIGATION
// ══════════════════════
async function sendToRobot(location) {
  if (!state.rpiIp) { showLocationToast(`📍 Navigate to: ${location.toUpperCase()}`); return; }
  try {
    await fetch(`http://${state.rpiIp}:${state.rpiPort}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'navigate', location, timestamp: Date.now() }),
      signal: AbortSignal.timeout(3000),
    });
    showLocationToast(`📍 Navigating → ${location.toUpperCase()}`);
  } catch {
    showLocationToast(`📡 Robot offline — ${location}`);
  }
}

// ══════════════════════
//  VISION CAPTURE
// ══════════════════════
let visionPending = false;

function showCameraOverlay() {
  const stream = captureFrame(); // ensure faceVideo is alive
  if (dom.camPreview && dom.faceVideo && dom.faceVideo.srcObject) {
    dom.camPreview.srcObject = dom.faceVideo.srcObject;
  }
  if (dom.cameraOverlay) dom.cameraOverlay.classList.add('show');
  if (dom.captureBtn) dom.captureBtn.classList.add('visible');
}

function closeCameraOverlay() {
  if (dom.cameraOverlay) dom.cameraOverlay.classList.remove('show');
  if (dom.captureBtn)    dom.captureBtn.classList.remove('visible');
  visionPending = false;
}

async function handleCaptureAndAnalyse() {
  if (!state.llmUrl) {
    showSpeech('Set your LLM server URL in settings first!');
    speak('Please set the LLM server URL in settings.');
    return;
  }
  const dataUrl = captureFrame();
  closeCameraOverlay();

  if (!dataUrl) {
    showSpeech('Camera is not ready. Make sure it is enabled.');
    speak('Camera is not ready.');
    return;
  }

  setMood('thinking');
  updateStatus('ANALYSING IMAGE...');
  showSpeech('Let me look at that…', true);
  speak('Let me look at that.');

  try {
    const base64 = dataUrl.split(',')[1];
    const prompt  = state.pendingVisionPrompt || 'Describe what you see in this image in 2-3 sentences.';
    const reply   = await askVision(base64, prompt);
    const vEmotion = detectEmotion(reply);          // keyword scan (vision model)
    showSpeech(reply, true);
    speak(reply);
    setMood(vEmotion);
    updateStatus('VISION DONE');
  } catch (e) {
    const msg = 'I had trouble analysing that. Check the LLM server connection.';
    showSpeech(msg, true);
    speak(msg);
    setMood('worried');
    updateStatus('VISION ERROR: ' + e.message.substring(0, 40), 'warn');
  }
}

// ══════════════════════
//  SPOKEN INPUT
// ══════════════════════
const VISION_TRIGGERS = [
  'what is this','what do you see','analyse this','analyze this',
  'look at this','what am i holding','describe this',
  'what is in front','scan this','identify this',
];

async function processSpokenInput(rawText, lower) {
  // Vision intent
  for (const kw of VISION_TRIGGERS) {
    if (lower.includes(kw)) {
      state.pendingVisionPrompt = rawText;
      visionPending = true;
      showCameraOverlay();
      showSpeech('📷 Point your camera and tap ANALYSE.');
      speak('Point your camera and tap Analyse.');
      setMood('curious');
      return;
    }
  }

  // Navigation
  for (const loc of LOCATIONS) {
    if (lower.includes(loc)) {
      const dest = LOCATION_MAP[loc] || loc;
      const msg  = `Navigating to ${dest}!`;
      showSpeech(msg); speak(msg); setMood('excited');
      await sendToRobot(dest);
      return;
    }
  }

  // Emotion mirroring
  const emotionMap = {
    happy:'happy', excited:'excited', sad:'sad', angry:'angry',
    scared:'scared', surprised:'surprised', love:'love', confused:'confused',
    sleepy:'sleepy', tired:'sleepy', bored:'bored',
    funny:'laughing', laugh:'laughing', think:'thinking', thinking:'thinking',
  };
  for (const [word, mood] of Object.entries(emotionMap)) {
    if (lower.includes(word)) { setMood(mood); break; }
  }

  // LLM chat
  if (!state.llmUrl) {
    const msg = "Set your Ollama server URL in Settings to chat with me!";
    showSpeech(msg); speak(msg); setMood('happy');
    return;
  }

  setMood('thinking');
  updateStatus('THINKING...');
  try {
    const raw             = await askLLM(rawText, newLLMAbort());
    const { emotion, clean } = parseReply(raw);   // extract tag + strip ALL markdown
    showSpeech(clean);
    speak(clean);
    setMood(emotion || detectEmotion(raw));        // tag wins; keyword scan as fallback
    updateStatus('SID: ' + clean.substring(0, 50));
  } catch (e) {
    if (e.name === 'AbortError') {
      // User pressed stop — silent, already handled
      return;
    }
    const msg = 'I had trouble reaching my brain. Check the LLM server.';
    showSpeech(msg); speak(msg); setMood('worried');
    updateStatus('LLM ERROR', 'warn');
    console.error('LLM:', e);
  }
}

// ── Emotion detection — two layers ─────────────────────────
// Layer 1: parse [EMOTION:tag] injected by the LLM system prompt.
// Layer 2: rich keyword fallback for vision replies / LLM lapses.
function detectEmotion(text) {
  // Layer 1 — explicit tag from LLM
  const tagMatch = text.match(/\[EMOTION:([\w]+)\]/i);
  if (tagMatch) {
    const e = tagMatch[1].toLowerCase();
    if (reactions[e]) return e;
  }
  // Layer 2 — keyword scan
  const l = text.toLowerCase();
  if (/\blove\b|adore|cherish|heart/.test(l))                      return 'love';
  if (/haha|lol|funny|hilarious|laugh/.test(l))                     return 'laughing';
  if (/wow|incredible|unbelievable|no way|whoa/.test(l))            return 'surprised';
  if (/excited|amazing|awesome|fantastic|wonderful/.test(l))        return 'excited';
  if (/happy|glad|pleased|delighted|yay/.test(l))                   return 'happy';
  if (/sorry|sad|unfortunate|regret|miss you/.test(l))              return 'sad';
  if (/angry|furious|annoyed|frustrat|rage/.test(l))                return 'angry';
  if (/scared|afraid|terrified|fear|danger/.test(l))                return 'scared';
  if (/worried|concern|anxious|nervous|uneasy/.test(l))             return 'worried';
  if (/confused|unclear|not sure|don.t understand|lost/.test(l))    return 'confused';
  if (/curious|interesting|i wonder|tell me more/.test(l))          return 'curious';
  if (/think|consider|hmm|perhaps|let me|calculating/.test(l))      return 'thinking';
  if (/tired|sleepy|yawn|exhausted|drowsy/.test(l))                 return 'sleepy';
  if (/bored|whatever|meh/.test(l))                                 return 'bored';
  return 'speaking';
}

// Strip [EMOTION:tag] from reply before showing / speaking it
function stripEmotionTag(text) {
  return text.replace(/\[EMOTION:[\w]+\]\s*/i, '').trim();
}

// ══════════════════════
//  UI INIT
// ══════════════════════
function initUI() {
  // Colour grid
  const colorGrid = document.getElementById('color-grid');
  if (colorGrid) {
    eyeColors.forEach((c, i) => {
      const s = document.createElement('div');
      s.className = 'color-swatch' + (i === 0 ? ' active' : '');
      s.style.cssText = `background:${c.main};box-shadow:0 0 10px ${c.main}66`;
      s.title = c.name;
      s.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        applyEyeColor(c);
      });
      colorGrid.appendChild(s);
    });
  }

  // Mood grid
  const moodGrid = document.getElementById('mood-grid');
  if (moodGrid) {
    Object.keys(reactions).forEach(key => {
      const btn = document.createElement('div');
      btn.className = 'mood-btn' + (key === 'neutral' ? ' active' : '');
      btn.innerHTML = `<span class="mood-icon">${moodIcons[key] || '🤖'}</span><span>${reactions[key].label}</span>`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setMood(key, true);
      });
      moodGrid.appendChild(btn);
    });
  }

  // Menu
  const menuBtn     = document.getElementById('menu-btn');
  const menuPanel   = document.getElementById('menu-panel');
  const menuOverlay = document.getElementById('menu-overlay');
  const menuClose   = document.getElementById('menu-close');
  const closeMenu   = () => { menuPanel.classList.remove('open'); menuOverlay.classList.remove('show'); };
  menuBtn?.addEventListener('click',     () => { menuPanel.classList.add('open'); menuOverlay.classList.add('show'); });
  menuClose?.addEventListener('click',   closeMenu);
  menuOverlay?.addEventListener('click', closeMenu);

  // Fullscreen
  document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });

  // Volume slider
  const volSlider = document.getElementById('vol-slider');
  const volVal    = document.getElementById('vol-val');
  volSlider?.addEventListener('input', () => { state.volume = +volSlider.value; volVal.textContent = volSlider.value; });

  // Blink slider
  const blinkSlider = document.getElementById('blink-slider');
  const blinkVal    = document.getElementById('blink-val');
  blinkSlider?.addEventListener('input', () => { state.blinkRate = +blinkSlider.value; blinkVal.textContent = blinkSlider.value; });

  // Toggles
  initToggle('mic-toggle',    'micActive',    () => startMic(), () => stopMic());
  initToggle('cam-toggle',    'camActive',    () => startCam(), () => stopCam());
  initToggle('motion-toggle', 'randomMotion');
  initToggle('touch-toggle',  'followTouch');

  // LLM URL
  const llmInput  = document.getElementById('llm-url-input');
  const saveLLMBtn = document.getElementById('save-llm-btn');
  if (llmInput) llmInput.value = state.llmUrl;
  saveLLMBtn?.addEventListener('click', async () => {
    const url = llmInput?.value.trim().replace(/\/$/, '') || '';
    if (!url) return;
    state.llmUrl = url;
    localStorage.setItem('llm_url', url);
    dom.llmStatus.textContent = 'Testing…'; dom.llmStatus.style.color = 'var(--text-dim)';
    try {
      const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000), headers: { 'ngrok-skip-browser-warning': 'true' } });
      dom.llmStatus.textContent = r.ok ? '✓ Connected to Ollama' : '⚠ Saved (got ' + r.status + ')';
      dom.llmStatus.style.color = r.ok ? 'var(--success)' : 'var(--accent)';
    } catch {
      dom.llmStatus.textContent = '⚠ Saved — ngrok may block direct ping, try chatting';
      dom.llmStatus.style.color = 'var(--accent)';
    }
  });

  // RPI connection
  const rpiIpEl   = document.getElementById('rpi-ip');
  const rpiPortEl = document.getElementById('rpi-port');
  if (rpiIpEl)   rpiIpEl.value   = state.rpiIp;
  if (rpiPortEl) rpiPortEl.value = state.rpiPort;
  document.getElementById('rpi-connect-btn')?.addEventListener('click', async () => {
    const ip   = rpiIpEl?.value.trim() || '';
    const port = rpiPortEl?.value.trim() || '8080';
    if (!ip) { dom.rpiStatus.textContent = '⚠ Enter IP'; dom.rpiStatus.style.color = 'var(--accent)'; return; }
    state.rpiIp = ip; state.rpiPort = port;
    localStorage.setItem('rpi_ip', ip); localStorage.setItem('rpi_port', port);
    dom.rpiStatus.textContent = 'Connecting…'; dom.rpiStatus.style.color = 'var(--text-dim)';
    try {
      await fetch(`http://${ip}:${port}/ping`, { signal: AbortSignal.timeout(3000) });
      state.rpiConnected = true;
      dom.rpiStatus.textContent = `✓ ${ip}:${port}`; dom.rpiStatus.style.color = 'var(--success)';
    } catch {
      state.rpiConnected = true;
      dom.rpiStatus.textContent = `⚠ Saved (ping failed — may still work)`; dom.rpiStatus.style.color = 'var(--accent)';
    }
  });

  // Capture button
  dom.captureBtn?.addEventListener('click', handleCaptureAndAnalyse);

  // Camera close
  document.getElementById('cam-close')?.addEventListener('click', closeCameraOverlay);

}

function initToggle(id, stateKey, onFn, offFn) {
  document.getElementById(id)?.addEventListener('click', function () {
    state[stateKey] = !state[stateKey];
    this.classList.toggle('on', state[stateKey]);
    if (state[stateKey] && onFn) onFn();
    if (!state[stateKey] && offFn) offFn();
  });
}

// ══════════════════════
//  WIRE CALLBACKS
// ══════════════════════
function wireCallbacks() {
  // mic → main
  micCallbacks.updateStatus       = updateStatus;
  micCallbacks.processSpokenInput = processSpokenInput;
  micCallbacks.onStop = () => {
    // Abort any in-flight LLM request
    llmAbortController.abort();
    updateStatus('STOPPED');
    // Hide speech bubble immediately
    if (dom.speechBubble) {
      dom.speechBubble.classList.remove('show');
      clearTimeout(dom.speechBubble._t);
    }
  };

  // cam → main
  camCallbacks.updateStatus = updateStatus;
  camCallbacks.showSpeech   = (t) => showSpeech(t, false);
  camCallbacks.speak        = speak;

  // tts ↔ eye (via eye.js helper)
  wireTTSCallbacks();
}

// ══════════════════════
//  BOOT
// ══════════════════════
async function boot() {
  updateStatus('SID BOOTING…', 'warn');
  setMood('thinking');
  await delay(600);

  if (state.micActive) await startMic();
  if (state.camActive) await startCam();

  await delay(300);
  setMood('happy');

  const greeting = state.llmUrl
    ? 'Hey! SID online. I\'m ready to chat and help you navigate.'
    : 'Hey! SID online! Set your LLM server URL in settings to fully activate me.';
  showSpeech(greeting);
  await speak(greeting);
  updateStatus('SID ONLINE — READY');
  setTimeout(() => setMood('neutral'), 4000);
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════
//  ENTRY
// ══════════════════════
window.addEventListener('load', () => {
  initDOMRefs();
  wireCallbacks();
  initUI();
  loadVoices();
  scheduleBlink();

  // Android audio unlock tap
  dom.tapUnlock?.addEventListener('click', async () => {
    if (state.audioContext?.state === 'suspended') await state.audioContext.resume();
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    window.speechSynthesis.speak(warmup);
    dom.tapUnlock.classList.add('hidden');
    await boot();
  }, { once: true });
});