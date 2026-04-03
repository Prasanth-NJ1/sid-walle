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

let camStream    = null;
let blazeModel   = null;
let faceDetecting = false;
let lastFaceTime  = 0;
let captureCanvas = null;

function cb(name, ...args) { if (camCallbacks[name]) camCallbacks[name](...args); }

export function getCamStream() { return camStream; }

export async function startCam() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    cb('updateStatus', 'CAM ACTIVE');
    // Hook preview into face-video for frame capture
    if (dom.faceVideo) {
      dom.faceVideo.srcObject = camStream;
      dom.faceVideo.play().catch(() => {});
    }
    loadFaceModel();
  } catch (e) {
    cb('updateStatus', 'CAM DENIED', 'warn');
  }
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
