# SID — Companion Robot Eye Web App

A Vite-powered web app that serves as the **head/face** of your companion robot.
It shows animated robot eyes, listens via microphone, talks back using TTS, and
connects to your local Ollama LLM server (text + vision).

---

## 🗂️ Project Structure

```
sid-robot/
├── index.html          ← Entry point
├── vite.config.js
├── package.json
└── src/
    ├── main.js         ← App orchestrator (wires everything)
    ├── state.js        ← Shared state + DOM refs + constants
    ├── eye.js          ← Eye animations, moods, blink, pupil tracking
    ├── tts.js          ← Text-to-Speech (Web Speech API)
    ├── mic.js          ← Microphone + Speech Recognition (STT)
    ├── cam.js          ← Camera access + BlazeFace detection
    ├── llm.js          ← Ollama API (text: smolvlm2, vision: gemma3:4b)
    └── style.css       ← Full cyberpunk UI styles
```

---

## ⚡ Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000 in your browser
```

---

## ⚙️ Configuration (via Settings menu in app)

### LLM Server (required)
Enter your **ngrok URL** in the Settings menu → **LLM Server** field.

Example: `https://kathy-nontranscribing-stupendously.ngrok-free.dev`

The app auto-uses:
- **Text chat** → `richardyoung/smolvlm2-2.2b-instruct:latest`
- **Image analysis** → `gemma3:4b`

### Robot Connection (optional)
Enter your ROS/FastAPI robot's IP and port (default 8080).
When you say room names like **"kitchen"** or **"bedroom"**, SID sends a JSON
`POST /command` to your robot:
```json
{ "command": "navigate", "location": "kitchen", "timestamp": 1234567890 }
```

---

## 🎙️ Voice Commands

| You say...                        | What happens                                     |
|-----------------------------------|--------------------------------------------------|
| *Any question or statement*       | Sent to smolvlm2 LLM, response spoken aloud      |
| "What is this" / "Analyse this"   | Opens camera overlay → tap ANALYSE → gemma3:4b   |
| "Go to the kitchen"               | Navigates robot to kitchen                       |
| "Go to the bedroom"               | Navigates robot to bedroom                       |
| "Go to the hall / living room"    | Navigates robot to hall                          |
| "Go to the restroom / bathroom"   | Navigates robot to restroom                      |

---

## 🤖 System Flow (matching your architecture diagram)

```
Browser (Vercel/localhost)
  │
  ├─ STT (Web Speech API) ──→ processSpokenInput()
  │                                │
  │                    ┌───────────┴──────────┐
  │                    ↓                      ↓
  │              Text prompt            Vision trigger
  │                    ↓                      ↓
  │           POST /api/generate      Capture frame
  │           smolvlm2-2.2b           POST /api/generate
  │           (ngrok URL)             gemma3:4b
  │                    ↓                      ↓
  │              LLM response          Vision description
  │                    └───────────┬──────────┘
  │                                ↓
  ├─ TTS (Web Speech API) ←── speak(reply)
  │
  └─ POST http://RPI_IP:8080/command  (navigation commands)
```

---

## 🚀 Deploy to Vercel

```bash
npm run build
# Upload the dist/ folder to Vercel, or:
npx vercel --prod
```

> **Note:** Because ngrok and the robot use HTTP or self-signed certs,
> set your Vercel deployment to allow mixed content, or use a custom domain
> with HTTPS that matches your ngrok URL.

---

## 👁️ Features

- **Animated dual robot eyes** with blink, pupil tracking, and 16 mood states
- **BlazeFace** real-time face detection (eyes follow your face)
- **Always-on STT** via Web Speech API
- **Vision mode** — say "analyse this" → camera opens → tap ANALYSE → gemma3:4b describes it
- **Navigation commands** — spoken room names → JSON POST to your ROS robot
- **Eye colour picker** (10 colours) and manual mood overrides
- **Idle animations** when no face is detected
- **Fullscreen mode** for robot display

---

## 🔧 Ollama API Reference

The app calls your Ollama server at:

**Text:** `POST {LLM_URL}/api/generate`
```json
{
  "model": "richardyoung/smolvlm2-2.2b-instruct:latest",
  "prompt": "...(conversation history)...",
  "stream": false
}
```

**Vision:** `POST {LLM_URL}/api/generate`
```json
{
  "model": "gemma3:4b",
  "prompt": "Describe what you see in this image...",
  "images": ["BASE64_STRING"],
  "stream": false
}
```
