# Kochbuch

Ein Wochen-Essensplaner in Form eines Stundenplans: sieben Tageszeilen, vier
Mahlzeitenspalten, Gerichte in den Feldern, verschiebbar mit der Maus.
Dazu eine Bibliothek mit 560 Rezepten aus gemeinfreien Kochbüchern und offen
lizenzierten Wikis, eigene Rezepte zum Selbstschreiben, Allergenangaben zu
jedem Gericht, eine Einkaufsliste, die sich aus dem Plan selbst
zusammenrechnet, und der Weg von dort in den REWE-Onlineshop.

Die App ist durchgehend deutschsprachig — Oberfläche wie Rezepte.

```bash
npm install
npm run dev       # Entwicklung auf http://localhost:5173
npm run build     # Produktionsbündel nach dist/
npm test          # Modultests
```

## Der Planer

Der Plan wird über WebGL gezeichnet (Three.js), sieht aber flach aus wie ein
gedruckter Stundenplan: orthografische Draufsicht ohne Fluchtpunkte, weißer
Grund, schwarzes Raster, keine Schatten. Die durchgehenden Linien entstehen
aus einer dunklen Grundfläche, auf der die weißen Felder mit einem Spalt von
Linienbreite liegen — dadurch sind alle Linien gleich stark, innen wie außen.
Beschriftungen sind Canvas-Texturen in mehrfacher Auflösung, damit die Schrift
scharf bleibt.

Die Kamera rahmt das Raster bei jeder Fenstergröße neu ein und rechnet dabei
den Platz heraus, den die Bibliothek belegt. Mausrad zoomt, Ziehen auf freier
Fläche verschiebt, ein Doppelklick stellt den Ausschnitt wieder her.

- **Ziehen aus der Bibliothek** — eine Rezeptkarte auf ein Feld ziehen. Beim
  Überfahren färbt sich das Zielfeld ein.
- **Verschieben im Plan** — Gerichte lassen sich zwischen Feldern ziehen; ist
  das Ziel belegt, tauschen die beiden den Platz.
- **Antippen** öffnet das Rezept mit Zutaten, Zubereitung und Quellenangabe.
  Die Portionszahl dort wirkt direkt auf Plan und Einkaufsliste.
- **Woche füllen** belegt alle leeren Frühstücks-, Mittag- und Abendslots mit
  passenden Rezepten, ohne innerhalb einer Woche zu wiederholen.
- Der Plan liegt im `localStorage`, getrennt nach Kalenderwoche.

## Auf dem Handy

Unter 760 Pixel Breite schaltet die App auf eine Tagesansicht um: ein Tag,
vier Mahlzeitenzeilen, hochkant. Die sieben Wochentage liegen als Leiste unter
der Kopfzeile, ein Punkt zeigt, an welchen Tagen schon etwas geplant ist.
Gewischt wird auch — nach links der nächste Tag, nach rechts der vorige.

Gezogen wird auf dem Handy nichts, dafür sind Finger und Felder zu ungenau
gegeneinander. Stattdessen nimmt ein Tipp in der Bibliothek das Rezept auf:
eine Leiste am unteren Rand zeigt, was in der Hand liegt, der nächste Tipp auf
ein Feld legt es ab. **Ansehen** führt von dort ins Rezept, **×** legt es
wieder weg.

Die Bibliothek wird zum Blatt, das vom unteren Rand heraufgezogen wird — ein
Tipp auf den Griff öffnet und schließt sie, ein Tipp auf ein leeres Feld im
Plan öffnet sie ebenfalls. Was in der Kopfzeile keinen Platz mehr findet,
Woche füllen, Woche leeren und Quellen, liegt unter **⋯**.

Die Beschriftungen werden für beide Ansichten getrennt gezeichnet: hochkant ist
Höhe reichlich vorhanden und Breite knapp, quer genau umgekehrt. Eine
gemeinsame Textur erschiene in einer der beiden verzerrt.

## Allergene

