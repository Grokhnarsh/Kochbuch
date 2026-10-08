# Kochbuch

Ein Wochen-Essensplaner in Form eines Stundenplans: sieben Tageszeilen, vier
Mahlzeitenspalten, Gerichte in den Feldern, verschiebbar mit der Maus.
Dazu eine Bibliothek mit rund 13.100 Rezepten aus gemeinfreien Kochbüchern,
offen lizenzierten Wikis und frei lizenzierten Kochbüchern, eigene Rezepte zum
Selbstschreiben (auch aus eigenen Büchern, mit Quellenangabe), Allergenangaben und
berechnete Nährwerte zu jedem Gericht, Vorschläge für eine ausgewogene Woche,
eine Einkaufsliste, die sich aus dem Plan selbst zusammenrechnet, und der Weg
von dort in den REWE-Onlineshop.

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
- **Woche füllen** plant nach Vorgaben: welche Mahlzeiten und Tage, für wie
  viele Personen, welche Ernährungsform, wie lange die Zubereitung höchstens
  dauert, ohne welche Allergene und wie oft Fisch. Auf Wunsch zieht der Plan
  gut bewertete Gerichte vor oder solche, deren Zutaten im Vorrat liegen.
  Grenzen wie Allergene und Zeit gelten immer; der Zufall bleibt, zwei Klicks
  ergeben zwei Wochen. **Noch einmal würfeln** ersetzt nur, was eben geplant
  wurde — von Hand Gelegtes bleibt. Die Vorgaben werden gespeichert, und
  **Anderes Gericht** in der Rezeptansicht tauscht ein einzelnes Feld nach
  denselben Regeln aus.
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
Woche füllen, Woche leeren, Vorrat und Quellen, liegt unter **⋯** — auf
mittleren Breiten bis 1400 Pixel auch am Rechner.

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

Damit das trägt, entscheidet an jeder Stelle des Namens das längste passende
Stichwort. Sonst wäre Sojamilch Milch, Muskatnuss eine Nuss, Erdnussbutter
Butter und Hackfleisch vom Schwein ein Getränk mit Sulfiten. Eine andere
Stelle zählt aber für sich: „Butter oder Margarine“ enthält Milch, auch wenn
Margarine allein sie nur enthalten *kann*, und in „Joghurt mit Kokosmilch“
bleibt der Joghurt Milch. Umgekehrt müssen lange
Grundwörter auch mitten im Wort gefunden werden, sonst bliebe „Ziegenkäserolle“
unerkannt; bei kurzen Stichwörtern wäre genau das fatal, deshalb gilt es nur
für eine ausgewählte Liste. Rund hundert solcher Fälle stehen als Tests in
`tests/allergene.test.js`.

Steht **„vegan“** an einer Zutat — „vegane Butter“, „Joghurt (vegan)“ —, ist
sie frei von Milch, Ei, Fisch, Krebs- und Weichtieren; was pflanzlich darin
ist, Soja, Hafer oder Nüsse, bleibt stehen. „Pflanzlich“ allein genügt dafür
nicht, manche pflanzliche Sahne enthält Buttermilch. Und es zählt die erste
Wahl: „Butter (vegan: Margarine)“ und „Butter oder vegane Butter“ enthalten
Milch.

> **Wichtig:** Das Verfahren kennt nur, was im Rezept steht. Was ein
> Fertigprodukt tatsächlich enthält, steht auf der Packung, nicht im
> Rezepttext. Die Angaben sind deshalb eine Hilfe beim Aussortieren — bei
> einer Allergie ersetzen sie das Etikett nicht. Genau dieser Satz steht auch
> in der App an jeder Stelle, an der Allergene erscheinen.

## Nährwerte

Zu jedem Rezept berechnet die App Energie, Fett, gesättigte Fettsäuren,
Kohlenhydrate, Zucker, Ballaststoffe, Eiweiß und Salz — die Angaben der
EU-Nährwertdeklaration, dazu Ballaststoffe. Sie stehen in der Rezeptansicht
als Tabelle mit dem Anteil an der Referenzmenge, als Kalorienzahl auf jeder
Karte und im Plan, und unter **Nährwerte** als Übersicht: die geplante Woche
Tag für Tag und alle Rezepte in einer sortierbaren Tabelle.

**Woher die Zahlen kommen.** Jede Zutat wird einem Lebensmittel der
USDA-Datenbank *FoodData Central, SR Legacy* zugeordnet (gemeinfrei, CC0) —
267 Einträge, von Weizenmehl bis Garam Masala. Die Zuordnung steht in
`scripts/naehrwerte/zuordnung.mjs`, und zwar nur sie: die Werte selbst zieht
`npm run naehrwerte` aus der Datenbank und schreibt sie nach
`src/data/naehrwerte.json`. Keine Zahl ist von Hand eingetragen; jede trägt
ihre FDC-Nummer. Löffel- und Stückgewichte kommen ebenfalls aus der
Datenbank, wo es passt, sonst aus deutschen Größen (ein Ei der Größe M
wiegt ohne Schale 50 g, nicht 44 g wie ein amerikanisches „medium“).

**Vegane Küche.** Tempeh, Sojaschnetzel, pflanzliche Sahne, Kokoscreme,
Soja- und Mandeldrink haben eigene Einträge. Steht „vegan“ vor einem
tierischen Lebensmittel, gilt sein pflanzliches Gegenstück: „vegane Butter“
ist Margarine, „veganes Hack“ ein Fleischersatz und kein Rinderhack, das die
Gesundheitsbewertung als rotes Fleisch zählen würde.

