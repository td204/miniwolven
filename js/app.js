'use strict';

/* =========================================================================
 * Miniwolven — UI-laag. Alle spellogica zit in js/engine.js (Engine).
 * Dit bestand: schermen, opslag (localStorage), verteller-stem en timers.
 * ========================================================================= */

/* ---------- opslag ---------- */

const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} },
};

const KEYS = { game: 'mw_game', stats: 'mw_stats', groups: 'mw_groups', prefs: 'mw_prefs' };

/** Zichtbaar op het startscherm; gelijk houden met de cache-versie in sw.js. */
const APP_VERSION = 33;

/** Geluidseffecten (gehuil, piepjes) staan standaard uit; aan te zetten in ⚙️. */
function soundOn() {
  const prefs = Store.get(KEYS.prefs, {});
  return prefs.sound === true;
}
function setSound(on) {
  const prefs = Store.get(KEYS.prefs, {});
  prefs.sound = on;
  Store.set(KEYS.prefs, prefs);
}

/** Beschikbare avatars; de eerste rij mensjes zijn de standaardtoewijzing. */
const AVATARS = ['👨', '👩', '👦', '👧', '👴', '👵', '🐺', '🐱', '🐶', '🐰', '🦊', '🐻', '🦁', '🐸', '🦄', '🐷'];

const av = p => p.avatar || '🙂';

const CAUSE_TEXT = {
  wolf: 'gepakt door de weerwolf',
  gif: 'vergiftigd door de heks ☠️',
  jager: 'meegenomen door de jager 🏹',
  liefde: 'gestorven van liefdesverdriet 💔',
  drankje: 'het genees-drankje was verkeerd gebrouwen ☠️',
  stemming: 'door het dorp op de brandstapel gezet 🔥',
  correctie: 'aangepast door de spelleider ✏️',
};

function saveGame() { if (game) Store.set(KEYS.game, game); }
function clearGame() { game = null; Store.del(KEYS.game); }

function knownPlayers() {
  const stats = Store.get(KEYS.stats, {});
  return Object.values(stats).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}

function knownPlayer(name) {
  return Store.get(KEYS.stats, {})[String(name).trim().toLowerCase()] || null;
}

function rememberGroup(names) {
  const groups = Store.get(KEYS.groups, []);
  const key = names.map(n => n.toLowerCase()).sort().join('|');
  const filtered = groups.filter(gr => gr.names.map(n => n.toLowerCase()).sort().join('|') !== key);
  filtered.unshift({ names, at: Date.now() });
  Store.set(KEYS.groups, filtered.slice(0, 8));
}

function recordStats(g) {
  if (g.statsRecorded) return;
  g.statsRecorded = true;
  const stats = Store.get(KEYS.stats, {});
  const scores = Engine.scores(g);
  for (const p of g.players) {
    const k = p.name.toLowerCase();
    const s = stats[k] || { name: p.name, games: 0, wins: 0, wolfGames: 0, guessesRight: 0, guessesTotal: 0 };
    s.name = p.name;
    s.games++;
    const team = Engine.ROLES[p.role].team;
    const won = g.winner === 'geliefden'
      ? (g.lovers && g.lovers.includes(p.id))
      : team === g.winner;
    if (won) s.wins++;
    if (p.role === 'wolf') s.wolfGames++;
    const row = scores.find(r => r.id === p.id);
    if (row && !row.isWolf) { s.guessesRight += row.right; s.guessesTotal += row.total; }
    s.avatar = p.avatar;
    s.kleuter = !!p.kleuter;
    s.lastPlayed = Date.now();
    stats[k] = s;
  }
  Store.set(KEYS.stats, stats);
  saveGame();
}

/* ---------- verteller-stem & geluid ---------- */

function speak(text) {
  if (!game || !game.settings.voice) return;
  if (game.settings.spelleider) return; // de spelleider vertelt zelf
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL';
    u.rate = 0.95;
    const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('nl'));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch {}
}
if ('speechSynthesis' in window) speechSynthesis.getVoices(); // vroeg laden

let audioCtx = null;
function beep(freq = 660, dur = 0.15) {
  if (!soundOn()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(gain).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}

/** Paukenslag (boem!) voor de grote onthulling. */
function drumBoom(vol = 0.5) {
  if (!soundOn()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.5);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.8);
    const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.06), audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = audioCtx.createBufferSource(); n.buffer = buf;
    const nf = audioCtx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300;
    const ng = audioCtx.createGain(); ng.gain.value = vol * 0.5;
    n.connect(nf).connect(ng).connect(audioCtx.destination);
    n.start(t);
  } catch {}
}

/* ---------- openingsgeluid: wolvengehuil met wind (gesynthetiseerd) ---------- */

let howlPlayed = false;

function synthHowl(ctx) {
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  // Wind: ruis door een zwevend laagdoorlaatfilter
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf; noise.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass'; windFilter.frequency.value = 350; windFilter.Q.value = 0.8;
  const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.25;
  const windLfoGain = ctx.createGain(); windLfoGain.gain.value = 180;
  windLfo.connect(windLfoGain).connect(windFilter.frequency);
  const windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.0001, t0);
  windGain.gain.exponentialRampToValueAtTime(0.07, t0 + 1.2);
  windGain.gain.setValueAtTime(0.07, t0 + 5);
  windGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 7.5);
  noise.connect(windFilter).connect(windGain).connect(master);
  noise.start(t0); noise.stop(t0 + 7.6);
  windLfo.start(t0); windLfo.stop(t0 + 7.6);

  // Eén huil: a-hoooo-oeee. Zaagtand door formant-filters geeft een kelig,
  // dierlijk timbre (een kale toon met vibrato klinkt als een spookje).
  const howlOnce = (start, base, vol) => {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.5;
    const f1 = ctx.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 850; f1.Q.value = 1.6; f1.gain.value = 10;
    const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1300; f2.Q.value = 2; f2.gain.value = 6;
    const g = ctx.createGain();
    // toonverloop: kort omhoog, lang aanhouden terwijl hij langzaam zakt, wegsterven
    osc.frequency.setValueAtTime(base * 0.55, start);
    osc.frequency.exponentialRampToValueAtTime(base, start + 0.7);
    osc.frequency.linearRampToValueAtTime(base * 0.93, start + 2.4);
    osc.frequency.exponentialRampToValueAtTime(base * 0.5, start + 3.3);
    // héél licht wankelen, pas tijdens het aanhouden (geen spook-vibrato)
    const vib = ctx.createOscillator(); vib.frequency.value = 4.3;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, start);
    vibG.gain.setValueAtTime(0, start + 0.9);
    vibG.gain.linearRampToValueAtTime(base * 0.012, start + 1.3);
    vib.connect(vibG).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.45);
    g.gain.setValueAtTime(vol, start + 2.3);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 3.4);
    osc.connect(lp).connect(f1).connect(f2).connect(g).connect(master);
    osc.start(start); osc.stop(start + 3.5);
    vib.start(start); vib.stop(start + 3.5);
    // vleugje adem voor een ruw randje
    const bLen = Math.floor(ctx.sampleRate * 3.4);
    const bBuf = ctx.createBuffer(1, bLen, ctx.sampleRate);
    const bd = bBuf.getChannelData(0);
    for (let i = 0; i < bLen; i++) bd[i] = Math.random() * 2 - 1;
    const breath = ctx.createBufferSource(); breath.buffer = bBuf;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1100; bf.Q.value = 1.2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, start);
    bg.gain.exponentialRampToValueAtTime(vol * 0.12, start + 0.5);
    bg.gain.exponentialRampToValueAtTime(0.0001, start + 3.3);
    breath.connect(bf).connect(bg).connect(master);
    breath.start(start); breath.stop(start + 3.4);
  };
  howlOnce(t0 + 0.8, 400, 0.09);   // de wolf dichtbij
  howlOnce(t0 + 2.8, 310, 0.04);   // een tweede, verder weg
}

/** Echte wolvenhuil (audio/wolf-howl.mp3), bewust niet te hard en met nette
 *  fades. Laadt het bestand niet, dan valt hij terug op de synthese-huil. */
function playHowlFile(ctx) {
  const VOLUME = 0.28;
  fetch('audio/wolf-howl.mp3')
    .then(r => { if (!r.ok) throw new Error('geen audio'); return r.arrayBuffer(); })
    .then(buf => ctx.decodeAudioData(buf))
    .then(audio => {
      const src = ctx.createBufferSource();
      src.buffer = audio;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      const end = t + audio.duration;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(VOLUME, t + 0.4);
      g.gain.setValueAtTime(VOLUME, Math.max(t + 0.4, end - 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      src.connect(g).connect(ctx.destination);
      src.start(t);
    })
    .catch(() => synthHowl(ctx));
}

/** Speel het openingsgeluid één keer; browsers staan geluid soms pas na de
 *  eerste aanraking toe, dus we proberen het bij openen én bij de eerste tik. */
function tryHowl() {
  if (howlPlayed || !soundOn()) return;
  if (currentView !== 'home') return; // het gehuil hoort alleen bij het startscherm
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(() => {
      if (howlPlayed || audioCtx.state !== 'running') return;
      howlPlayed = true;
      playHowlFile(audioCtx);
    }).catch(() => {});
  } catch {}
}
window.addEventListener('pointerdown', tryHowl);

/* ---------- sfeergeluid per scène (zacht, gesynthetiseerd) ---------- */

const Ambient = {
  scene: null, gain: null, sources: [], timers: [],
  ensure() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch { return null; }
  },
  stop(fadeSec = 0.8) {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    if (this.gain && audioCtx) {
      const g = this.gain, srcs = this.sources, t = audioCtx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      } catch {}
      setTimeout(() => {
        srcs.forEach(s => { try { s.stop(); } catch {} });
        try { g.disconnect(); } catch {}
      }, fadeSec * 1000 + 100);
    }
    this.gain = null; this.sources = []; this.scene = null;
  },
  every(ms, fn) { this.timers.push(setInterval(fn, ms)); },
  set(scene) {
    // Naar stilte (geheim moment): snel uitfaden, anders verraadt de speaker
    // nog bijna een seconde lang waar de telefoon is.
    if (!soundOn() || !scene) { if (this.scene) this.stop(0.2); return; }
    if (scene === this.scene) return;
    this.stop();
    const ctx = this.ensure();
    if (!ctx) return;
    this.scene = scene;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    g.connect(ctx.destination);
    this.gain = g;
    (AMBIENT_SCENES[scene] || (() => {}))(ctx, g, this);
  },
};

/* bouwstenen */
function ambWind(ctx, out, amb, cut = 300, vol = 0.02) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.7;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18;
  const lfoG = ctx.createGain(); lfoG.gain.value = cut * 0.5;
  lfo.connect(lfoG).connect(f.frequency);
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(); lfo.start();
  amb.sources.push(src, lfo);
}
function ambDrone(ctx, out, amb, freq = 55, vol = 0.025) {
  const g = ctx.createGain(); g.gain.value = vol;
  const trem = ctx.createOscillator(); trem.frequency.value = 0.4;
  const tremG = ctx.createGain(); tremG.gain.value = vol * 0.4;
  trem.connect(tremG).connect(g.gain);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  for (const det of [0, 4]) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = freq; o.detune.value = det;
    o.connect(f); o.start(); amb.sources.push(o);
  }
  f.connect(g).connect(out);
  trem.start(); amb.sources.push(trem);
}
function ambCrickets(ctx, out, amb) {
  const chirp = () => {
    if (Math.random() < 0.35) return;
    const base = 4100 + Math.random() * 500, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.value = base;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    }
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.3);
  };
  amb.every(700, chirp);
}
function ambBirds(ctx, out, amb, kans = 0.4) {
  const tweet = () => {
    if (Math.random() > kans) return;
    let t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const f0 = 2100 + Math.random() * 900;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.3), t + 0.08);
      o.frequency.exponentialRampToValueAtTime(f0, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.015, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
      t += 0.18 + Math.random() * 0.12;
    }
  };
  amb.every(1600, tweet);
}
function ambHeartbeat(ctx, out, amb) {
  const thump = (t, vol) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(52, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
  };
  amb.every(1100, () => { const t = ctx.currentTime; thump(t, 0.05); thump(t + 0.22, 0.03); });
}
const AMBIENT_SCENES = {
  // alleen wind: doorlopende lage tonen klinken op een telefoonspeaker al
  // snel als een bromtoon in plaats van sfeer
  deal:  (ctx, g, amb) => { ambWind(ctx, g, amb, 320, 0.022); },
  night: (ctx, g, amb) => { ambWind(ctx, g, amb, 280, 0.02); ambCrickets(ctx, g, amb); },
  tense: (ctx, g, amb) => { ambWind(ctx, g, amb, 200, 0.012); ambDrone(ctx, g, amb); ambHeartbeat(ctx, g, amb); },
  dawn:  (ctx, g, amb) => { ambWind(ctx, g, amb, 400, 0.014); ambBirds(ctx, g, amb, 0.55); },
  day:   (ctx, g, amb) => { ambWind(ctx, g, amb, 500, 0.018); ambBirds(ctx, g, amb, 0.3); },
};

/**
 * App naar de achtergrond → al het geluid meteen hard uit en de audio-engine
 * slapen leggen. Zonder dit hervatten oscillators bij het heropenen midden in
 * hun golfvorm: dat hoor je als een kraakje.
 */
