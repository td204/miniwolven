# De gebruikersinterface

Miniwolven is één telefoon op een tafel in een (half)donkere huiskamer, bediend
door spelers van kleuter tot volwassene, vaak zonder bril op en met spanning in
de vingers. Alles in de UI volgt uit die situatie.

## Uitgangspunten

1. **Eén scherm, één taak.** Elk scherm stelt precies één vraag of geeft één
   instructie, met één primaire knop. Geen menubalk, geen tabs, geen
   navigatiediepte tijdens het spel.
2. **Groot en aanraakbaar.** Knoppen zijn minimaal 48 px hoog, de primaire
   actie is een brede gele balk. Kiezen van spelers gaat via tegels van ± 90 px
   met een grote avatar — ook aanwijsbaar voor een kleuter.
3. **Leesbaar in het donker.** Donker nachtblauw thema, warm maanlicht-geel als
   accent, hoge contrasten, geen wit scherm dat de kamer verlicht.
4. **Beeld boven tekst.** Emoji dragen de betekenis (rollen, avatars, iconen);
   tekst ondersteunt. Kleuter-modus versterkt dit: rolkaart = één groot beeld.
5. **De app praat.** De verteller-stem (speechSynthesis, nl-NL) leest
   instructies voor, zodat niemand hoeft mee te lezen met ogen dicht.

## Thema

- Kleuren: achtergrond `#17153a`→`#1e1b4b` (radiaal verloop), panelen
  `#282461`, tekst `#ecebff`, gedempt `#a5a1d6`, accent `#fbbf24` (maangeel),
  ok `#34d399`, gevaar `#f87171`.
- Systeemfont, basis 17 px, ruime regelafstand. Afronding 16 px op vrijwel
  alles.
- Achtergondkleur staat óók op `html`, zodat overscroll/pull-to-refresh nooit
  een kale ondergrond toont. Safe-area-insets zitten in het app-vlak (niet op
  `body`), zodat de pagina exact schermhoog blijft.
- Tekstselectie en de long-press-callout staan app-breed uit (alleen
  invoervelden niet): voorkomt Android's selectie-trilling bij vasthoud-
  interacties.

## Componenten

| Component | Gebruik |
|---|---|
| `btn` / `btn primary` / `btn subtle` | standaard-, primaire- en terloopse acties; `small` voor een ondertitel in de knop |
| `player-grid` + `player-pick` | 2-koloms raster van speler-tegels: grote avatar + naam |
| `chip` | bekende spelers en snelkeuzes |
| `toggle` | rol-schakelaars met emoji, uitleg en vinkje |
| `seg` | tweekeuze met uitleg (app onthult / fysiek aantikken) |
| `opt` | instelregel met checkbox of select |
| `counter` | groot − / getal / + |
| `cardwrap` (cardback/cardfront) | houd-vast-om-te-zien rolkaart |
| `overlay` + `sheet` | menu van onderaf (⋮) |
| `overlay center` + `dialog` | eigen bevestigingsdialoog: emoji, één zin, twee knoppen |
| `topbar` | titel + rechts 🔊/🔇 (in spel) en ⋮ (waar het menu hoort) |
| `timer-big`, `rest-count`, `count-num` | groot aftellen in drie maten |
| `death`, `reveal-banner`, `listrow`, `statcard`, `pill`, `callout` | uitslag- en lijstweergaven |

## Interactiepatronen

- **Doorgeefscherm**: elke geheime handeling begint met "Geef de telefoon aan
  {avatar} {naam}" + bevestigingsknop "Ik ben {naam} ✋". Niemand ziet per
  ongeluk andermans geheim.
- **Houd-vast-om-te-zien**: de rolkaart is alleen zichtbaar zolang de vinger op
  de kaart ligt (pointer events, `touchstart` preventDefault tegen het
  long-press-gebaar). Loslaten verbergt direct; meekijken over de schouder
  levert hooguit een flits op.
- **Vasthoud-drempel**: de noodknop vergt 3 s ingedrukt houden met zichtbare
  voortgangsbalk — frictie als feature.
- **Auto-doorloop**: momenten waarop niemand de telefoon mag vasthouden
  (nacht begint, rustpauzes) lopen op timers, altijd met een discrete
  "verder ›" om te versnellen.
- **Herhaalde oproep**: wek-schermen roepen elke 7 s opnieuw, steeds
  aandringender; elke schermwissel kapt lopende spraak direct af.
- **Terugknop** (Android/browser): één history-"trap" vangt back op. Waar terug
  logisch is (rollen → spelers, sub-schermen → start, spelregels → herkomst)
  navigeert hij echt terug; op het startscherm of midden in het spel doet hij
  stilletjes niets. Geen afsluit-popup: een PWA kan zichzelf toch niet sluiten.
- **Eigen dialogen**: nooit `confirm()`/`alert()` — die tonen het site-adres,
  breken de stijl en pakken de focus (en dus het geluid) af.
- **Statusfeedback**: knoppen verschijnen pas als ze mogen (bijv. "Gezien —
  doorgeven" pas na daadwerkelijk kijken); gevaarlijke acties zijn rood en
  vragen bevestiging; succesmeldingen zijn een groene pil, geen popup.

## Schermenoverzicht

Setup: home → spelers (avatar/naam/🧒 per rij) → rollen & opties.
Spel: doorgeefscherm ↔ kaartscherm (×n) → klaar-scherm → nachtschermen
(slaap, wek, actie, rustpauze ×2, ochtend, samenvatting) → dag → gok-schermen
(doorgeef ↔ kies) → eindscherm (doek valt → drums → onthulling).
Overig: statistieken, spelregels, instellingen, menu-sheet, noodknop-flow,
avatar-kiezer, bevestigingsdialoog.

## Toegankelijkheid & robuustheid

- Verteller-stem maakt het spel speelbaar zonder mee te lezen.
- Kleuter-modus per speler: grotere beelden, minder tekst, avatar-aanwijzen.
- Alles werkt zonder sensoren, zonder geluid en zonder netwerk (offline PWA);
  extra's (bewegingssensor, audio) zijn progressieve versterking.
- Versienummer onderaan het startscherm: onmisbaar om op afstand te zien welke
  versie een toestel draait.
