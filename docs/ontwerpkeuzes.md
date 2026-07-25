# Ontwerpkeuzes en de overwegingen erachter

Per keuze: wat we kozen, wat het alternatief was, en waarom.

## Spelontwerp

**Geen aparte spelleider; de app ís de verteller.**
Klassiek Weerwolven vraagt ±8 spelers plus een spelleider die niet meespeelt.
Het doel was een gezin van 3–4. Dus: de app neemt de verteltaken over (kaarten
delen, rollen wekken, uitslagen onthullen) en *iedereen speelt mee*. Deze ene
keuze stuurt bijna al het andere: doorgeefschermen, automatische overgangen,
verteller-stem.

**Gok-rondes in plaats van wegstemmen.**
De huisregel van dit gezin: na elke nacht gokt iedereen geheim wie de wolf is;
niemand wordt weggestemd. Overwogen is de klassieke dagstemming (lynch) als
optie in te bouwen; bewust uitgesteld om het spel klein te houden. De gok-ronde
in de app (in plaats van hardop) is gekozen omdat alleen dan scores en
statistieken bij te houden zijn — en omdat geheime gokken de onthulling
spannender maken.

**Einde op winstconditie, niet op vast aantal rondes.**
Burgers winnen zodra alle wolven dood zijn (heks-gif of jager!), wolven zodra
ze niet meer in de minderheid zijn. Simpel uit te leggen en schaalt vanzelf
mee met het aantal spelers.

**Doodsmelding als instelling: app onthult óf fysiek aantikken.**
Het gezin speelt het liefst met fysiek aantikken ("geeft leuke situaties");
de app-onthulling met 5-4-3-2-1 is theatraler en nodig voor kleine groepen die
stil willen blijven zitten. Beide huisregels bestaan naast elkaar; de keuze
bepaalt ook wie er mee mag gokken (fysiek aangetikte doden weten te veel).

**Glurend meisje zonder app-mechaniek.**
Haar rol (gluren tijdens de wolvenbeurt, op eigen risico) is fysiek gedrag dat
je niet in software vangt. De app legt de rol uit en *herinnert eraan* — met
stem én tekst op precies de juiste momenten. Les: niet alles hoeft een feature
te zijn; soms is de app alleen de souffleur.

**Noodknop met frictie in plaats van "kaart terugkijken".**
Vrij terugbladeren zou spieken normaliseren. Overwogen: alleen de eigenaar,
of pas na X seconden. Gekozen: pas nadat íedereen zijn kaart zag + 3 seconden
vasthouden + zichtbare registratie bij de onthulling. Sociale kosten in plaats
van een hard slot.

**Kleuter-modus per speler, niet per spel.**
In één gezin zitten lezers en niet-lezers. De vlag zit dus op de speler en
wordt onthouden. Gevolgen door de hele app: rolkaart = één groot beeld,
spelers aanwijzen via avatar-tegels, en de hint-variatie gaat automatisch op
slot (een geheime hint die je niet kunt lezen — en die niemand mag voorlezen —
is zinloos).

## Techniek

**Puur statisch, nul dependencies, geen build-stap.**
HTML + CSS + vanilla JS. Overwogen: een framework en een bundler. Verworpen:
niets aan dit spel vraagt erom, en zonder build blijft hosten gratis (GitHub
Pages), blijft de stap naar Capacitor klein en kan iedereen de code lezen.

**Spelregels als pure engine, los van de DOM.**
`engine.js` werkt op een serialiseerbaar state-object en draait ook in Node.
Daardoor: (a) 1600 volledige spellen per testrun gesimuleerd, (b) hervatten =
state opslaan, (c) fase 2 (websockets, host-authoritative met gefilterde views
per rol) vergt geen herschrijving van de regels.

**localStorage in plaats van een database.**
Spelers, groepen, voorkeuren, statistieken en het lopende spel passen ruim in
localStorage. Een server introduceren vóór multiplayer nodig is, is complexiteit
zonder opbrengst.

**Emoji als volledige art-direction.**
Rollen, avatars, iconen, dialogen: alles emoji. Gratis, overal beschikbaar,
schaalt, en kleuters herkennen ze moeiteloos. Alleen het app-icoon is
gegenereerde PNG (procedureel getekend, zonder image-libraries) en de
wolvenhuil een mp3.

**Geluid gesynthetiseerd, tenzij een opname wint.**
Alle sfeer (krekels, wind, vogels, hartslag, pauken) komt uit de Web Audio API:
geen assets, werkt offline, per scène te mengen. De wolvenhuil is de
uitzondering — synthese bleef "een spookje", een echte opname won direct.
Die is vervolgens 75 % gecomprimeerd (mono, 32 kHz, 64 kbps): meer is voor een
telefoonspeaker niet hoorbaar.

**Geluid standaard uit; muten kan altijd.**
Audio is sfeer, geen vereiste. Eén schakelaar in instellingen plus een
🔊/🔇-knop op elk spelscherm. De verteller-stem staat hier bewust los van: die
is spelbegeleiding en heeft een eigen optie per spel.

**Bewegingssensor: alleen conservatief, alleen versnellen.**
De sensor (ligt de telefoon plat en stil?) mag uitsluitend wachttijd inkorten.
Het omgekeerde — geluid dempen zodra de telefoon "vastgehouden" leek — is
gebouwd én verwijderd: het kapte instructies af. Regel: een sensor mag een
vloeiender pad kiezen, nooit het script onderbreken.

**PWA-updates: network-first navigatie + auto-reload + zichtbaar versienummer.**
Cache-first gaf de klassieke PWA-kwaal: updates pas na twee herstarts en tien
minuten CDN-cache. Nu: navigaties gaan netwerk-eerst (offline valt terug op
cache), een nieuwe service worker herlaadt de pagina eenmalig (behalve bij de
allereerste installatie), en het startscherm toont het versienummer zodat
"welke versie draai jij?" een blik kost in plaats van een discussie.

**Eigen dialogen, eigen terugknop-gedrag.**
`confirm()` toont het site-adres, breekt de illusie en pakt focus en audio af.
De terugknop kreeg een history-trap: echt terug waar dat kan, anders niets —
de eerder gebouwde "app sluiten?"-vraag is geschrapt toen bleek dat een PWA
zichzelf toch niet mag sluiten (een vraag zonder gevolg is ruis).
