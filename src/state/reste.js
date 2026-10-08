/**
 * Reste: Was nach der Woche in angebrochenen Packungen uebrig bleibt.
 *
 * Sahne gibt es im 200-ml-Becher, Kokosmilch in der 400-ml-Dose. Braucht
 * der Plan 120 ml Sahne, stehen danach 80 ml im Kuehlschrank. Fuer solche
 * Reste schlaegt die App Rezepte vor, die sie aufbrauchen.
 *
 * Gerechnet wird nur fuer Verderbliches in ueblichen Packungsgroessen;
 * Mehl oder Reis halten sich, die gehoeren in den Vorrat.
 */

import { vorratsName, deckt } from './vorrat.js';
import { toBase, roundAmount } from './units.js';

/** [Name, Groesse, Basiseinheit, Packung] — uebliche Groessen im deutschen Handel */
export const PACKUNGEN = [
  ['Schlagsahne', 200, 'ml', 'Becher'],
  ['Saure Sahne', 200, 'g', 'Becher'],
  ['Schmand', 200, 'g', 'Becher'],
  ['Crème fraîche', 200, 'g', 'Becher'],
  ['Joghurt', 500, 'g', 'Becher'],
  ['Quark', 250, 'g', 'Becher'],
  ['Frischkäse', 200, 'g', 'Packung'],
  ['Mascarpone', 250, 'g', 'Becher'],
  ['Ricotta', 250, 'g', 'Becher'],
  ['Mozzarella', 125, 'g', 'Kugel'],
  ['Feta', 200, 'g', 'Packung'],
  ['Buttermilch', 500, 'ml', 'Becher'],
  ['Milch', 1000, 'ml', 'Packung'],
  ['Kokosmilch', 400, 'ml', 'Dose'],
  ['Passierte Tomaten', 500, 'g', 'Packung'],
  ['Gehackte Tomaten', 400, 'g', 'Dose'],
  ['Kichererbsen', 400, 'g', 'Dose'],
  ['Kidneybohnen', 400, 'g', 'Dose'],
  ['Hackfleisch', 500, 'g', 'Packung'],
  ['Speck', 125, 'g', 'Packung'],
  ['Blätterteig', 275, 'g', 'Rolle'],
  ['Butter', 250, 'g', 'Stück'],
  ['Spinat', 250, 'g', 'Beutel'],
].map(([name, groesse, einheit, packung]) => ({ name, key: vorratsName(name), groesse, einheit, packung }));

// "Sahne" im Plan ist Schlagsahne; die anderen Namen decken sich selbst
const ALIAS = new Map([['sahne', 'schlagsahne'], ['rinderhack', 'hackfleisch'], ['hack', 'hackfleisch'],
  ['gemischtes hackfleisch', 'hackfleisch'], ['dosentomaten', 'gehackte tomaten'], ['tomaten aus der dose', 'gehackte tomaten']]);

function packungFuer(name) {
  const n = vorratsName(name);
  const key = ALIAS.get(n) || n;
  return PACKUNGEN.find((p) => p.key === key)
    || PACKUNGEN.find((p) => deckt(p.key, key));
}

/**
 * @param {{aisle:string, items:object[]}[]} groups Einkaufsliste nach Abzug des Vorrats
 * @returns {{name:string, rest:number, einheit:string, packungen:number, packung:object}[]}
 */
export function resteAus(groups) {
  const out = [];
  for (const item of groups.flatMap((g) => g.items)) {
    const p = packungFuer(item.name);
    if (!p) continue;
    const bedarf = toBase(item.amount, item.unit);
    if (bedarf.amount == null || bedarf.unit !== p.einheit || bedarf.amount <= 0) continue;
    const packungen = Math.ceil(bedarf.amount / p.groesse - 1e-9);
    const rest = packungen * p.groesse - bedarf.amount;
    // Ein Loeffel Rest ist kein Rest
    if (rest < Math.max(30, p.groesse * 0.2)) continue;
    out.push({ name: item.name, rest: roundAmount(rest), einheit: p.einheit, packungen, packung: p });
  }
  return out.sort((a, b) => b.rest / b.packung.groesse - a.rest / a.packung.groesse);
}

/**
 * Rezepte, die einen Rest aufbrauchen: Hauptmahlzeiten, die nicht schon
 * im Plan liegen, die besser bewerteten zuerst.
 *
 * @returns {Map<string, object[]>} Restname → Rezepte
 */
export function resteRezepte(reste, rezepte, { ausschliessen = new Set(), je = 3 } = {}) {
  const out = new Map();
  for (const r of reste) {
    const key = vorratsName(r.name);
    const treffer = rezepte
      .filter((x) => !x.lesetext && !ausschliessen.has(x.id)
        && (x.meals || []).some((m) => m === 'mittag' || m === 'abend')
        && x.ingredients.some((i) => deckt(key, vorratsName(i.name))))
      .sort((a, b) => (b.gesundheit?.punkte || 0) - (a.gesundheit?.punkte || 0))
      .slice(0, je);
    out.set(r.name, treffer);
  }
  return out;
}
