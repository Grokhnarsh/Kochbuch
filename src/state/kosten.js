/**
 * Was kostet ein Gericht ungefaehr?
 *
 * Gerechnet wird ueber die Naehrwertrechnung: die weiss schon, welches
 * Lebensmittel hinter "2 EL Olivenöl" steckt und wie viel Gramm das sind.
 * Dazu kommt ein Richtpreis je Kilogramm (Fluessiges je Liter, wie es im
 * Laden steht): gerundete Durchschnittspreise deutscher Supermaerkte,
 * Eigenmarke und Markenware gemischt, Stand 2026. Angebote, Bio, Region
 * und Packungsgroessen verschieben das; es ist eine Groessenordnung, kein
 * Kassenbon. So steht es auch in der Oberflaeche.
 */

/** Euro je kg (bzw. Liter) nach Lebensmittel-Id der Naehrwerttabelle */
export const PREISE = {
  weizenmehl: 0.9, vollkornmehl: 1.5, roggenmehl: 1.5, dinkelmehl: 2, maismehl: 2.5, griess: 1.8, staerke: 3,
  haferflocken: 1.6, reis: 2.5, rundkornreis: 3, nudeln: 1.8, semmelbroesel: 2.5, weissbrot: 3, broetchen: 4,
  roggenbrot: 3.5, vollkornbrot: 4, blaetterteig: 4.5, zwieback: 4.5, sago: 6, loeffelbiskuit: 7,
  zucker: 1, brauner_zucker: 2.5, puderzucker: 2, honig: 10, agavendicksaft: 12, ahornsirup: 25, melasse: 8,
  marmelade: 5, kakao: 12, zartbitter: 10, milchschokolade: 8, weisse_schokolade: 9, marzipan: 10, nougat: 12,
  rosinen: 6, orangeat: 10, gelatine: 30, puddingpulver: 6, backpulver: 8, natron: 6, hefe: 4, trockenhefe: 20,
  butter: 9, butterschmalz: 10, margarine: 4, schmalz: 5, olivenoel: 9, rapsoel: 2.5, frittieroel: 2.5,
  erdnussoel: 6, sesamoel: 15, kokosoel: 10, walnussoel: 25,
  milch: 1.1, fettarme_milch: 1, buttermilch: 1.5, kondensmilch: 3.5, kondensmilch_ungezuckert: 3, sahne: 4.5,
  creme_fraiche: 6, schmand: 4.5, joghurt: 2, quark: 3.5, frischkaese: 7, parmesan: 20, hartkaese: 14, gouda: 9,
  cheddar: 12, feta: 10, mozzarella: 7, ricotta: 8, camembert: 9, ziegenkaese: 18,
  ei: 5, eigelb: 5, eiweiss: 5,
  rinderhack: 9, schweinehack: 7, rindfleisch: 14, rindersteak: 30, schweinefleisch: 8, schweinefilet: 15,
  schweinebauch: 7, speck: 12, kochschinken: 13, rohschinken: 22, haehnchenbrust: 10, haehnchen: 5, pute: 12,
  lamm: 18, taube: 30, zunge: 12, nieren: 8, talg: 4, kalb: 28, ente: 10, wild: 25, kaninchen: 15, bratwurst: 9,
  salami: 15, leber: 7,
  kabeljau: 25, lachs: 20, raeucherlachs: 30, forelle: 18, thunfisch: 12, hering: 10, matjes: 14, makrele: 12,
  aal: 40, sardellen: 30, sardinen: 10, stockfisch: 30, krebse: 30, garnelen: 22, muscheln: 8, tintenfisch: 15,
  kartoffeln: 1.2, suesskartoffel: 3, zwiebel: 1.2, schalotte: 4, fruehlingszwiebel: 5, knoblauch: 8, moehren: 1.2,
  tomaten: 3, dosentomaten: 1.5, tomatenmark: 4, paprika: 4, gruene_paprika: 4, chili: 10, zucchini: 2.5,
  aubergine: 3, gurke: 2.5, gewuerzgurke: 3, weisskohl: 1, rotkohl: 1.2, sauerkraut: 2, lauch: 2.5,
  sellerieknolle: 2.5, staudensellerie: 3.5, suppengruen: 3, spinat: 6, champignons: 5, erbsen: 3.5,
  gruene_bohnen: 4, weisse_bohnen: 3, kidneybohnen: 3, kichererbsen: 3, linsen: 3, rote_linsen: 3.5, mais: 3.5,
  kuerbis: 2, rote_bete: 2.5, brokkoli: 3.5, blumenkohl: 3, kohlrabi: 3, rosenkohl: 4, gruenkohl: 4, spargel: 10,
  fenchel: 4, salat: 4, radieschen: 5, steckrueben: 2, rueben: 2, sauerampfer: 20, pastinaken: 3.5, avocado: 8,
  oliven: 10, ingwer: 6, bambussprossen: 5, kraeuter: 25,
  aepfel: 2.5, birnen: 3, bananen: 1.8, zitrone: 3.5, zitronensaft: 3, zitronenschale: 10, limette: 6,
  limettensaft: 6, orange: 2.5, orangensaft: 1.8, apfelsaft: 1.5, ananas: 3, aprikosen: 5, trockenaprikosen: 12,
  pflaumen: 3, backpflaumen: 10, kirschen: 8, erdbeeren: 6, beeren: 10, rhabarber: 4, mango: 5, trauben: 4,
  feigen: 12, datteln: 8, quitten: 4, kokosraspel: 8, kokosmilch: 4,
  mandeln: 12, maronen: 10, haselnuesse: 14, walnuesse: 14, pinienkerne: 50, cashew: 18, pistazien: 30,
  erdnuesse: 7, erdnussbutter: 8, sesam: 8, tahin: 12, sonnenblumenkerne: 4, kuerbiskerne: 12, leinsamen: 4, mohn: 8,
  salz: 0.5, pfeffer: 30, zimt: 25, safran: 5000, muskat: 40, paprikapulver: 20, kreuzkuemmel: 30, kuemmel: 15,
  kurkuma: 25, curry: 25, nelken: 50, ingwerpulver: 30, cayenne: 30, koriandersamen: 20, kardamom: 80, anis: 40,
  piment: 40, getr_kraeuter: 40, lorbeer: 60, senfkoerner: 15, vanille: 400,
  senf: 3, essig: 1.5, weinessig: 3, apfelessig: 2.5, balsamico: 6, sojasauce: 6, worcester: 10, ketchup: 3,
  mayonnaise: 4, meerrettich: 8, kapern: 15,
  // Bruehe steht als Fluessigkeit im Rezept; aus Pulver angesetzt kostet der Liter wenig
  gemuesebruehe: 0.4, fleischbruehe: 0.5, huehnerbruehe: 0.5, fischfond: 6, bruehwuerfel: 15,
  wasser: 0, weisswein: 5, rotwein: 5, bier: 2, spirituosen: 15, kaffee: 1.5,
  tofu: 6, tempeh: 12, sojaschnetzel: 10, fleischersatz: 12, sojamilch: 1.8, mandeldrink: 2.5, reisdrink: 2,
  pflanzensahne: 4.5, kokossahne: 6, sojajoghurt: 4, kaeseersatz: 15,
};

