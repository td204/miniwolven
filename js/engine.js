'use strict';

/**
 * Miniwolven spel-engine.
 *
 * Bewust volledig los van de DOM gehouden: alle spellogica leeft hier en werkt
 * op een serialiseerbaar state-object. Dat maakt hervatten (localStorage) en
 * fase 2 (state synchroniseren via websockets naar mee-spelende telefoons)
 * mogelijk zonder de regels te herschrijven.
 */

const ROLES = {
  wolf: {
    id: 'wolf', naam: 'Weerwolf', emoji: '🐺', team: 'wolven',
    kort: 'Jij bent de weerwolf. Verraad jezelf niet!',
    uitleg: 'Elke nacht kies jij in het geheim een slachtoffer. Overdag doe je alsof je een gewone burger bent. Jij wint als er nog maar één andere speler over is.',
  },
  burger: {
    id: 'burger', naam: 'Burger', emoji: '🧑‍🌾', team: 'burgers',
    kort: 'Jij bent een gewone burger.',
    uitleg: 'Je hebt geen speciale krachten, maar wel ogen en oren. Let overdag goed op wie er zenuwachtig lacht of raar kijkt, en gok wie de weerwolf is.',
  },
  ziener: {
    id: 'ziener', naam: 'Ziener', emoji: '🔮', team: 'burgers',
    kort: 'Jij mag elke nacht één speler doorzien.',
    uitleg: 'Elke nacht word je even wakker en wijs je één speler aan. De app vertelt jou (en alleen jou) of die speler de weerwolf is. Verklap niet te snel wat je weet — dan word jij het volgende slachtoffer!',
  },
  heks: {
    id: 'heks', naam: 'Heks', emoji: '🧪', team: 'burgers',
    kort: 'Jij hebt twee drankjes: genezen en vergif.',
    uitleg: 'Je hebt één genees-drankje (red het slachtoffer van de weerwolf) en één gif-drankje (laat zelf iemand doodgaan). Allebei mag je maar één keer per spel gebruiken. Kies je moment slim.',
  },
  meisje: {
    id: 'meisje', naam: 'Glurend meisje', emoji: '👧', team: 'burgers',
    kort: 'Jij mag stiekem gluren als de weerwolf wakker is.',
    uitleg: 'Als de weerwolf ’s nachts wakker wordt, mag jij je ogen op een héél klein kiertje doen om te gluren wie er beweegt. Maar pas op: word je betrapt, dan pakt de weerwolf jou! Dit doe je gewoon in het echt, niet in de app.',
  },
  jager: {
    id: 'jager', naam: 'Jager', emoji: '🏹', team: 'burgers',
    kort: 'Als jij doodgaat, neem je iemand mee.',
    uitleg: 'Ga jij dood — door de weerwolf of door vergif — dan mag je meteen nog één keer schieten: kies een speler die met jou meegaat. Kies wijs!',
  },
};

/** Volgorde waarin extra rollen worden toegevoegd bij automatische samenstelling. */
const AUTO_SPECIALS = ['ziener', 'heks', 'meisje', 'jager'];