function audioSleep() {
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
  try {
    Ambient.timers.forEach(t => clearInterval(t));
    Ambient.timers = [];
    if (Ambient.gain && audioCtx) {
      Ambient.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      Ambient.gain.gain.value = 0;
    }
    Ambient.sources.forEach(s => { try { s.stop(); } catch {} });
    Ambient.sources = [];
    if (Ambient.gain) { try { Ambient.gain.disconnect(); } catch {} }
    Ambient.gain = null;
    Ambient.scene = null;
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
  } catch {}
}
function audioWake() {
  if (document.hidden) return;
  if (audioCtx) audioCtx.resume().catch(() => {});
  Ambient.set(ambientScene()); // sfeer komt vers en met fade-in terug
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audioSleep(); else audioWake();
});
// Extra vangnetten: sommige overgangen (andere app in split-screen, systeem-
// overlays, bevroren tabblad) melden zich niet altijd via visibilitychange.
window.addEventListener('pagehide', audioSleep);
window.addEventListener('blur', audioSleep);
window.addEventListener('focus', audioWake);
document.addEventListener('freeze', audioSleep);
// Waakhond: draait er nog geluid terwijl de app niet zichtbaar is? Direct uit.
setInterval(() => {
  if ((document.hidden || !document.hasFocus()) && audioCtx && audioCtx.state === 'running' && Ambient.scene) {
    audioSleep();
  }
}, 2000);

/* ---------- bewegingssensor: ligt de telefoon of is hij in de hand? ----------
 * Nooit leidend, alleen een extraatje. Drempels zijn bewust conservatief:
 * we handelen alleen als we het vrij zeker weten, anders doen we niets. */

const Motion = {
  started: false, active: false, last: null, jitter: 0, flat: false,
  listen() {
    window.addEventListener('devicemotion', e => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      if (this.last) {
        const d = Math.abs(a.x - this.last.x) + Math.abs(a.y - this.last.y) + Math.abs(a.z - this.last.z);
        this.jitter = this.jitter * 0.9 + d * 0.1; // lopend gemiddelde
      }
      this.last = { x: a.x, y: a.y, z: a.z };
      this.flat = Math.abs(Math.abs(a.z) - 9.8) < 1.6 && Math.abs(a.x) < 1.6 && Math.abs(a.y) < 1.6;
      this.active = true;
    }, { passive: true });
  },
  /** Vrij zeker: plat op tafel en muisstil. */
  isDown() { return this.active && this.flat && this.jitter < 0.25; },
};
function initMotion() {
  if (Motion.started) return;
  Motion.started = true;
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS vraagt expliciet toestemming; weigeren = feature gewoon uit
      DeviceMotionEvent.requestPermission()
        .then(state => { if (state === 'granted') Motion.listen(); })
        .catch(() => {});
    } else if ('DeviceMotionEvent' in window) {
      Motion.listen();
    }
  } catch {}
}
window.addEventListener('pointerdown', initMotion, { once: true });

/** Welke sfeer past bij het scherm dat nu zichtbaar is? */
function ambientScene() {
  if (!game || currentView !== 'game') return null;
  if (ui.shotResult || (game.hunterPending != null && ui.hunterActive)) return 'tense';
  if (game.phase === 'deal' || game.phase === 'dealDone') return 'deal';
  if (game.phase === 'night') {
    const step = Engine.nightStep(game);
    if (step === 'wake') return ui.stepStage === 'count' ? 'tense' : 'dawn';
    if (step === 'ziener' || step === 'wolf' || step === 'heks' || step === 'cupido') {
      // Zodra de rol op 'ik ben wakker' drukt en de telefoon vastheeft, moet
      // het STIL zijn: geluid uit de speaker verraadt waar de telefoon is.
      // Dat geldt ook voor de stille teruglegfase van de rustpauze.
      if (ui.stepStage === 'rest') return ui.restSpoken ? 'night' : null;
      const secretStage = ui.stepStage && ui.stepStage !== 'wake';
      if (secretStage) return null;
      return step === 'wolf' ? 'tense' : 'night';
    }
    return 'night';
  }
  if (game.phase === 'day') return 'day';
  if (game.phase === 'end') return ui.endStage === 'reveal' ? 'dawn' : 'tense';
  return null;
}

// Snel muten kan altijd: 🔊/🔇 staat op elk spelscherm bovenin.
document.addEventListener('click', e => {
  const b = e.target && e.target.closest ? e.target.closest('#soundBtn') : null;
  if (!b) return;
  setSound(!soundOn());
  b.textContent = soundOn() ? '🔊' : '🔇';
  Ambient.set(soundOn() ? ambientScene() : null);
});

/* ---------- hulpjes ---------- */

const app = () => document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let activeTimers = [];
let restoreScrollY = null; // in-place herteken? dan scrollpositie behouden
function after(ms, fn) { activeTimers.push(setTimeout(fn, ms)); }
function every(ms, fn) { activeTimers.push(setInterval(fn, ms)); }
function clearTimers() { activeTimers.forEach(t => { clearTimeout(t); clearInterval(t); }); activeTimers = []; }

function screen(html, cls = '') {
  clearTimers();
  // Lopende spraak direct afkappen: een herinnering die nét gestart is mag
  // niet doorpraten nadat iemand de telefoon al heeft opgepakt.
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
  app().className = cls;
  app().innerHTML = html;
  window.scrollTo(0, 0);
  if (restoreScrollY != null) { window.scrollTo(0, restoreScrollY); restoreScrollY = null; }
  Ambient.set(ambientScene());
}

function roleCardHTML(p, g) {
  const r = Engine.ROLES[p.role];
  let extra = '';
  if (p.role === 'wolf') {
    const mates = Engine.fellowWolves(g, p.id);
    if (mates.length) extra += `<p class="card-extra">🐺 Je mede-wolf: <b>${mates.map(m => `${av(m)} ${esc(m.name)}`).join(' en ')}</b>. Jullie jagen samen.</p>`;
  }
  if (p.role === 'heks' && g.players.length <= 4) {
    extra += `<p class="card-extra">🧪 Kleine groep: je hebt twéé genees-drankjes en géén gif. Jezelf redden mag alleen met je allereerste drankje.</p>`;
  }
  if (p.hint) extra += `<p class="card-hint">🤫 ${esc(p.hint)}</p>`;
  // Kleuter-modus: extra groot plaatje, geen leestekst — het beeld ís de rol.
  if (p.kleuter) {
    return `
      <div class="rolecard rolecard-kleuter team-${r.team}">
        <div class="rolecard-emoji xl">${r.emoji}</div>
        <div class="rolecard-name">${r.naam}</div>
        <p class="rolecard-kort">${r.kort}</p>
        ${extra}
      </div>`;
  }
  return `
    <div class="rolecard team-${r.team}">
      <div class="rolecard-emoji">${r.emoji}</div>
      <div class="rolecard-name">${r.naam}</div>
      <p class="rolecard-kort">${r.kort}</p>
      <p class="rolecard-uitleg">${r.uitleg}</p>
      ${extra}
    </div>`;
}

/** Kaart die alleen zichtbaar is zolang je hem ingedrukt houdt. */
function bindHoldReveal(holdEl, cardEl, onFirstReveal) {
  let revealed = false;
  const show = e => {
    e.preventDefault();
    cardEl.classList.add('revealed');
    holdEl.classList.add('holding');
    if (!revealed) { revealed = true; onFirstReveal && onFirstReveal(); }
  };
  const hide = () => { cardEl.classList.remove('revealed'); holdEl.classList.remove('holding'); };
  holdEl.addEventListener('pointerdown', show);
  holdEl.addEventListener('pointerup', hide);
  holdEl.addEventListener('pointercancel', hide);
  holdEl.addEventListener('pointerleave', hide);
  holdEl.addEventListener('contextmenu', e => e.preventDefault());
  // Blokkeer het native long-press-gebaar (Android trilt anders bij vasthouden).
  holdEl.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
}

