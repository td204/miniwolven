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
const APP_VERSION = 14;

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
    if (team === g.winner) s.wins++;
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

  // Eén huil: ahoe-oe-oeee — toon glijdt omhoog, trilt even, zakt weg
  const howlOnce = (start, base, vol) => {
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.detune.value = 6;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1400;
    const g = ctx.createGain();
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vibGain = ctx.createGain(); vibGain.gain.value = base * 0.03;
    vib.connect(vibGain); vibGain.connect(osc.frequency); vibGain.connect(osc2.frequency);
    for (const o of [osc, osc2]) {
      o.frequency.setValueAtTime(base * 0.55, start);
      o.frequency.exponentialRampToValueAtTime(base, start + 0.85);      // a-hoe omhoog
      o.frequency.setValueAtTime(base, start + 2.0);                     // oeee aanhouden
      o.frequency.exponentialRampToValueAtTime(base * 0.68, start + 3.0); // wegzakken
      o.connect(filt);
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.5);
    g.gain.setValueAtTime(vol, start + 2.1);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 3.2);
    filt.connect(g).connect(master);
    osc.start(start); osc.stop(start + 3.3);
    osc2.start(start); osc2.stop(start + 3.3);
    vib.start(start); vib.stop(start + 3.3);
  };
  howlOnce(t0 + 0.8, 420, 0.12);   // de wolf dichtbij
  howlOnce(t0 + 2.6, 330, 0.05);   // een tweede, verder weg
}

/** Speel het openingsgeluid één keer; browsers staan geluid soms pas na de
 *  eerste aanraking toe, dus we proberen het bij openen én bij de eerste tik. */