**Was als Portion zählt.** Bei Rezepten für Personen gelten die Werte je
Portion, bei gezählten Stücken je Stück. Ein Blech Butterkuchen, ein Glas
Marmelade, ein Liter Brühe oder ein Brot wird je 100 g angegeben — „je
Portion“ wären das sechstausend Kalorien. Dasselbe gilt, wenn eine Portion
mehr als 1,2 kg wiegen oder mehr als 2000 kcal haben müsste: dann stimmt die
Portionszahl des Rezepts nicht, und die App sagt das.

**Fett, das man nicht isst.** Mehr als 400 g Fett in einem Rezept ist
Frittierfett; davon wird ein Zehntel gerechnet. Mehr als 40 g je Portion ist
Bratfett — 300 g Butterschmalz für vier Schnitzel —, davon ein Viertel. Steht
Öl ohne Menge im Rezept, wird das vermerkt: auf dem Papier sähe Frittiertes
sonst aus wie Rohkost.

**Wie belastbar.** Zutaten ohne Menge („Salz nach Geschmack“) fließen nicht
ein und werden genannt, ebenso Zutaten, die sich nicht zuordnen lassen.
Daraus ergibt sich die Abdeckung: ab 90 % gelten die Werte als belastbar, ab
70 % als Schätzung, darunter zeigt die App keine Zahlen, sondern sagt, was
fehlt. Von den 560 Rezepten sind derzeit 445 belastbar, 92 geschätzt, 23 ohne
Werte. Gerechnet wird mit Rohgewichten, ohne Garverluste.

**Die Woche** wird je Person gerechnet: aus jeder geplanten Mahlzeit eine
Portion. Wie viele Portionen man kocht, bestimmt den Einkauf, nicht, was einer
isst — die App hat das anfangs verwechselt, siehe unten.

## Gesunde Vorschläge

**Gesunde Vorschläge** schlägt je Mahlzeit gut bewertete Gerichte vor, die
noch nicht im Plan liegen; **Einplanen** legt sie in das nächste freie Feld,
**Woche gesund füllen** belegt alle freien Frühstücks-, Mittags- und
Abendfelder auf einmal, gelost aus den besten zwölf, damit nicht jede Woche
gleich aussieht. Die Filter der Bibliothek gelten mit: wer „ohne Milch“ oder
„vegan“ gewählt hat, bekommt nur Passendes.

Die Bewertung von 0 bis 100 ist absichtlich nachvollziehbar statt raffiniert
— ein Grundwert und benannte Kriterien nach den Empfehlungen der DGE und der
WHO, jedes mit Punkten und einem Satz dazu:

- Anteil von Gemüse, Obst und Hülsenfrüchten am Gewicht, Vollkorn
- Energiedichte (unter 125 kcal je 100 g gilt als niedrig)
- gesättigte Fettsäuren, Zucker und Salz je Portion, gemessen an einem
  Drittel der Tagesreferenz; Ballaststoffe und Eiweiß ebenso
- wenig rotes und verarbeitetes Fleisch, Fisch als Pluspunkt
- satt soll es auch machen: ein Tomatensalat mit 60 kcal ist gesund, aber
  kein Mittagessen

In der Rezeptansicht stehen Punkte und Gründe unter **Ausgewogenheit**, in der
Bibliothek markiert ein 🌿 Gerichte ab 60 Punkten.

Was der geplanten Woche fehlt, gibt Vorschlägen Vorrang, die genau das
mitbringen: liegen die Ballaststoffe bisher bei 16 statt 30 g am Tag, stehen
ballaststoffreiche Gerichte vorn und tragen den Vermerk „passt zur Woche“.

> Das ist eine Orientierung aus berechneten Werten, keine Ernährungsberatung.
> Bei besonderem Bedarf zählt der ärztliche Rat — so steht es auch in der App.

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

**Aus eigenen Kochbüchern.** Wer ein Rezept aus einem gekauften Buch
abschreibt, trägt unter *Quelle* Buch oder Website, Autor oder Verlag, Jahr,
Seite und einen Link ein. Die Angabe steht dann in der Rezeptansicht
(„Quelle: *Das große Kochbuch*, Beispiel-Verlag, 1998, S. 214“), auf der
Karte und in der Suche — ein Rezept findet sich also auch über den Titel des
Buchs. Eine Abschrift für den eigenen Gebrauch ist erlaubt; veröffentlichen
ließe sie sich nicht, auch nicht mit Quellenangabe. Deshalb bleiben solche
Rezepte, wie alle eigenen, in diesem Browser.

Sie liegen im `localStorage` dieses Browsers — die App hat keinen Server, der
sie aufbewahren könnte. Ein geleerter Browser oder ein anderes Gerät heißt
also: weg. `state/eigene.js` bringt dafür `alsDatei()` und `ausDatei()` mit.

## Woher die Rezepte stammen

Alle mitgelieferten Rezepte gehen auf gemeinfreie Kochbücher und offen
lizenzierte Werke zurück. Die Herkunft steht an jedem Rezept, mit Link auf
die Originalseite, und im Quellenverzeichnis der App.

**Offene Wikis, vollständig.** Jede Rezeptseite, die Zutaten und Zubereitung
hat, ist dabei. Kategorie, Mahlzeit, Küche und vegetarisch/vegan kommen aus den
Kategorien der Seite; Portionen, Zeiten und Schwierigkeit aus ihrer Infobox —
fehlt dort etwas, bleibt es leer statt geraten.

