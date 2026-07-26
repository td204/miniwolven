# Het spelscenario — van openen tot onthulling

Miniwolven is een digitale spelleider voor Weerwolven met 3–12 spelers rond één
telefoon. Dit document beschrijft het complete verloop: elke fase, elk scherm,
de gesproken teksten, de timing en het geluid. Het spel is een state-machine;
de fasen hieronder zijn de states.

```
home → setup spelers → setup rollen & opties → kaarten delen → kaarten klaar
     → [ nacht → (jager?) → ochtend → dag → gok-ronde ]*  → einde/onthulling
```

## 0. Openen van de app

- Wolvengehuil (echte opname, mp3, zacht met fade) + het startscherm met maan-
  animatie. Het gehuil klinkt **alleen op het startscherm** en alleen als
  geluidseffecten aanstaan (standaard uit). Browsers staan audio pas na een
  eerste aanraking toe; de app probeert het bij openen en anders bij de eerste
  tik.
- Startscherm toont: *Hervat spel* (als er een onafgemaakt spel is, met ronde en
  spelerslijst), *Nieuw spel*, de laatste vier eerdere samenstellingen als
  éen-tik-knoppen, *Statistieken*, *Spelregels*, *Instellingen* en onderaan het
  versienummer.

## 1. Setup: spelers

- Aantal spelers via − / + (3–12). Per speler: **avatar-knop** (kiezer met 16
  emoji: mensjes en diertjes), naaminvoerveld, **kleuter-schakelaar 🧒**.
- Bekende spelers (uit eerdere potjes) staan als tik-chips met hun avatar;
  tikken vult het eerste lege veld én zet avatar en kleuter-stand goed.
- Validatie: alle namen ingevuld, geen dubbele namen.

## 2. Setup: rollen & opties

- Wolven-teller (1+) en vier rol-schakelaars: 🔮 ziener, 🧪 heks, 👧 glurend
  meisje, 🏹 jager. De rest wordt burger. Een *Aanbevolen*-knop zet de
  automatische samenstelling terug (1 wolf t/m 6 spelers, 2 vanaf 7, 3 vanaf
  12; specials in vaste volgorde toegevoegd).
- Validatie met uitleg: minstens 1 wolf, minstens 2 niet-wolven, wolven minder
  dan de helft.
- Opties: doodsmelding **📱 app onthult** of **👆 fysiek aantikken**;
  🗣️ verteller-stem; 🕵️ gok-ronde; 🤫 geheime hint (automatisch op slot met
  uitleg zodra een kleuter meespeelt); ☀️ overleg-timer (uit/2/3/5 min).
- *Deel de kaarten* bewaart voorkeuren + samenstelling en start het spel.

## 3. Kaarten delen (pass-and-play)

Per speler twee schermen:

1. **Doorgeefscherm** — grote avatar, "Geef de telefoon aan {naam}", knop
   "Ik ben {naam} ✋". De stem zegt: *"Geef de telefoon aan {naam}."*
2. **Kaartscherm** — de kaart is alleen zichtbaar **zolang je hem ingedrukt
   houdt** (loslaten = verborgen). Pas na minstens één keer kijken verschijnt
   "✅ Gezien — doorgeven"; daarna is de kaart definitief op slot.

De kaart toont rol-emoji, rolnaam (teamkleur), één kernzin en uitleg. Extra's:
wolven zien hun mede-wolven (met avatar); de hint-variatie zet bij één
willekeurige niet-wolf (nooit een kleuter) een geheime hint op de kaart
("de weerwolf is X of Y"). **Kleuter-modus**: extra groot emoji, grote rolnaam,
één korte zin, géén lap tekst — het beeld is de rol.

Na de laatste kaart: overzichtsscherm met de mededeling dat kaarten op slot
zijn en dat de **noodknop** in het menu zit (zie §9).

## 4. De nacht

Elke nacht is een vaste reeks stappen; stappen van dode rollen worden
overgeslagen. Sfeergeluid per stap staat in §8.

