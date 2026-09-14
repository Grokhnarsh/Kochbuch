# Kochbuch

Ein Wochen-Essensplaner, dessen Planungsfläche in WebGL läuft: sieben
Tageszeilen, vier Mahlzeitenspalten, Rezepte als Karten, die man mit der Maus
zwischen den Slots verschiebt. Dazu eine Bibliothek mit 140 Rezepten aus
gemeinfreien Kochbüchern, eine Einkaufsliste, die sich aus dem Plan selbst
zusammenrechnet, und der Weg von dort in den REWE-Onlineshop.

```bash
npm install
npm run dev       # Entwicklung auf http://localhost:5173
npm run build     # Produktionsbündel nach dist/
npm test          # Modultests
```

## Der Planer

Die Bühne ist eine Three.js-Szene: abgerundete Karten mit echter Dicke und
weichem Schatten, Beschriftungen als Canvas-Texturen, ein Untergrund mit
sanftem Verlauf. Die Kamera rahmt das Raster bei jeder Fenstergröße neu ein
und rechnet dabei den Platz heraus, den Bibliothek und Wochenbilanz belegen.

- **Ziehen aus der Bibliothek** — eine Rezeptkarte auf einen Slot ziehen. Beim
  Überfahren leuchtet der Zielslot auf.
- **Verschieben im Plan** — Karten lassen sich zwischen Slots ziehen; ist das
  Ziel belegt, tauschen die beiden Gerichte den Platz.
- **Antippen** öffnet das Rezept mit Zutaten, Zubereitung und Quellenangabe.
  Die Portionszahl dort wirkt direkt auf Plan und Einkaufsliste.
- **Woche füllen** belegt alle leeren Frühstücks-, Mittag- und Abendslots mit
  passenden Rezepten, ohne innerhalb einer Woche zu wiederholen.
- Der Plan liegt im `localStorage`, getrennt nach Kalenderwoche.

## Woher die Rezepte stammen

Alle mitgelieferten Rezepte gehen auf gemeinfreie Kochbücher und offen
lizenzierte Projekte zurück. Sie sind behutsam modernisiert — metrische Mengen,
heutige Gartemperaturen, zeitgemäße Sprache —, die Herkunft steht an jedem
Rezept und im Quellenverzeichnis der App.

| Quelle | Jahr | Lizenz | Rezepte |
| --- | --- | --- | --- |
| [Henriette Davidis, *Praktisches Kochbuch*](https://www.projekt-gutenberg.org/davidis/kochbuch/kochbuch.html) | 1845 | gemeinfrei | 20 |
| [Katharina Prato, *Die Süddeutsche Küche*](https://austria-forum.org/web-books/en/diesuddeutschek00de1858kfu) | 1858 | gemeinfrei | 20 |
| [Isabella Beeton, *Book of Household Management*](https://www.gutenberg.org/ebooks/10136) | 1861 | Public Domain | 20 |
| [Pellegrino Artusi, *La scienza in cucina*](https://www.gutenberg.org/ebooks/59047) | 1891 | Public Domain | 20 |
| [Fannie Farmer, *Boston Cooking-School Cook Book*](https://www.gutenberg.org/ebooks/65061) | 1896 | Public Domain | 20 |
| [Hannah Glasse, *The Art of Cookery*](https://archive.org/details/artofcookermade00glas) | 1747 | Public Domain | 15 |
| [Wikibooks Kochbuch](https://de.wikibooks.org/wiki/Kochbuch) | laufend | CC BY-SA 3.0 | 25 |

### Live nachladen

Unter **Quellen → Live nachladen** holt die App weitere Rezepte dazu. Beide
Schnittstellen senden `access-control-allow-origin: *`, funktionieren also
direkt aus dem Browser:

- **[TheMealDB](https://www.themealdb.com/)** — rund 790 internationale
  Rezepte, frei mit Namensnennung. Der Bestand wird über das Verzeichnis nach
  Anfangsbuchstaben geholt, nicht über den Küchenfilter: der deckt in der
  freien Stufe nur einen Teil ab, unter „German" liegt dort nichts.
  Angelsächsische Mengen werden beim Einlesen metrisch umgerechnet, damit die
  Einkaufsliste sie zusammenfassen kann.
- **[Wikibooks-Kochbuch](https://de.wikibooks.org/wiki/Kochbuch)** (CC BY-SA 3.0)
  über die MediaWiki-API. Bewusst gedrosselt und seriell: Wikimedia
  beantwortet Stoßlasten mit 429.

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
                   Einkaufsliste, Abteilungszuordnung
  webgl/           Szene, Planungsboard, Geometrie, Canvas-Texturen
  ui/              Bibliothek, Rezeptansicht, Einkaufsliste, Quellen
  sources/         Live-Adapter und schema.org-Importer
  shops/           Supermarkt-Anbindungen
scripts/           Import-Werkzeug für die Kommandozeile
tests/             Modultests und ein Rauchtest im Browser
```

Die Logik, die sich lohnt zu prüfen, liegt bewusst frei von App-Zustand:
`state/shopping.js` verdichtet Einträge zu einer Liste, `state/week.js` rechnet
Kalenderwochen, `sources/ingredients.js` zerlegt Zutatenzeilen,
`sources/schemaorg.js` liest Rezeptseiten. Der Store ruft diese Funktionen nur
auf.

## Tests

```bash
npm test           # 31 Modultests: Mengen, Einkaufsliste, Import, Korpus
npm run test:browser   # Rauchtest in Chromium gegen die gebaute App
```

Die Modultests prüfen unter anderem, dass das Korpus vollständig ist, dass
Mengen über Einheitengrenzen korrekt summiert werden, dass imperiale Einheiten
metrisch ankommen und dass Zutaten in der richtigen Abteilung landen. Der Browsertest fährt die App hoch, plant eine
Woche, zieht eine Karte mit der Maus in einen anderen Slot und prüft
Einkaufsliste und Shop-Übergabe.

Für den Browsertest muss die gebaute App laufen:

```bash
npm run build && npm run preview &
npm run test:browser
# abweichender Browser: CHROMIUM_PATH=/pfad/zu/chrome npm run test:browser
```

## Lizenz

Der Quellcode steht unter MIT. Für die Rezeptdaten gelten die Lizenzen der
jeweiligen Quellen, wie oben und im Quellenverzeichnis der App angegeben.
