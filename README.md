# 🐺 Miniwolven

Weerwolven voor thuis — ook met 3 of 4 spelers. Eén telefoon wordt doorgegeven; de
app deelt de kaarten, begeleidt de nachten met een verteller-stem, telt af wie er
dood is en doet aan het einde de grote onthulling. Gemaakt als installeerbare PWA:
werkt offline, alles wordt lokaal op het toestel bewaard.

## Spelen

**Direct proberen:** open `index.html` in een browser (alles werkt, alleen
offline-cache en installeren niet — daar is HTTPS voor nodig).

**Echt hosten (aanbevolen): GitHub Pages aanzetten** — eenmalig, twee klikken:

1. Ga op GitHub naar deze repository → **Settings** → **Pages**;
2. Onder *Build and deployment* kies je **Source: Deploy from a branch**, daaronder
   de branch `claude/miniwolven-pwa-app-j0cbm4` (of `main` na een merge) met map
   **/ (root)**, en klik **Save**.

Na een minuut staat de app op **https://td204.github.io/miniwolven/** en wordt hij
bij elke push automatisch opnieuw gepubliceerd. Open die URL op je telefoon en kies
*"Zet op beginscherm"* (Android/Chrome) of *Deel → Zet op beginscherm* (iPhone) —
Miniwolven gedraagt zich dan als een echte app, ook offline.

**Lokaal ontwikkelen:**

```bash
npx serve .        # of: python3 -m http.server
```

## Wat zit erin

- 3–12 spelers, namen met snel-kies-chips en "verder in vorige samenstelling";
- rollen: weerwolf, burger, ziener, heks, glurend meisje, jager — automatisch
  voorgesteld, handmatig aanpasbaar;
- kaarten delen met houd-vast-om-te-kijken (niemand kan spieken) + noodknop met
  3-seconden-drempel voor wie z'n rol écht vergeten is;
- nachtfase met verteller-stem (nl-NL), keuze: app onthult het slachtoffer met
  5-4-3-2-1-aftelling, óf de wolf tikt in het echt iemand aan;
- gok-ronde per dag (geheim, in de app) met 🏆 speurneus-scores bij de onthulling;
- statistieken per speler over alle spellen heen; spel hervatten na herladen.

Zie [`SPEC.md`](SPEC.md) voor de volledige specificatie, de spelregels en het
ontwerp van fase 2 (multiplayer via websockets).

## Ontwikkeling

Geen build-stap, geen dependencies. `js/engine.js` bevat alle spelregels als pure
module (ook laadbaar in Node), `js/app.js` de schermen. Iconen opnieuw genereren:

```bash
node tools/make-icons.mjs
```

---

Gemaakt voor huiskamer-avonden vol wantrouwen. 🐺🌕
