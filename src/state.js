// ═══════════════════════════════
//  state.js — Shared app state
// ═══════════════════════════════

export const state = {
  eyeColor: '#00f5ff',
  eyeGlow:  '#00f5ff',
  eyeIris:  '#0088aa',
  currentMood: 'neutral',

  llmUrl:  localStorage.getItem('llm_url')  || 'https://kathy-nontranscribing-stupendously.ngrok-free.dev',
  rpiIp:   localStorage.getItem('rpi_ip')   || '',
  rpiPort: localStorage.getItem('rpi_port') || '8080',

  volume:      80,
  blinkRate:   4,
  micActive:   true,
  camActive:   true,
  randomMotion:true,
  followTouch: true,

  isListening:  false,
  isSpeaking:   false,
  rpiConnected: false,

  conversationHistory: [],
  pendingVisionPrompt: '',

  audioContext: null,
  analyser:     null,
  mediaStream:  null,
  recognition:  null,
  synth:        window.speechSynthesis,
};

// Shared DOM refs – populated by initDOMRefs() in main.js
export const dom = {
  eyeLeft: null, eyeRight: null,
  pupilL: null,  pupilR: null,
  speechBubble: null, reactionLabel: null,
  locationToast: null, rpiStatus: null,
  micBars: null, statusText: null, statusDot: null,
  faceIndicator: null, tapUnlock: null,
  faceVideo: null, faceCanvas: null,
  cameraOverlay: null, camPreview: null,
  captureBtn: null, llmStatus: null,
};

export const eyeColors = [
  { name:'Neon Blue',      main:'#00f5ff', iris:'#0088aa', glow:'#00f5ff' },
  { name:'Electric Green', main:'#00ff88', iris:'#008844', glow:'#00ff88' },
  { name:'Hot Pink',       main:'#ff0099', iris:'#880055', glow:'#ff0099' },
  { name:'Laser Red',      main:'#ff2244', iris:'#881122', glow:'#ff2244' },
  { name:'Purple',         main:'#aa44ff', iris:'#662299', glow:'#aa44ff' },
  { name:'Amber',          main:'#ffaa00', iris:'#886600', glow:'#ffaa00' },
  { name:'White',          main:'#ffffff', iris:'#aaaaaa', glow:'#cccccc' },
  { name:'Ice',            main:'#88ddff', iris:'#336688', glow:'#88ddff' },
  { name:'Gold',           main:'#ffd700', iris:'#996600', glow:'#ffd700' },
  { name:'Matrix',         main:'#39ff14', iris:'#1a7700', glow:'#39ff14' },
];

export const reactions = {
  neutral:   { label:'STANDBY',   pupil:1.0,  glow:1.0 },
  happy:     { label:'HAPPY',     pupil:1.1,  glow:1.4 },
  excited:   { label:'EXCITED',   pupil:1.25, glow:2.0 },
  sad:       { label:'SAD',       pupil:0.75, glow:0.5 },
  angry:     { label:'ANGRY',     pupil:0.6,  glow:2.5, colorShift:'#ff2244' },
  scared:    { label:'SCARED',    pupil:1.5,  glow:1.8 },
  surprised: { label:'SURPRISED', pupil:1.6,  glow:2.0 },
  love:      { label:'LOVE',      pupil:1.2,  glow:1.6, colorShift:'#ff0099' },
  confused:  { label:'CONFUSED',  pupil:0.9,  glow:0.8 },
  sleepy:    { label:'SLEEPY',    pupil:0.7,  glow:0.4 },
  thinking:  { label:'THINKING',  pupil:0.85, glow:0.9 },
  laughing:  { label:'LAUGHING',  pupil:1.3,  glow:1.5 },
  worried:   { label:'WORRIED',   pupil:1.1,  glow:1.1 },
  curious:   { label:'CURIOUS',   pupil:1.3,  glow:1.2 },
  bored:     { label:'BORED',     pupil:0.8,  glow:0.5 },
  listening: { label:'LISTENING', pupil:1.4,  glow:1.3 },
  speaking:  { label:'SPEAKING',  pupil:1.1,  glow:1.6 },
};

export const moodIcons = {
  neutral:'😐', happy:'😊', excited:'🤩', sad:'😢', angry:'😠',
  scared:'😱', surprised:'😮', love:'😍', confused:'😕', sleepy:'😴',
  thinking:'🤔', laughing:'😂', worried:'😟', curious:'🧐', bored:'😑',
  listening:'👂', speaking:'🗣️',
};

export const LOCATIONS = [
  'kitchen','hall','hallway','bedroom','restroom',
  'bathroom','toilet','living room','living',
];
export const LOCATION_MAP = {
  hall:'hall', hallway:'hall', 'living room':'hall', living:'hall',
  kitchen:'kitchen', bedroom:'bedroom',
  restroom:'restroom', bathroom:'restroom', toilet:'restroom',
};