function tryHowl() {
  if (howlPlayed || !soundOn()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(() => {
      if (howlPlayed || audioCtx.state !== 'running') return;
      howlPlayed = true;
      synthHowl(audioCtx);
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
  stop() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    if (this.gain && audioCtx) {
      const g = this.gain, srcs = this.sources, t = audioCtx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
      } catch {}
      setTimeout(() => {
        srcs.forEach(s => { try { s.stop(); } catch {} });
        try { g.disconnect(); } catch {}
      }, 900);
    }
    this.gain = null; this.sources = []; this.scene = null;
  },
  every(ms, fn) { this.timers.push(setInterval(fn, ms)); },
  set(scene) {
    if (!soundOn() || !scene) { if (this.scene) this.stop(); return; }
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
function ambPad(ctx, out, amb) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480;
  const g = ctx.createGain(); g.gain.value = 0.016;
  const trem = ctx.createOscillator(); trem.frequency.value = 0.13;
  const tremG = ctx.createGain(); tremG.gain.value = 0.008;
  trem.connect(tremG).connect(g.gain);
  for (const fr of [110, 164.8]) {
    const o = ctx.createOscillator(); o.frequency.value = fr;
    o.connect(f); o.start(); amb.sources.push(o);
  }
  f.connect(g).connect(out);
  trem.start(); amb.sources.push(trem);
}

const AMBIENT_SCENES = {
  deal:  (ctx, g, amb) => { ambWind(ctx, g, amb, 250, 0.015); ambPad(ctx, g, amb); },
  night: (ctx, g, amb) => { ambWind(ctx, g, amb, 280, 0.02); ambCrickets(ctx, g, amb); },
  tense: (ctx, g, amb) => { ambWind(ctx, g, amb, 200, 0.012); ambDrone(ctx, g, amb); ambHeartbeat(ctx, g, amb); },
  dawn:  (ctx, g, amb) => { ambWind(ctx, g, amb, 400, 0.014); ambBirds(ctx, g, amb, 0.55); },
  day:   (ctx, g, amb) => { ambWind(ctx, g, amb, 500, 0.018); ambBirds(ctx, g, amb, 0.3); },
};

/** Welke sfeer past bij het scherm dat nu zichtbaar is? */
function ambientScene() {
  if (!game || currentView !== 'game') return null;
  if (ui.shotResult || (game.hunterPending != null && ui.hunterActive)) return 'tense';
  if (game.phase === 'deal' || game.phase === 'dealDone') return 'deal';
  if (game.phase === 'night') {
    const step = Engine.nightStep(game);
    if (step === 'wake') return ui.stepStage === 'count' ? 'tense' : 'dawn';
    if (step === 'wolf' && ui.stepStage !== 'rest') return 'tense';
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
function after(ms, fn) { activeTimers.push(setTimeout(fn, ms)); }
function every(ms, fn) { activeTimers.push(setInterval(fn, ms)); }
function clearTimers() { activeTimers.forEach(t => { clearTimeout(t); clearInterval(t); }); activeTimers = []; }

function screen(html, cls = '') {
  clearTimers();
  app().className = cls;
  app().innerHTML = html;
  window.scrollTo(0, 0);
  Ambient.set(ambientScene());
}

function roleCardHTML(p, g) {
  const r = Engine.ROLES[p.role];
  let extra = '';
  if (p.role === 'wolf') {
    const mates = Engine.fellowWolves(g, p.id);
    if (mates.length) extra += `<p class="card-extra">🐺 Je mede-wolf: <b>${mates.map(m => `${av(m)} ${esc(m.name)}`).join(' en ')}</b>. Jullie jagen samen.</p>`;
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
    <button class="player-pick" data-id="${p.id}">
      <span class="pp-avatar">${av(p)}</span>
      <span class="pp-name">${esc(p.name)}</span>
    </button>`).join('')}</div>`;
}
function bindPlayerButtons(onPick) {
  $$('.player-pick').forEach(b => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
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
      if (confirm('Weet je zeker dat je het lopende spel weggooit?')) { clearGame(); renderHome(); }
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
  $('#optSound').addEventListener('change', e => {
    setSound(e.target.checked);
    if (e.target.checked) { howlPlayed = false; tryHowl(); } // meteen even laten horen
  });
  $('#wipeStats').addEventListener('click', () => {
    if (!confirm('Alle statistieken op nul zetten? Spelers en avatars blijven bestaan.')) return;
    const stats = Store.get(KEYS.stats, {});
    for (const s of Object.values(stats)) {
      s.games = 0; s.wins = 0; s.wolfGames = 0; s.guessesRight = 0; s.guessesTotal = 0;
    }
    Store.set(KEYS.stats, stats);
    $('#wipeDone').textContent = '✅ Statistieken staan weer op nul.';
  });
  $('#wipePlayers').addEventListener('click', () => {
    if (!confirm('Alle bekende spelers, groepen en statistieken definitief wissen?')) return;
    Store.del(KEYS.stats);
    Store.del(KEYS.groups);
    renderSettings();
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
      ${['ziener', 'heks', 'meisje', 'jager'].map(specialToggle).join('')}
      <div class="pill">${burgers >= 0 ? `+ ${burgers} 🧑‍🌾 ${burgers === 1 ? 'burger' : 'burgers'}` : ''}</div>
      <button class="btn subtle" id="autoBtn">✨ Aanbevolen samenstelling</button>
      <div class="error">${err ? esc(err) : ''}</div>

      <div class="section-label">Hoe wordt het slachtoffer bekend?</div>
      <div class="seg">
        <button class="seg-opt ${s.deathMode === 'app' ? 'on' : ''}" data-mode="app">📱 App onthult<small>de app telt af en zegt wie dood is</small></button>
        <button class="seg-opt ${s.deathMode === 'fysiek' ? 'on' : ''}" data-mode="fysiek">👆 Fysiek aantikken<small>de wolf tikt ’s nachts iemand aan</small></button>
      </div>

      <div class="section-label">Opties</div>
      <label class="opt"><input type="checkbox" id="optVoice" ${s.voice ? 'checked' : ''}> 🗣️ Verteller-stem (de app praat)</label>
      <label class="opt"><input type="checkbox" id="optGuess" ${s.guessing ? 'checked' : ''}> 🕵️ Gok-ronde in de app (houdt scores bij)</label>
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
  $$('.seg-opt').forEach(b => b.addEventListener('click', () => { s.deathMode = b.dataset.mode; renderSetupRoles(); }));
  $('#optVoice').addEventListener('change', e => s.voice = e.target.checked);
  $('#optGuess').addEventListener('change', e => s.guessing = e.target.checked);
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
  const step = Engine.nightStep(game);
  if (step === 'sleep') return renderNightSleep();
  if (step === 'ziener') return renderNightZiener();
  if (step === 'wolf') return renderNightWolf();
  if (step === 'heks') return renderNightHeks();
  if (step === 'wake') return renderNightWake();
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
  ui.stepStage = 'rest';
  ui.restLabel = label;
  render();
}

function renderNightRest() {
  const REST_SECONDS = 7;
  screen(`
    <div class="center-stage night">
      <div class="big-emoji">😴</div>
      <h2>${esc(ui.restLabel)}, ogen dicht</h2>
      <p class="muted">Leg de telefoon terug in het midden.<br>Ssst… even helemaal stil.</p>
      <div class="rest-count" id="restCount">${REST_SECONDS}</div>
      <button class="btn subtle" id="skip">verder ›</button>
    </div>
  `, 'theme-night');
  speak(`${ui.restLabel}, doe je ogen dicht en leg de telefoon terug.`);
  let left = REST_SECONDS;
  every(1000, () => {
    left--;
    const el = $('#restCount');
    if (el) el.textContent = left;
    if (left <= 0) nightNext();
  });
  $('#skip').addEventListener('click', nightNext);
}

function renderNightSleep() {
  // Geen knop: wie de app bedient speelt zelf mee en moet ook de ogen dicht
  // doen. De nacht begint daarom vanzelf na een korte aftelling.
  const SLEEP_SECONDS = 10;
  const meisje = game.players.find(p => p.alive && p.role === 'meisje');
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
  speak(`Nacht ${game.round}. Iedereen doet zijn ogen dicht en gaat slapen. De nacht begint vanzelf.`);
  let left = SLEEP_SECONDS;
  every(1000, () => {
    left--;
    const el = $('#restCount');
    if (el) el.textContent = left;
    if (left <= 0) nightNext();
  });
  $('#skip').addEventListener('click', nightNext);
}

function renderNightZiener() {
  const ziener = game.players.find(p => p.alive && p.role === 'ziener');
  if (!ui.stepStage) ui.stepStage = 'wake';

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · ziener`, true)}      <div class="center-stage night">
        <div class="big-emoji">🔮</div>
        <h2>Ziener, word wakker</h2>
        <p class="muted">Alleen de ziener doet nu de ogen open en pakt stilletjes de telefoon.</p>
        <button class="btn primary big" id="me">Ik ben de ziener 🔮</button>
      </div>
    `, 'theme-night');
    bindMenu();
    speakNagging('Ziener, word wakker. Pak stilletjes de telefoon.', [
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
        <h2>🔮 Wie wil je doorzien?</h2>
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
      <p class="muted">Onthoud dit goed — en verklap het niet te snel.</p>
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
    screen(`
      ${header(`Nacht ${game.round} · weerwolf`, true)}      <div class="center-stage night">
        <div class="big-emoji">🐺</div>
        <h2>${multi ? 'Weerwolven, word wakker' : 'Weerwolf, word wakker'}</h2>
        <p class="muted">${multi ? 'Alleen de weerwolven doen de ogen open.' : 'Alleen de weerwolf doet de ogen open.'}
        ${game.settings.deathMode === 'app' ? ' Pak stilletjes de telefoon.' : ''}</p>
        <button class="btn primary big" id="me">${multi ? 'Wij zijn wakker' : 'Ik ben wakker'} 🐺</button>
      </div>
    `, 'theme-night');
    bindMenu();
    const wolfWord = multi ? 'Weerwolven' : 'Weerwolf';
    speakNagging(`${wolfWord}, word wakker.`, [
      `${wolfWord}! Hallo ${wolfWord.toLowerCase()}! Word wakker.`,
      `${wolfWord}, word wakker!`,
      `Hé ${wolfWord.toLowerCase()}! Opstaan, het is jachttijd.`,
    ]);
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
      ${header('Weerwolf', true)}
      <div class="stack night">
        <h2>🎯 Wie val je vannacht aan?</h2>
        ${playerButtons(options)}
      </div>
    `, 'theme-night');
    bindMenu();
    bindPlayerButtons(id => { ui.wolfPick = id; ui.stepStage = 'confirm'; render(); });
    return;
  }
  const t = Engine.player(game, ui.wolfPick);
  screen(`
    ${header('Weerwolf', true)}
    <div class="center-stage night">
      <div class="big-emoji">🎯 ${av(t)}</div>
      <h2>Vannacht pak je<br><span class="danger">${av(t)} ${esc(t.name)}</span></h2>
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
  if (!ui.stepStage) ui.stepStage = 'wake';
  const appMode = game.settings.deathMode === 'app';
  const victim = appMode && game.night.wolfTarget != null ? Engine.player(game, game.night.wolfTarget) : null;

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · heks`, true)}      <div class="center-stage night">
        <div class="big-emoji">🧪</div>
        <h2>Heks, word wakker</h2>
        <p class="muted">Alleen de heks doet de ogen open en pakt stilletjes de telefoon.</p>
        <button class="btn primary big" id="me">Ik ben de heks 🧪</button>
      </div>
    `, 'theme-night');
    bindMenu();
    speakNagging('Heks, word wakker. Pak stilletjes de telefoon.', [
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
  const healAvail = !game.witch.healUsed;
  const poisonAvail = !game.witch.poisonUsed;
  const healed = game.night.witchHeal;
  const poisoned = game.night.witchPoisonTarget != null;
  screen(`
    ${header('Heks', true)}
    <div class="stack night">
      <div class="big-emoji center">🧪</div>
      ${appMode
        ? `<h2 class="center">Vannacht aangevallen:<br><span class="danger">${victim ? `${av(victim)} ${esc(victim.name)}` : 'niemand'}</span></h2>`
        : `<h2 class="center">Wil je een drankje gebruiken?</h2>
           <p class="muted center">Jij weet niet wie er is aangetikt — genezen werkt op het slachtoffer van vannacht, wie het ook is.</p>`}
      ${healed ? `<div class="pill ok">💚 Genees-drankje ingezet — het slachtoffer overleeft!</div>`
        : healAvail && (victim || !appMode) ? `<button class="btn" id="heal">💚 Gebruik genees-drankje ${victim ? `voor ${av(victim)} ${esc(victim.name)}` : ''}</button>`
        : `<div class="pill">💚 Genees-drankje is al gebruikt</div>`}
      ${poisoned ? `<div class="pill danger">☠️ Gif-drankje ingezet voor ${av(Engine.player(game, game.night.witchPoisonTarget))} ${esc(Engine.player(game, game.night.witchPoisonTarget).name)}</div>`
        : poisonAvail ? `<button class="btn" id="poison">☠️ Gebruik gif-drankje…</button>`
        : `<div class="pill">☠️ Gif-drankje is al gebruikt</div>`}
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
    screen(`
      ${header(`Nacht ${game.round}`, true)}
      <div class="center-stage">
        <div class="big-emoji">🌞</div>
        <h2>Iedereen ogen open!</h2>
        ${appMode
          ? `<p class="muted">De app telt zo af en onthult wat er vannacht is gebeurd…</p>
             <button class="btn primary big" id="go">🥁 Start het aftellen</button>`
          : `<p class="muted">Wie is er vannacht aangetikt?</p>
             <button class="btn primary big" id="go">Doorgeven wie is aangetikt</button>`}
      </div>
    `);
    bindMenu();
    speak('De zon komt op. Iedereen mag de ogen weer openen.');
    $('#go').addEventListener('click', () => {
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
  const causeText = { wolf: 'gepakt door de weerwolf', gif: 'vergiftigd door de heks ☠️', jager: 'meegenomen door de jager 🏹' };

  let lines = '';
  if (!deaths.length && !saved) lines = `<h2>😮‍💨 Niemand ging dood vannacht!</h2>`;
  if (saved) lines += `<div class="pill ok">💚 ${av(saved)} ${esc(saved.name)} werd aangevallen… maar de heks heeft ${esc(saved.name)} gered!</div>`;
  for (const d of deaths) {
    const r = Engine.ROLES[d.p.role];
    lines += `
      <div class="death">
        <div class="death-name">💀 ${av(d.p)} ${esc(d.p.name)}</div>
        <div class="death-role">${r.emoji} was ${r.naam} — ${causeText[d.cause]}</div>
      </div>`;
  }

  const texts = [];
  if (saved) texts.push(`${saved.name} werd gered door de heks.`);
  for (const d of deaths) texts.push(`${d.p.name} is dood. ${d.p.name} was ${Engine.ROLES[d.p.role].naam}.`);
  if (!deaths.length && !saved) texts.push('Niemand ging dood vannacht.');
  speak(texts.join(' '));

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
  $('#go').addEventListener('click', () => {
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
    if (!confirm(`Zeker weten? ${t.name} gaat mee met de jager.`)) return;
    Engine.hunterShoot(game, id); saveGame();
    const r = Engine.ROLES[t.role];
    ui = { shotResult: { name: t.name, avatar: av(t), role: r } };
    render();
  });
}

function renderShotResult() {
  const s = ui.shotResult;
  speak(`${s.name} is neergeschoten door de jager. ${s.name} was ${s.role.naam}.`);
  screen(`
    ${header('De jager schoot raak', true)}
    <div class="center-stage">
      <div class="death">
        <div class="death-name">💀 ${s.avatar || ''} ${esc(s.name)}</div>
        <div class="death-role">${s.role.emoji} was ${s.role.naam} — meegenomen door de jager 🏹</div>
      </div>
      <button class="btn primary big" id="go">Verder ☀️</button>
    </div>
  `);
  bindMenu();
  $('#go').addEventListener('click', () => { ui = {}; render(); });
}

/* ---------- dag ---------- */

function renderDay() {
  if (game.settings.guessing && !Engine.guessingDone(game) && ui.guessing) return renderGuessing();

  const alive = Engine.alive(game);
  const done = Engine.guessingDone(game);
  const s = game.settings;
  screen(`
    ${header(`Dag ${game.round}`, true)}
    <div class="stack">
      <div class="big-emoji center">☀️</div>
      <h2 class="center">Overleg maar eens goed…</h2>
      <p class="muted center">Wie deed er verdacht? Wie lachte er zo raar? Nog in leven:
      ${alive.map(p => `${av(p)} ${esc(p.name)}`).join(', ')}.</p>
      ${s.dayTimerSec ? `
        <button class="btn" id="timerBtn">⏱️ Start ${Math.round(s.dayTimerSec / 60)} min overleg-timer</button>
        <div class="timer-big" id="dayTimer"></div>` : ''}
      ${s.guessing ? (done
        ? `<div class="pill ok">🕵️ Iedereen heeft zijn gok gedaan 🤫</div>`
        : `<button class="btn primary big" id="guessBtn">🕵️ Start de gok-ronde <small>iedereen gokt in het geheim wie de wolf is</small></button>`)
        : ''}
      ${(!s.guessing || done) ? `<button class="btn primary big" id="nightBtn">🌙 Start nacht ${game.round + 1}</button>` : ''}
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
  const nightBtn = $('#nightBtn');
  if (nightBtn) nightBtn.addEventListener('click', () => {
    Engine.startNight(game); saveGame(); ui = {}; render();
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
  const options = Engine.alive(game).filter(p => p.id !== guesser.id);
  screen(`
    ${header(`Gok van ${esc(guesser.name)}`)}
    <div class="stack">
      <h2>🕵️ Wie denk jij dat de weerwolf is?</h2>
      <p class="muted">Je gok blijft geheim tot het einde van het spel.</p>
      ${playerButtons(options)}
    </div>
  `);
  bindPlayerButtons(id => {
    Engine.recordGuess(game, id); saveGame();
    ui.guessStage = 'pass';
    render();
  });
}

/* ---------- einde ---------- */

function renderEnd() {
  if (!ui.endStage) ui.endStage = game.statsRecorded ? 'reveal' : 'pre';

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
    speak('Het issss…');
    const boom = hard => {
      drumBoom(hard ? 0.7 : 0.5);
      const d = $('#drum');
      if (d) { d.classList.remove('hit'); void d.offsetWidth; d.classList.add('hit'); }
    };
    after(1500, () => {
      const l = $('#line'); if (l) l.textContent = 'Het is… het is…';
      speak('het issss…');
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
  speak(`${wolves.map(w => w.name).join(' en ')} ${wolves.length > 1 ? 'waren de weerwolven' : 'was de weerwolf'}. De ${wolvesWon ? 'weerwolven' : 'burgers'} winnen!`);

  screen(`
    ${header('De onthulling')}
    <div class="stack">
      <div class="reveal-banner ${wolvesWon ? 'wolves' : 'village'}">
        <div class="big-emoji">${wolvesWon ? '🐺' : '🎉'}</div>
        <h2>${wolves.map(w => `${av(w)} ${esc(w.name)}`).join(' en ')}<br>${wolves.length > 1 ? 'waren de weerwolven!' : 'was de weerwolf!'}</h2>
        <div class="pill ${wolvesWon ? 'danger' : 'ok'}">${wolvesWon ? '🐺 De weerwolven winnen!' : '🎉 De burgers winnen!'}</div>
      </div>

      <div class="section-label">Alle rollen</div>
      ${game.players.map(p => {
        const r = Engine.ROLES[p.role];
        return `<div class="listrow ${p.alive ? '' : 'dead'}">
          <span>${av(p)} ${esc(p.name)}</span>
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
      ${Engine.allSeen(game) ? '<button class="btn" id="mReview">🔎 Kaart terugkijken (noodknop)</button>' : ''}
      <button class="btn danger-btn" id="mQuit">❌ Spel afbreken</button>
      <button class="btn subtle" id="mClose">Sluiten</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  $('#mClose').addEventListener('click', close);
  $('#mRules').addEventListener('click', () => { close(); renderRules(render); });
  const mReview = $('#mReview');
  if (mReview) mReview.addEventListener('click', () => { close(); renderReview(); });
  $('#mQuit').addEventListener('click', () => {
    if (confirm('Spel afbreken? De rollen worden dan niet onthuld en er worden geen scores geteld.')) {
      close(); clearGame(); renderHome();
    }
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
  // startscherm of lopend spel
  if (confirm('Miniwolven afsluiten?')) {
    history.back();                                  // in een browser-tab: terug naar de vorige site
    setTimeout(() => window.close(), 250);           // in de geïnstalleerde app: proberen te sluiten
    setTimeout(() => armBackTrap(), 500);            // lukt sluiten niet, dan blijven we netjes staan
  } else {
    armBackTrap();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ mw: 0 }, '');
  armBackTrap();
  renderHome();
  tryHowl(); // ahoeoeee 🐺 (lukt dit nog niet van de browser, dan bij de eerste tik)
});