const Engine = {

  ROLES,

  /** Aanbevolen samenstelling voor n spelers. */
  autoComposition(n) {
    const wolves = n >= 12 ? 3 : n >= 7 ? 2 : 1;
    const specialSlots = Math.min(AUTO_SPECIALS.length, Math.max(1, n - wolves - 1));
    const specials = AUTO_SPECIALS.slice(0, specialSlots);
    return { wolves, specials };
  },

  /** Controleer een (handmatige) samenstelling. Geeft een foutmelding of null. */
  validateComposition(n, wolves, specials) {
    if (n < 3) return 'Miniwolven speel je met minimaal 3 spelers.';
    if (wolves < 1) return 'Er moet minstens één weerwolf zijn.';
    if (wolves + specials.length > n) return 'Meer rollen dan spelers — haal een rol weg.';
    if (n - wolves < 2) return 'Er moeten minstens 2 niet-wolven zijn, anders is het spel meteen voorbij.';
    if (wolves > Math.floor((n - 1) / 2)) return 'Zoveel wolven is niet eerlijk: de wolven winnen dan bijna meteen.';
    return null;
  },

  /**
   * Start een nieuw spel.
   * cfg: { names:[..], wolves:int, specials:['ziener',..], settings:{...} }
   */
  newGame(cfg) {
    const roles = [];
    for (let i = 0; i < cfg.wolves; i++) roles.push('wolf');
    for (const s of cfg.specials) roles.push(s);
    while (roles.length < cfg.names.length) roles.push('burger');
    // Fisher-Yates
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const players = cfg.names.map((name, i) => ({
      id: i, name, role: roles[i], alive: true, seenCard: false,
      avatar: (cfg.avatars && cfg.avatars[i]) || '🙂',
      kleuter: !!(cfg.kleuters && cfg.kleuters[i]),
      hint: null, deathRound: null, deathCause: null,
    }));

    const g = {
      version: 1,
      startedAt: cfg.startedAt || null,
      settings: Object.assign({
        deathMode: 'app',      // 'app' = app onthult wie dood is | 'fysiek' = wolf tikt iemand aan
        voice: true,           // verteller-stem (spraak)
        hint: false,           // variatie: één speler krijgt een geheime hint
        guessing: true,        // gok-ronde in de app bijhouden
        dayTimerSec: 180,
      }, cfg.settings || {}),
      players,
      round: 0,
      phase: 'deal',           // deal → dealDone → night → hunter? → day → night ... → end
      deal: { index: 0 },
      night: null,
      witch: { healUsed: false, poisonUsed: false },
      lastNight: null,         // samenvatting van de afgelopen nacht voor de dag-fase
      guesses: [],             // {round, byId, suspectId}
      guessQueue: null,        // { ids:[..], index }
      hunterPending: null,     // speler-id van gestorven jager die nog mag schieten
      reviews: [],             // noodknop-gebruik: {playerId, round}
      winner: null,            // 'wolven' | 'burgers'
      log: [],
    };

    // Variatie: geheime hint voor één willekeurige niet-wolf.
    // Kleuters kunnen niet lezen, dus die krijgen nooit de hint.
    const hintPool = players.filter(p => p.role !== 'wolf' && !p.kleuter);
    if (g.settings.hint && hintPool.length) {
      const nonWolves = hintPool;
      const holder = nonWolves[Math.floor(Math.random() * nonWolves.length)];
      const wolf = players.filter(p => p.role === 'wolf')[Math.floor(Math.random() * cfg.wolves)];
      const decoys = players.filter(p => p.id !== holder.id && p.id !== wolf.id && p.role !== 'wolf');
      const decoy = decoys[Math.floor(Math.random() * decoys.length)];
      const pair = Math.random() < 0.5 ? [wolf, decoy] : [decoy, wolf];
      holder.hint = `Psst… geheime hint, alleen voor jou: de weerwolf is ${pair[0].name} of ${pair[1].name}. Verklap dit niet zomaar!`;
    }
    return g;
  },

  alive(g) { return g.players.filter(p => p.alive); },
  aliveWolves(g) { return g.players.filter(p => p.alive && p.role === 'wolf'); },
  wolves(g) { return g.players.filter(p => p.role === 'wolf'); },
  player(g, id) { return g.players.find(p => p.id === id); },
  fellowWolves(g, id) { return g.players.filter(p => p.role === 'wolf' && p.id !== id); },

  /* ---------- kaarten delen ---------- */

  currentDealPlayer(g) { return g.players[g.deal.index]; },

  confirmCardSeen(g) {
    g.players[g.deal.index].seenCard = true;
    if (g.deal.index + 1 < g.players.length) {
      g.deal.index++;
    } else {
      g.phase = 'dealDone';
    }
  },

  allSeen(g) { return g.players.every(p => p.seenCard); },

  noteReview(g, playerId) {
    g.reviews.push({ playerId, round: g.round });
  },

  /* ---------- nacht ---------- */

  startNight(g) {
    g.round++;
    const steps = ['sleep'];
    if (g.players.some(p => p.alive && p.role === 'ziener')) steps.push('ziener');
    steps.push('wolf');
    const heks = g.players.find(p => p.alive && p.role === 'heks');
    if (heks && (!g.witch.healUsed || !g.witch.poisonUsed)) steps.push('heks');
    steps.push('wake');
    g.night = {
      steps, stepIndex: 0,
      wolfTarget: null, seerChecked: null,
      witchHeal: false, witchPoisonTarget: null,
      resolved: false,
    };
    g.phase = 'night';
  },

  nightStep(g) { return g.night.steps[g.night.stepIndex]; },

  nextNightStep(g) {
    if (g.night.stepIndex + 1 < g.night.steps.length) g.night.stepIndex++;
  },

  seerPick(g, targetId) {
    g.night.seerChecked = targetId;
    return this.player(g, targetId).role === 'wolf';
  },

  wolfPick(g, targetId) { g.night.wolfTarget = targetId; },

  witchHeal(g) { g.night.witchHeal = true; g.witch.healUsed = true; },
  witchPoison(g, targetId) { g.night.witchPoisonTarget = targetId; g.witch.poisonUsed = true; },

  /**
   * Verwerk de nacht tot doden. In fysieke modus geeft de host het aangetikte
   * slachtoffer door via physicalVictimId (of null voor niemand).
   */
  resolveNight(g, physicalVictimId) {
    const n = g.night;
    const target = g.settings.deathMode === 'app'
      ? n.wolfTarget
      : (physicalVictimId != null ? physicalVictimId : null);

    const deaths = [];
    let saved = null;
    if (target != null) {
      if (n.witchHeal) saved = target;
      else deaths.push({ id: target, cause: 'wolf' });
    }
    if (n.witchPoisonTarget != null && !deaths.some(d => d.id === n.witchPoisonTarget)) {
      deaths.push({ id: n.witchPoisonTarget, cause: 'gif' });
    }
    for (const d of deaths) this._kill(g, d.id, d.cause);
    n.resolved = true;
    g.lastNight = { round: g.round, deaths, saved };
    g.log.push({ round: g.round, deaths: deaths.map(d => d.id), saved });

    // Een gestorven jager mag eerst nog schieten voor we winst bepalen.
    const deadHunter = deaths.map(d => this.player(g, d.id)).find(p => p.role === 'jager');
    if (deadHunter) { g.hunterPending = deadHunter.id; return; }
    this._afterDeaths(g);
  },

  _kill(g, id, cause) {
    const p = this.player(g, id);
    if (!p || !p.alive) return;
    p.alive = false; p.deathRound = g.round; p.deathCause = cause;
  },

  hunterShoot(g, targetId) {
    this._kill(g, targetId, 'jager');
    if (g.lastNight) g.lastNight.deaths.push({ id: targetId, cause: 'jager' });
    g.hunterPending = null;
    this._afterDeaths(g);
  },

  _afterDeaths(g) {
    if (this.checkEnd(g)) return;
    g.phase = 'day';
    if (g.settings.guessing) this._buildGuessQueue(g);
  },

  checkEnd(g) {
    const wolves = this.aliveWolves(g).length;
    const others = this.alive(g).length - wolves;
    if (wolves === 0) { g.winner = 'burgers'; g.phase = 'end'; return true; }
    if (wolves >= others) { g.winner = 'wolven'; g.phase = 'end'; return true; }
    return false;
  },

  /* ---------- dag: gok-ronde ---------- */

  _buildGuessQueue(g) {
    // Levende spelers gokken altijd mee. Dode spelers alleen in app-modus:
    // daar weet een dode niet wie hem 'aangeraakt' heeft.
    const ids = g.players
      .filter(p => p.alive || g.settings.deathMode === 'app')
      .map(p => p.id);
    g.guessQueue = { ids, index: 0 };
  },

  currentGuesser(g) {
    const q = g.guessQueue;
    if (!q || q.index >= q.ids.length) return null;
    return this.player(g, q.ids[q.index]);
  },

  recordGuess(g, suspectId) {
    const p = this.currentGuesser(g);
    g.guesses.push({ round: g.round, byId: p.id, suspectId });
    g.guessQueue.index++;
  },

  guessingDone(g) {
    return !g.settings.guessing || !g.guessQueue || g.guessQueue.index >= g.guessQueue.ids.length;
  },

  /* ---------- einde & scores ---------- */

  /** Speurneus-scores: goede gokken per speler (wolven gokken mee als bluf, telt niet). */
  scores(g) {
    const wolfIds = new Set(this.wolves(g).map(p => p.id));
    const perPlayer = g.players.map(p => ({
      id: p.id, name: p.name, isWolf: wolfIds.has(p.id),
      right: 0, total: 0,
    }));
    for (const guess of g.guesses) {
      if (wolfIds.has(guess.byId)) continue;
      const row = perPlayer.find(r => r.id === guess.byId);
      row.total++;
      if (wolfIds.has(guess.suspectId)) row.right++;
    }
    return perPlayer;
  },
};

// Voor eventueel hergebruik in Node (tests / fase 2-server).
if (typeof module !== 'undefined') module.exports = { Engine, ROLES };
