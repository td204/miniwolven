# Lessons learned

Geleerd tijdens het bouwen én tijdens echte potjes aan de keukentafel. De
meeste lessen kwamen uit spelersfeedback binnen een dag na de eerste release.

## 1. De speaker verraadt waar de telefoon is

De grootste lesreeks. In een spel met ogen dicht is *geluid* informatie: wie
een piepje of een stem uit zijn richting hoort komen, weet wie de telefoon
vastheeft. Dit dook in vier gedaanten op:

- De aankondiging van de volgende rol klonk terwijl de vorige de telefoon nog
  terug-legde → **stille rustpauze** tussen rollen.
- De rustpauze zelf sprák meteen ("Heks, ogen dicht") terwijl de heks de
  telefoon nog vasthield → rustpauze in **twee fasen**: eerst zwijgend "leg de
  telefoon terug", pas daarna spreken.
- De herhaal-oproep ("Ziener! Hallo ziener!") kruiste soms net de knopdruk en
  praatte door uit iemands handen → **elke schermwissel kapt lopende spraak
  direct af**.
- De sfeergeluiden (krekels) startten al tijdens het terugleggen en liepen door
  tijdens geheime acties → **stilte is een scène**: de sfeer-router kent
  expliciet "geheim moment = geen geluid", met een snelle 0,2 s-fade.

**Les:** behandel audio in een hot-seat-spel als een informatiekanaal dat je
net zo zorgvuldig moet afschermen als het scherm zelf.

## 2. Spraak-afkappen kan je eigen spraak raken

De fix "kap spraak af bij schermwissel" introduceerde een regressie: schermen
die hun eigen tekst vóór de schermopbouw startten (ochtend-onthulling,
jager-uitkomst, eindonthulling) kapten zichzélf af — "Dex is dood" werd nooit
meer uitgesproken. **Les:** leg een vaste volgorde vast (eerst scherm bouwen,
dán spreken) en documenteer die in de code; en test gesproken paden expliciet,
want een geluids-regressie zie je niet in een screenshot.

## 3. Tekst-naar-spraak leest wat er staat, niet wat je bedoelt

"Het issss…" werd letter voor letter voorgelezen ("het is s s s s").
**Les:** schrijf voor TTS gewoon correcte taal; bouw spanning met pauzes,
stiltes en geluid (paukenslagen), niet met creatieve spelling. En schrijf
meervoudsteksten echt uit (jullie-vorm voor meerdere wolven) in plaats van
één sjabloon te vervoegen.

## 4. Web-audio heeft een levenscyclus

- Autoplay-beleid: geluid mag pas na de eerste aanraking → probeer bij openen,
  val terug op de eerste tik.
- App naar achtergrond: oscillators bevriezen midden in hun golfvorm en
  *kraken* bij hervatten → bij verbergen alles hard op nul, bronnen stoppen,
  context suspenden; bij terugkomen vers opbouwen met fade-in.
- `visibilitychange` alleen is niet genoeg (split-screen, overlays, freeze) →
  ook `blur`/`pagehide`/`freeze` afvangen én een waakhond die elke 2 s checkt
  of er geluid speelt terwijl de app niet zichtbaar is.
- Synthese is prima voor ambience (krekels, wind, hartslag) maar een dier
  na-synthetiseren wordt al snel "een spookje" → gebruik een opname waar het
  timbre ertoe doet, en comprimeer die agressief (mono/32 kHz/64 kbps was
  75 % kleiner zonder hoorbaar verlies op een telefoonspeaker).

## 5. PWA-updates zijn een product-feature, geen detail

Cache-first betekende: fix gepusht, gezin ziet hem pas na twee herstarts en
tien minuten CDN-cache — midden in een speelavond. Oplossing in drie delen:
navigaties network-first met offline-fallback, auto-reload zodra een nieuwe
service worker de regie neemt (behalve bij de allereerste installatie), en een
**zichtbaar versienummer** op het startscherm. Dat laatste bleek onmisbaar bij
debuggen op afstand: "staat er v16 onderaan?" vervangt drie schermfoto's.

## 6. De bediener speelt zelf mee

Een knop "iedereen slaapt → verder" veronderstelt iemand die wakker blijft om
te drukken — maar die persoon speelt mee en moet óók ogen dicht. **Les:** in
een spel zonder spelleider mag geen enkel moment een "operator" nodig hebben;
gebruik auto-aftellingen met een discrete skip.

## 7. Systeem-UI breekt de betovering

Native `confirm()` toont het site-adres, oogt niet naar het thema en pakt de
focus (en dus het geluid) af. Eigen dialogen losten drie problemen tegelijk op.
Ook geschrapt: een "app afsluiten?"-vraag die niets kon waarmaken — een PWA
mag zichzelf niet sluiten. **Les:** stel bij elke bevestiging de vraag of er
überhaupt een gevolg is; zo niet, weg ermee.

## 8. Sensoren: assisteren mag, regisseren niet

Bewegingsdetectie ("ligt de telefoon of is hij in de hand?") is verleidelijk.
Wat bleef: stille wachttijd inkorten als de telefoon aantoonbaar terugligt —
puur winst. Wat sneuvelde: audio dempen zodra de telefoon "vast" leek — het
kapte gesproken instructies halverwege af. **Les:** laat een onbetrouwbaar
signaal alleen dingen *versnellen* die toch al zouden gebeuren; laat het nooit
iets *onderbreken*. Goede begeleiding met tekst en stem verslaat slimme
detectie.

## 9. Mobiele platform-eigenaardigheden die je pas op een echt toestel ziet

- Androids long-press-trilling bij vasthoud-interacties → `user-select: none`
  app-breed (behalve invoervelden) + `touchstart` preventDefault op
  vasthoud-elementen.
- Safe-area-insets op body én app-vlak = pagina nét hoger dan het scherm →
  scrollbar en een achtergrond die "ophoudt"; insets horen op één element en
  de achtergrondkleur óók op `html` (overscroll).
- De Android-terugknop sluit een PWA zonder history-stack → één history-trap
  en per scherm bepalen wat "terug" betekent.

**Les:** emulators en desktop-browsers vangen dit niet; niets vervangt een
echt potje op een echte telefoon.

## 10. Pure engine + doorspeel-test = snel durven veranderen

Doordat de regels DOM-vrij zijn, simuleert één Node-script 1600 complete
spellen per run, en speelt één Playwright-script een echt potje van setup tot
drum-onthulling in de echte UI. Elke spelersfeedback kon daardoor binnen
minuten veilig worden doorgevoerd. De ochtend-regressie (samenvatting werd
overgeslagen) werd gevonden door een speler — waarna de test er een assertie
bij kreeg zodat het nooit meer stil passeert. **Les:** maak de doorspeel-test
onderdeel van elke fix, en verhard hem bij elke gevonden regressie.

## 11. Frictie kan een feature zijn

De noodknop (rol vergeten) werkt juist góed omdat hij onhandig is: pas na alle
kaarten, 3 seconden vasthouden, en zichtbaar in het eindverslag. Niet elke
handeling moet zo makkelijk mogelijk zijn; sociale remmen mogen in het ontwerp.

## 12. Huisregels zijn de spec

De opdrachtgever beschreef geen Weerwolven-uit-het-boekje maar het spel zoals
het gezin het speelt (aantikken in het echt, gokken in plaats van stemmen, de
dode gokt soms mee). De app codeert die huisregels en maakt ze instelbaar waar
gezinnen verschillen. **Les:** vraag niet "wat zijn de regels" maar "hoe
spelen jullie het écht" — en maak precies dát.