function playerButtons(players) {
  // Grote aanwijs-tegels met avatar: ook een kleuter die nog niet kan lezen
  // herkent zo wie hij aanwijst.
  return `<div class="player-grid">${players.map(p => `
    <button class="player-pick ${p.alive === false ? 'pp-dead' : ''}" data-id="${p.id}">
      <span class="pp-avatar">${av(p)}</span>
      <span class="pp-name">${esc(p.name)}${p.alive === false ? ' 💀' : ''}</span>
    </button>`).join('')}</div>`;
}
function bindPlayerButtons(onPick) {
  $$('.player-pick').forEach(b => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
}

/** Eigen bevestigingsdialoog in de stijl van de app (geen systeem-popup). */
function confirmDialog(message, opts = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay center';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-emoji">${opts.emoji || '🤔'}</div>
        <p class="dialog-text">${message}</p>
        <div class="row">
          <button class="btn half" id="dlgCancel">${opts.cancel || 'Nee'}</button>
          <button class="btn half ${opts.danger ? 'danger-solid' : 'primary'}" id="dlgOk">${opts.ok || 'Ja'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const done = v => { overlay.remove(); resolve(v); };
    overlay.querySelector('#dlgOk').addEventListener('click', () => done(true));
    overlay.querySelector('#dlgCancel').addEventListener('click', () => done(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}

function header(title, showMenu) {
  const soundBtn = game ? `<button class="topbar-menu" id="soundBtn" aria-label="Geluid">${soundOn() ? '🔊' : '🔇'}</button>` : '';
  return `
    <header class="topbar">
      <span class="topbar-title">${title}</span>
      <span class="topbar-right">
        ${soundBtn}
        ${showMenu ? '<button class="topbar-menu" id="menuBtn" aria-label="Menu">⋮</button>' : ''}
      </span>
    </header>`;
}
function bindMenu() {
  const b = $('#menuBtn');
  if (b) b.addEventListener('click', showMenu);
}

/* ---------- globale status ---------- */

let game = Store.get(KEYS.game, null);
// migratie: oudere opgeslagen spellen hadden nog healUsed/poisonUsed-vlaggen
if (game && game.witch && game.witch.healsLeft === undefined) {
  game.witch = {
    healsTotal: 1, healsLeft: game.witch.healUsed ? 0 : 1,
    poisonsTotal: 1, poisonsLeft: game.witch.poisonUsed ? 0 : 1,
    selfHealUsed: false,
  };
}
let setup = null;   // tijdelijke setup-status (namen, rollen, opties)
let ui = {};        // vluchtige schermstatus (niet opgeslagen)
let currentView = 'home'; // voor de terugknop: waar zijn we, en waar kan 'terug' heen?

/* =========================================================================
 * SCHERMEN
 * ========================================================================= */

/* ---------- home ---------- */

function renderHome() {
  ui = {};
  currentView = 'home';
  const groups = Store.get(KEYS.groups, []);
  const hasGame = game && game.phase !== 'end';
  screen(`
    <div class="hero">
      <div class="hero-moon">🌕</div>
      <h1 class="hero-title">Mini<span>wolven</span></h1>
      <p class="hero-sub">Weerwolven voor thuis — ook met 3 of 4 spelers</p>
    </div>
    <div class="stack">
      ${hasGame ? `
        <button class="btn primary big" id="resumeBtn">▶️ Hervat spel <small>ronde ${game.round || 1} · ${game.players.map(p => `${av(p)} ${esc(p.name)}`).join(', ')}</small></button>
        <button class="btn subtle" id="discardBtn">🗑️ Lopend spel weggooien</button>` : ''}
      <button class="btn primary big" id="newBtn">🌕 Nieuw spel</button>
      ${groups.length ? `
        <div class="section-label">Verder in een vorige samenstelling</div>
        ${groups.slice(0, 4).map((gr, i) =>
          `<button class="btn group-pick" data-i="${i}">👨‍👩‍👧‍👦 ${gr.names.map(esc).join(', ')} <small>${gr.names.length} spelers</small></button>`).join('')}` : ''}
      <div class="row">
        <button class="btn half" id="statsBtn">📊 Statistieken</button>
        <button class="btn half" id="rulesBtn">📖 Spelregels</button>
      </div>
      <button class="btn" id="settingsBtn">⚙️ Instellingen</button>
    </div>
    <p class="footer-note">Tip: installeer Miniwolven via ‘Zet op beginscherm’ in je browser.<br>Miniwolven v${APP_VERSION}</p>
  `);
  if (hasGame) {
    $('#resumeBtn').addEventListener('click', () => render());
    $('#discardBtn').addEventListener('click', () => {
      confirmDialog('Weet je zeker dat je het lopende spel weggooit?',
        { emoji: '🗑️', ok: 'Weggooien', cancel: 'Toch niet', danger: true })
        .then(ok => { if (ok) { clearGame(); renderHome(); } });
    });
  }
  $('#newBtn').addEventListener('click', () => startSetup());
  $$('.group-pick').forEach(b => b.addEventListener('click', () => {
    startSetup(groups[Number(b.dataset.i)].names);
  }));
  $('#statsBtn').addEventListener('click', renderStats);
  $('#rulesBtn').addEventListener('click', () => renderRules(renderHome));
  $('#settingsBtn').addEventListener('click', renderSettings);
}

/* ---------- instellingen ---------- */

function renderSettings() {
  currentView = 'settings';
  const players = knownPlayers();
  screen(`
    ${header('Instellingen ⚙️')}
    <div class="stack">
      <label class="opt"><input type="checkbox" id="optSound" ${soundOn() ? 'checked' : ''}>
        🔊 Geluidseffecten <small>· wolvengehuil bij het openen en piepjes bij het aftellen</small></label>
      <p class="muted">De verteller-stem staat hier los van: die zet je per spel aan of uit bij de opties.</p>

      <div class="section-label">Opgeslagen gegevens</div>
      <button class="btn" id="wipeStats">🗑️ Statistieken op nul zetten
        <small>scores worden 0, spelers en avatars blijven bestaan</small></button>
      <button class="btn danger-btn" id="wipePlayers">🧹 Alle oude spelers wissen
        <small>verwijdert alle bekende spelers, groepen en statistieken</small></button>
      <div id="wipeDone" class="error" style="color:var(--ok)"></div>

      <p class="muted center">Miniwolven v${APP_VERSION} · ${players.length} bekende ${players.length === 1 ? 'speler' : 'spelers'}</p>
      <button class="btn primary" id="back">← Terug</button>
    </div>
  `);
  $('#optSound').addEventListener('change', e => setSound(e.target.checked));
  $('#wipeStats').addEventListener('click', () => {
    confirmDialog('Alle statistieken op nul zetten? Spelers en avatars blijven bestaan.',
      { emoji: '🗑️', ok: 'Op nul zetten', cancel: 'Toch niet' })
      .then(ok => {
        if (!ok) return;
        const stats = Store.get(KEYS.stats, {});
        for (const s of Object.values(stats)) {
          s.games = 0; s.wins = 0; s.wolfGames = 0; s.guessesRight = 0; s.guessesTotal = 0;
        }
        Store.set(KEYS.stats, stats);
        $('#wipeDone').textContent = '✅ Statistieken staan weer op nul.';
      });
  });
  $('#wipePlayers').addEventListener('click', () => {
    confirmDialog('Alle bekende spelers, groepen en statistieken definitief wissen?',
      { emoji: '🧹', ok: 'Alles wissen', cancel: 'Toch niet', danger: true })
      .then(ok => {
        if (!ok) return;
        Store.del(KEYS.stats);
        Store.del(KEYS.groups);
        renderSettings();
      });
  });
  $('#back').addEventListener('click', renderHome);
}

/* ---------- setup: spelers ---------- */

function startSetup(names) {
  const prefs = Store.get(KEYS.prefs, {});
  setup = {
    names: names ? names.slice() : ['', '', '', ''],
    avatars: [], kleuters: [],
    settings: Object.assign({
      deathMode: 'app', voice: true, hint: false, guessing: true,
      dayTimerSec: 180,
    }, prefs.settings || {}),
    wolves: null, specials: null, // null = automatisch
  };
  setup.names.forEach((nm, i) => {
    const known = nm ? knownPlayer(nm) : null;
    setup.avatars[i] = (known && known.avatar) || AVATARS[i % AVATARS.length];
    setup.kleuters[i] = !!(known && known.kleuter);
  });
  renderSetupPlayers();
}

function renderSetupPlayers() {
  if (currentView === 'players') restoreScrollY = window.scrollY;
  currentView = 'players';
  const known = knownPlayers();
  const n = setup.names.length;
  screen(`
    ${header('Wie spelen er mee?')}
    <div class="stack">
      <div class="counter">
        <button class="btn round" id="minus">−</button>
        <div class="counter-num">${n}<small>spelers</small></div>
        <button class="btn round" id="plus">+</button>
      </div>
      <div id="nameInputs" class="stack tight">
        ${setup.names.map((nm, i) => `
          <div class="player-row">
            <button class="avatar-btn" data-i="${i}" aria-label="Kies avatar">${setup.avatars[i]}</button>
            <input class="input name-input" data-i="${i}" value="${esc(nm)}"
                   placeholder="Naam speler ${i + 1}" autocomplete="off" enterkeyhint="next">
            <button class="kleuter-btn ${setup.kleuters[i] ? 'on' : ''}" data-i="${i}" aria-label="Kleuter-modus">🧒</button>
            <button class="clear-btn" data-i="${i}" aria-label="Regel leegmaken">🗑️</button>
          </div>`).join('')}
      </div>
      <p class="muted">Tik het plaatje voor een andere avatar. Zet 🧒 aan voor een kleuter
      die nog niet kan lezen: die krijgt extra grote plaatjes in plaats van tekst.</p>
      ${known.length ? `
        <div class="section-label">Bekende spelers — tik om in te vullen</div>
        <div class="chips">${known.slice(0, 12).map(s => `<button class="chip" data-name="${esc(s.name)}">${s.avatar || ''} ${esc(s.name)}</button>`).join('')}</div>` : ''}
      <div id="setupError" class="error"></div>
      <button class="btn primary big" id="next">Verder → rollen kiezen</button>
      <button class="btn subtle" id="back">← Terug</button>
    </div>
  `);
  const readNames = () => { $$('.name-input').forEach(inp => setup.names[Number(inp.dataset.i)] = inp.value); };
  $('#minus').addEventListener('click', () => {
    readNames();
    if (setup.names.length > 3) { setup.names.pop(); setup.avatars.pop(); setup.kleuters.pop(); renderSetupPlayers(); }
  });
  $('#plus').addEventListener('click', () => {
    readNames();
    if (setup.names.length < 12) {
      const used = new Set(setup.avatars);
      setup.avatars.push(AVATARS.find(a => !used.has(a)) || AVATARS[setup.names.length % AVATARS.length]);
      setup.kleuters.push(false);
      setup.names.push('');
      renderSetupPlayers();
    }
  });
  $$('.avatar-btn').forEach(b => b.addEventListener('click', () => {
    readNames();
    showAvatarPicker(Number(b.dataset.i));
  }));
  $$('.kleuter-btn').forEach(b => b.addEventListener('click', () => {
    readNames();
    const i = Number(b.dataset.i);
    setup.kleuters[i] = !setup.kleuters[i];
    renderSetupPlayers();
  }));
  // Prullenbakje: maakt alléén deze regel leeg (de speler blijft gewoon
  // bewaard in het geheugen en de chips), zodat je iemand kunt wisselen.
  $$('.clear-btn').forEach(b => b.addEventListener('click', () => {
    readNames();
    const i = Number(b.dataset.i);
    setup.names[i] = '';
    setup.kleuters[i] = false;
    renderSetupPlayers();
  }));
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    readNames();
    const name = c.dataset.name;
    if (setup.names.some(x => x.trim().toLowerCase() === name.toLowerCase())) return;
    const empty = setup.names.findIndex(x => !x.trim());
    if (empty < 0) return;
    setup.names[empty] = name;
    const s = knownPlayer(name);
    if (s) { if (s.avatar) setup.avatars[empty] = s.avatar; setup.kleuters[empty] = !!s.kleuter; }
    renderSetupPlayers();
  }));
  $('#next').addEventListener('click', () => {
    readNames();
    const names = setup.names.map(x => x.trim());
    if (names.some(x => !x)) return void ($('#setupError').textContent = 'Vul alle namen in (of haal een speler weg met −).');
    const lower = names.map(x => x.toLowerCase());
    if (new Set(lower).size !== lower.length) return void ($('#setupError').textContent = 'Elke speler heeft een eigen naam nodig.');
    setup.names = names;
    renderSetupRoles();
  });
  $('#back').addEventListener('click', renderHome);
}

function showAvatarPicker(i) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <div class="section-label">Kies een avatar voor ${esc(setup.names[i] || `speler ${i + 1}`)}</div>
      <div class="avatar-grid">
        ${AVATARS.map(a => `<button class="avatar-opt ${setup.avatars[i] === a ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}
      </div>
      <button class="btn subtle" id="avClose">Sluiten</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#avClose').addEventListener('click', close);
  overlay.querySelectorAll('.avatar-opt').forEach(b => b.addEventListener('click', () => {
    setup.avatars[i] = b.dataset.a;
    close();
    renderSetupPlayers();
  }));
}

/* ---------- setup: rollen & opties ---------- */

function renderSetupRoles() {
  if (currentView === 'roles') restoreScrollY = window.scrollY;
  currentView = 'roles';
  const n = setup.names.length;
  const auto = Engine.autoComposition(n);
  if (setup.wolves == null) setup.wolves = auto.wolves;
  if (setup.specials == null) setup.specials = auto.specials.slice();

  const burgers = n - setup.wolves - setup.specials.length;
  const err = Engine.validateComposition(n, setup.wolves, setup.specials);
  const s = setup.settings;

  const specialToggle = id => {
    const r = Engine.ROLES[id];
    const on = setup.specials.includes(id);
    return `
      <button class="toggle ${on ? 'on' : ''}" data-role="${id}">
        <span class="toggle-emoji">${r.emoji}</span>
        <span class="toggle-body"><b>${r.naam}</b><small>${r.kort}</small></span>
        <span class="toggle-state">${on ? '✔' : ''}</span>
      </button>`;
  };

  screen(`
    ${header('Rollen & opties')}
    <div class="stack">
      <div class="section-label">Samenstelling voor ${n} spelers</div>
      <div class="counter">
        <button class="btn round" id="wolfMinus">−</button>
        <div class="counter-num">${setup.wolves} 🐺<small>${setup.wolves === 1 ? 'weerwolf' : 'weerwolven'}</small></div>
        <button class="btn round" id="wolfPlus">+</button>
      </div>
      ${['ziener', 'heks', 'meisje', 'jager', 'cupido', 'dorpsgek'].map(specialToggle).join('')}
      <div class="pill">${burgers >= 0 ? `+ ${burgers} 🧑‍🌾 ${burgers === 1 ? 'burger' : 'burgers'}` : ''}</div>
      <button class="btn subtle" id="autoBtn">✨ Aanbevolen samenstelling</button>
      ${n >= 9 && ['ziener', 'heks', 'meisje'].every(r => setup.specials.includes(r)) && setup.wolves < 3
        ? `<p class="callout">💡 Met ziener, heks én glurend meisje samen zijn <b>3 weerwolven</b> aan te raden bij ${n} spelers — anders schakelen die drie de wolven te snel uit.</p>` : ''}
      ${setup.specials.includes('dorpsgek') && !s.dayVote
        ? `<p class="callout">🤪 De dorpsgek doet pas iets als de <b>dagstemming</b> aanstaat (zie opties hieronder).</p>` : ''}
      <div class="error">${err ? esc(err) : ''}</div>

      <div class="section-label">Wie leidt het spel?</div>
      <div class="seg">
        <button class="seg-opt ${!s.spelleider ? 'on' : ''}" data-lead="app">📱 De app<small>de telefoon gaat rond, de app vertelt</small></button>
        <button class="seg-opt ${s.spelleider ? 'on' : ''}" data-lead="leider">🎩 Een spelleider<small>één verteller speelt niet mee en bedient de app</small></button>
      </div>

      <div class="section-label">Hoe wordt het slachtoffer bekend?</div>
      <div class="seg">
        <button class="seg-opt ${s.deathMode === 'app' ? 'on' : ''}" data-mode="app">📱 App onthult<small>de app telt af en zegt wie dood is</small></button>
        <button class="seg-opt ${s.deathMode === 'fysiek' ? 'on' : ''}" data-mode="fysiek">👆 Fysiek aantikken<small>de wolf tikt ’s nachts iemand aan</small></button>
      </div>

      <div class="section-label">Opties</div>
      ${s.spelleider
        ? `<div class="pill">🗣️ Verteller-stem staat uit — de spelleider vertelt zelf</div>`
        : `<label class="opt"><input type="checkbox" id="optVoice" ${s.voice ? 'checked' : ''}> 🗣️ Verteller-stem (de app praat)</label>`}
      <label class="opt"><input type="checkbox" id="optGuess" ${s.guessing ? 'checked' : ''}> 🕵️ Gok-ronde in de app (houdt scores bij)</label>
      <label class="opt"><input type="checkbox" id="optVote" ${s.dayVote ? 'checked' : ''}> 🔥 Dagstemming: brandstapel <small>· aanrader bij grote groepen; staken = niemand</small></label>
      <label class="opt"><input type="checkbox" id="optMishap" ${s.witchMishap ? 'checked' : ''}> ⚗️ Onvoorspelbare heks <small>· genees-drankje kan mislukken</small></label>
      ${setup.kleuters.some(Boolean)
        ? `<label class="opt disabled"><input type="checkbox" disabled> 🤫 Geheime hint <small>· uit: er speelt een kleuter mee, die kan de hint niet lezen</small></label>`
        : `<label class="opt"><input type="checkbox" id="optHint" ${s.hint ? 'checked' : ''}> 🤫 Variatie: één speler krijgt een geheime hint</label>`}
      <label class="opt">☀️ Overleg-timer overdag
        <select id="optDayTimer" class="select">
          ${[0, 120, 180, 300].map(v => `<option value="${v}" ${s.dayTimerSec === v ? 'selected' : ''}>${v === 0 ? 'uit' : (v / 60) + ' min'}</option>`).join('')}
        </select></label>

      <button class="btn primary big" id="deal" ${err ? 'disabled' : ''}>🃏 Deel de kaarten</button>
      <button class="btn subtle" id="back">← Terug naar spelers</button>
    </div>
  `);
  $('#wolfMinus').addEventListener('click', () => { if (setup.wolves > 1) { setup.wolves--; renderSetupRoles(); } });
  $('#wolfPlus').addEventListener('click', () => { setup.wolves++; renderSetupRoles(); });
  $$('.toggle').forEach(t => t.addEventListener('click', () => {
    const id = t.dataset.role;
    const i = setup.specials.indexOf(id);
    if (i >= 0) setup.specials.splice(i, 1); else setup.specials.push(id);
    renderSetupRoles();
  }));
  $('#autoBtn').addEventListener('click', () => { setup.wolves = null; setup.specials = null; renderSetupRoles(); });
  $$('.seg-opt').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode) s.deathMode = b.dataset.mode;
    if (b.dataset.lead) s.spelleider = b.dataset.lead === 'leider';
    renderSetupRoles();
  }));
  const optVoice = $('#optVoice');
  if (optVoice) optVoice.addEventListener('change', e => s.voice = e.target.checked);
  $('#optGuess').addEventListener('change', e => s.guessing = e.target.checked);
  $('#optVote').addEventListener('change', e => { s.dayVote = e.target.checked; renderSetupRoles(); });
  $('#optMishap').addEventListener('change', e => s.witchMishap = e.target.checked);
  const optHint = $('#optHint');
  if (optHint) optHint.addEventListener('change', e => s.hint = e.target.checked);
  $('#optDayTimer').addEventListener('change', e => s.dayTimerSec = Number(e.target.value));
  $('#deal').addEventListener('click', () => {
    if (setup.kleuters.some(Boolean)) s.hint = false;
    Store.set(KEYS.prefs, Object.assign(Store.get(KEYS.prefs, {}), { settings: s }));
    rememberGroup(setup.names);
    game = Engine.newGame({
      names: setup.names, avatars: setup.avatars, kleuters: setup.kleuters,
      wolves: setup.wolves, specials: setup.specials,
      settings: s, startedAt: Date.now(),
    });
    saveGame();
    ui = {};
    render();
  });
  $('#back').addEventListener('click', renderSetupPlayers);
}

/* ---------- kaarten delen ---------- */

function renderDeal() {
  const p = Engine.currentDealPlayer(game);
  if (!ui.dealStage) ui.dealStage = 'pass';

  if (ui.dealStage === 'pass') {
    screen(`
      ${header(`Kaarten delen · ${game.deal.index + 1}/${game.players.length}`)}
      <div class="center-stage">
        <div class="big-emoji">${av(p)}</div>
        <h2>Geef de telefoon aan<br><span class="accent">${av(p)} ${esc(p.name)}</span></h2>
        <p class="muted">Niemand anders mag meekijken.</p>
        <button class="btn primary big" id="me">Ik ben ${av(p)} ${esc(p.name)} ✋</button>
      </div>
    `);
    speak(`Geef de telefoon aan ${p.name}.`);
    $('#me').addEventListener('click', () => { ui.dealStage = 'card'; ui.seen = false; render(); });
    return;
  }

  // kaart-scherm: alleen zichtbaar zolang je ingedrukt houdt
  screen(`
    ${header(`Jouw kaart, ${esc(p.name)}`)}
    <div class="center-stage">
      <div class="cardwrap">
        <div class="cardback" id="hold">
          <div class="cardback-inner">🃏<br><b>Houd ingedrukt</b><br><small>om je kaart te zien</small></div>
        </div>
        <div class="cardfront" id="card">${roleCardHTML(p, game)}</div>
      </div>
      <p class="muted">Laat los en je kaart is weer verborgen.</p>
      <button class="btn primary big" id="done" style="visibility:hidden">
        ✅ Gezien — doorgeven</button>
    </div>
  `);
  bindHoldReveal($('#hold'), $('#card'), () => { ui.seen = true; $('#done').style.visibility = 'visible'; });
  $('#done').addEventListener('click', () => {
    if (!ui.seen) return;
    Engine.confirmCardSeen(game);
    saveGame();
    ui.dealStage = 'pass';
    render();
  });
}

function renderDealDone() {
  const meisje = game.players.find(p => p.role === 'meisje');
  screen(`
    ${header('Alle kaarten gedeeld', true)}
    <div class="center-stage">
      <div class="big-emoji">🤐</div>
      <h2>Iedereen kent zijn rol</h2>
      <p class="muted">Kaarten kunnen niet meer teruggekeken worden.<br>
      Echt vergeten? De noodknop zit in het menu (⋮) — maar dat wordt genoteerd 😉.</p>
      <p class="muted">Praat gerust even: wie kijkt er verdacht? Wie lacht er zo raar?</p>
      <button class="btn primary big" id="night">🌙 Start nacht 1</button>
    </div>
  `);
  bindMenu();
  $('#night').addEventListener('click', () => {
    Engine.startNight(game); saveGame(); ui = {}; render();
  });
}

/* ---------- nacht ---------- */

/**
 * Blijf een nacht-aankondiging herhalen (elke ~7 sec, steeds aandringender)
 * tot de speler op de knop drukt — voor als iemand het door rumoer niet hoort.
 * De herhaling stopt vanzelf: elke schermwissel ruimt de timers op.
 */
function speakNagging(first, variants) {
  speak(first);
  let i = 0;
  every(7000, () => { speak(variants[i % variants.length]); i++; });
}

function renderNight() {
  if (ui.stepStage === 'rest') return renderNightRest();
  // Het draaiboek is een momentopname van bij het startsein van de nacht;
  // een rol kan intussen gestorven zijn (bijv. via een spelleider-correctie).
  // Sla stappen van dode rollen alsnog over.
  const actorAlive = {
    cupido: () => game.players.some(p => p.alive && p.role === 'cupido'),
    ziener: () => game.players.some(p => p.alive && p.role === 'ziener'),
    heks: () => game.players.some(p => p.alive && p.role === 'heks'),
    wolf: () => Engine.aliveWolves(game).length > 0,
  };
  let step = Engine.nightStep(game);
  while (actorAlive[step] && !actorAlive[step]()) {
    Engine.nextNightStep(game); saveGame();
    ui.stepStage = null;
    step = Engine.nightStep(game);
  }
  if (step === 'sleep') return renderNightSleep();
  if (step === 'cupido') return renderNightCupido();
  if (step === 'ziener') return renderNightZiener();
  if (step === 'wolf') return renderNightWolf();
  if (step === 'heks') return renderNightHeks();
  if (step === 'wake') return renderNightWake();
}

/** Herhaal-oproep; met spelleider volstaat één aankondiging (die port de rol zelf). */
function nag(first, variants) {
  if (game.settings.spelleider) { speak(first); return; }
  speakNagging(first, variants);
}

function nightNext() {
  Engine.nextNightStep(game); saveGame();
  ui.stepStage = null; render();
}

/**
 * Stille overgang: de rol die net klaar is legt de telefoon terug en doet de
 * ogen dicht; de app wacht een paar tellen in stilte voordat de volgende rol
 * wordt aangekondigd — anders verraadt de aankondiging wie er net bezig was.
 */
function startRest(label) {
  // Met een spelleider gaat de telefoon niet rond: geen teruglegpauze nodig.
  if (game.settings.spelleider) { nightNext(); return; }
  ui.stepStage = 'rest';
  ui.restLabel = label;
  ui.restSpoken = false; // nachtsfeer pas aan als de stille teruglegfase voorbij is
  render();
}

function renderNightRest() {
  // Twee fasen: eerst ZWIJGEND 'leg de telefoon terug' (de speler heeft hem
  // nog vast — spraak zou verraden waar de telefoon is), en pas als hij
  // terug in het midden ligt spreekt de app de rol toe.
  const SILENT_SECONDS = 5;
  const SPOKEN_SECONDS = 4;
  let downStreak = 0; // aantal seconden dat de telefoon aantoonbaar terugligt
  screen(`
    <div class="center-stage night">
      <div class="big-emoji" id="restEmoji">📵</div>
      <h2 id="restTitle">Leg de telefoon terug</h2>
      <p class="muted" id="restText">Stil neerleggen in het midden van de tafel…</p>
      <div class="rest-count" id="restCount">${SILENT_SECONDS + SPOKEN_SECONDS}</div>
      <button class="btn subtle" id="skip">verder ›</button>
    </div>
  `, 'theme-night');
  let left = SILENT_SECONDS + SPOKEN_SECONDS;
  every(1000, () => {
    left--;
    // Ligt de telefoon volgens de bewegingssensor al twee tellen zeker plat
    // en stil? Dan hoeft de stille fase niet langer te duren.
    if (left > SPOKEN_SECONDS + 1) {
      downStreak = Motion.isDown() ? downStreak + 1 : 0;
      if (downStreak >= 2) left = SPOKEN_SECONDS + 1;
    }
    const el = $('#restCount');
    if (el) el.textContent = left;
    if (left === SPOKEN_SECONDS) {
      // telefoon ligt nu terug: vanaf hier mag er weer gepraat en geklonken worden
      const em = $('#restEmoji'), t = $('#restTitle'), x = $('#restText');
      if (em) em.textContent = '😴';
      if (t) t.textContent = `${ui.restLabel}, ogen dicht`;
      if (x) x.textContent = 'Ssst… even helemaal stil.';
      ui.restSpoken = true;
      Ambient.set(ambientScene());
      speak(ui.restLabel === 'Weerwolven'
        ? 'Weerwolven, doe jullie ogen dicht.'
        : `${ui.restLabel}, doe je ogen dicht.`);
    }
    if (left <= 0) nightNext();
  });
  $('#skip').addEventListener('click', nightNext);
}

function renderNightSleep() {
  const meisje = game.players.find(p => p.alive && p.role === 'meisje');
  // Met spelleider: die speelt niet mee en drukt gewoon zelf op de knop.
  if (game.settings.spelleider) {
    screen(`
      ${header(`Nacht ${game.round}`, true)}
      <div class="center-stage night">
        <div class="big-emoji">🌙</div>
        <h2>Iedereen ogen dicht!</h2>
        ${meisje ? `<p class="callout">👧 Glurend meisje: straks, als de weerwolf wakker is, mag jij héél voorzichtig gluren. Op eigen risico!</p>` : ''}
        <button class="btn primary big" id="skip">Iedereen slaapt → verder</button>
      </div>
    `, 'theme-night');
    bindMenu();
    speak(`Nacht ${game.round}. Iedereen doet zijn ogen dicht en gaat slapen.` +
      (meisje ? ' Glurend meisje: jij mag straks alléén gluren wanneer de weerwolf wakker is.' : ''));
    $('#skip').addEventListener('click', nightNext);
    return;
  }
  // Geen knop: wie de app bedient speelt zelf mee en moet ook de ogen dicht
  // doen. De nacht begint daarom vanzelf na een korte aftelling.
  const SLEEP_SECONDS = 10;
  screen(`
    ${header(`Nacht ${game.round}`, true)}    <div class="center-stage night">
      <div class="big-emoji">🌙</div>
      <h2>Iedereen ogen dicht!</h2>
      <p class="muted">Leg de telefoon in het midden van de tafel.<br>De nacht begint vanzelf…</p>
      ${meisje ? `<p class="callout">👧 Glurend meisje: straks, als de weerwolf wakker is, mag jij héél voorzichtig gluren. Op eigen risico!</p>` : ''}
      <div class="rest-count" id="restCount">${SLEEP_SECONDS}</div>
      <button class="btn subtle" id="skip">verder ›</button>
    </div>
  `, 'theme-night');
  bindMenu();
  speak(`Nacht ${game.round}. Iedereen doet zijn ogen dicht en gaat slapen.` +
    (meisje ? ' Glurend meisje: jij mag straks alléén gluren wanneer de weerwolf wakker is.' : '') +
    ' De nacht begint vanzelf.');
  let left = SLEEP_SECONDS;
  every(1000, () => {
    left--;
    const el = $('#restCount');
    if (el) el.textContent = left;
    if (left <= 0) nightNext();
  });
  $('#skip').addEventListener('click', nightNext);
}

function renderNightCupido() {
  const SL = game.settings.spelleider;
  if (!ui.stepStage) ui.stepStage = 'wake';
  if (!ui.cupidoSel) ui.cupidoSel = [];

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · cupido`, true)}
      <div class="center-stage night">
        <div class="big-emoji">💘</div>
        <h2>${SL ? 'Wek cupido' : 'Cupido, word wakker'}</h2>
        <p class="muted">${SL ? 'Alleen cupido doet de ogen open.' : 'Alleen cupido doet de ogen open en pakt stilletjes de telefoon.'}</p>
        <button class="btn primary big" id="me">${SL ? 'Cupido is wakker ✋' : 'Ik ben cupido 💘'}</button>
      </div>
    `, 'theme-night');
    bindMenu();
    nag('Cupido, word wakker.', [
      'Cupido! Hallo cupido! Word wakker.',
      'Cupido, word wakker — de liefde wacht!',
    ]);
    $('#me').addEventListener('click', () => { ui.stepStage = 'pick'; render(); });
    return;
  }
  if (ui.stepStage === 'pick') {
    const sel = ui.cupidoSel;
    if (ui.cupidoRendered) restoreScrollY = window.scrollY;
    ui.cupidoRendered = true;
    screen(`
      ${header('Cupido', true)}
      <div class="stack night">
        <h2>💘 ${SL ? 'Wie wijst cupido aan als geliefden?' : 'Kies twee geliefden'}</h2>
        <p class="muted">Tik twee spelers aan${SL ? '' : ' — jijzelf mag ook'}.</p>
        <div class="player-grid">${Engine.alive(game).map(p => `
          <button class="player-pick ${sel.includes(p.id) ? 'sel' : ''}" data-id="${p.id}">
            <span class="pp-avatar">${av(p)}</span>
            <span class="pp-name">${esc(p.name)}</span>
          </button>`).join('')}</div>
        <button class="btn primary big" id="ok" ${sel.length === 2 ? '' : 'disabled'}>💘 Verbind deze harten</button>
      </div>
    `, 'theme-night');
    bindMenu();
    $$('.player-pick').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.id);
      const i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1);
      else { if (sel.length === 2) sel.shift(); sel.push(id); }
      render();
    }));
    $('#ok').addEventListener('click', () => {
      if (sel.length !== 2) return;
      Engine.cupidoPick(game, sel[0], sel[1]); saveGame();
      ui.stepStage = 'instruct'; render();
    });
    return;
  }
  // instruct: cupido tikt de geliefden aan zodat ze elkaar zien
  screen(`
    ${header('Cupido', true)}
    <div class="center-stage night">
      <div class="big-emoji">💘</div>
      <h2>${SL ? 'Tik de geliefden aan' : 'Tik nu zélf je geliefden aan'}</h2>
      <p class="muted">Héél zachtjes. Zij doen de ogen open, kijken elkaar even aan… en doen de ogen weer dicht.</p>
      <button class="btn primary big" id="done">Klaar · ogen dicht 😴</button>
    </div>
  `, 'theme-night');
  bindMenu();
  speak('Geliefden, doe je ogen open en kijk elkaar aan. Jullie horen nu bij elkaar, in leven en in dood.');
  $('#done').addEventListener('click', () => { ui.cupidoSel = null; startRest('Cupido'); });
}

function renderNightZiener() {
  const SL = game.settings.spelleider;
  const ziener = game.players.find(p => p.alive && p.role === 'ziener');
  if (!ui.stepStage) ui.stepStage = 'wake';

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · ziener`, true)}      <div class="center-stage night">
        <div class="big-emoji">🔮</div>
        <h2>${SL ? 'Wek de ziener' : 'Ziener, word wakker'}</h2>
        <p class="muted">${SL ? 'Alleen de ziener doet de ogen open en wijst straks iemand aan.' : 'Alleen de ziener doet nu de ogen open en pakt stilletjes de telefoon.'}</p>
        <button class="btn primary big" id="me">${SL ? 'De ziener is wakker ✋' : 'Ik ben de ziener 🔮'}</button>
      </div>
    `, 'theme-night');
    bindMenu();
    nag('Ziener, word wakker. Pak stilletjes de telefoon.', [
      'Ziener! Hallo ziener! Word wakker.',
      'Ziener, word wakker en pak de telefoon.',
      'Slaap je, ziener? Wakker worden!',
    ]);
    $('#me').addEventListener('click', () => { ui.stepStage = 'pick'; render(); });
    return;
  }
  if (ui.stepStage === 'pick') {
    const options = Engine.alive(game).filter(p => p.id !== ziener.id);
    screen(`
      ${header('Ziener', true)}
      <div class="stack night">
        <h2>🔮 ${SL ? 'Wie wijst de ziener aan?' : 'Wie wil je doorzien?'}</h2>
        ${playerButtons(options)}
      </div>
    `, 'theme-night');
    bindMenu();
    bindPlayerButtons(id => {
      ui.seerResult = { id, isWolf: Engine.seerPick(game, id) };
      saveGame(); ui.stepStage = 'result'; render();
    });
    return;
  }
  const t = Engine.player(game, ui.seerResult.id);
  screen(`
    ${header('Ziener', true)}
    <div class="center-stage night">
      <div class="big-emoji">${av(t)} ${ui.seerResult.isWolf ? '🐺' : '✅'}</div>
      <h2>${av(t)} ${esc(t.name)} is ${ui.seerResult.isWolf ? '<span class="danger">de WEERWOLF!</span>' : 'géén weerwolf'}</h2>
      <p class="muted">${game.settings.spelleider ? 'Laat dit alléén aan de ziener zien.' : 'Onthoud dit goed — en verklap het niet te snel.'}</p>
      <button class="btn primary big" id="done">Klaar · ogen dicht 😴</button>
    </div>
  `, 'theme-night');
  bindMenu();
  $('#done').addEventListener('click', () => startRest('Ziener'));
}

function renderNightWolf() {
  const wolves = Engine.aliveWolves(game);
  const multi = wolves.length > 1;
  if (!ui.stepStage) ui.stepStage = 'wake';

  if (ui.stepStage === 'wake') {
    const meisje = game.players.find(p => p.alive && p.role === 'meisje');
    const glurenZin = meisje ? ' Glurend meisje, nu mag jij heel voorzichtig gluren.' : '';
    screen(`
      ${header(`Nacht ${game.round} · weerwolf`, true)}      <div class="center-stage night">
        <div class="big-emoji">🐺</div>
        <h2>${game.settings.spelleider ? (multi ? 'Wek de weerwolven' : 'Wek de weerwolf') : (multi ? 'Weerwolven, word wakker' : 'Weerwolf, word wakker')}</h2>
        <p class="muted">${multi ? 'Alleen de weerwolven doen de ogen open.' : 'Alleen de weerwolf doet de ogen open.'}
        ${game.settings.spelleider ? ' Laat ze een slachtoffer aanwijzen.' : (game.settings.deathMode === 'app' ? ' Pak stilletjes de telefoon.' : '')}</p>
        ${meisje ? '<p class="callout">👧 Glurend meisje: nu mag jij héél voorzichtig gluren — op eigen risico!</p>' : ''}
        <button class="btn primary big" id="me">${game.settings.spelleider ? (multi ? 'De wolven zijn wakker ✋' : 'De wolf is wakker ✋') : `${multi ? 'Wij zijn wakker' : 'Ik ben wakker'} 🐺`}</button>
      </div>
    `, 'theme-night');
    bindMenu();
    if (multi) {
      nag('Weerwolven, word wakker.' + glurenZin, [
        'Weerwolven! Hallo weerwolven! Zijn jullie al wakker?',
        'Weerwolven, worden jullie eens wakker!',
        'Hé weerwolven! Opstaan, jullie moeten op jacht.',
      ]);
    } else {
      nag('Weerwolf, word wakker.' + glurenZin, [
        'Weerwolf! Hallo weerwolf! Word wakker.',
        'Weerwolf, word wakker!',
        'Hé weerwolf! Opstaan, het is jachttijd.',
      ]);
    }
    $('#me').addEventListener('click', () => {
      ui.stepStage = game.settings.deathMode === 'app' ? 'pick' : 'fysiek';
      render();
    });
    return;
  }
  if (ui.stepStage === 'fysiek') {
    screen(`
      ${header('Weerwolf', true)}
      <div class="center-stage night">
        <div class="big-emoji">👆</div>
        <h2>Kies je slachtoffer</h2>
        <p class="muted">Sta héél zachtjes op en tik je slachtoffer aan. Ga daarna terug zitten alsof er niets gebeurd is.</p>
        <button class="btn primary big" id="done">Klaar · ogen dicht 😴</button>
      </div>
    `, 'theme-night');
    bindMenu();
    $('#done').addEventListener('click', () => startRest(wolves.length > 1 ? 'Weerwolven' : 'Weerwolf'));
    return;
  }
  if (ui.stepStage === 'pick') {
    const options = Engine.alive(game).filter(p => p.role !== 'wolf');
    screen(`
      ${header(multi ? 'Weerwolven' : 'Weerwolf', true)}
      <div class="stack night">
        <h2>🎯 ${game.settings.spelleider ? (multi ? 'Wie wijzen de wolven aan?' : 'Wie wijst de wolf aan?') : (multi ? 'Wie vallen jullie vannacht aan?' : 'Wie val je vannacht aan?')}</h2>
        ${playerButtons(options)}
      </div>
    `, 'theme-night');
    bindMenu();
    bindPlayerButtons(id => { ui.wolfPick = id; ui.stepStage = 'confirm'; render(); });
    return;
  }
  const t = Engine.player(game, ui.wolfPick);
  screen(`
    ${header(multi ? 'Weerwolven' : 'Weerwolf', true)}
    <div class="center-stage night">
      <div class="big-emoji">🎯 ${av(t)}</div>
      <h2>${multi ? 'Vannacht pakken jullie' : 'Vannacht pak je'}<br><span class="danger">${av(t)} ${esc(t.name)}</span></h2>
      <div class="row">
        <button class="btn half" id="backBtn">↩︎ Toch iemand anders</button>
        <button class="btn primary half" id="ok">Zeker weten 🐺</button>
      </div>
    </div>
  `, 'theme-night');
  bindMenu();
  $('#backBtn').addEventListener('click', () => { ui.stepStage = 'pick'; render(); });
  $('#ok').addEventListener('click', () => {
    Engine.wolfPick(game, ui.wolfPick); saveGame();
    startRest(wolves.length > 1 ? 'Weerwolven' : 'Weerwolf');
  });
}

function renderNightHeks() {
  const heks = game.players.find(p => p.alive && p.role === 'heks');
  // Spelleider zonder drankjes: alleen een geheugensteuntje, geen keuzes.
  // Alleen als er deze nacht ook níets is ingezet — direct na het laatste
  // drankje hoort gewoon het normale heks-scherm te blijven staan.
  if (game.settings.spelleider && game.witch.healsLeft <= 0 && game.witch.poisonsLeft <= 0
      && !game.night.witchHeal && game.night.witchPoisonTarget == null) {
    screen(`
      ${header(`Nacht ${game.round} · heks`, true)}
      <div class="center-stage night">
        <div class="big-emoji">🧪</div>
        <h2>De heks heeft geen drankjes meer</h2>
        <p class="muted">Wek haar heel even voor de vorm (dan verklapt het overslaan niets aan het dorp) en laat haar weer gaan slapen.</p>
        <button class="btn primary big" id="done">Verder · ogen dicht 😴</button>
      </div>
    `, 'theme-night');
    bindMenu();
    $('#done').addEventListener('click', nightNext);
    return;
  }
  if (!ui.stepStage) ui.stepStage = 'wake';
  const appMode = game.settings.deathMode === 'app';
  const victim = appMode && game.night.wolfTarget != null ? Engine.player(game, game.night.wolfTarget) : null;

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · heks`, true)}      <div class="center-stage night">
        <div class="big-emoji">🧪</div>
        <h2>${game.settings.spelleider ? 'Wek de heks' : 'Heks, word wakker'}</h2>
        <p class="muted">${game.settings.spelleider ? 'Alleen de heks doet de ogen open; vraag haar met gebaren om haar keuze.' : 'Alleen de heks doet de ogen open en pakt stilletjes de telefoon.'}</p>
        <button class="btn primary big" id="me">${game.settings.spelleider ? 'De heks is wakker ✋' : 'Ik ben de heks 🧪'}</button>
      </div>
    `, 'theme-night');
    bindMenu();
    nag('Heks, word wakker. Pak stilletjes de telefoon.', [
      'Heks! Hallo heks! Word wakker.',
      'Heks, word wakker!',
      'Heks, je drankjes staan te wachten!',
    ]);
    $('#me').addEventListener('click', () => { ui.stepStage = 'act'; render(); });
    return;
  }
  if (ui.stepStage === 'poison') {
    const options = Engine.alive(game).filter(p => p.id !== heks.id);
    screen(`
      ${header('Heks', true)}
      <div class="stack night">
        <h2>☠️ Wie krijgt het gif-drankje?</h2>
        ${playerButtons(options)}
        <button class="btn subtle" id="cancel">↩︎ Toch niet</button>
      </div>
    `, 'theme-night');
    bindMenu();
    bindPlayerButtons(id => { Engine.witchPoison(game, id); saveGame(); ui.stepStage = 'act'; render(); });
    $('#cancel').addEventListener('click', () => { ui.stepStage = 'act'; render(); });
    return;
  }
  // act-overzicht
  const w = game.witch;
  const healed = game.night.witchHeal;
  const poisoned = game.night.witchPoisonTarget != null;
  // Jezelf redden mag maar één keer, en alléén met de allereerste genezing.
  const victimIsSelf = appMode && victim && victim.id === heks.id;
  const selfBlocked = victimIsSelf && (w.selfHealUsed || w.healsLeft < w.healsTotal);
  const canHeal = !healed && w.healsLeft > 0 && (victim || !appMode) && !selfBlocked;

  let healRow;
  if (healed) healRow = `<div class="pill ok">💚 Genees-drankje ingezet — het slachtoffer overleeft!</div>`;
  else if (selfBlocked) healRow = `<div class="pill">💚 Jezelf redden mag alleen met je allereerste drankje</div>`;
  else if (canHeal) healRow = `<button class="btn" id="heal">💚 Gebruik genees-drankje ${victim ? `voor ${av(victim)} ${esc(victim.name)}` : ''}${w.healsTotal > 1 ? ` <small>nog ${w.healsLeft} van ${w.healsTotal}</small>` : ''}</button>`;
  else healRow = `<div class="pill">💚 Genees-drankjes zijn op</div>`;

  let poisonRow = '';
  if (w.poisonsTotal > 0) {
    if (poisoned) poisonRow = `<div class="pill danger">☠️ Gif-drankje ingezet voor ${av(Engine.player(game, game.night.witchPoisonTarget))} ${esc(Engine.player(game, game.night.witchPoisonTarget).name)}</div>`;
    else if (w.poisonsLeft > 0) poisonRow = `<button class="btn" id="poison">☠️ Gebruik gif-drankje…</button>`;
    else poisonRow = `<div class="pill">☠️ Gif-drankje is al gebruikt</div>`;
  }

  screen(`
    ${header('Heks', true)}
    <div class="stack night">
      <div class="big-emoji center">🧪</div>
      ${appMode
        ? `<h2 class="center">Vannacht aangevallen:<br><span class="danger">${victim ? `${av(victim)} ${esc(victim.name)}` : 'niemand'}</span></h2>`
        : `<h2 class="center">Wil je een drankje gebruiken?</h2>
           <p class="muted center">Jij weet niet wie er is aangetikt — genezen werkt op het slachtoffer van vannacht, wie het ook is.</p>`}
      ${healRow}
      ${poisonRow}
      <button class="btn primary big" id="done">Klaar · ogen dicht 😴</button>
    </div>
  `, 'theme-night');
  bindMenu();
  const healBtn = $('#heal');
  if (healBtn) healBtn.addEventListener('click', () => { Engine.witchHeal(game); saveGame(); render(); });
  const poisonBtn = $('#poison');
  if (poisonBtn) poisonBtn.addEventListener('click', () => { ui.stepStage = 'poison'; render(); });
  $('#done').addEventListener('click', () => startRest('Heks'));
}

function renderNightWake() {
  const appMode = game.settings.deathMode === 'app';
  if (!ui.stepStage) ui.stepStage = 'open';

  if (ui.stepStage === 'open') {
    const SL = game.settings.spelleider;
    screen(`
      ${header(`Nacht ${game.round}`, true)}
      <div class="center-stage">
        <div class="big-emoji">🌞</div>
        <h2>${SL ? 'De nacht is voorbij' : 'Iedereen ogen open!'}</h2>
        ${SL
          ? `<p class="muted">Wek het dorp en vertel zelf wat er is gebeurd — het overzicht komt zo in beeld.</p>
             <button class="btn primary big" id="go">${appMode ? 'Toon het overzicht van de nacht' : 'Doorgeven wie is aangetikt'}</button>`
          : appMode
          ? `<p class="muted">De app telt zo af en onthult wat er vannacht is gebeurd…</p>
             <button class="btn primary big" id="go">🥁 Start het aftellen</button>`
          : `<p class="muted">Wie is er vannacht aangetikt?</p>
             <button class="btn primary big" id="go">Doorgeven wie is aangetikt</button>`}
      </div>
    `);
    bindMenu();
    speak('De zon komt op. Iedereen mag de ogen weer openen.');
    $('#go').addEventListener('click', () => {
      if (SL && appMode) {
        // geen aftel-theater: de spelleider vertelt zelf, de app toont het overzicht
        Engine.resolveNight(game, null); saveGame();
        ui.stepStage = 'summary'; render();
        return;
      }
      ui.stepStage = appMode ? 'count' : 'whodied';
      if (appMode) ui.count = 5;
      render();
    });
    return;
  }

  if (ui.stepStage === 'whodied') {
    screen(`
      ${header('Wie is aangetikt?', true)}
      <div class="stack">
        <h2>👆 Wie werd er vannacht aangetikt?</h2>
        ${playerButtons(Engine.alive(game))}
        <button class="btn subtle" id="nobody">Niemand is aangetikt</button>
      </div>
    `);
    bindMenu();
    const resolve = id => {
      Engine.resolveNight(game, id); saveGame();
      ui.stepStage = 'summary'; render();
    };
    bindPlayerButtons(resolve);
    $('#nobody').addEventListener('click', () => resolve(null));
    return;
  }

  if (ui.stepStage === 'count') {
    screen(`
      <div class="center-stage countdown">
        <div class="count-num" id="num">${ui.count}</div>
      </div>
    `, 'theme-night');
    speak(String(ui.count));
    beep(520 + ui.count * 40, 0.12);
    after(1000, () => {
      ui.count--;
      if (ui.count > 0) { render(); }
      else {
        Engine.resolveNight(game, null); saveGame();
        ui.stepStage = 'summary'; render();
      }
    });
    return;
  }

  // samenvatting van de nacht
  renderNightSummary();
}

function renderNightSummary() {
  const ln = game.lastNight;
  const deaths = ln.deaths.map(d => ({ p: Engine.player(game, d.id), cause: d.cause }));
  const saved = ln.saved != null ? Engine.player(game, ln.saved) : null;
  const causeText = CAUSE_TEXT;
  // onvoorspelbare heks: gered, maar het drankje kan iets veranderd hebben
  const mishapCard = ln.mishap && ln.mishap !== 'dood' && saved && !ln.mishapShown;

  // Beslist deze nacht het spel? Dan blijven de rollen geheim tot de grote
  // onthulling — anders is alle spanning er al af ("Dex was de weerwolf").
  // In spelleider-modus kijkt alleen de spelleider mee: die mag alles zien.
  const secretFinal = game.winner != null && !game.settings.spelleider;

  let lines = '';
  if (!deaths.length && !saved) lines = `<h2>😮‍💨 Niemand ging dood vannacht!</h2>`;
  if (saved) lines += `<div class="pill ok">💚 ${av(saved)} ${esc(saved.name)} werd aangevallen… maar de heks heeft ${esc(saved.name)} gered!</div>`;
  for (const d of deaths) {
    const r = Engine.ROLES[d.p.role];
    lines += `
      <div class="death">
        <div class="death-name">💀 ${av(d.p)} ${esc(d.p.name)}</div>
        <div class="death-role">${secretFinal ? causeText[d.cause] : `${r.emoji} was ${r.naam} — ${causeText[d.cause]}`}</div>
      </div>`;
  }
  if (mishapCard) lines += `<p class="callout">⚗️ Maar het drankje van de heks borrelde wel héél verdacht… ${av(saved)} ${esc(saved.name)} moet zo even stiekem de eigen kaart bekijken!</p>`;
  if (secretFinal) lines += `<p class="callout">🤫 De rollen blijven nog even geheim…</p>`;

  // Let op: speak() moet ná screen() — screen() kapt lopende spraak juist af.
  const texts = [];
  if (saved) texts.push(`${saved.name} werd gered door de heks.`);
  for (const d of deaths) {
    texts.push(secretFinal
      ? `${d.p.name} is dood.`
      : `${d.p.name} is dood. ${d.p.name} was ${Engine.ROLES[d.p.role].naam}.`);
  }
  if (!deaths.length && !saved) texts.push('Niemand ging dood vannacht.');
  if (mishapCard) texts.push(`Maar het drankje borrelde verdacht. ${saved.name}, bekijk zo stiekem je kaart.`);
  if (secretFinal) texts.push('De rollen blijven nog even geheim.');

  const hunter = game.hunterPending != null ? Engine.player(game, game.hunterPending) : null;
  screen(`
    ${header(`Ochtend na nacht ${game.round}`, true)}
    <div class="center-stage">
      <div class="big-emoji">🌅</div>
      ${lines}
      ${hunter ? `<p class="callout">🏹 ${esc(hunter.name)} was de jager en mag nog één keer schieten!</p>` : ''}
      <button class="btn primary big" id="go">${hunter ? '🏹 Jager, kies je doelwit' : 'Verder ☀️'}</button>
    </div>
  `);
  bindMenu();
  speak(texts.join(' '));
  $('#go').addEventListener('click', () => {
    ui = {};
    if (mishapCard) { ui.mishap = 'pass'; render(); return; }
    if (game.hunterPending != null) ui.hunterActive = true;
    render();
  });
}

/** Onvoorspelbare heks: de geredde bekijkt stiekem zijn (mogelijk nieuwe) kaart. */
function renderMishap() {
  const ln = game.lastNight;
  const p = Engine.player(game, ln.saved);

  if (ui.mishap === 'pass') {
    screen(`
      ${header('Het drankje… ⚗️')}
      <div class="center-stage">
        <div class="big-emoji">${av(p)}</div>
        <h2>Geef de telefoon aan<br><span class="accent">${av(p)} ${esc(p.name)}</span></h2>
        <p class="muted">Alleen jij mag zien wat het drankje met je heeft gedaan…</p>
        <button class="btn primary big" id="me">Ik ben ${av(p)} ${esc(p.name)} ✋</button>
      </div>
    `);
    speak(`Geef de telefoon aan ${p.name}.`);
    $('#me').addEventListener('click', () => { ui.mishap = 'card'; render(); });
    return;
  }

  const outcome = {
    ok: '😮‍💨 Niets aan de hand: het drankje werkte gewoon. Er is niets veranderd.',
    burger: '⚗️ Verkeerd gebrouwen! Je bent veranderd in een gewone burger.',
    wolf: '⚗️ Verkeerd gebrouwen! Je bent veranderd in een WEERWOLF — doe voortaan stiekem je ogen open met de wolven.',
  }[ln.mishap];
  screen(`
    ${header(`Jouw kaart, ${esc(p.name)}`)}
    <div class="center-stage">
      <div class="cardwrap">
        <div class="cardback" id="hold">
          <div class="cardback-inner">⚗️<br><b>Houd ingedrukt</b><br><small>om te zien wat het drankje deed</small></div>
        </div>
        <div class="cardfront" id="card">
          <div class="rolecard">
            <p class="card-hint">${outcome}</p>
            ${roleCardHTML(p, game)}
          </div>
        </div>
      </div>
      <button class="btn primary big" id="done" style="visibility:hidden">✅ Gezien — doorgeven</button>
    </div>
  `);
  bindHoldReveal($('#hold'), $('#card'), () => { $('#done').style.visibility = 'visible'; });
  $('#done').addEventListener('click', () => {
    game.lastNight.mishapShown = true; saveGame();
    ui = {};
    if (game.hunterPending != null) ui.hunterActive = true;
    render();
  });
}

function renderHunter() {
  const hunter = Engine.player(game, game.hunterPending);
  screen(`
    ${header('De jager schiet!', true)}
    <div class="stack">
      <div class="big-emoji center">🏹</div>
      <h2 class="center">${av(hunter)} ${esc(hunter.name)}, wie neem je mee?</h2>
      ${playerButtons(Engine.alive(game))}
    </div>
  `);
  bindMenu();
  bindPlayerButtons(id => {
    const t = Engine.player(game, id);
    confirmDialog(`${av(t)} ${esc(t.name)} gaat mee met de jager. Zeker weten?`,
      { emoji: '🏹', ok: 'Ja, schiet', cancel: 'Toch niet' })
      .then(ok => {
        if (!ok) return;
        Engine.hunterShoot(game, id); saveGame();
        const r = Engine.ROLES[t.role];
        ui = { shotResult: { name: t.name, avatar: av(t), role: r } };
        render();
      });
  });
}

function renderShotResult() {
  const s = ui.shotResult;
  screen(`
    ${header('De jager schoot raak', true)}
    <div class="center-stage">
      <div class="death">
        <div class="death-name">💀 ${s.avatar || ''} ${esc(s.name)}</div>
        <div class="death-role">${game.winner != null ? 'meegenomen door de jager 🏹' : `${s.role.emoji} was ${s.role.naam} — meegenomen door de jager 🏹`}</div>
      </div>
      <button class="btn primary big" id="go">Verder ☀️</button>
    </div>
  `);
  bindMenu();
  speak(game.winner != null
    ? `${s.name} is neergeschoten door de jager.`
    : `${s.name} is neergeschoten door de jager. ${s.name} was ${s.role.naam}.`);
  $('#go').addEventListener('click', () => { ui = {}; render(); });
}

/* ---------- dag ---------- */

function renderDay() {
  if (game.settings.guessing && !Engine.guessingDone(game) && ui.guessing) return renderGuessing();
  if (ui.voting && game.settings.spelleider) return renderVoteTally();
  if (ui.voting && game.voteQueue) return renderVoting();

  const alive = Engine.alive(game);
  const done = Engine.guessingDone(game);
  const s = game.settings;
  const finalR = !!game.finalRound; // spel is beslist: laatste gok, dan de onthulling
  screen(`
    ${header(finalR ? 'De laatste gok!' : `Dag ${game.round}`, true)}
    <div class="stack">
      <div class="big-emoji center">${finalR ? '🌘' : '☀️'}</div>
      <h2 class="center">${finalR ? 'Het spel is beslist…' : 'Overleg maar eens goed…'}</h2>
      ${finalR ? '' : `<div class="pill">${Object.entries(Engine.aliveRoleCounts(game))
        .sort((a, b) => (a[0] === 'wolf' ? -1 : b[0] === 'wolf' ? 1 : 0))
        .map(([role, n]) => `${n}× ${Engine.ROLES[role].emoji} ${Engine.ROLES[role].naam.toLowerCase()}`)
        .join(' · ')}</div>`}
      <p class="muted center">${finalR
        ? 'Maar wie wás nou al die tijd de weerwolf? Iedereen doet nog één geheime gok — dán valt het doek.'
        : `Wie deed er verdacht? Wie lachte er zo raar? Nog in leven:
      ${alive.map(p => `${av(p)} ${esc(p.name)}`).join(', ')}.`}</p>
      ${!finalR && s.dayTimerSec ? `
        <button class="btn" id="timerBtn">⏱️ Start ${Math.round(s.dayTimerSec / 60)} min overleg-timer</button>
        <div class="timer-big" id="dayTimer"></div>` : ''}
      ${s.guessing ? (done
        ? `<div class="pill ok">🕵️ Iedereen heeft zijn gok gedaan 🤫</div>`
        : `<button class="btn primary big" id="guessBtn">🕵️ Start de ${finalR ? 'laatste gok-ronde' : 'gok-ronde'} <small>iedereen gokt in het geheim wie de wolf is</small></button>`)
        : ''}
      ${!finalR && s.dayVote && (done || !s.guessing) && game.voteRound !== game.round
        ? `<button class="btn primary big" id="voteBtn">🔥 Start de stemming <small>wie gaat er op de brandstapel?</small></button>` : ''}
      ${!finalR && s.dayVote && game.voteRound === game.round
        ? `<div class="pill">🔥 De stemming is geweest</div>` : ''}
      ${finalR
        ? (done ? `<button class="btn primary big" id="toReveal">🥁 Naar de onthulling</button>` : '')
        : ((done || !s.guessing) && (!s.dayVote || game.voteRound === game.round)
          ? `<button class="btn primary big" id="nightBtn">🌙 Start nacht ${game.round + 1}</button>` : '')}
    </div>
  `);
  bindMenu();
  const timerBtn = $('#timerBtn');
  if (timerBtn) timerBtn.addEventListener('click', () => {
    timerBtn.disabled = true;
    let left = s.dayTimerSec;
    const el = $('#dayTimer');
    const tick = () => {
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      if (left === 0) { beep(440, 0.5); el.textContent = '⏰ Tijd is om!'; clearTimers(); }
      left--;
    };
    tick(); every(1000, tick);
  });
  const guessBtn = $('#guessBtn');
  if (guessBtn) guessBtn.addEventListener('click', () => { ui.guessing = true; ui.guessStage = 'pass'; render(); });
  const voteBtn = $('#voteBtn');
  if (voteBtn) voteBtn.addEventListener('click', () => {
    if (game.settings.spelleider) {
      // spelleider turft zelf; wie op wie stemde wordt niet vastgelegd
      ui.voting = true; ui.tally = {};
      render();
      return;
    }
    Engine.startVote(game); saveGame();
    ui.voting = true; ui.voteStage = 'pass';
    render();
  });
  const nightBtn = $('#nightBtn');
  if (nightBtn) nightBtn.addEventListener('click', () => {
    Engine.startNight(game); saveGame(); ui = {}; render();
  });
  const toReveal = $('#toReveal');
  if (toReveal) toReveal.addEventListener('click', () => {
    game.phase = 'end'; saveGame(); ui = {}; render();
  });
}

function renderGuessing() {
  const guesser = Engine.currentGuesser(game);
  if (!guesser) { ui.guessing = false; return renderDay(); }
  if (!ui.guessStage) ui.guessStage = 'pass';

  if (ui.guessStage === 'pass') {
    screen(`
      ${header(`Gok-ronde · ${game.guessQueue.index + 1}/${game.guessQueue.ids.length}`)}
      <div class="center-stage">
        <div class="big-emoji">${av(guesser)}</div>
        <h2>Geef de telefoon aan<br><span class="accent">${av(guesser)} ${esc(guesser.name)}</span></h2>
        <p class="muted">Niemand mag meekijken met de gok. 🤫</p>
        <button class="btn primary big" id="me">Ik ben ${av(guesser)} ${esc(guesser.name)} ✋</button>
      </div>
    `);
    speak(`Geef de telefoon aan ${guesser.name}.`);
    $('#me').addEventListener('click', () => { ui.guessStage = 'pick'; render(); });
    return;
  }
  // In de laatste ronde kan de wolf ook al dood zijn (heks-gif, jager),
  // dus dan mag je op iederéén gokken — ook op de doden.
  const pool = game.finalRound ? game.players : Engine.alive(game);
  const options = pool.filter(p => p.id !== guesser.id);
  screen(`
    ${header(`Gok van ${esc(guesser.name)}`)}
    <div class="stack">
      <h2>🕵️ Wie denk jij dat de weerwolf ${game.finalRound ? 'was' : 'is'}?</h2>
      <p class="muted">${game.finalRound ? 'Je laatste gok — zo meteen valt het doek.' : 'Je gok blijft geheim tot het einde van het spel.'}</p>
      ${playerButtons(options)}
    </div>
  `);
  bindPlayerButtons(id => {
    Engine.recordGuess(game, id); saveGame();
    ui.guessStage = 'pass';
    render();
  });
}

/* ---------- dagstemming: de brandstapel ---------- */

function renderVoting() {
  const voter = Engine.currentVoter(game);
  if (!voter) { ui.voting = false; return renderDay(); }
  if (!ui.voteStage) ui.voteStage = 'pass';

  if (ui.voteStage === 'pass') {
    screen(`
      ${header(`Stemming · ${game.voteQueue.index + 1}/${game.voteQueue.ids.length}`)}
      <div class="center-stage">
        <div class="big-emoji">${av(voter)}</div>
        <h2>Geef de telefoon aan<br><span class="accent">${av(voter)} ${esc(voter.name)}</span></h2>
        <p class="muted">Stem in het geheim wie er op de brandstapel moet. 🔥</p>
        <button class="btn primary big" id="me">Ik ben ${av(voter)} ${esc(voter.name)} ✋</button>
      </div>
    `);
    speak(`Geef de telefoon aan ${voter.name}.`);
    $('#me').addEventListener('click', () => { ui.voteStage = 'pick'; render(); });
    return;
  }
  const options = Engine.alive(game).filter(p => p.id !== voter.id);
  screen(`
    ${header(`Stem van ${esc(voter.name)}`)}
    <div class="stack">
      <h2>🔥 Wie moet er op de brandstapel?</h2>
      <p class="muted">Bij staken van de stemmen gaat er niemand.</p>
      ${playerButtons(options)}
    </div>
  `);
  bindPlayerButtons(id => {
    Engine.recordVote(game, id); saveGame();
    if (Engine.voteDone(game)) {
      Engine.resolveVote(game); saveGame();
      ui = { voteResult: true };
    } else {
      ui.voteStage = 'pass';
    }
    render();
  });
}

/** Spelleider-modus: de stemmen worden geturfd, niet per stemmer vastgelegd. */
function renderVoteTally() {
  const alive = Engine.alive(game);
  if (!ui.tally) ui.tally = {};
  if (ui.tallyRendered) restoreScrollY = window.scrollY;
  ui.tallyRendered = true;
  const total = Object.values(ui.tally).reduce((a, b) => a + b, 0);
  screen(`
    ${header('Stemming turven 🔥', true)}
    <div class="stack">
      <p class="muted">Laat het dorp stemmen en turf per speler het aantal stemmen.
      Wie op wie stemde wordt niet vastgelegd.</p>
      ${alive.map(p => `
        <div class="listrow">
          <span>${av(p)} ${esc(p.name)}</span>
          <span class="tally-controls">
            <button class="btn round small" data-min="${p.id}">−</button>
            <b class="tally-num">${ui.tally[p.id] || 0}</b>
            <button class="btn round small" data-plus="${p.id}">+</button>
          </span>
        </div>`).join('')}
      <div class="pill">${total} ${total === 1 ? 'stem' : 'stemmen'} geturfd</div>
      <button class="btn primary big" id="tallyOk" ${total ? '' : 'disabled'}>🔥 Uitslag bepalen</button>
      <button class="btn subtle" id="cancel">↩︎ Annuleren</button>
    </div>
  `);
  bindMenu();
  $$('[data-plus]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.plus;
    ui.tally[id] = (ui.tally[id] || 0) + 1;
    render();
  }));
  $$('[data-min]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.min;
    ui.tally[id] = Math.max(0, (ui.tally[id] || 0) - 1);
    render();
  }));
  $('#tallyOk').addEventListener('click', () => {
    if (!total) return;
    const counts = {};
    for (const [id, n] of Object.entries(ui.tally)) if (n > 0) counts[id] = n;
    Engine.resolveVoteCounts(game, counts); saveGame();
    ui = { voteResult: true };
    render();
  });
  $('#cancel').addEventListener('click', () => { ui.voting = false; ui.tally = null; render(); });
}

function renderVoteResult() {
  const v = game.lastVote;
  // stemming besliste het spel: rollen geheim (behalve voor de spelleider)
  const secret = game.winner != null && !game.settings.spelleider;
  const rows = Object.entries(v.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const p = Engine.player(game, Number(id));
      return `<div class="listrow"><span>${av(p)} ${esc(p.name)}</span><span class="muted">${n} ${n === 1 ? 'stem' : 'stemmen'}</span></div>`;
    }).join('');

  let outcome = '', speech = '';
  if (v.tie) {
    outcome = `<div class="pill">🤝 De stemmen staken — niemand gaat op de brandstapel.</div>`;
    speech = 'De stemmen staken. Niemand gaat op de brandstapel.';
  } else if (v.gekSaved) {
    const p = Engine.player(game, v.lynchedId);
    outcome = `<div class="pill ok">🤪 ${av(p)} ${esc(p.name)} blijkt de dorpsgek! Het dorp verbrandt geen dorpsgek — ${esc(p.name)} blijft leven, maar mag niet meer stemmen.</div>`;
    speech = `${p.name} blijkt de dorpsgek. Het dorp verbrandt geen dorpsgek. ${p.name} blijft leven, maar mag niet meer stemmen.`;
  } else {
    for (const d of v.deaths) {
      const p = Engine.player(game, d.id);
      const r = Engine.ROLES[p.role];
      outcome += `
        <div class="death">
          <div class="death-name">🔥 ${av(p)} ${esc(p.name)}</div>
          <div class="death-role">${secret ? CAUSE_TEXT[d.cause] : `${r.emoji} was ${r.naam} — ${CAUSE_TEXT[d.cause]}`}</div>
        </div>`;
      speech += secret
        ? `${p.name} is ${d.cause === 'liefde' ? 'gestorven van liefdesverdriet' : 'op de brandstapel gezet'}. `
        : `${p.name} is ${d.cause === 'liefde' ? 'gestorven van liefdesverdriet' : 'op de brandstapel gezet'}. ${p.name} was ${r.naam}. `;
    }
    if (secret) outcome += `<p class="callout">🤫 De rollen blijven nog even geheim…</p>`;
  }

  const hunter = game.hunterPending != null ? Engine.player(game, game.hunterPending) : null;
  screen(`
    ${header('De stemming 🔥', true)}
    <div class="stack">
      <div class="section-label">De stemmen</div>
      ${rows}
      ${outcome}
      ${hunter ? `<p class="callout">🏹 ${av(hunter)} ${esc(hunter.name)} was de jager en mag nog één keer schieten!</p>` : ''}
      <button class="btn primary big" id="go">${hunter ? '🏹 Jager, kies je doelwit' : 'Verder'}</button>
    </div>
  `);
  bindMenu();
  speak(speech);
  $('#go').addEventListener('click', () => {
    ui = {};
    if (game.hunterPending != null) ui.hunterActive = true;
    render();
  });
}

/* ---------- spelersoverzicht (spelleider) ---------- */

function renderRoster() {
  const w = game.phase !== 'end' ? Engine.decideWinner(game) : null;
  screen(`
    ${header('Spelersoverzicht 📋')}
    <div class="stack">
      <p class="muted">Alleen voor de spelleider-ogen! Tik een speler voor correcties.</p>
      ${game.players.map(p => {
        const r = Engine.ROLES[p.role];
        const lover = game.lovers && game.lovers.includes(p.id) ? ' 💘' : '';
        return `<button class="listrow roster-row ${p.alive ? '' : 'dead'}" data-id="${p.id}">
          <span>${av(p)} ${esc(p.name)}${lover}</span>
          <span class="muted">${r.emoji} ${r.naam} · ${p.alive ? '❤️' : `💀 ${CAUSE_TEXT[p.deathCause] || 'dood'}`}</span>
        </button>`;
      }).join('')}
      ${w ? `<div class="pill ok">Het spel lijkt beslist!</div>
             <button class="btn primary big" id="toEnd">🥁 Naar de onthulling</button>` : ''}
      <button class="btn primary" id="back">← Terug naar het spel</button>
    </div>
  `);
  $$('.roster-row').forEach(b => b.addEventListener('click', () => showRosterActions(Number(b.dataset.id))));
  const toEnd = $('#toEnd');
  if (toEnd) toEnd.addEventListener('click', () => {
    game.winner = w; game.phase = 'end'; saveGame();
    ui = {}; render();
  });
  $('#back').addEventListener('click', () => { ui.rosterOpen = false; render(); });
}

function showRosterActions(id) {
  const p = Engine.player(game, id);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <div class="section-label">${av(p)} ${esc(p.name)} — ${Engine.ROLES[p.role].emoji} ${Engine.ROLES[p.role].naam}</div>
      ${p.alive ? `
        <button class="btn" data-cause="wolf">🐺 Markeer dood: gepakt door de wolf</button>
        <button class="btn" data-cause="gif">☠️ Markeer dood: vergiftigd</button>
        <button class="btn" data-cause="stemming">🔥 Markeer dood: weggestemd</button>
        <button class="btn" data-cause="jager">🏹 Markeer dood: door de jager</button>
        <button class="btn" data-cause="correctie">✏️ Markeer dood: andere reden</button>`
      : `<button class="btn" id="revive">💚 Weer levend maken</button>`}
      <button class="btn subtle" id="rClose">Sluiten</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#rClose').addEventListener('click', close);
  overlay.querySelectorAll('[data-cause]').forEach(b => b.addEventListener('click', () => {
    Engine.correctKill(game, id, b.dataset.cause); // geliefden sterven automatisch mee
    saveGame(); close(); render();
  }));
  const rev = overlay.querySelector('#revive');
  if (rev) rev.addEventListener('click', () => {
    Engine.correctRevive(game, id); saveGame(); close(); render();
  });
}

/* ---------- einde ---------- */

function renderEnd() {
  // Spelleider-modus: geen drum-theater van de app — de spelleider onthult
  // zelf; de app toont direct het volledige overzicht.
  if (!ui.endStage) ui.endStage = (game.statsRecorded || game.settings.spelleider) ? 'reveal' : 'pre';

  if (ui.endStage === 'pre') {
    screen(`
      ${header('Het spel is voorbij…')}
      <div class="center-stage">
        <div class="big-emoji">🌘</div>
        <h2>Het doek valt over het dorp</h2>
        <p class="muted">Nog één keer diep ademhalen…<br>Wie was al die tijd de weerwolf?</p>
        <button class="btn primary big" id="reveal">🥁 Onthul de weerwolf</button>
      </div>
    `, 'theme-night');
    speak('Het spel is voorbij. Wie was al die tijd de weerwolf?');
    $('#reveal').addEventListener('click', () => { ui.endStage = 'drum'; render(); });
    return;
  }
  if (ui.endStage === 'drum') {
    // Masked Singer-momentje: "Het is… het is…" — drie paukenslagen — de naam!
    screen(`
      <div class="center-stage countdown">
        <div class="big-emoji drum" id="drum">🥁</div>
        <h2 class="reveal-line" id="line">Het is…</h2>
      </div>
    `, 'theme-night');
    speak('Het is…');
    const boom = hard => {
      drumBoom(hard ? 0.7 : 0.5);
      const d = $('#drum');
      if (d) { d.classList.remove('hit'); void d.offsetWidth; d.classList.add('hit'); }
    };
    after(1500, () => {
      const l = $('#line'); if (l) l.textContent = 'Het is… het is…';
      speak('het is…');
    });
    after(3000, () => boom(false));
    after(3800, () => boom(false));
    after(4600, () => boom(true));
    after(5700, () => { ui.endStage = 'reveal'; render(); });
    return;
  }

  recordStats(game);
  const wolves = Engine.wolves(game);
  const wolvesWon = game.winner === 'wolven';
  const scores = Engine.scores(game).slice().sort((a, b) => b.right - a.right);
  const best = scores.filter(r => !r.isWolf && r.right > 0 && r.right === Math.max(...scores.filter(x => !x.isWolf).map(x => x.right)));

  screen(`
    ${header('De onthulling')}
    <div class="stack">
      <div class="reveal-banner ${game.winner === 'geliefden' ? 'lovers' : wolvesWon ? 'wolves' : 'village'}">
        <div class="big-emoji">${game.winner === 'geliefden' ? '💘' : wolvesWon ? '🐺' : '🎉'}</div>
        <h2>${wolves.map(w => `${av(w)} ${esc(w.name)}`).join(' en ')}<br>${wolves.length > 1 ? 'waren de weerwolven!' : 'was de weerwolf!'}</h2>
        <div class="pill ${wolvesWon ? 'danger' : 'ok'}">${game.winner === 'geliefden'
          ? `💘 ${game.lovers.map(id => esc(Engine.player(game, id).name)).join(' en ')} winnen als geliefden!`
          : wolvesWon ? '🐺 De weerwolven winnen!' : '🎉 De burgers winnen!'}</div>
      </div>

      <div class="section-label">Alle rollen</div>
      ${game.players.map(p => {
        const r = Engine.ROLES[p.role];
        const lover = game.lovers && game.lovers.includes(p.id) ? ' 💘' : '';
        return `<div class="listrow ${p.alive ? '' : 'dead'}">
          <span>${av(p)} ${esc(p.name)}${lover}</span>
          <span class="muted">${r.emoji} ${r.naam}${p.alive ? '' : ' · 💀'}</span></div>`;
      }).join('')}

      ${game.settings.guessing ? `
        <div class="section-label">Speurneus-scores 🕵️</div>
        ${scores.map(r => `
          <div class="listrow">
            <span>${av(Engine.player(game, r.id))} ${esc(r.name)}${best.some(b => b.id === r.id) ? ' 🏆' : ''}</span>
            <span class="muted">${r.isWolf ? '🐺 was de wolf' : `${r.right} van ${r.total} goed`}</span>
          </div>`).join('')}` : ''}

      ${game.reviews.length ? `<p class="muted center">🔎 Noodknop gebruikt: ${game.reviews.map(rv => esc(Engine.player(game, rv.playerId).name)).join(', ')} 😉</p>` : ''}

      <button class="btn primary big" id="again">🔁 Opnieuw met dezelfde groep</button>
      <button class="btn" id="home">🏠 Naar het beginscherm</button>
    </div>
  `);
  speak(`${wolves.map(w => w.name).join(' en ')} ${wolves.length > 1 ? 'waren de weerwolven' : 'was de weerwolf'}. ${game.winner === 'geliefden'
    ? `${game.lovers.map(id => Engine.player(game, id).name).join(' en ')} winnen als geliefden!`
    : `De ${wolvesWon ? 'weerwolven' : 'burgers'} winnen!`}`);
  $('#again').addEventListener('click', () => {
    const names = game.players.map(p => p.name);
    const avatars = game.players.map(p => av(p));
    const kleuters = game.players.map(p => !!p.kleuter);
    const settings = game.settings;
    clearGame();
    setup = { names, avatars, kleuters, settings: Object.assign({}, settings), wolves: null, specials: null };
    renderSetupRoles();
  });
  $('#home').addEventListener('click', () => { clearGame(); renderHome(); });
}

/* ---------- menu & noodknop ---------- */

function showMenu() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <button class="btn" id="mRules">📖 Spelregels</button>
      ${game.settings.spelleider ? '<button class="btn" id="mRoster">📋 Spelersoverzicht</button>' : ''}
      ${Engine.allSeen(game) ? '<button class="btn" id="mReview">🔎 Kaart terugkijken (noodknop)</button>' : ''}
      <button class="btn danger-btn" id="mQuit">❌ Spel afbreken</button>
      <button class="btn subtle" id="mClose">Sluiten</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  $('#mClose').addEventListener('click', close);
  $('#mRules').addEventListener('click', () => { close(); renderRules(render); });
  const mRoster = $('#mRoster');
  if (mRoster) mRoster.addEventListener('click', () => { close(); ui.rosterOpen = true; render(); });
  const mReview = $('#mReview');
  if (mReview) mReview.addEventListener('click', () => { close(); renderReview(); });
  $('#mQuit').addEventListener('click', () => {
    close();
    confirmDialog('Spel afbreken? De rollen worden dan niet onthuld en er worden geen scores geteld.',
      { emoji: '❌', ok: 'Afbreken', cancel: 'Doorspelen', danger: true })
      .then(ok => { if (ok) { clearGame(); renderHome(); } });
  });
}

function renderReview() {
  if (!ui.reviewStage) ui.reviewStage = 'pick';

  if (ui.reviewStage === 'pick') {
    screen(`
      ${header('Noodknop 🔎')}
      <div class="stack">
        <h2>Wie is zijn rol écht vergeten?</h2>
        <p class="muted">Alleen die speler mag zo kijken — en het wordt genoteerd, dus geen smoesjes 😉</p>
        ${playerButtons(game.players)}
        <button class="btn subtle" id="cancel">↩︎ Terug</button>
      </div>
    `);
    bindPlayerButtons(id => { ui.reviewId = id; ui.reviewStage = 'hold'; render(); });
    $('#cancel').addEventListener('click', () => { ui.reviewStage = null; ui.reviewId = null; render(); });
    return;
  }

  const p = Engine.player(game, ui.reviewId);
  screen(`
    ${header(`Noodknop · ${esc(p.name)}`)}
    <div class="center-stage">
      <p class="muted">Geef de telefoon aan <b>${esc(p.name)}</b>. Houd de knop <b>3 seconden</b> ingedrukt om de kaart te zien.</p>
      <button class="btn primary big holdbtn" id="hold">🔎 Houd 3 sec ingedrukt…<span class="holdbar" id="bar"></span></button>
      <div class="cardfront review-card" id="card">${roleCardHTML(p, game)}</div>
      <button class="btn" id="back">↩︎ Klaar, terug naar het spel</button>
    </div>
  `);
  const hold = $('#hold'), bar = $('#bar'), card = $('#card');
  let t0 = null, raf = null, noted = false;
  const step = () => {
    const frac = Math.min(1, (Date.now() - t0) / 3000);
    bar.style.width = (frac * 100) + '%';
    if (frac >= 1) {
      card.classList.add('revealed');
      if (!noted) { noted = true; Engine.noteReview(game, p.id); saveGame(); }
      return;
    }
    raf = requestAnimationFrame(step);
  };
  const start = e => { e.preventDefault(); t0 = Date.now(); raf = requestAnimationFrame(step); };
  const stop = () => { cancelAnimationFrame(raf); bar.style.width = '0'; card.classList.remove('revealed'); };
  hold.addEventListener('pointerdown', start);
  hold.addEventListener('pointerup', stop);
  hold.addEventListener('pointercancel', stop);
  hold.addEventListener('pointerleave', stop);
  hold.addEventListener('contextmenu', e => e.preventDefault());
  hold.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  $('#back').addEventListener('click', () => { ui.reviewStage = null; ui.reviewId = null; render(); });
}

/* ---------- statistieken & regels ---------- */

function renderStats() {
  currentView = 'stats';
  const stats = Object.values(Store.get(KEYS.stats, {}))
    .sort((a, b) => b.games - a.games);
  screen(`
    ${header('Statistieken 📊')}
    <div class="stack">
      ${stats.length ? stats.map(s => `
        <div class="statcard">
          <div class="statcard-name">${s.avatar || ''} ${esc(s.name)}${s.kleuter ? ' 🧒' : ''}</div>
          <div class="statcard-row">
            <span>🎮 ${s.games}×</span>
            <span>🏆 ${s.wins}× winst</span>
            <span>🐺 ${s.wolfGames}× wolf</span>
            <span>🕵️ ${s.guessesRight}/${s.guessesTotal} goed${s.guessesTotal ? ` (${Math.round(100 * s.guessesRight / s.guessesTotal)}%)` : ''}</span>
          </div>
        </div>`).join('')
      : '<p class="muted center">Nog geen spellen gespeeld. De eerste onthulling vult dit lijstje vanzelf.</p>'}
      <button class="btn primary" id="back">← Terug</button>
    </div>
  `);
  $('#back').addEventListener('click', renderHome);
}

let rulesBack = null; // waar 'terug' vanuit de spelregels heen moet

function renderRules(backFn) {
  currentView = 'rules';
  rulesBack = backFn || renderHome;
  screen(`
    ${header('Spelregels 📖')}
    <div class="stack rules">
      <h2>Zo speel je Miniwolven</h2>
      <p>Eén (of meer) van jullie is stiekem de <b>weerwolf</b>. Elke <b>nacht</b> pakt de wolf een slachtoffer, elke <b>dag</b> praten jullie over wie het zou kunnen zijn en doet iedereen in het geheim een gok in de app.
      Het spel stopt als de wolf ontmaskerd én uitgeschakeld is (burgers winnen) of als er nog maar één burger over is (wolf wint). Aan het einde onthult de app alles — en wie het vaakst goed gokte, is de 🏆 speurneus.</p>
      <h2>De rollen</h2>
      ${Object.values(Engine.ROLES).map(r => `
        <div class="rulerow"><div class="rulerow-title">${r.emoji} <b>${r.naam}</b></div><p>${r.uitleg}</p></div>`).join('')}
      <h2>Tips</h2>
      <p>🎵 Zet zachte muziek aan tijdens de nacht, dan hoor je niet wie er beweegt of tikt.</p>
      <p>📵 Geef de telefoon met het scherm naar beneden door.</p>
      <p>👆 In de stand ‘fysiek aantikken’ tikt de wolf ’s nachts iemand aan — extra spannend, maar de aangetikte gokt die ronde niet mee (die weet te veel!).</p>
      <button class="btn primary" id="back">← Terug</button>
    </div>
  `);
  $('#back').addEventListener('click', backFn || renderHome);
}

/* ---------- router ---------- */

function render() {
  if (!game) return renderHome();
  currentView = 'game';
  if (ui.reviewStage) return renderReview();
  if (ui.rosterOpen) return renderRoster();
  if (ui.mishap) return renderMishap();
  if (ui.voteResult) return renderVoteResult();
  if (ui.shotResult) return renderShotResult();
  if (game.hunterPending != null && ui.hunterActive) return renderHunter();
  // Ochtend-samenvatting eerst tonen: resolveNight zet de fase al op dag/einde,
  // maar wat er vannacht gebeurd is moet natuurlijk wél eerst onthuld worden.
  if (ui.stepStage === 'summary' && game.lastNight) return renderNightSummary();
  switch (game.phase) {
    case 'deal': return renderDeal();
    case 'dealDone': return renderDealDone();
    case 'night':
      if (Engine.nightStep(game) === 'wake' && game.night.resolved && !ui.stepStage) ui.stepStage = 'summary';
      return renderNight();
    case 'day': return renderDay();
    case 'end': return renderEnd();
    default: return renderHome();
  }
}

/* ---------- terugknop (Android/browser) ---------- */
// Eén 'buffer'-entry in de history vangt de terugknop op: waar het kan gaan we
// echt terug in de app; op het startscherm of midden in een spel vragen we
// eerst of de app dicht mag.
function armBackTrap() { history.pushState({ mw: 1 }, ''); }

window.addEventListener('popstate', () => {
  if (currentView === 'roles') { armBackTrap(); renderSetupPlayers(); return; }
  if (currentView === 'rules') { armBackTrap(); (rulesBack || renderHome)(); return; }
  if (['players', 'stats', 'settings'].includes(currentView)) { armBackTrap(); renderHome(); return; }
  // Startscherm of lopend spel: terug kan nergens heen, dus doe stilletjes
  // niets. Afsluiten gaat gewoon via de home-knop van het toestel.
  armBackTrap();
});

document.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ mw: 0 }, '');
  armBackTrap();
  renderHome();
  tryHowl(); // ahoeoeee 🐺 (lukt dit nog niet van de browser, dan bij de eerste tik)
});