export const HINWEIS_KOSTEN = 'Grobe Schätzung aus Richtpreisen deutscher Supermärkte (Stand 2026), '
  + 'ohne Angebote und Bio; Gewürze anteilig. Kein Kassenbon.';

/** Guenstigere Gegenstuecke fuer teure Zutaten, die dasselbe leisten */
export const ALTERNATIVEN = {
  pinienkerne: ['sonnenblumenkerne', 'Sonnenblumenkerne, geröstet'],
  parmesan: ['hartkaese', 'würziger Hartkäse wie Grana Padano oder Bergkäse'],
  cashew: ['erdnuesse', 'Erdnüsse'],
  pistazien: ['mandeln', 'Mandeln'],
  haehnchenbrust: ['haehnchen', 'Hähnchenschenkel, ausgelöst'],
  kalb: ['schweinefleisch', 'Schweineschnitzel'],
  rindersteak: ['rindfleisch', 'Rinderhüfte oder Schmorfleisch'],
  ahornsirup: ['honig', 'Honig'],
  raeucherlachs: ['forelle', 'geräucherte Forelle'],
  ziegenkaese: ['feta', 'Feta'],
  walnussoel: ['rapsoel', 'Rapsöl'],
  kabeljau: ['hering', 'Seelachs oder Hering'],
};