Zu jedem Rezept steht, welche der **vierzehn kennzeichnungspflichtigen
Allergene** aus Anhang II der EU-Lebensmittelinformationsverordnung
(1169/2011) darin vorkommen: in der Rezeptansicht ausgeschrieben, auf der
Karte als Zeichenreihe, in der Einkaufsliste als Übersicht mit der Zahl der
betroffenen Positionen. Der Filter **„ohne …“** blendet Rezepte aus, in denen
ein bestimmtes Allergen steckt.

Erkannt wird aus dem Zutatennamen, und zwar in zwei Stufen:

- **Enthält** — die Zutat *ist* das Allergen oder trägt es zwingend:
  Weizenmehl, Eigelb, Parmesan, Sardellen.
- **Kann enthalten** — die Zutat trägt es häufig, aber nicht notwendig:
  Brühwürfel (Sellerie, Weizen), Schokolade (Sojalecithin), Butterschmalz
  (Milcheiweiß), Wein und Essig (Sulfite).

Damit das trägt, gewinnt beim Suchen immer das längste passende Stichwort.
Sonst wäre Sojamilch Milch, Muskatnuss eine Nuss, Erdnussbutter Butter und
Hackfleisch vom Schwein ein Getränk mit Sulfiten. Umgekehrt müssen lange
Grundwörter auch mitten im Wort gefunden werden, sonst bliebe „Ziegenkäserolle“
unerkannt; bei kurzen Stichwörtern wäre genau das fatal, deshalb gilt es nur
für eine ausgewählte Liste. Rund achtzig solcher Fälle stehen als Tests in
`tests/allergene.test.js`.

> **Wichtig:** Das Verfahren kennt nur, was im Rezept steht. Was ein
> Fertigprodukt tatsächlich enthält, steht auf der Packung, nicht im
> Rezepttext. Die Angaben sind deshalb eine Hilfe beim Aussortieren — bei
> einer Allergie ersetzen sie das Etikett nicht. Genau dieser Satz steht auch
> in der App an jeder Stelle, an der Allergene erscheinen.

## Eigene Rezepte

**+ Eigenes Rezept** am Fuß der Bibliothek öffnet ein Formular; auf dem Handy
steht derselbe Punkt unter **⋯**. Zutaten und Zubereitung werden als Text
eingegeben, eine Zeile je Zutat beziehungsweise Schritt — schneller getippt
als ein Feldergitter und näher an dem, was in einem Kochbuch steht.

Die Zeilen zerlegt derselbe Parser wie beim Import: „750 g Kartoffeln“,
„1 Stange Lauch“, „etwas Majoran“. Darunter steht laufend mit, was dabei
herauskommt, samt der erkannten Allergene — so sieht man beim Schreiben, ob
eine Zeile richtig gelesen wurde.

Gespeicherte Rezepte stehen als eigene Quelle in der Bibliothek, lassen sich
in den Plan legen, fließen in die Einkaufsliste ein und sind über die
Rezeptansicht wieder zu ändern oder zu löschen. Beim Löschen verschwinden sie
auch aus allen Wochenplänen; sonst bliebe dort ein Eintrag ohne Rezept.

Sie liegen im `localStorage` dieses Browsers — die App hat keinen Server, der
sie aufbewahren könnte. Ein geleerter Browser oder ein anderes Gerät heißt
also: weg. `state/eigene.js` bringt dafür `alsDatei()` und `ausDatei()` mit.

## Woher die Rezepte stammen

Alle mitgelieferten Rezepte gehen auf gemeinfreie Kochbücher und offen
lizenzierte Projekte zurück. Die historischen sind behutsam modernisiert —
metrische Mengen, heutige Gartemperaturen, zeitgemäße Sprache —, die Herkunft
steht an jedem Rezept und im Quellenverzeichnis der App.

