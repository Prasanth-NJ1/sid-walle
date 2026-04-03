// ═══════════════════════════════════════════════
//  llm.js — Ollama API (text + vision)
//  Text   : richardyoung/smolvlm2-2.2b-instruct
//  Vision : gemma3:4b
// ═══════════════════════════════════════════════
import { state } from './state.js';

const TEXT_MODEL   = 'richardyoung/smolvlm2-2.2b-instruct:latest';
const VISION_MODEL = 'gemma3:4b';

const SYSTEM =
  'You are SID, a robot. Reply in 1 sentence only. Never explain. Never elaborate. Be direct.';

export async function askLLM(userText) {
  if (!state.llmUrl) throw new Error('No LLM URL configured');

  // Append user turn
  state.conversationHistory.push({ role: 'user', content: userText });
  if (state.conversationHistory.length > 20) state.conversationHistory.splice(0, 2);

  // Build flat prompt from history
  let prompt = SYSTEM + '\n\n';
  for (const msg of state.conversationHistory) {
    prompt += msg.role === 'user' ? `Human: ${msg.content}\n` : `SID: ${msg.content}\n`;
  }
  prompt += 'SID:';

  const res = await fetch(`${state.llmUrl}/api/generate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      // Using a custom User-Agent bypasses the ngrok warning page 
      // without causing the CORS 'Access-Control-Allow-Headers' error.
      'User-Agent': 'RobotCompanion/1.0' 
    },
    body: JSON.stringify({ 
      model: TEXT_MODEL, 
      prompt: prompt, 
      stream: false 
    }),
    signal: AbortSignal.timeout(40000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const reply = (data.response || '').trim() || 'I had trouble forming a response.';

  state.conversationHistory.push({ role: 'assistant', content: reply });
  if (state.conversationHistory.length > 20) state.conversationHistory.splice(0, 2);

  return reply;
}

export async function askVision(base64Image, promptText) {
  if (!state.llmUrl) throw new Error('No LLM URL configured');

  const res = await fetch(`${state.llmUrl}/api/generate`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'RobotCompanion/1.0'
    },
    body: JSON.stringify({
      model:  VISION_MODEL,
      prompt: promptText || 'Describe what you see in this image in 2-3 sentences.',
      images: [base64Image],
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.response || '').trim() || 'I could not analyse that image.';
}