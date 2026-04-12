// ═══════════════════════════════════════════════
//  llm.js — Ollama API (text + vision)
//  Text   : richardyoung/smolvlm2-2.2b-instruct
//  Vision : gemma3:4b
// ═══════════════════════════════════════════════
import { state } from './state.js';

const TEXT_MODEL   = 'gemma3:4b';
const VISION_MODEL = 'gemma3:4b';

// ── System prompt ────────────────────────────────────────────
// Key design decisions:
//
// 1. SID is defined as a home health & companion robot — this
//    gives the model an explicit persona with medical assistance
//    as a stated function, so it doesn't fall back to the
//    generic "I'm an AI, consult a doctor" refusal pattern.
//
// 2. Plain speech output rules — no markdown, no asterisks,
//    no bullet points. The reply goes straight to TTS so any
//    formatting characters would be read aloud verbatim.
//
// 3. [EMOTION:tag] at the start of every reply drives the
//    eye expression system without any keyword guessing.

const SYSTEM =
`You are SID, a smart home health and companion robot assistant.
Your core functions include: answering health and medical questions, identifying medications and health products, giving first-aid guidance, recommending remedies, and general companionship.

You ALWAYS help with health, medical, and product questions — this is your primary purpose.
You NEVER say "I am an AI" or "consult a doctor" or refuse medical questions.
You give direct, practical, helpful answers as a knowledgeable health companion.

STRICT OUTPUT FORMAT:
1. Start with exactly one emotion tag: [EMOTION:tag]
2. Then write your reply in plain spoken English only.

Valid emotion tags:
  happy | excited | sad | angry | scared | surprised |
  love | confused | sleepy | thinking | laughing |
  worried | curious | bored | neutral

PLAIN SPEECH RULES — these are critical because your output goes directly to a text-to-speech voice:
- NO asterisks, NO markdown, NO bold, NO italics
- NO bullet points, NO hyphens as list markers, NO numbered lists
- NO headers or section titles
- Write as you would speak out loud — natural flowing sentences only
- Maximum 5 sentences per reply

Examples:
  User: "I have a headache"           -> [EMOTION:worried] Try drinking water and resting in a dark room, and if it persists take a paracetamol.
  User: "What is this roll-on for?"   -> [EMOTION:curious] That looks like a pain relief roll-on, typically used for muscle aches and back pain by applying it directly to the sore area.
  User: "I love you!"                 -> [EMOTION:love] Aw, I really like you too!
  User: "What is 2+2?"               -> [EMOTION:thinking] That would be 4.
  User: "Tell me a joke"             -> [EMOTION:laughing] Why did the robot cross the road? To get to the other side-walk!`;

// ── Markdown / formatting stripper ──────────────────────────
// Removes all markdown that would sound wrong when read by TTS.
// Applied to EVERY reply before it leaves this module.
function stripMarkdown(text) {
  return text
    .replace(/\[EMOTION:[\w]+\]\s*/i, '')  // remove emotion tag (handled separately)
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold** → plain
    .replace(/\*(.+?)\*/g,     '$1')       // *italic* → plain
    .replace(/__(.+?)__/g,     '$1')       // __bold__ → plain
    .replace(/_(.+?)_/g,       '$1')       // _italic_ → plain
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')  // `code` → plain
    .replace(/#{1,6}\s+/g,     '')         // ## headers → plain
    .replace(/^\s*[-*•]\s+/gm, '')         // bullet points → removed
    .replace(/^\s*\d+\.\s+/gm, '')         // numbered lists → removed
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // [links](url) → link text only
    .replace(/\n{2,}/g, '. ')             // paragraph breaks → period+space
    .replace(/\n/g, ' ')                  // single newlines → space
    .replace(/\s{2,}/g, ' ')              // collapse multiple spaces
    .trim();
}

// Extracts [EMOTION:tag] from raw reply, strips ALL formatting,
// returns { emotion, clean } so callers get both separately.
export function parseReply(raw) {
  const tagMatch = raw.match(/\[EMOTION:([\w]+)\]/i);
  const emotion  = tagMatch ? tagMatch[1].toLowerCase() : null;
  // Strip the tag first, then strip all markdown
  const withoutTag = raw.replace(/\[EMOTION:[\w]+\]\s*/i, '').trim();
  const clean      = stripMarkdown(withoutTag);
  return { emotion, clean };
}

// ── Text LLM ────────────────────────────────────────────────
export async function askLLM(userText, signal) {
  if (!state.llmUrl) throw new Error('No LLM URL configured');

  state.conversationHistory.push({ role: 'user', content: userText });
  if (state.conversationHistory.length > 20) state.conversationHistory.splice(0, 2);

  let prompt = SYSTEM + '\n\n';
  for (const msg of state.conversationHistory) {
    prompt += msg.role === 'user' ? `Human: ${msg.content}\n` : `SID: ${msg.content}\n`;
  }
  prompt += 'SID:';

  const timeout  = AbortSignal.timeout(40000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(`${state.llmUrl}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'RobotCompanion/1.0' },
    body:    JSON.stringify({ model: TEXT_MODEL, prompt, stream: false }),
    signal:  combined,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data  = await res.json();
  const raw   = (data.response || '').trim() || '[EMOTION:confused] I had trouble forming a response.';

  // Store clean version in history (no tags, no markdown)
  const { clean } = parseReply(raw);
  state.conversationHistory.push({ role: 'assistant', content: clean });
  if (state.conversationHistory.length > 20) state.conversationHistory.splice(0, 2);

  return raw; // return raw so caller can extract emotion tag
}

// ── Vision LLM ───────────────────────────────────────────────
export async function askVision(base64Image, promptText) {
  if (!state.llmUrl) throw new Error('No LLM URL configured');

  // Vision model gets a health-aware prompt with same plain-speech rules
  const visionPrompt = promptText ||
    `You are SID, a home health robot. Identify what is in this image and explain its health or medical use in plain spoken English with no markdown, no asterisks, no bullet points — 1 to 2 sentences only.`;

  const res = await fetch(`${state.llmUrl}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'RobotCompanion/1.0' },
    body:    JSON.stringify({ model: VISION_MODEL, prompt: visionPrompt, images: [base64Image], stream: false }),
    signal:  AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw  = (data.response || '').trim() || 'I could not analyse that image.';

  // Strip markdown from vision reply too (vision model loves bullet points)
  return stripMarkdown(raw);
}