| Quelle | Jahr | Lizenz | Rezepte |
| --- | --- | --- | --- |
| [Henriette Davidis, *Praktisches Kochbuch*](https://www.projekt-gutenberg.org/davidis/kochbuch/kochbuch.html) | 1845 | gemeinfrei | 20 |
| [Katharina Prato, *Die Süddeutsche Küche*](https://austria-forum.org/web-books/en/diesuddeutschek00de1858kfu) | 1858 | gemeinfrei | 20 |
| [Isabella Beeton, *Book of Household Management*](https://www.gutenberg.org/ebooks/10136) | 1861 | Public Domain | 20 |
| [Pellegrino Artusi, *La scienza in cucina*](https://www.gutenberg.org/ebooks/59047) | 1891 | Public Domain | 20 |
| [Fannie Farmer, *Boston Cooking-School Cook Book*](https://www.gutenberg.org/ebooks/65061) | 1896 | Public Domain | 20 |
| [Hannah Glasse, *The Art of Cookery*](https://archive.org/details/artofcookermade00glas) | 1747 | Public Domain | 15 |
| [Wikibooks Kochbuch](https://de.wikibooks.org/wiki/Kochbuch) | laufend | CC BY-SA 3.0 | 25 |
| [Koch-Wiki](https://www.kochwiki.org/) | laufend | CC BY-SA | 420 |

### Live nachladen

Unter **Quellen → Live nachladen** holt die App weitere Rezepte dazu. Angeboten
werden bewusst nur deutschsprachige Quellen; beide senden
`access-control-allow-origin: *` und funktionieren direkt aus dem Browser:

- **[Koch-Wiki](https://www.kochwiki.org/)** (CC BY-SA) — rund 9000 deutsche
  Rezepte. Seiten mit englischem Titel bleiben außen vor, damit die App
  einsprachig bleibt. Bruchvorlagen wie `{{B|1|2}}` werden in Mengen
  übersetzt statt gestrichen, sehr knappe Schritte an den vorigen angehängt
  statt verworfen.
- **[Wikibooks-Kochbuch](https://de.wikibooks.org/wiki/Kochbuch)** (CC BY-SA 3.0)
  über die MediaWiki-API. Bewusst gedrosselt und seriell: Wikimedia
  beantwortet Stoßlasten mit 429.

Zwei weitere Quellen sind angebunden, liefern aber nur englische Texte und
bleiben deshalb dem Import-Werkzeug auf der Kommandozeile vorbehalten:
[TheMealDB](https://www.themealdb.com/) (rund 790 Rezepte, frei mit
Namensnennung) und der [UniTools-Datensatz](https://theunitools.com/) (501
Gerichte aus 127 Ländern, CC BY-SA 4.0). Angelsächsische Mengen (`tsp`, `lb`,
`oz`) rechnet der Importer dabei metrisch um, damit die Einkaufsliste sie
zusammenfassen kann.

Dazu kommen [Gutendex](https://gutendex.com/) zum Auffinden weiterer
gemeinfreier Kochbücher, [Open Food Facts](https://world.openfoodfacts.org/)
(ODbL) für Produktdaten und [USDA FoodData Central](https://fdc.nal.usda.gov/)
für Nährwerte.

## Einkaufsliste und Bestellung

Aus dem Wochenplan entsteht die Liste automatisch: Zutaten werden auf die
geplanten Portionen hochgerechnet, gleiche Positionen zusammengefasst —
auch über Einheitengrenzen hinweg, 400 g plus 800 g ergeben 1,2 kg — und nach
Abteilungen sortiert, in der Reihenfolge, in der man den Markt durchläuft.

Für den Einkauf gibt es drei Wege: Liste kopieren, als CSV herunterladen oder
die Übergabe an REWE.

> **Zur REWE-Anbindung:** REWE veröffentlicht keine Entwicklerschnittstelle für
> Warenkorb oder Bestellung. Verlässlich öffentlich ist die Produktsuche des
> Shops (`shop.rewe.de/productList?search=…`). Die App nutzt sie: jede Position
> bekommt einen bereinigten Suchbegriff — aus „Weizenmehl Type 405" wird
> „Weizenmehl" — und einen Link in den Shop, wo das Produkt mit einem Klick in
> den Warenkorb geht. Die Übergabeansicht führt Position für Position durch die
> Liste. Wer einen eigenen Warenkorb-Endpunkt hat (Partnerzugang oder selbst
> betriebener Proxy), hängt ihn über `configure({ endpoint })` in
> `src/shops/rewe.js` ein; am Rest der App ändert sich nichts. Weitere Händler
> lassen sich als zusätzliche Adapter in `src/shops/` ergänzen.

## Eigene Rezepte importieren

Chefkoch.de, rewe.de und die meisten Rezeptportale liefern ihre Rezepte als
[schema.org/Recipe](https://schema.org/Recipe)-Daten aus. Der Importer liest
diese Angaben, zerlegt deutsche Mengenangaben („1 ½ TL", „2 Zehen", „n. B.")
und legt das Rezept in der Bibliothek ab.

```bash
npm run import -- --url https://www.chefkoch.de/rezepte/...
npm run import -- --file gespeicherte-seite.html --url https://...
npm run import -- --themealdb alle        # gesamter Bestand, rund 790 Rezepte
npm run import -- --themealdb Italian     # nur eine Küche
npm run import -- --wikibooks 25
npm run import -- --kochwiki 400
npm run import -- --unitools
npm run import -- --gutendex cookery
```

Offen lizenzierte Quellen landen in `data/offene-quellen/`. Mit `--bundle`
schreibt der Importer sie zusätzlich nach `src/data/books/`, sodass sie fest
mitgeliefert werden — ob die Lizenz einer Quelle das Weitergeben erlaubt,
entscheidet bewusst der Betreiber, nicht das Werkzeug. Läuft der Import hinter
einem Proxy, liest Nodes eingebautes `fetch` ihn nur mit
`NODE_USE_ENV_PROXY=1`.

In der App geht das unter **Quellen → Rezept per Adresse importieren**. Blockt
eine Seite den direkten Zugriff aus dem Browser — bei Rezeptportalen die Regel,
weil sie keine CORS-Freigabe setzen —, funktioniert der eingefügte
Seitenquelltext oder der Weg über die Kommandozeile, wo CORS nicht greift.

Ein Massenabzug ganzer Portale ist bewusst nicht vorgesehen: Chefkoch und REWE
untersagen das in ihren Nutzungsbedingungen, und die Rezepttexte sind
urheberrechtlich geschützt. Der Importer holt einzelne Rezepte, die man selbst
auswählt.

**Rechtliches:** Importierte Rezepte von kommerziellen Portalen bleiben
Eigentum des jeweiligen Anbieters. Sie werden nur lokal gespeichert, im Browser
oder unter `data/importiert/`, und sind über `.gitignore` vom Repository
ausgenommen. Ausgeliefert wird ausschließlich das gemeinfreie und offen
lizenzierte Korpus.

## Aufbau

```
src/
  data/            Rezeptkorpus als JSON, Quellenregister, Suchindex
    books/         ein Kochbuch je Datei
  state/           Wochenplan, Kalenderrechnung, Mengenarithmetik,
                   Einkaufsliste, Abteilungszuordnung, Allergene,
                   eigene Rezepte
  webgl/           Szene, Stundenplan-Raster, Canvas-Texturen
  ui/              Bibliothek, Rezeptansicht, Rezeptformular,
                   Einkaufsliste, Quellen
  sources/         Live-Adapter und schema.org-Importer
  shops/           Supermarkt-Anbindungen
scripts/           Import-Werkzeug für die Kommandozeile
tests/             Modultests und ein Rauchtest im Browser
```

Die Logik, die sich lohnt zu prüfen, liegt bewusst frei von App-Zustand:
`state/shopping.js` verdichtet Einträge zu einer Liste, `state/week.js` rechnet
Kalenderwochen, `state/allergens.js` erkennt Allergene, `state/rezeptform.js`
macht aus Formulareingaben ein Rezept, `sources/ingredients.js` zerlegt
Zutatenzeilen, `sources/schemaorg.js` liest Rezeptseiten. Der Store ruft diese
Funktionen nur auf. `state/matcher.js` liegt darunter: die Stichwortsuche im
Zutatennamen, die Abteilungen und Allergene gemeinsam benutzen.

## Tests

```bash
npm test               # 56 Modultests: Mengen, Einkaufsliste, Import,
                       # Korpus, Allergene, eigene Rezepte
npm run test:browser   # Rauchtest in Chromium gegen die gebaute App
npm run test:handy     # derselbe Weg in Telefongröße, mit Berührung
```

Die Modultests prüfen unter anderem, dass das Korpus vollständig ist, dass
Mengen über Einheitengrenzen korrekt summiert werden, dass imperiale Einheiten
metrisch ankommen, dass Zutaten in der richtigen Abteilung landen — auch bei
Zusammensetzungen wie „Milchreis" oder „Olivenöl" —, dass die Allergenerkennung
die Verwechslungen aushält, die ein bloßer Teilstring machen würde, dass ein
leeres Formularfeld als fehlend und nicht als Null gilt, und dass kein
englischer Text in Titel, Kapitel oder Schlagwörter zurückkehrt. Der
Browsertest fährt die App hoch, plant eine Woche, zieht eine Karte mit der Maus
in einen anderen Slot, prüft Einkaufsliste und Shop-Übergabe und schreibt zum
Schluss ein eigenes Rezept. Der Handytest geht denselben Weg in einem Fenster
von 390 × 844 Punkten, mit Berührung statt Maus.

Für den Browsertest muss die gebaute App laufen:

```bash
npm run build && npm run preview &
npm run test:browser
npm run test:handy
# abweichender Browser: CHROMIUM_PATH=/pfad/zu/chrome npm run test:browser
```

## Abgleich mit Git

Jede Änderung soll geprüft und gesichert sein, bevor sie liegen bleibt.
Dafür greifen vier Dinge ineinander:

**`npm run sync`** macht den ganzen Weg in einem Schritt: Modultests, Build,
Commit, Push auf den aktuellen Branch. Ohne Argument leitet es die
Commit-Nachricht aus den geänderten Pfaden ab.

```bash
npm run sync -- "Einkaufsliste nach Abteilungen sortiert"
npm run sync
```

Schlägt eine Prüfung fehl, wird trotzdem **lokal committet** — keine Arbeit
geht verloren —, der **Push bleibt aber aus**, damit der Branch auf der
Gegenseite nie rot wird. Der nächste erfolgreiche Lauf schiebt beide Commits
gemeinsam hoch. Auf `main` wird grundsätzlich nicht gepusht.

**Git-Hooks** in `.githooks/` fangen manuelle Commits ab: `pre-commit` führt
die Modultests aus, `pre-push` baut zusätzlich. Sie werden über
`core.hooksPath` verankert und richten sich nach `npm install` von selbst ein.
Umgehen lassen sie sich mit `--no-verify`; genau das nutzt das Sync-Werkzeug,
weil es die Prüfungen selbst ausführt und anders entscheidet.

**GitHub Actions** (`.github/workflows/ci.yml`) laufen bei jedem Push und
jedem Pull Request: ein Job für Modultests und Build, ein zweiter für die
beiden Browsertests in Chromium — erst am Schreibtisch, dann am Telefon.
Schlägt einer fehl, hängen die Bildschirmfotos als Artefakt am Lauf.

**Claude Code** ist über `.claude/settings.json` daran gekoppelt: ein
`SessionStart`-Hook installiert Abhängigkeiten und Git-Hooks, ein
`Stop`-Hook ruft nach jedem Arbeitsschritt `npm run sync -- --auto` auf. Damit
ist der Stand nach jedem Schritt geprüft und gesichert. Wer das nicht möchte,
entfernt den `Stop`-Eintrag oder schaltet ihn über `/hooks` ab.

## Lizenz

Der Quellcode steht unter MIT. Für die Rezeptdaten gelten die Lizenzen der
jeweiligen Quellen, wie oben und im Quellenverzeichnis der App angegeben.
