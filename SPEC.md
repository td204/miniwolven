# Miniwolven — specificatie & bouwprompt

> Dit document is tegelijk de **specificatie** van de app in deze repository én een
> **herbruikbare prompt**: upload dit bestand bij Claude (of een andere AI-assistent)
> als je de app wilt uitbreiden of opnieuw wilt laten bouwen, en beschrijf daarnaast
> wat er anders moet.

## 1. Het concept

Miniwolven is een digitale spelleider voor het kaartspel *Weerwolven*, gemaakt voor
gezinnen: het klassieke spel vraagt om ±8 spelers en een aparte spelleider, maar
Miniwolven maakt het speelbaar met **3 tot 12 spelers zonder spelleider**. Eén
telefoon ligt op tafel en wordt doorgegeven; de app deelt de kaarten, praat het spel
aan elkaar (letterlijk, met een verteller-stem), begeleidt de nachten en dagen, en
doet aan het einde de grote onthulling.

De app is een **PWA** (installeerbaar via "Zet op beginscherm"), draait volledig
offline en bewaart alles lokaal op het toestel (geen account, geen server).

## 2. De rollen

| Rol | Team | Wat doet die? |
|---|---|---|
| 🐺 Weerwolf | wolven | Kiest elke nacht een slachtoffer. Bij meerdere wolven jagen ze samen en kennen ze elkaar. |
| 🧑‍🌾 Burger | burgers | Geen krachten; let overdag op en gokt mee. |
| 🔮 Ziener | burgers | Mag elke nacht één speler "doorzien": de app vertelt of die de wolf is. |
| 🧪 Heks | burgers | Eén genees-drankje (redt het slachtoffer van die nacht) en één gif-drankje (doodt zelf iemand), elk éénmalig. |
| 👧 Glurend meisje | burgers | Mag in het echt gluren (ogen op een kiertje) terwijl de wolf wakker is; wordt ze betrapt, dan pakt de wolf haar. Geen app-actie — de app legt de rol uit en herinnert eraan. |
| 🏹 Jager | burgers | Gaat de jager dood, dan schiet die direct nog één speler mee het graf in (via de app). |

**Automatische samenstelling** (altijd handmatig aanpasbaar): 1 wolf t/m 6 spelers,
2 wolven vanaf 7, 3 vanaf 12. Speciale rollen worden in deze volgorde toegevoegd
zolang er spelers over zijn: ziener → heks → glurend meisje → jager; de rest wordt
burger. Validatie: minstens 1 wolf, minstens 2 niet-wolven, wolven < helft van de groep.

## 3. Spelverloop (één telefoon, doorgeven)

1. **Setup** — aantal spelers (3–12), namen invullen. Elke speler kiest een **avatar**
   (👨 👩 👦 👧 👴 👵 🐺 🐱 🐶 🐰 🦊 🐻 🦁 🐸 🦄 🐷) die overal in het spel terugkomt:
   bij het doorgeven, op de aanwijs-tegels van wolf/heks/ziener, bij het gokken en in
   de onthulling. Per speler is er een **kleuter-modus** (🧒) voor kinderen die nog
   niet kunnen lezen: hun rolkaart is dan één groot plaatje met minimale tekst, en
   spelers aanwijzen doen ze via de avatar-tegels. Bekende spelers verschijnen als
   tik-chips (avatar en kleuter-instelling onthouden); eerdere samenstellingen
   ("Papa, Mama, Fien, Ties") zijn met één tik te herladen. Daarna rollen en opties
   kiezen.
2. **Kaarten delen** — per speler: "Geef de telefoon aan …" → speler bevestigt →
   **houd-vast-om-te-kijken**: de kaart is alleen zichtbaar zolang de speler de kaart
   ingedrukt houdt (loslaten = weer verborgen, niemand kan meegluren) → "Gezien —
   doorgeven". Daarna is de kaart definitief op slot: terugbladeren kan niet.
3. **Noodknop** — echt vergeten? In het menu zit "Kaart terugkijken". Bewust
   drempelig: kan pas als álle kaarten gedeeld zijn, de juiste speler moet de knop
   **3 seconden ingedrukt houden**, en het gebruik wordt genoteerd en bij de
   onthulling getoond ("🔎 Noodknop gebruikt: …"). Zo is spieken onaantrekkelijk maar
   een blackout geen ramp.
4. **Nacht** (met optionele nacht-timer en verteller-stem):
   - "Iedereen ogen dicht" (+ herinnering voor het glurend meisje);
   - 🔮 ziener wordt wakker, kiest op de telefoon iemand om te doorzien;
   - 🐺 wolf wordt wakker en kiest het slachtoffer — **afhankelijk van de instelling**:
     - *App onthult*: de wolf tikt het slachtoffer aan **in de app**;
     - *Fysiek aantikken*: de wolf staat zachtjes op en tikt het slachtoffer in het
       echt aan (geeft de leukste chaos);
   - 🧪 heks wordt wakker; in app-modus ziet ze wie is aangevallen en kan genezen
     en/of vergiftigen; in fysieke modus zet ze haar drankjes "blind" in;
   - "Iedereen ogen open!" — in app-modus telt de app af **5-4-3-2-1** (met stem) en
     onthult wie er dood is (mét rol); in fysieke modus vraagt de app wie er is
     aangetikt en verwerkt dan heks-effecten ("…maar de heks heeft je gered!").
5. **Dag** — overleg (optionele overleg-timer), daarna de **gok-ronde**: de telefoon
   gaat rond en iedereen kiest in het geheim wie die denkt dat de wolf is. Gokken
   blijven geheim tot het einde. Wie gokt mee: alle levenden (de wolf bluft mee, telt
   niet voor de score); doden gokken alleen mee in app-modus — in fysieke modus weet
   de aangetikte te veel.
