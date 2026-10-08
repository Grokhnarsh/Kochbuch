/**
 * Monatsrueckblick: was im Plan stand, was gekocht wurde, wie
 * ausgewogen, saisonal und teuer es war.
 *
 * Grundlage sind die Wochenplaene (geplant) und der Kochverlauf
 * (gekocht, soweit eingetragen). Ein Gericht, das im Plan stand und das
 * niemand als gekocht markiert hat, zaehlt als geplant — mehr weiss die
 * App nicht.
 *
 * Reine Funktion.
 */

import { istFisch } from './planer.js';
import { erfuellt } from './profile.js';
import { saisonFuer } from './saison.js';
import { kostenRezept } from './kosten.js';

const ZWEI = (n) => String(n).padStart(2, '0');

/** Das Datum eines Plan-Felds: Wochenmontag plus Tag */
function datumVon(woche, slot) {
  const [j, m, t] = woche.split('-').map(Number);
  return new Date(j, m - 1, t + Number(slot.split(':')[0]));
}

/**
 * @param {{plans:object, bewertungen:object, lookup:{get:Function}, jahr:number, monat:number,
 *          rechne?:(r:object)=>object}} eingabe monat 1–12; rechne liefert ein Rezept mit voller Naehrwertrechnung
 */
export function rueckblick({ plans, bewertungen, lookup, jahr, monat, rechne = (r) => r }) {
  const praefix = `${jahr}-${ZWEI(monat)}`;
  const geplant = [];
  for (const [woche, eintraege] of Object.entries(plans || {})) {
    for (const [slot, e] of Object.entries(eintraege || {})) {
      const d = datumVon(woche, slot);
      if (d.getFullYear() !== jahr || d.getMonth() + 1 !== monat) continue;
      const r = lookup.get(e.recipeId);
      if (r) geplant.push({ r, e, mahlzeit: slot.split(':')[1] });
    }
  }

  const gekocht = [];
  const neu = [];
  for (const [id, b] of Object.entries(bewertungen || {})) {
    const imMonat = b.gekocht.filter((t) => t.startsWith(praefix));
    if (!imMonat.length) continue;
    const r = lookup.get(id);
    if (!r) continue;
    for (let i = 0; i < imMonat.length; i += 1) gekocht.push(r);
    // Zum ersten Mal gekocht, wenn es vorher keinen Eintrag gab
    if (b.gekocht[0].startsWith(praefix)) neu.push(r);
  }

  const haupt = geplant.filter((x) => x.mahlzeit === 'mittag' || x.mahlzeit === 'abend');
  const gerichte = haupt.filter((x) => !x.e.rest);
  const anteil = (liste, f) => (liste.length ? liste.filter(f).length / liste.length : 0);

  let kosten = 0;
  let mitKosten = 0;
  for (const { r, e } of geplant) {
    if (e.rest) continue;
    const k = kostenRezept(rechne(r));
    if (!k || k.abdeckung < 0.6) continue;
    kosten += k.gesamt * ((e.servings + (e.extra || 0)) / (r.servings || 1));
    mitKosten += 1;
  }

  const punkte = gerichte.map((x) => x.r.gesundheit?.punkte).filter((p) => p != null);

  // Am haeufigsten im Plan oder gekocht
  const zaehler = new Map();
  for (const { r, e } of geplant) if (!e.rest) zaehler.set(r.id, { r, n: (zaehler.get(r.id)?.n || 0) + 1 });
  for (const r of gekocht) zaehler.set(r.id, { r, n: (zaehler.get(r.id)?.n || 0) + 1 });
  const lieblinge = [...zaehler.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 5);

  return {
    geplant: geplant.length,
    gekocht: gekocht.length,
    neu: neu.map((r) => r.title).slice(0, 12),
    fisch: gerichte.filter((x) => istFisch(x.r)).length,
    vegetarisch: anteil(gerichte, (x) => erfuellt(x.r, 'vegetarisch')),
    saisonal: anteil(gerichte, (x) => saisonFuer(x.r, monat).saisonal),
    vorgekocht: haupt.filter((x) => x.e.rest).length,
    gesundheit: punkte.length ? Math.round(punkte.reduce((a, b) => a + b, 0) / punkte.length) : null,
    kosten: mitKosten ? kosten : null,
    kostenGerichte: mitKosten,
    lieblinge: lieblinge.map((x) => ({ id: x.r.id, title: x.r.title, n: x.n })),
  };
}
