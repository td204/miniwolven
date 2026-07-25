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

function saveGame() { if (game) Store.set(KEYS.game, game); }
function clearGame() { game = null; Store.del(KEYS.game); }

function knownPlayers() {
  const stats = Store.get(KEYS.stats, {});
  return Object.values(stats).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).map(s => s.name);
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
}

function roleCardHTML(p, g) {
  const r = Engine.ROLES[p.role];
  let extra = '';
  if (p.role === 'wolf') {
    const mates = Engine.fellowWolves(g, p.id);
    if (mates.length) extra += `<p class="card-extra">🐺 Je mede-wolf: <b>${esc(mates.map(m => m.name).join(' en '))}</b>. Jullie jagen samen.</p>`;
  }
  if (p.hint) extra += `<p class="card-hint">🤫 ${esc(p.hint)}</p>`;
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
}

function playerButtons(players, onPick, cls = '') {
  return players.map(p =>
    `<button class="btn player-pick ${cls}" data-id="${p.id}">${esc(p.name)}</button>`).join('');
}
function bindPlayerButtons(onPick) {
  $$('.player-pick').forEach(b => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
}

function header(title, showMenu) {
  return `
    <header class="topbar">
      <span class="topbar-title">${title}</span>
      ${showMenu ? '<button class="topbar-menu" id="menuBtn" aria-label="Menu">⋮</button>' : ''}
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

/* =========================================================================
 * SCHERMEN
 * ========================================================================= */

/* ---------- home ---------- */

function renderHome() {
  ui = {};
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
        <button class="btn primary big" id="resumeBtn">▶️ Hervat spel <small>ronde ${game.round || 1} · ${game.players.map(p => esc(p.name)).join(', ')}</small></button>
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
    </div>
    <p class="footer-note">Tip: installeer Miniwolven via ‘Zet op beginscherm’ in je browser.</p>
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
}

/* ---------- setup: spelers ---------- */

function startSetup(names) {
  const prefs = Store.get(KEYS.prefs, {});
  setup = {
    names: names ? names.slice() : ['', '', '', ''],
    settings: Object.assign({
      deathMode: 'app', voice: true, hint: false, guessing: true,
      nightTimerSec: 0, dayTimerSec: 180,
    }, prefs.settings || {}),
    wolves: null, specials: null, // null = automatisch
  };
  renderSetupPlayers();
}

function renderSetupPlayers() {
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
          <input class="input name-input" data-i="${i}" value="${esc(nm)}"
                 placeholder="Naam speler ${i + 1}" autocomplete="off" enterkeyhint="next">`).join('')}
      </div>
      ${known.length ? `
        <div class="section-label">Bekende spelers — tik om in te vullen</div>
        <div class="chips">${known.slice(0, 12).map(nm => `<button class="chip" data-name="${esc(nm)}">${esc(nm)}</button>`).join('')}</div>` : ''}
      <div id="setupError" class="error"></div>
      <button class="btn primary big" id="next">Verder → rollen kiezen</button>
      <button class="btn subtle" id="back">← Terug</button>
    </div>
  `);
  const readNames = () => { $$('.name-input').forEach(inp => setup.names[Number(inp.dataset.i)] = inp.value); };
  $('#minus').addEventListener('click', () => { readNames(); if (setup.names.length > 3) { setup.names.pop(); renderSetupPlayers(); } });
  $('#plus').addEventListener('click', () => { readNames(); if (setup.names.length < 12) { setup.names.push(''); renderSetupPlayers(); } });
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    readNames();
    const name = c.dataset.name;
    if (setup.names.some(x => x.trim().toLowerCase() === name.toLowerCase())) return;
    const empty = setup.names.findIndex(x => !x.trim());
    if (empty >= 0) setup.names[empty] = name; else return;
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

/* ---------- setup: rollen & opties ---------- */

function renderSetupRoles() {
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
      <label class="opt"><input type="checkbox" id="optHint" ${s.hint ? 'checked' : ''}> 🤫 Variatie: één speler krijgt een geheime hint</label>
      <label class="opt">⏱️ Nacht-timer
        <select id="optNightTimer" class="select">
          ${[0, 30, 60, 90].map(v => `<option value="${v}" ${s.nightTimerSec === v ? 'selected' : ''}>${v === 0 ? 'uit' : v + ' sec'}</option>`).join('')}
        </select></label>
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
  $('#optHint').addEventListener('change', e => s.hint = e.target.checked);
  $('#optNightTimer').addEventListener('change', e => s.nightTimerSec = Number(e.target.value));
  $('#optDayTimer').addEventListener('change', e => s.dayTimerSec = Number(e.target.value));
  $('#deal').addEventListener('click', () => {
    Store.set(KEYS.prefs, { settings: s });
    rememberGroup(setup.names);
    game = Engine.newGame({
      names: setup.names, wolves: setup.wolves, specials: setup.specials,
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
        <div class="big-emoji">📵</div>
        <h2>Geef de telefoon aan<br><span class="accent">${esc(p.name)}</span></h2>
        <p class="muted">Niemand anders mag meekijken.</p>
        <button class="btn primary big" id="me">Ik ben ${esc(p.name)} ✋</button>
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

function nightTimerChip() {
  return game.settings.nightTimerSec ? `<div class="timer-chip" id="nightTimer"></div>` : '';
}
function startNightTimerChip() {
  if (!game.settings.nightTimerSec) return;
  if (ui.nightDeadline == null) ui.nightDeadline = Date.now() + game.settings.nightTimerSec * 1000;
  const el = $('#nightTimer');
  if (!el) return;
  const tick = () => {
    const left = Math.max(0, Math.ceil((ui.nightDeadline - Date.now()) / 1000));
    el.textContent = `⏱️ ${left}s`;
    if (left === 0 && !ui.nightTimeUp) { ui.nightTimeUp = true; beep(440, 0.4); el.classList.add('over'); }
  };
  tick(); every(500, tick);
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
  const meisje = game.players.find(p => p.alive && p.role === 'meisje');
  screen(`
    ${header(`Nacht ${game.round}`, true)} ${nightTimerChip()}
    <div class="center-stage night">
      <div class="big-emoji">🌙</div>
      <h2>Iedereen ogen dicht!</h2>
      <p class="muted">Leg de telefoon in het midden van de tafel.</p>
      ${meisje ? `<p class="callout">👧 Glurend meisje: straks, als de weerwolf wakker is, mag jij héél voorzichtig gluren. Op eigen risico!</p>` : ''}
      <button class="btn primary big" id="go">Iedereen slaapt → verder</button>
    </div>
  `, 'theme-night');
  bindMenu(); startNightTimerChip();
  speak(`Nacht ${game.round}. Iedereen doet zijn ogen dicht en gaat slapen.`);
  $('#go').addEventListener('click', nightNext);
}

function renderNightZiener() {
  const ziener = game.players.find(p => p.alive && p.role === 'ziener');
  if (!ui.stepStage) ui.stepStage = 'wake';

  if (ui.stepStage === 'wake') {
    screen(`
      ${header(`Nacht ${game.round} · ziener`, true)} ${nightTimerChip()}
      <div class="center-stage night">
        <div class="big-emoji">🔮</div>
        <h2>Ziener, word wakker</h2>
        <p class="muted">Alleen de ziener doet nu de ogen open en pakt stilletjes de telefoon.</p>
        <button class="btn primary big" id="me">Ik ben de ziener 🔮</button>
      </div>
    `, 'theme-night');
    bindMenu(); startNightTimerChip();
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
      <div class="big-emoji">${ui.seerResult.isWolf ? '🐺' : '✅'}</div>
      <h2>${esc(t.name)} is ${ui.seerResult.isWolf ? '<span class="danger">de WEERWOLF!</span>' : 'géén weerwolf'}</h2>
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
      ${header(`Nacht ${game.round} · weerwolf`, true)} ${nightTimerChip()}
      <div class="center-stage night">
        <div class="big-emoji">🐺</div>
        <h2>${multi ? 'Weerwolven, word wakker' : 'Weerwolf, word wakker'}</h2>
        <p class="muted">${multi ? 'Alleen de weerwolven doen de ogen open.' : 'Alleen de weerwolf doet de ogen open.'}
        ${game.settings.deathMode === 'app' ? ' Pak stilletjes de telefoon.' : ''}</p>
        <button class="btn primary big" id="me">${multi ? 'Wij zijn wakker' : 'Ik ben wakker'} 🐺</button>
      </div>
    `, 'theme-night');
    bindMenu(); startNightTimerChip();
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
      <div class="big-emoji">🎯</div>
      <h2>Vannacht pak je<br><span class="danger">${esc(t.name)}</span></h2>
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
      ${header(`Nacht ${game.round} · heks`, true)} ${nightTimerChip()}
      <div class="center-stage night">
        <div class="big-emoji">🧪</div>
        <h2>Heks, word wakker</h2>
        <p class="muted">Alleen de heks doet de ogen open en pakt stilletjes de telefoon.</p>
        <button class="btn primary big" id="me">Ik ben de heks 🧪</button>
      </div>
    `, 'theme-night');
    bindMenu(); startNightTimerChip();
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
        ? `<h2 class="center">Vannacht aangevallen:<br><span class="danger">${victim ? esc(victim.name) : 'niemand'}</span></h2>`
        : `<h2 class="center">Wil je een drankje gebruiken?</h2>
           <p class="muted center">Jij weet niet wie er is aangetikt — genezen werkt op het slachtoffer van vannacht, wie het ook is.</p>`}
      ${healed ? `<div class="pill ok">💚 Genees-drankje ingezet — het slachtoffer overleeft!</div>`
        : healAvail && (victim || !appMode) ? `<button class="btn" id="heal">💚 Gebruik genees-drankje ${victim ? `voor ${esc(victim.name)}` : ''}</button>`
        : `<div class="pill">💚 Genees-drankje is al gebruikt</div>`}
      ${poisoned ? `<div class="pill danger">☠️ Gif-drankje ingezet voor ${esc(Engine.player(game, game.night.witchPoisonTarget).name)}</div>`
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
  if (saved) lines += `<div class="pill ok">💚 ${esc(saved.name)} werd aangevallen… maar de heks heeft ${esc(saved.name)} gered!</div>`;
  for (const d of deaths) {
    const r = Engine.ROLES[d.p.role];
    lines += `
      <div class="death">
        <div class="death-name">💀 ${esc(d.p.name)}</div>
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
      <h2 class="center">${esc(hunter.name)}, wie neem je mee?</h2>
      ${playerButtons(Engine.alive(game))}
    </div>
  `);
  bindMenu();
  bindPlayerButtons(id => {
    const t = Engine.player(game, id);
    if (!confirm(`Zeker weten? ${t.name} gaat mee met de jager.`)) return;
    Engine.hunterShoot(game, id); saveGame();
    const r = Engine.ROLES[t.role];
    ui = { shotResult: { name: t.name, role: r } };
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
        <div class="death-name">💀 ${esc(s.name)}</div>
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
      ${alive.map(p => esc(p.name)).join(', ')}.</p>
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
        <div class="big-emoji">🤫</div>
        <h2>Geef de telefoon aan<br><span class="accent">${esc(guesser.name)}</span></h2>
        <p class="muted">Niemand mag meekijken met de gok.</p>
        <button class="btn primary big" id="me">Ik ben ${esc(guesser.name)} ✋</button>
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
    $('#reveal').addEventListener('click', () => { ui.endStage = 'count'; ui.count = 5; render(); });
    return;
  }
  if (ui.endStage === 'count') {
    screen(`<div class="center-stage countdown"><div class="count-num">${ui.count}</div></div>`, 'theme-night');
    speak(String(ui.count));
    beep(520 + ui.count * 40, 0.12);
    after(1000, () => {
      ui.count--;
      if (ui.count > 0) render();
      else { ui.endStage = 'reveal'; render(); }
    });
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
        <h2>${wolves.map(w => esc(w.name)).join(' en ')}<br>${wolves.length > 1 ? 'waren de weerwolven!' : 'was de weerwolf!'}</h2>
        <div class="pill ${wolvesWon ? 'danger' : 'ok'}">${wolvesWon ? '🐺 De weerwolven winnen!' : '🎉 De burgers winnen!'}</div>
      </div>

      <div class="section-label">Alle rollen</div>
      ${game.players.map(p => {
        const r = Engine.ROLES[p.role];
        return `<div class="listrow ${p.alive ? '' : 'dead'}">
          <span>${r.emoji} ${esc(p.name)}</span>
          <span class="muted">${r.naam}${p.alive ? '' : ' · 💀'}</span></div>`;
      }).join('')}

      ${game.settings.guessing ? `
        <div class="section-label">Speurneus-scores 🕵️</div>
        ${scores.map(r => `
          <div class="listrow">
            <span>${esc(r.name)}${best.some(b => b.id === r.id) ? ' 🏆' : ''}</span>
            <span class="muted">${r.isWolf ? '🐺 was de wolf' : `${r.right} van ${r.total} goed`}</span>
          </div>`).join('')}` : ''}

      ${game.reviews.length ? `<p class="muted center">🔎 Noodknop gebruikt: ${game.reviews.map(rv => esc(Engine.player(game, rv.playerId).name)).join(', ')} 😉</p>` : ''}

      <button class="btn primary big" id="again">🔁 Opnieuw met dezelfde groep</button>
      <button class="btn" id="home">🏠 Naar het beginscherm</button>
    </div>
  `);
  $('#again').addEventListener('click', () => {
    const names = game.players.map(p => p.name);
    const settings = game.settings;
    clearGame();
    setup = { names, settings: Object.assign({}, settings), wolves: null, specials: null };
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
  $('#back').addEventListener('click', () => { ui.reviewStage = null; ui.reviewId = null; render(); });
}

/* ---------- statistieken & regels ---------- */

function renderStats() {
  const stats = Object.values(Store.get(KEYS.stats, {}))
    .sort((a, b) => b.games - a.games);
  screen(`
    ${header('Statistieken 📊')}
    <div class="stack">
      ${stats.length ? stats.map(s => `
        <div class="statcard">
          <div class="statcard-name">${esc(s.name)}</div>
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

function renderRules(backFn) {
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

document.addEventListener('DOMContentLoaded', renderHome);