6. **Herhaal** nacht + dag tot een team wint: burgers winnen zodra alle wolven dood
   zijn (heks-gif of jager!), wolven winnen zodra ze niet meer in de minderheid zijn
   (bij 1 wolf: nog maar 2 spelers over).
7. **De onthulling** — tromgeroffel, aftellen, dan: wie de wolf was, wie er won, alle
   rollen, en de 🏆 **speurneus-scores** (wie gokte het vaakst goed).

## 4. Opties per spel

- 📱 **App onthult** of 👆 **fysiek aantikken** (zie boven) — dé huisregel-keuze.
- 🗣️ **Verteller-stem**: de app spreekt de nachtinstructies en onthullingen uit
  (Web Speech API, nl-NL).
- 🕵️ **Gok-ronde in de app** aan/uit (uit = gewoon hardop overleggen).
- 🤫 **Geheime hint** (variatie): één willekeurige niet-wolf krijgt op de rolkaart een
  hint: "de weerwolf is X of Y". Speelt er een kleuter mee, dan staat deze optie
  automatisch uit (een hint die je niet kunt lezen heeft geen zin, en voorlezen kan
  niet — de hint is geheim).
- ☀️ **Overleg-timer** overdag (uit/2/3/5 min). Een aparte nacht-timer is er bewust
  niet: de nacht loopt vanzelf (automatische start-aftelling, herhaalde
  wakker-word-oproepen, stille rustpauzes).

## 5. Opgeslagen gegevens (localStorage)

- `mw_game` — het lopende spel (hervatten na herladen/appwissel);
- `mw_stats` — per speler: gespeeld, gewonnen, x wolf, gokken goed/totaal;
- `mw_groups` — laatste 8 samenstellingen;
- `mw_prefs` — laatst gebruikte opties.

## 6. Techniek (fase 1 — dit is gebouwd)

- **Puur statisch**: HTML + CSS + vanilla JS, geen build-stap, geen dependencies.
  - `js/engine.js` — alle spelregels als pure, DOM-vrije module op een
    serialiseerbaar state-object (ook laadbaar in Node, zie tests);
  - `js/app.js` — schermen, opslag, stem en timers;
  - `sw.js` + `manifest.webmanifest` + `icons/` — PWA/offline.
- **Hosting**: elke statische host werkt (GitHub Pages is gratis en genoeg). HTTPS is
  nodig voor installatie + service worker; direct `index.html` openen werkt ook, maar
  dan zonder offline-cache. **Een eigen webserver/database is voor fase 1 dus niet
  nodig** — alles staat op het toestel zelf.
- **Naar een "echte" app**: dankzij nul dependencies is de stap naar Capacitor klein
  (`npx cap add android/ios` om dezelfde code als store-app te verpakken).

## 7. Fase 2 — multiplayer via websockets (ontwerp, nog niet gebouwd)

Doel: spelers die dat willen zien hun kaart en nachtacties op hun **eigen telefoon**;
wie niet mee wil doen met een telefoon, speelt gewoon via het host-toestel mee
(hybride, per speler te kiezen).

- **Model**: de host maakt een spel en krijgt een **spelcode** (bijv. 5 letters).
  Gasten voeren de code in en koppelen aan de sessie. De host is *authoritative*: de
  engine draait alleen daar; gasten sturen acties (`seerPick`, `wolfPick`, `guess`) en
  ontvangen elk een **gefilterde view** van de state (je krijgt alleen wat jouw rol
  mag weten — nooit de hele state naar iedereen sturen).
- De engine is hier al op voorbereid: state is serialiseerbaar en alle regels zitten
  in pure functies zonder DOM.
- **Serverkeuze** (dit is het moment waarop wél een servertje nodig is):
  1. *Klein Node-servertje met `ws`* — een kamer per spelcode, berichten doorsturen;
     ±100 regels code, te draaien op een gratis tier (Fly.io/Railway/VPS);
  2. *Managed realtime* (Supabase Realtime, PartyKit, Ably) — geen eigen server
     beheren, wel een externe dienst;
  3. *WebRTC/PeerJS* — peer-to-peer zonder eigen server, maar de publieke
     signaling-broker is een afhankelijkheid en NAT kan tegenwerken.
  Aanbeveling: optie 1 of 2; de app zelf blijft statisch gehost.
- **Robuustheid**: gasten mogen wegvallen (host kan elke rol overnemen op het
  host-toestel), reconnect via spelcode + spelernaam.

## 8. Ideeën voor latere variaties ("wie is de mol"-sfeer)

- **Eindquiz**: naast "wie is de wolf" extra vragen (heeft de wolf vannacht X
  gekozen? wie was de ziener?) — meeste antwoorden goed wint;
- **Dagstemming (klassiek)**: optioneel iemand wegstemmen na het overleg;
- **Fluister-opdrachten**: elke ronde krijgt één speler een mini-opdracht ("gebruik
  het woord 'volle maan' in het gesprek") — wie opdrachten spot, krijgt punten;
- **Dubbelrol**: één burger denkt dat die burger is, maar blijkt halverwege iets
  anders;
- **Seizoensthema's**: andere geluiden/kleuren (herfst, Halloween, kerstwolf).

## 9. Regels die de app aan nieuwe spelers uitlegt

Elke rolkaart legt de eigen rol in twee zinnen uit; het spelregels-scherm (📖, ook
tijdens het spel via het menu) beschrijft het hele verloop plus tips: muziek aan
tijdens de nacht (dan hoor je geen beweging), telefoon met het scherm naar beneden
doorgeven, en de huisregel-uitleg van fysiek aantikken.