/** Preis eines Postens in Euro (Gramm × Euro je kg) */
const euro = (posten) => (PREISE[posten.lebensmittel] ?? null) == null ? null : (posten.gramm / 1000) * PREISE[posten.lebensmittel];

/**
 * Kosten eines Rezepts fuer seine angegebene Menge.
 *
 * @param {object} recipe mit voller Naehrwertrechnung (vollstaendig())
 * @returns {{gesamt:number, jePortion:number|null, posten:{name:string, euro:number}[],
 *            ohnePreis:string[], abdeckung:number, sparen:{statt:string, mit:string, ersparnis:number}[]}|null}
 */
export function kostenRezept(recipe) {
  const n = recipe?.naehrwerte;
  if (!n?.posten?.length) return null;
  const posten = [];
  const ohnePreis = [...(n.unbekannt || [])];
  for (const p of n.posten) {
    const e = euro(p);
    if (e == null) ohnePreis.push(p.name);
    else posten.push({ name: p.name, lebensmittel: p.lebensmittel, gramm: p.gramm, euro: e });
  }
  const gesamt = posten.reduce((s, p) => s + p.euro, 0);
  const bewertet = posten.length + ohnePreis.length;
  const portionen = recipe.servings || 0;

  const sparen = posten
    .filter((p) => ALTERNATIVEN[p.lebensmittel] && p.euro >= 1)
    .map((p) => {
      const [id, mit] = ALTERNATIVEN[p.lebensmittel];
      const ersparnis = p.euro - (p.gramm / 1000) * PREISE[id];
      return { statt: p.name, mit, ersparnis };
    })
    .filter((s) => s.ersparnis >= 0.5)
    .sort((a, b) => b.ersparnis - a.ersparnis);

  return {
    gesamt,
    jePortion: portionen > 0 && (n.art === 'portion' || n.art === 'stueck') ? gesamt / portionen : null,
    posten: posten.sort((a, b) => b.euro - a.euro),
    ohnePreis,
    abdeckung: bewertet ? posten.length / bewertet : 0,
    sparen,
  };
}

/**
 * Kosten der Woche: jedes Gericht auf seine geplante Portionszahl gerechnet.
 *
 * @param {{recipeId:string, servings:number}[]} eintraege
 * @param {(id:string)=>object|undefined} rezept liefert das vollstaendig gerechnete Rezept
 * @returns {{gesamt:number, gerichte:number, geschaetzt:number}}
 */
export function kostenWoche(eintraege, rezept) {
  let gesamt = 0;
  let geschaetzt = 0;
  for (const e of eintraege) {
    const r = rezept(e.recipeId);
    const k = r && kostenRezept(r);
    if (!k || k.abdeckung < 0.6) continue;
    gesamt += k.gesamt * (e.servings / (r.servings || 1));
    geschaetzt += 1;
  }
  return { gesamt, gerichte: eintraege.length, geschaetzt };
}

/** 3.456 -> "3,46 €", 0.4 -> "0,40 €" */
export function euroText(betrag) {
  return `${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