| Quelle | Lizenz | Rezepte |
| --- | --- | --- |
| [Koch-Wiki](https://www.kochwiki.org/) | CC BY-SA 3.0 | 8.962 |
| [Wikibooks-Kochbuch](https://de.wikibooks.org/wiki/Kochbuch) | CC BY-SA 4.0 | 562 + 25 aufbereitete |
| [Rezepte-Wiki (Fandom)](https://rezepte.fandom.com/de/) | CC BY-SA 3.0 | 370 |

**Historische Kochbücher im Wortlaut.** Die Rezepte stehen so da, wie sie
gedruckt wurden, mit einem Hinweis *Originaltext*. Davidis und Schiller
schreiben keine Zutatenlisten, sondern Anweisungen („Ein Viertel Pfund mageres
Schweinefleisch … dann 4 Loth Butter zu Sahne gerührt"). Die Zutaten werden
daraus erschlossen und die alten Maße umgerechnet — nach preußischem Gewicht bei
Davidis, nach bairischem bei Schiller, wie sie selbst angibt. Weil so eine
Liste unvollständig sein kann, rechnet die App daraus keine Nährwerte, und
„Woche füllen" sowie die Vorschläge lassen diese Rezepte aus; einplanen lassen
sie sich von Hand. Heyl hat echte Zutatenlisten in Gramm und gilt deshalb als
gewöhnliches Rezept.

| Quelle | Jahr | Lizenz | Rezepte |
| --- | --- | --- | --- |
| [Henriette Davidis, *Praktisches Kochbuch*](https://www.deutschestextarchiv.de/davidis_kochbuch_1849), 4. Auflage, Deutsches Textarchiv | 1849 | Text gemeinfrei, Transkription CC BY-SA 4.0 | 1.054 |
| [Viktorine Schiller, *Neuestes Süddeutsches Kochbuch*](https://www.gutenberg.org/ebooks/52879) | 1843 | gemeinfrei | 790 |
| [Hedwig Heyl, *Volks-Kochbuch*](https://www.gutenberg.org/ebooks/13921) | 1905 | gemeinfrei | 127 |
| [August Oetker, *Grundlehren der Kochkunst*](https://www.gutenberg.org/ebooks/31537), das erste Oetker-Kochbuch | 1895 | gemeinfrei | 10 |

Das Oetker-Buch von 1895 ist gemeinfrei — August Oetker starb 1918 — und vor
allem Hauswirtschaftslehre; Rezepte stehen nur im Kapitel „Dr. Oetker's
Recepte": Kuchen und Gebäck mit dem damals neuen Backpulver, im Wortlaut samt
Werbeton. Die heutigen Dr.-Oetker-Kochbücher sind geschützt und bleiben
draußen. Ab dem Kaiserreich rechnen die Bücher metrisch; der Leser alter Texte
versteht deshalb auch „100 g Butter" und „ein viertel Liter Milch".

**Geschützt, aber frei lizenziert.** Ein urheberrechtlich geschütztes
Kochbuch darf nur hinein, wenn sein Urheber es erlaubt — eine Quellenangabe
allein genügt nicht. Marcus Petersen-Clausen hat seine Kochbücher auf
Köche-Nord.de unter Creative Commons BY-SA 3.0 gestellt: nutzbar mit
Namensnennung und unter gleichen Bedingungen. Jedes Rezept nennt Buch, Autor
und Lizenz, verlinkt die Seite im PDF und vermerkt, dass es für die App in
Zutaten und Arbeitsschritte gegliedert wurde. Übernommen werden nur Bücher,
die die Lizenz selbst nennen — 16 tun das nicht und bleiben außen vor —, und
keine, die ihr Autor als KI-erzeugt kennzeichnet. Ebenfalls nicht dabei sind
sechs Bücher, die ihre Rezepte mit Wahlkampf oder Widmungen an Diktatoren
verweben. Aus den übrigen fallen beim Lesen Kopf- und Fußzeilen, Hinweise auf
unterstützte Vereine und Parteien, Spendenkonten und Länderkunde heraus;
„Arbeitszeit: etwa 30 Minuten“ wird zur Vorbereitungszeit. Vegan heißt ein
Rezept nur, wenn es das Buch sagt und die Zutaten es bestätigen: steht in
einem veganen Buch schlicht „Butter“, gilt es als vegetarisch.

| Quelle | Lizenz | Bücher | Rezepte |
| --- | --- | --- | --- |
| [Köche-Nord.de, Kochbücher von Marcus Petersen-Clausen](https://xn--kche-nord-07a.de/kochbuecher.html) | CC BY-SA 3.0 | 59 | 1.077 |

**Von Hand aufbereitet** und sofort beim Start da: je 15 bis 20 Rezepte aus
sechs historischen Büchern, behutsam modernisiert — metrische Mengen, heutige
Gartemperaturen, zeitgemäße Sprache.

| Quelle | Jahr | Lizenz | Rezepte |
| --- | --- | --- | --- |
| [Henriette Davidis, *Praktisches Kochbuch*](https://www.projekt-gutenberg.org/davidis/kochbuch/kochbuch.html) | 1845 | gemeinfrei | 20 |
| [Katharina Prato, *Die Süddeutsche Küche*](https://austria-forum.org/web-books/en/diesuddeutschek00de1858kfu) | 1858 | gemeinfrei | 20 |
| [Isabella Beeton, *Book of Household Management*](https://www.gutenberg.org/ebooks/10136) | 1861 | Public Domain | 20 |
| [Pellegrino Artusi, *La scienza in cucina*](https://www.gutenberg.org/ebooks/59047) | 1891 | Public Domain | 20 |
| [Fannie Farmer, *Boston Cooking-School Cook Book*](https://www.gutenberg.org/ebooks/65061) | 1896 | Public Domain | 20 |
| [Hannah Glasse, *The Art of Cookery*](https://archive.org/details/artofcookermade00glas) | 1747 | Public Domain | 15 |

**Was nicht dabei ist, und warum:**

- **Chefkoch, Cookidoo (Thermomix), Rezeptwelt, REWE** — die Rezepttexte sind
  urheberrechtlich geschützt, und die Nutzungsbedingungen verbieten das
  massenhafte Kopieren. Einzelne, selbst ausgewählte Rezepte lassen sich
  importieren (siehe unten); ins Repository gelangen sie nie.
- **Gekaufte Kochbücher** — Dr. Oetker, GU, die Thermomix-Bücher und alle
  anderen, deren Rechte vorbehalten sind. Eine Quellenangabe ersetzt die
  Erlaubnis nicht. Zum eigenen Gebrauch lassen sich Rezepte daraus als
  eigenes Rezept mit Quelle abschreiben; sie bleiben dann im Browser.
- **Kochbücher, die nur als Scan vorliegen** — ohne Transkription gibt es
  keinen Text, und eine Texterkennung alter Frakturdrucke wäre zu fehlerhaft.
- **Frühneuhochdeutsche Bücher** wie Rumpolt (1581) oder Wecker (1598) im
  Deutschen Textarchiv — ohne verwertbare Mengen und für heutige Leser kaum
  nachzukochen.
- **Englischsprachige Sammlungen** wie TheMealDB und der UniTools-Datensatz —
  die App ist durchgehend deutsch. Aus demselben Grund fehlen drei Rezepte,
  die schon bei Davidis „Round of Beef" heißen.

### Wie die großen Sammlungen geladen werden

Dreizehntausend Rezepte im Programmbündel würden den Start um Sekunden verzögern.
Deshalb liegen die Wikis und die großen Bücher als statische Dateien unter
`public/korpus/` — in Teilen von höchstens 2 MB, ein Rezept je Zeile — und
kommen nach dem ersten Bild dazu. Die Bibliothek wächst dabei sichtbar, der
Plan zeichnet Gerichte nach, die er vorher noch nicht kannte.

Allergene, Nährwerte und Bewertung rechnet das Werkzeug beim Bauen und legt je
Rezept eine knappe Zusammenfassung ab; das reicht für Karten, Filter,
Wochensummen und Vorschläge. Wer ein Rezept öffnet, bekommt die volle Rechnung
mit Gründen, Posten und Hinweisen — für genau dieses eine. Beide Wege laufen
durch dieselbe Funktion, und ein Test prüft, dass keine Zusammenfassung
veraltet ist.

```bash
npm run korpus -- kochwiki            # eine Sammlung neu holen
npm run korpus -- --alle              # alle
npm run korpus -- --neu-rechnen       # nur Zusammenfassungen, etwa nach
                                      # Änderungen an der Nährwerttabelle
```

Abgerufen wird höflich: mit Name und Kontaktadresse im User-Agent, einer Pause
zwischen den Anfragen je Server, Warten nach „429" so lange, wie der Server
sagt, und einem Plattencache unter `data/cache/` — ein zweiter Lauf fragt
nichts erneut. Aus MediaWiki-Wikis kommen fünfzig Seiten je Anfrage, fürs
Koch-Wiki also rund zweihundert Anfragen statt neuntausend.

### Live nachladen

Unter **Quellen → Live nachladen** holt die App die **neuesten** Seiten aus
Koch-Wiki und Wikibooks — alles Ältere liegt dem Korpus schon bei. Beide
senden `access-control-allow-origin: *` und funktionieren direkt aus dem
Browser. Seiten mit englischem Titel bleiben außen vor, Bruchvorlagen wie
`{{B|1|2}}` werden in Mengen übersetzt statt gestrichen, sehr knappe Schritte
an den vorigen angehängt statt verworfen.

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

## Kochmodus und Timer

**Kochmodus** in der Rezeptansicht zeigt einen Arbeitsschritt bildschirmfüllend
in großer Schrift. Weiter geht es mit Wischen, den Pfeiltasten oder den großen
Knöpfen unten; die Zutaten, auf die gewählten Portionen gerechnet, klappen
daneben auf und lassen sich abhaken. Solange der Kochmodus offen ist, bleibt
der Bildschirm an (Screen Wake Lock, wo der Browser es erlaubt).

Zeitangaben in den Schritten werden zu Knöpfen: „15 Minuten köcheln",
„1 Std. 30 Min. ruhen lassen", „eine halbe Stunde", auch „17 Min./100 °C"
in Thermomix-Rezepten. Ein Tipp stellt den Timer. Bei einer Spanne wie
„20–25 Minuten" gilt die untere Grenze — nachsehen schadet nie, zu spät schon.
Mehrere Timer laufen nebeneinander in einer Leiste unten rechts, auch nach
dem Schließen des Kochmodus und nach einem versehentlichen Neuladen. Ist einer
abgelaufen, piept und vibriert es, bis jemand quittiert. Gerechnet wird mit
dem Endzeitpunkt, nicht mit gezählten Sekunden; ein Tab im Hintergrund geht
deshalb nicht nach.

## Vorrat

Unter **Vorrat** steht, was in Küche und Kammer liegt, mit Menge („1 kg
Mehl") oder ohne („Salz"). **Grundzutaten eintragen** füllt Salz, Pfeffer,
Zucker, Mehl, Öl, Essig, Senf und Brühe auf einmal ein.

- **Die Einkaufsliste zieht den Vorrat ab.** Ohne Menge gilt eine Zutat als
  vorhanden; mit Menge wird gerechnet: 1 kg Mehl im Vorrat, 1,2 kg im Plan,
  bleiben 200 g auf der Liste. Was der Vorrat deckt, steht getrennt darunter.
  Passen die Einheiten nicht zusammen, gilt die Position als vorhanden, mit
  dem Vermerk „Menge prüfen". **In den Vorrat** übernimmt nach dem Einkauf die
  abgehakten Positionen.
- **Was kann ich kochen?** sucht Rezepte, denen höchstens drei Zutaten
  fehlen, zuerst die, für die alles da ist. Salz, Pfeffer und Wasser zählen
  nicht.

Ob ein Vorratsposten eine Zutat deckt, entscheidet das Ende des Namens, wie im
Deutschen üblich: Weizenmehl ist Mehl, Olivenöl ist Öl, Eier decken „1 Ei".
Tomatenmark ist aber keine Tomate, Reisnudeln sind kein Reis, und Milch
ersetzt keine Kokosmilch. Eine Näherung bleibt es: Wer „Zucker" einträgt, dem
gilt auch Puderzucker als vorhanden. Gekochtes zieht die App nicht selbst ab
— der Vorrat ist eine Liste dessen, was da ist, kein Lagerbuch.

## Haushalt

Unter **Haushalt** stehen die Personen, die mitessen: mit Ernährungsform,
Allergenen und dem, was sie nicht mögen („Pilze, Koriander"). Rezepte, die für
jemanden nicht passen, tragen in der Bibliothek ein ⚠ mit Namen, und die
Rezeptansicht sagt, warum („Anna: enthält Nüsse"). **Woche füllen** plant auf
Wunsch für alle am Tisch: Allergene aller zählen, Ernährungsformen gelten
zusammen (vegan erfüllt dabei auch vegetarisch), und ohne eigene
Personenzahl kocht der Plan für alle, die mitessen. Wer diese Woche nicht da
ist, wird abgehakt statt gelöscht. Der Filter **Passt für den ganzen
Haushalt** in der Bibliothek zeigt nur Rezepte ohne Konflikt.

## Bewertungen, Notizen, Kochverlauf

In jeder Rezeptansicht gibt es Sterne, eine Notiz („beim nächsten Mal weniger
Salz") und **Heute gekocht**; wer den Kochmodus bis zum letzten Schritt
durchgeht, trägt das Gericht ebenfalls ein. Unter Haushalt → **Gekocht** stehen
Lieblinge und der Verlauf nach Tagen. Die Bibliothek filtert nach **Lieblingen**
und **Schon gekocht**, und **Woche füllen** zieht auf Wunsch Gerichte mit vier
oder fünf Sternen vor, schlecht bewertete selten und gerade Gekochtes erst nach
zehn Tagen wieder.

## Saison und Reste

Ein Saisonkalender kennt rund fünfzig Obst- und Gemüsesorten aus heimischem
Anbau, Freiland oder Lager, auf Monate gerundet. Die Rezeptansicht sagt, welche
Zutaten gerade Saison haben und welche nicht („Erdbeeren: Mai bis Juli"); was
haltbar gemacht ist — Marmelade, Dosentomaten, Tomatenmark — kennt keine
Saison, und Ganzjähriges wie Kartoffeln zählt nicht mit. **Vorrat → Saison**
zeigt, was im Monat wächst, mit passenden Gerichten; die Bibliothek filtert
nach **Saisonal in diesem Monat**, und Woche füllen zieht Saisonales auf
Wunsch vor.

Die Einkaufsliste rechnet aus, was nach der Woche in angebrochenen Packungen
bleibt: Braucht der Plan 120 ml Sahne, bleiben vom 200-ml-Becher 80 ml. Für
jeden Rest stehen Rezeptideen daneben, die ihn aufbrauchen. Gerechnet wird für
Verderbliches in üblichen Packungsgrößen (Becher, Dose, Kugel); Mehl und Reis
halten sich und gehören in den Vorrat.

## Kosten

Was ein Gericht ungefähr kostet, folgt aus der Nährwertrechnung — die weiß
schon, welches Lebensmittel hinter „2 EL Olivenöl" steht und wie viel Gramm
das sind — und einem Richtpreis je Kilogramm oder Liter: gerundete
Durchschnittspreise deutscher Supermärkte, Eigenmarke und Markenware gemischt,
Stand 2026. Die Rezeptansicht nennt Gesamt- und Portionspreis, was am meisten
kostet, und günstigere Gegenstücke, wo sie dasselbe leisten (Sonnenblumenkerne
statt Pinienkernen, Hartkäse statt Parmesan). Die Einkaufsliste schätzt die
Woche. Angebote, Bio und Packungsgrößen verschieben das; es ist eine
Größenordnung, kein Kassenbon, und so steht es auch da.

## Sichern, Teilen, Drucken

Alles liegt im Browser. Unter Haushalt → **Sichern & Teilen** entsteht eine
Sicherungsdatei mit Plänen, eigenen Rezepten, Importen, Vorrat, Haushalt,
Bewertungen und auf Wunsch den Fotos; eingelesen ersetzt sie die Daten im
Browser. Was hereinkommt, wird geprüft und bereinigt. Ist die Datei **für
andere**, bleiben Abschriften aus eigenen Kochbüchern und von Webseiten
importierte Rezepte draußen: die eigene Kopie ist erlaubt, das Weitergeben
nicht.

**Link teilen** schickt den Wochenplan als Adresse (über das Teilen-Menü des
Geräts oder in die Zwischenablage). Wer ihn öffnet, wird gefragt, ob der Plan
übernommen werden soll. Der Link trägt nur Rezepte aus der gemeinsamen
Bibliothek; eigene und importierte kennt der Empfänger nicht.

**Drucken** gibt Wochenplan, Einkaufsliste mit Kästchen zum Abhaken oder ein
Rezeptheft der Woche aus — jedes Gericht einmal, mit Zutaten für die geplanten
Portionen und der Quellenangabe samt Lizenz. Über den Druckdialog lässt sich
das auch als PDF speichern.

## Fotos

Eigene Rezepte bekommen auf Wunsch ein Foto. Es wird auf höchstens 1200 Pixel
verkleinert und in IndexedDB dieses Browsers gespeichert — für den
`localStorage` wären Bilder zu groß — und steht oben in der Rezeptansicht.

## Offline und als App

Die App lässt sich installieren (Manifest mit Symbol) und läuft ohne Netz: ein
Service Worker hält Startseite, Programmdateien und die großen Sammlungen
vor. Die Startseite kommt aus dem Netz, wenn es eins gibt, sonst aus dem
Speicher; die Programmdateien tragen ihren Inhalt im Namen und ändern sich nie;
die Sammlungen kommen sofort aus dem Speicher und werden im Hintergrund
erneuert. Im Entwicklungsserver ist der Service Worker aus.

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
npm run import -- --urls meine-rezepte.txt   # eine Adresse je Zeile, höchstens 50
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

Für mehrere Rezepte auf einmal: die Adressen der Lieblingsrezepte in eine
Textdatei schreiben und `npm run import -- --urls datei.txt` aufrufen. Das
Werkzeug holt sie nacheinander mit fünf Sekunden Pause und schreibt
`data/importiert/sammlung.json`; diese Datei liest die App unter **Quellen →
Sammlung laden** ein.

**Thermomix:** Einstellungen wie „10 Sek./Stufe 5", „5 Min./100°C/Stufe 1" oder
„Turbo/0,5 Sek." erkennt die App in jedem Rezept — importiert oder selbst
geschrieben —, hebt sie in der Rezeptansicht hervor und führt das Rezept unter
dem Schlagwort *Thermomix*. Von Cookidoo kommen Zutaten, Portionen und Zeiten;
die Arbeitsschritte zeigt Cookidoo nur angemeldeten Nutzern, das Rezept sagt
das dann ausdrücklich. Seiten, die ihre Schritte nicht als schema.org-Daten
liefern, liest der Importer unter der Überschrift „Zubereitung" aus dem
Seitentext.

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
  data/            Rezeptkorpus als JSON, Quellenregister, Suchindex,
                   Nachladen der großen Sammlungen (korpus.js)
    books/         die von Hand aufbereiteten Bücher, eines je Datei
  state/           Wochenplan, Kalenderrechnung, Mengenarithmetik,
                   Einkaufsliste, Abteilungszuordnung, Allergene,
                   Nährwerte, Gesundheitsbewertung, eigene Rezepte,
                   Zeitangaben, Vorrat, Wochenplanung nach Vorgaben,
                   Saison, Reste, Kosten, Haushalt, Bewertungen, Sichern
  webgl/           Szene, Stundenplan-Raster, Canvas-Texturen
  ui/              Bibliothek, Rezeptansicht, Rezeptformular,
                   Einkaufsliste, Nährwerte, Vorschläge, Quellen,
                   Kochmodus, Timer, Vorrat, Woche füllen, Haushalt,
                   Drucken, Fotos
  sources/         Live-Adapter und schema.org-Importer
  shops/           Supermarkt-Anbindungen
public/korpus/     die großen Sammlungen in Teilen, mit Verzeichnis index.json
public/sw.js       Service Worker für den Betrieb ohne Netz, dazu Manifest und Symbole
scripts/           Import-Werkzeug für die Kommandozeile
  korpus/          Bau des Korpus: höflicher Abruf, MediaWiki, historische
                   Texte (alte Maße und Schreibung), je Quelle ein Modul
  naehrwerte/      Zuordnung zur USDA-Datenbank und Bau der Nährwerttabelle
tests/             Modultests und ein Rauchtest im Browser
```

Die Logik, die sich lohnt zu prüfen, liegt bewusst frei von App-Zustand:
`state/shopping.js` verdichtet Einträge zu einer Liste, `state/week.js` rechnet
Kalenderwochen, `state/allergens.js` erkennt Allergene, `state/naehrwerte.js`
rechnet Nährwerte, `state/gesundheit.js` bewertet und schlägt vor,
`state/rezeptform.js` macht aus Formulareingaben ein Rezept,
`state/zeiten.js` findet Zeitangaben in Schritten, `state/vorrat.js` gleicht
Vorrat und Zutaten ab, `state/planer.js` plant nach Vorgaben,
`state/saison.js`, `state/reste.js`, `state/kosten.js`, `state/profile.js`,
`state/bewertung.js` und `state/teilen.js` rechnen Saison, Reste, Kosten,
Haushalt, Bewertungen sowie Sicherung und Teilen-Link, `sources/ingredients.js` zerlegt
Zutatenzeilen, `sources/schemaorg.js` liest Rezeptseiten. Der Store ruft diese
Funktionen nur auf. `state/matcher.js` liegt darunter: die Stichwortsuche im
Zutatennamen, die Abteilungen, Allergene und Nährwerte gemeinsam benutzen.
Alles, was aus Rezeptdaten in die Seite geschrieben wird, geht durch
`ui/html.js`: Rezepte kommen auch von fremden Webseiten, und ein Titel darf nie
als Markup ausgeführt werden.

## Tests

```bash
npm test               # 162 Modultests: Mengen, Einkaufsliste, Import,
                       # Korpus, Allergene, Nährwerte, Bewertung,
                       # eigene Rezepte, Sicherheit, alte Texte, Thermomix,
                       # Köche-Nord-Bücher, Zeitangaben, Vorrat, Planer,
                       # Saison, Reste, Kosten, Haushalt, Sichern, Teilen
npm run test:browser   # Rauchtest in Chromium gegen die gebaute App
npm run test:handy     # derselbe Weg in Telefongröße, mit Berührung
```

Die Modultests prüfen unter anderem, dass das Korpus vollständig ist, dass
Mengen über Einheitengrenzen korrekt summiert werden, dass imperiale Einheiten
metrisch ankommen, dass Zutaten in der richtigen Abteilung landen — auch bei
Zusammensetzungen wie „Milchreis" oder „Olivenöl" —, dass die Allergenerkennung
die Verwechslungen aushält, die ein bloßer Teilstring machen würde, dass ein
leeres Formularfeld als fehlend und nicht als Null gilt, dass Nährwerte aus
der Datenbank stammen und Frittierfett nicht als gegessen zählt, dass ein
Linseneintopf besser abschneidet als Bratwurst in Sahne, dass Markup in
Rezeptdaten maskiert wird, und dass kein englischer Text in Titel, Kapitel
oder Schlagwörter zurückkehrt. Fürs Korpus prüfen sie jedes der dreizehntausend
Rezepte, dass jede vorberechnete Zusammenfassung der frischen Rechnung
entspricht, dass kein Teil zu groß wird und nur offen lizenzierte Quellen
darin stehen. Für die alten Bücher: dass „¼ Pfund" bei Davidis 115 g sind und
ein bairisches Pfund bei Schiller 560 g, dass „½ Ei dick Butter" Butter meint
und kein Ei, und dass „Aepfel" wieder „Äpfel" heißt. Für die Köche-Nord-Bücher:
dass Kopfzeilen, Werbung und Zwischenüberschriften nicht in die Schritte
geraten, dass ein Titel über zwei Zeilen ganz ankommt und dass „NICHT vegan!“
kein veganes Buch ist. Und für die vegane Küche: dass „vegane Butter“ keine
Milch enthält und als Margarine zählt, „Butter (vegan: Margarine)“ aber
Butter bleibt. Für die Küche: dass „1 Std. 30 Min." eine Zeitangabe ist und
„Minutensteak" keine, dass Mehl im Vorrat Weizenmehl deckt, aber Reis keine
Reisnudeln, und dass „zweimal Fisch" zweimal Fisch heißt und nicht viermal. Dazu: dass
Erdbeermarmelade keine Saison hat, dass von 120 ml Sahne 80 ml im Becher
bleiben, dass doppelt so viele Portionen doppelt so viel kosten, dass ein
Haushalt mit Nussallergie keine Nüsse auf den Plan bekommt, und dass eine
Sicherung für andere keine Abschriften aus Büchern enthält.

Der Browsertest fährt die App hoch, wartet, bis die großen Sammlungen
nachgeladen sind, lädt eine Import-Sammlung mit Thermomix-Rezept, plant eine
Woche, zieht eine Karte mit der Maus in einen anderen Slot, prüft
Einkaufsliste und Shop-Übergabe, prüft die Namensnennung eines
Köche-Nord-Rezepts samt Lizenzlink, schreibt ein eigenes Rezept mit
Quellenangabe und findet es über den Buchtitel wieder, füllt die Woche
mit gesunden Vorschlägen, plant eine Woche nach Vorgaben (ohne Milch, zweimal
Fisch, für zwei) und tauscht ein Feld aus, rechnet den Vorrat aus der
Einkaufsliste heraus, blättert durch den Kochmodus, stellt einen Timer und
lässt ihn nach einem Neuladen klingeln, legt eine Person mit Nussallergie an
und plant für sie, bewertet ein Rezept und findet es unter den Lieblingen,
prüft Saisonkalender, Reste und Kosten, druckt das Rezeptheft, sichert alles,
leert den Browser und liest die Sicherung wieder ein, übernimmt einen geteilten
Wochenplan, speichert ein Foto, startet die App ohne Netz und prüft, dass ein
eingeschleuster Titel nicht ausgeführt wird. Der Handytest geht denselben Weg in einem Fenster
von 390 × 844 Punkten, mit Berührung statt Maus.

Für den Browsertest muss die gebaute App laufen:

```bash
npm run build && npm run preview &
npm run test:browser
npm run test:handy
# abweichender Browser: CHROMIUM_PATH=/pfad/zu/chrome npm run test:browser
```

## Behobene Fehler

Eine Durchsicht des ganzen Projekts hat Folgendes gefunden, jeweils mit
Test abgesichert:

- **Eingeschleustes Markup.** Rezepttitel, Zutaten und Schritte aus
  importierten Seiten, Wikis und Sicherungsdateien wurden als HTML in die
  Seite geschrieben. Eine präparierte Rezeptseite mit dem Titel
  `Kuchen <img src=x onerror=…>` führte beim Import Code aus — nachgewiesen
  gegen den alten Stand. Alles wird jetzt maskiert, Links lassen nur `http`
  und `https` durch.
- **Kalorien hingen an der Haushaltsgröße.** Wer für acht statt vier
  Personen plante, aß rechnerisch doppelt so viel; im Plan und im
  Tagesschnitt. Jetzt zählt je Person eine Portion.
- **„Geplante Tage“ hingen an Kalorien.** Ein Tag mit einem Gericht ohne
  Kalorienangabe galt als ungeplant.
- **Portionsgrenze uneins.** Die Rezeptansicht erlaubte 75 Printen, der Plan
  kürzte still auf 24.
- **Importe gingen auf dem Handy verloren.** Gespeichert wurde nur beim
  Verlassen der Seite, und das melden mobile Browser oft nicht. Nach dem
  Neuladen fehlten außerdem Lizenzhinweis und Anbieter, und ein geplantes
  importiertes Gericht blieb im Plan leer, bis sich etwas anderes änderte.
- **Ein kaputter Eintrag legte die App lahm.** Ein beschädigtes Rezept im
  Speicher oder in einer Sicherungsdatei brachte den Start zum Absturz; jetzt
  wird jeder Datensatz geprüft und notfalls übergangen.
- **Mengen ohne Zahl.** „1∕2 Zitrone“, „½-1 TL“, „1 – 2 EL“, „175ml“, „2Eier“,
  „ca. 200 g“ blieben als Name stehen, ohne Menge — in Einkaufsliste und
  Nährwerten gleichermaßen. 67 Zeilen im Korpus waren betroffen.
- **Jedes Koch-Wiki-Rezept war ein Hauptgericht.** Auch Amaretti,
  Kräuterbutter und eine Gewürzmischung, die „Woche füllen“ dann zum
  Abendessen machte. Kategorie, Mahlzeit, Küche und vegetarisch/vegan kommen
  jetzt aus den Kategorien der Wikiseite.
- Kleineres: HTML-Entitäten wie `z.&#8239;B.` im Text, Knöpfe in Fußzeilen,
  die nicht rechts standen, ein Handytest, der donnerstags scheiterte.

Beim Ausbau auf das ganze Korpus kam dazu:

- **Erfundene Angaben bei Wikibooks.** Der Adapter setzte jedem Rezept
  20 + 30 Minuten, vier Portionen und „Hauptgericht“. Jetzt kommen die Angaben
  aus der Rezeptbox der Seite, und was dort fehlt, bleibt leer.
- **Zweispaltige Zutatentabellen doppelten den Namen** („250 Mehl Mehl“).
- **Nur der erste Zutatenabschnitt zählte.** „Zutaten für den Teig“ und
  „Zutaten für den Guss“ stehen jetzt beide in der Liste. Ebenso gingen
  Absätze in der Zubereitung verloren, sobald es daneben einen
  Aufzählungspunkt gab.
- **„Bandnudeln mit Sahnesauce“ war ein Grundrezept** — die Sauce im Titel
  entschied. Jetzt zählt der Kern des Namens vor „mit“, „in“, „an“, und eine
  Kategorie „Hauptspeise“ geht einer Kategorie „Saucen“ vor. „Leicht
  veganisierbar“ galt als vegan.
- **Die Bibliothek baute bei jedem Tastendruck 260 Karten neu.** Jetzt
  entstehen sie stapelweise beim Blättern; die Suche braucht auf einem
  gedrosselten Rechner noch ein Drittel der Zeit.

Mit den veganen Kochbüchern kam dazu:

- **Ein langes Stichwort verdeckte den Rest des Namens.** Je Allergen
  entschied das längste Stichwort im ganzen Zutatennamen. „Butter oder
  Margarine“ enthielt Milch deshalb nur „vielleicht“, „Sojamilch oder
  Kuhmilch“ gar nicht, „Walnüsse oder Erdnüsse“ keine Nüsse und
  „Schweinebraten mit Rotwein“ keine Sulfite. 231 Zutatennamen im
  Korpus waren betroffen; jetzt zählt jede Stelle für sich.
- **Vegane Ersatzprodukte galten als tierisch.** „Veganes Hack“ ging als
  Rinderhack in Nährwerte und Gesundheitsbewertung ein, „Ei-Ersatz“ als Ei,
  „Mandeldrink“ als Mandeln (250 ml ergaben 666 statt 42 kcal), und vegane
  Butter trug das Allergen Milch.
- **Stärkemehl war Weizenmehl** — in den Nährwerten und als sicheres Gluten.
  Es ist Stärke, meist aus Mais oder Kartoffeln, und steht jetzt bei „kann
  enthalten“, weil alte Rezepte auch Weizenstärke meinen.

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