### 4a. Iedereen ogen dicht (automatisch)

- Stem: *"Nacht {n}. Iedereen doet zijn ogen dicht en gaat slapen."* Als het
  glurend meisje leeft: *"Glurend meisje: jij mag straks alléén gluren wanneer
  de weerwolf wakker is."* Dan: *"De nacht begint vanzelf."*
- Er is **geen knop**: wie de app bedient speelt zelf mee en moet ook de ogen
  dicht doen. Een stille teller (10 s) laat de nacht vanzelf beginnen; een
  discreet "verder ›" slaat de wachttijd over.

### 4b. Rolbeurten (ziener → wolf → heks)

Elke rolbeurt heeft hetzelfde patroon:

1. **Wek-scherm** (telefoon ligt in het midden): "🔮 Ziener, word wakker" met
   knop "Ik ben de ziener". De stem herhaalt de oproep **elke 7 seconden,
   steeds aandringender** ("Ziener! Hallo ziener!…"), tot de knop wordt
   ingedrukt — dan wordt lopende spraak per direct afgekapt.
2. **Geheime actie** (telefoon in de hand van de rol; volledig stil):
   - *Ziener*: kiest een speler → "{naam} is WEL/GEEN weerwolf".
   - *Wolf*: kiest een slachtoffer via avatar-tegels + bevestiging (app-modus)
     óf krijgt de instructie fysiek iemand aan te tikken (fysieke modus). Bij
     meerdere wolven staat alles in de jullie-vorm.
   - *Heks*: ziet in app-modus wie is aangevallen. Drankjes per groepsgrootte:
     vanaf 5 spelers 1× genezen + 1× gif; bij 3–4 spelers 2× genezen en géén
     gif (te sterk in een kleine groep). Zichzelf redden mag alleen met de
     allereerste genezing. In fysieke modus zet ze drankjes "blind" in.
3. **Rustpauze in twee fasen**:
   - *Fase 1 (5 s, volledig stil, ook geen sfeer)*: "📵 Leg de telefoon terug —
     stil neerleggen in het midden." Ligt de telefoon volgens de
     bewegingssensor twee tellen aantoonbaar plat en stil, dan wordt de rest
     van deze fase overgeslagen (sensor is een extraatje, nooit vereist).
   - *Fase 2 (4 s)*: scherm wordt "😴 {Rol}, ogen dicht", de stem spreekt de
     rol toe en de nachtsfeer fade weer in. Daarna volgt automatisch de
     volgende rol.

### 4c. Ochtend

- App-modus: "🌞 Iedereen ogen open!" → knop → groot aftellen **5-4-3-2-1**
  (stem + oplopende piepjes) → **ochtend-samenvatting**.
- Fysieke modus: "Wie is er vannacht aangetikt?" → keuze uit levende spelers of
  "niemand" → samenvatting (waar kan blijken dat de heks het slachtoffer
  redde: "…maar de heks heeft je gered! 💚").
