// ═══════════════════════════════════════════
//  cam.js — Camera + BlazeFace + Frame Capture
// ═══════════════════════════════════════════
import { state, dom } from './state.js';
import { setMood, setFacePresent, getFacePresent } from './eye.js';

export const camCallbacks = {
  updateStatus: null,  // (text, level?) => void
  showSpeech:   null,  // (text) => void
  speak:        null,  // (text) => void
};

let camStream     = null;
let blazeModel    = null;
let faceDetecting = false;
let lastFaceTime  = 0;
let captureCanvas = null;

function cb(name, ...args) { if (camCallbacks[name]) camCallbacks[name](...args); }

export function getCamStream() { return camStream; }

export async function startCam() {
  // ── FIX #1: Try front camera with exact first, fall back gracefully ──
  const constraints = [
    // First attempt: exact front camera (most explicit)
    { video: { facingMode: { exact: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } } },
    // Second attempt: soft preference for front camera
    { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } },
    // Third attempt: any camera (last resort)
    { video: true },
  ];

  let lastError = null;
  for (const constraint of constraints) {
    try {
      camStream = await navigator.mediaDevices.getUserMedia(constraint);
      break; // success — stop trying
    } catch (e) {
      lastError = e;
      console.warn('Camera attempt failed:', e.name, e.message, '| trying next constraint...');
    }
  }

  if (!camStream) {
    // ── FIX #2: Show a meaningful error instead of silently failing ──
    console.error('All camera attempts failed. Last error:', lastError);
    const reason = lastError?.name === 'NotAllowedError'
      ? 'Permission denied — allow camera in browser settings'
      : lastError?.name === 'NotFoundError'
      ? 'No camera found on this device'
      : lastError?.name === 'NotReadableError'
      ? 'Camera is in use by another app'
      : `Camera error: ${lastError?.name}`;
    cb('updateStatus', `CAM DENIED — ${reason}`, 'warn');
    return;
  }

  cb('updateStatus', 'CAM ACTIVE');

  // ── FIX #3: Hook stream into face-video AND cam-preview ──
  if (dom.faceVideo) {
    dom.faceVideo.srcObject = camStream;
    dom.faceVideo.setAttribute('playsinline', true); // required on iOS/Android
    dom.faceVideo.muted = true;
    dom.faceVideo.play().catch(e => console.warn('faceVideo play failed:', e));
  }

  // Also pipe into the camera overlay preview if it exists
  const camPreview = document.getElementById('cam-preview');
  if (camPreview) {
    camPreview.srcObject = camStream;
    camPreview.setAttribute('playsinline', true);
    camPreview.muted = true;
    camPreview.play().catch(e => console.warn('camPreview play failed:', e));
  }

  loadFaceModel();
}

export function stopCam() {
  faceDetecting = false;
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}

// ── Capture current frame as base64 JPEG data URL ──
export function captureFrame() {
  if (!dom.faceVideo || dom.faceVideo.readyState < 2) return null;
  if (!captureCanvas) captureCanvas = document.createElement('canvas');
  captureCanvas.width  = dom.faceVideo.videoWidth  || 640;
  captureCanvas.height = dom.faceVideo.videoHeight || 480;
  captureCanvas.getContext('2d').drawImage(dom.faceVideo, 0, 0);
  return captureCanvas.toDataURL('image/jpeg', 0.85);
}

// ── BlazeFace loader ──
async function loadFaceModel() {
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.js');
    blazeModel = await window.blazeface.load();
    cb('updateStatus', 'FACE MODEL READY');
    startFaceDetection();
  } catch (e) {
    console.warn('BlazeFace failed:', e);
    cb('updateStatus', 'FACE DETECT UNAVAILABLE');
    startIdleLoop();
  }
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function startFaceDetection() {
  if (!blazeModel || !dom.faceVideo || !dom.faceCanvas) return;
  dom.faceCanvas.width  = 320;
  dom.faceCanvas.height = 240;
  faceDetecting = true;
  detectLoop(); // ── FIX #4: Actually START the loop (was missing before!) ──
}

async function detectLoop() {
  if (!faceDetecting || !blazeModel) return;
  try {
    const ctx = dom.faceCanvas.getContext('2d');
    ctx.drawImage(dom.faceVideo, 0, 0, 320, 240);
    const preds = await blazeModel.estimateFaces(dom.faceCanvas, false);

    if (preds.length > 0) {
      if (!getFacePresent()) {
        setFacePresent(true);
        if (dom.faceIndicator) { dom.faceIndicator.textContent = '● FACE LOCKED'; dom.faceIndicator.style.color = 'var(--success)'; }
        setMood('curious');
        cb('showSpeech', 'I see you! 👁️');
        cb('speak', 'I see you!');
        cb('updateStatus', 'FACE DETECTED — TRACKING');
      }
      lastFaceTime = Date.now();
    } else {
      if (getFacePresent() && Date.now() - lastFaceTime > 2000) {
        setFacePresent(false);
        if (dom.faceIndicator) { dom.faceIndicator.textContent = '● NO FACE'; dom.faceIndicator.style.color = 'rgba(0,245,255,0.4)'; }
        setMood('bored');
        cb('updateStatus', 'NO FACE — IDLE');
        startIdleLoop();
      }
    }
  } catch (_) { /* swallow TF errors */ }
  setTimeout(detectLoop, 200); // ~5fps to save battery
}