- De samenvatting toont en **spreekt** elke dode: *"{naam} is dood. {naam} was
  {rol}."* — met avatar, rol en doodsoorzaak (wolf/gif/jager). **Uitzondering:
  beslist deze nacht het spel, dan blijven de rollen geheim** ("🤫 De rollen
  blijven nog even geheim…") zodat de finale-onthulling zijn spanning houdt.
- Sterft de **jager**, dan schiet die eerst terug: keuzescherm, eigen
  bevestigingsdialoog, extra dode met eigen onthulling.
- Winstcontrole: burgers winnen zodra alle wolven dood zijn; wolven winnen
  zodra ze niet meer in de minderheid zijn (bij 1 wolf: nog 2 spelers over).

## 5. De dag

- Overzicht: wie leeft nog (met avatars), aansporing tot overleg, optionele
  overleg-timer (aftellen met "⏰ Tijd is om!").
- **Gok-ronde** (optioneel, standaard aan): de telefoon gaat rond; elke
  gerechtigde speler bevestigt zijn identiteit en kiest in het geheim wie hij
  denkt dat de wolf is (avatar-tegels, niet op jezelf). Gokken blijven geheim
  tot het einde. Wie gokt mee: levenden altijd (de wolf bluft mee maar telt
  niet voor de score); doden alleen in app-modus — in fysieke modus weet de
  aangetikte te veel.
- Daarna: "🌙 Start nacht {n+1}".
- **Laatste ronde**: is het spel beslist, dan komt er geen nieuwe nacht maar
  wél eerst een laatste gok-ronde ("Het spel is beslist… maar wie wás de
  weerwolf?"). Daarin mag op iederéén gegokt worden — ook op doden, want de
  wolf kan al dood zijn (heks-gif, jager). Daarna: "🥁 Naar de onthulling".

## 6. Einde en onthulling (Masked Singer-stijl)

1. "🌘 Het doek valt over het dorp" → knop "🥁 Onthul de weerwolf".
2. Stem: *"Het is…"* — pauze — *"het is…"* — dan **drie paukenslagen**
   (gesynthetiseerd, derde het hardst, trommel-emoji veert mee) — ± 5,7 s.
3. Onthulling: wie de wolf was (avatar + naam), welk team wint, alle rollen,
   de 🏆 **speurneus-scores** (goede gokken; wolf uitgezonderd), eventueel wie
   de noodknop gebruikte. Stem spreekt winnaar en wolf.
4. Statistieken worden éénmalig bijgeschreven (gespeeld, gewonnen, × wolf,
   gokken goed/totaal, avatar, kleuter-stand). Knoppen: *Opnieuw met dezelfde
   groep* (zelfde namen/opties, nieuwe rollen) of *Naar het beginscherm*.

## 7. Hervatten

Elke actie wordt direct opgeslagen (localStorage). Na herladen, appwissel of
crash biedt het startscherm "▶️ Hervat spel" aan; het spel gaat verder bij het
begin van de actuele stap (vluchtige schermstatus, zoals een half ingevulde
keuze, gaat bewust verloren).

## 8. Geluid per scène

Alles gesynthetiseerd (Web Audio API), behalve de wolvenhuil (mp3). Standaard
staat het geluid **uit**; aan te zetten in ⚙️ of via 🔊 bovenin elk spelscherm.

| Scène | Geluid |
|---|---|
| Startscherm | wolvenhuil (eenmalig) |
| Kaarten delen | mysterieus laag akkoord + wind |
| Nacht (ogen dicht, ziener, heks, rustpauze fase 2) | krekels + nachtwind |
| Wolf kiest, jager, aftellen, vóór de onthulling | lage dreun + hartslag |
| Geheime acties + rustpauze fase 1 | **absolute stilte** |
| Ochtend | ontwakende vogels |
| Dag | lichte bries + vogels |

Scènes vloeien met ~1 s fade in elkaar over; naar stilte gaat in 0,2 s (snel,
want geluid verraadt waar de telefoon is). Bij het naar de achtergrond gaan van
de app stopt al het geluid onmiddellijk en wordt de audio-engine geslapen
gelegd; een waakhond controleert dit elke 2 s.

## 9. De noodknop (rol vergeten)

Bewust drempelig: pas beschikbaar nadat álle kaarten gezien zijn; te vinden in
het ⋮-menu; de juiste speler moet de knop **3 seconden ingedrukt houden**; het
gebruik wordt genoteerd en bij de onthulling getoond ("🔎 Noodknop gebruikt:
…"). Zo is spieken onaantrekkelijk maar een black-out geen ramp.

## 10. Vaste tijden (afgestemd in de praktijk)

| Moment | Duur |
|---|---|
| Nacht begint vanzelf | 10 s |
| Rustpauze: stil terugleggen | 5 s (korter bij sensor-bevestiging) |
| Rustpauze: gesproken deel | 4 s |
| Herhaal-oproep rolbeurten | elke 7 s |
| Ochtend-aftelling | 5 × 1 s |
| Drum-onthulling | ± 5,7 s totaal |
| Noodknop vasthouden | 3 s |
