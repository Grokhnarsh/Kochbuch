/**
 * Zustand des Wochenplans: Eintraege, Persistenz, abgeleitete Werte.
 *
 * Ein Eintrag haengt an einem Slot "<tagIndex>:<mahlzeit>" innerhalb einer
 * Kalenderwoche. Alles liegt im localStorage, es gibt keinen Server.
 */

import { recipeById, MEALS, DAYS, naehrwertRechner } from '../data/index.js';
import { startOfWeek, weekKey, isoWeekNumber } from './week.js';
import { aggregate } from './shopping.js';
import { NAEHRSTOFFE } from './naehrwerte.js';
import { vorratAbziehen, bereinigeVorrat } from './vorrat.js';
import { bereinigeVorgaben } from './planer.js';
import { bereinigeProfile } from './profile.js';
import { bereinigeBewertungen, alsGekocht, mitSternen, mitNotiz } from './bewertung.js';
import { bereinigeSammlungen, umschalten } from './sammlungen.js';
import { ohneFelder, vorkochenIn, kochEintraege, quelleVon } from './vorkochen.js';
import { inMetrisch } from './formen.js';
import { LISTEN } from './abgleich.js';

export { startOfWeek, weekKey, isoWeekNumber };

const STORAGE_KEY = 'kochbuch.plan.v1';
const IMPORT_KEY = 'kochbuch.imported.v1';
const OWN_KEY = 'kochbuch.eigene.v1';
const VORRAT_KEY = 'kochbuch.vorrat.v1';
const PLANER_KEY = 'kochbuch.planer.v1';
const PROFILE_KEY = 'kochbuch.profile.v1';
const BEWERTUNG_KEY = 'kochbuch.bewertungen.v1';
const SAMMLUNG_KEY = 'kochbuch.sammlungen.v1';
const ABGEHAKT_KEY = 'kochbuch.abgehakt.v1';
const ZEITEN_KEY = 'kochbuch.zeiten.v1';
const ANSICHT_KEY = 'kochbuch.ansicht.v1';

/** Alles, was eine Sicherung umfasst, nach Schluessel im localStorage */
export const SPEICHER = {
  plan: STORAGE_KEY, eigene: OWN_KEY, importe: IMPORT_KEY, vorrat: VORRAT_KEY,
  planer: PLANER_KEY, profile: PROFILE_KEY, bewertungen: BEWERTUNG_KEY,
  sammlungen: SAMMLUNG_KEY, abgehakt: ABGEHAKT_KEY,
};

/** Wann welcher Teil zuletzt geaendert wurde, fuer den Abgleich; siehe abgleich.js */
export const ZEITEN = ZEITEN_KEY;

/** Darstellung: Farbschema, Schriftgroesse, Tassen umrechnen. Bleibt auf diesem Geraet. */
export const ANSICHT_STANDARD = Object.freeze({ thema: 'auto', schrift: 1, metrisch: true });

function bereinigeAnsicht(a) {
  const v = a && typeof a === 'object' ? a : {};
  return {
    thema: ['auto', 'hell', 'dunkel'].includes(v.thema) ? v.thema : 'auto',
    schrift: [1, 1.15, 1.3].includes(v.schrift) ? v.schrift : 1,
    metrisch: v.metrisch !== false,
  };
}

function bereinigeAbgehakt(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const out = {};
  for (const [woche, haken] of Object.entries(roh)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(woche) || !haken || typeof haken !== 'object') continue;
    out[woche] = Object.fromEntries(Object.entries(haken).filter(([k, v]) => v === true && k.length < 300).slice(0, 500));
  }
  return out;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Privater Modus oder volles Kontingent: Plan bleibt fuer die Sitzung erhalten. */
  }
}

export const slotId = (dayIndex, mealId) => `${dayIndex}:${mealId}`;

/**
 * Hoechste Portionszahl fuer ein Rezept. Zaehlt es Stueck statt Portionen
 * ("75 Printen"), liegt der Ertrag von Haus aus hoch; die Grenze richtet
 * sich deshalb nach dem Rezept und gilt fuer Ansicht und Plan gleich.
 */
export const maxServingsFor = (recipe) => Math.max(24, (recipe?.servings || 1) * 4);

class Store {
  constructor() {
    this.weekStart = startOfWeek(new Date());
    this.listeners = new Set();
    this.ansicht = bereinigeAnsicht(readStorage(ANSICHT_KEY, {}));
    this.#lesen();
  }

  #lesen() {
    this.plans = readStorage(STORAGE_KEY, {});
    this.vorrat = bereinigeVorrat(readStorage(VORRAT_KEY, []));
    this.profile = bereinigeProfile(readStorage(PROFILE_KEY, []));
    this.bewertungen = bereinigeBewertungen(readStorage(BEWERTUNG_KEY, {}));
    this.sammlungen = bereinigeSammlungen(readStorage(SAMMLUNG_KEY, []));
    this.abgehakt = bereinigeAbgehakt(readStorage(ABGEHAKT_KEY, {}));
    const z = readStorage(ZEITEN_KEY, {});
    this.zeiten = z?.zeiten && typeof z.zeiten === 'object' ? z.zeiten : {};
    this.entfernt = z?.entfernt && typeof z.entfernt === 'object' ? z.entfernt : {};
  }

  /**
   * Schreibt einen Teil und merkt sich, wann er sich geaendert hat —
   * nur, wenn er sich wirklich geaendert hat. `wochen` nennt bei Plan
   * und Haken die betroffenen Wochen.
   */
  #schreibe(teil, key, wert, wochen = null) {
    let alt = null;
    try { alt = localStorage.getItem(key); } catch { /* ohne Speicher keine Zeiten */ }
    const neu = JSON.stringify(wert);
    writeStorage(key, wert);
    if (alt === neu) return;
    const jetzt = Date.now();
    if (wochen) {
      const z = { ...(this.zeiten[teil] || {}) };
      for (const w of wochen) z[w] = jetzt;
      this.zeiten = { ...this.zeiten, [teil]: z };
    } else {
      this.zeiten = { ...this.zeiten, [teil]: jetzt };
    }
    writeStorage(ZEITEN_KEY, { zeiten: this.zeiten, entfernt: this.entfernt });
  }

  /** Merkt sich Geloeschtes, damit ein Abgleich es nicht zurueckbringt */
  #begrabe(teil, kennungen) {
    if (!LISTEN[teil] || !kennungen.length) return;
    const g = { ...(this.entfernt[teil] || {}) };
    for (const k of kennungen) g[k] = Date.now();
    this.entfernt = { ...this.entfernt, [teil]: g };
    writeStorage(ZEITEN_KEY, { zeiten: this.zeiten, entfernt: this.entfernt });
  }

  /** Abgehakte Positionen der Einkaufsliste dieser Woche */
  get checked() {
    return this.abgehakt[this.key] || {};
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  get key() {
    return weekKey(this.weekStart);
  }

  /** Alle Eintraege der aktuellen Woche. */
  get week() {
    return this.plans[this.key] || {};
  }

  /** Datum eines Wochentags der aktuellen Woche. */
  dateOf(dayIndex) {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  shiftWeek(deltaWeeks) {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + deltaWeeks * 7);
    this.weekStart = startOfWeek(d);
    this.emit();
  }

  goToday() {
    this.weekStart = startOfWeek(new Date());
    this.emit();
  }

  entry(dayIndex, mealId) {
    return this.week[slotId(dayIndex, mealId)] || null;
  }

  /** Legt ein Rezept in einen Slot; ueberschreibt vorhandene Eintraege. */
  place(dayIndex, mealId, recipeId, servings) {
    const recipe = recipeById.get(recipeId);
    if (!recipe) return;
    const id = slotId(dayIndex, mealId);
    // Wer ein vorgekochtes Gericht oder einen Rest ueberschreibt, loest die Verbindung
    const week = this.week[id] ? ohneFelder(this.week, [id]) : { ...this.week };
    week[id] = {
      recipeId,
      servings: servings || recipe.servings || 2,
    };
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  /** Legt mehrere Eintraege auf einmal ab — ein Speichern, ein Neuzeichnen. */
  placeMany(eintraege) {
    if (!Object.keys(eintraege).length) return;
    // Nur, was ein anderes Gericht bekommt, verliert seine Verbindungen
    const ersetzt = Object.keys(eintraege).filter((id) => this.week[id] && this.week[id].recipeId !== eintraege[id].recipeId);
    const basis = ersetzt.length ? ohneFelder(this.week, ersetzt) : this.week;
    this.plans = { ...this.plans, [this.key]: { ...basis, ...eintraege } };
    this.persist();
  }

  /** Nimmt mehrere Felder auf einmal frei, etwa vor einem neuen Wuerfeln. */
  removeMany(slotIds) {
    this.plans = { ...this.plans, [this.key]: ohneFelder(this.week, slotIds) };
    this.persist();
  }

  remove(dayIndex, mealId) {
    this.removeMany([slotId(dayIndex, mealId)]);
  }

  /**
   * Kocht in einem Feld mehr, fuer ein anderes Feld der Woche.
   * @returns {boolean} ob es geklappt hat
   */
  vorkochen(quelle, ziel, portionen) {
    const neu = vorkochenIn(this.week, slotId(quelle.day, quelle.meal), slotId(ziel.day, ziel.meal), portionen);
    if (!neu) return false;
    this.plans = { ...this.plans, [this.key]: neu };
    this.persist();
    return true;
  }

  /** Verschiebt einen Eintrag; tauscht, wenn das Ziel belegt ist. */
  move(from, to) {
    const week = { ...this.week };
    const a = week[slotId(from.day, from.meal)];
    if (!a) return;
    const b = week[slotId(to.day, to.meal)];
    week[slotId(to.day, to.meal)] = a;
    if (b) week[slotId(from.day, from.meal)] = b;
    else delete week[slotId(from.day, from.meal)];
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  setServings(dayIndex, mealId, servings) {
    const e = this.entry(dayIndex, mealId);
    if (!e) return;
    const week = { ...this.week };
    const max = maxServingsFor(recipeById.get(e.recipeId));
    const neu = Math.max(1, Math.min(max, servings));
    week[slotId(dayIndex, mealId)] = { ...e, servings: neu };
    // Mehr Rest heisst: vorher mehr kochen
    const q = e.rest && quelleVon(week, e);
    if (q) week[q.id] = { ...q.eintrag, extra: Math.max(1, (q.eintrag.extra || 0) + neu - e.servings) };
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  clearWeek() {
    this.plans = { ...this.plans, [this.key]: {} };
    this.abgehakt = { ...this.abgehakt, [this.key]: {} };
    this.#schreibe('abgehakt', ABGEHAKT_KEY, this.abgehakt, [this.key]);
    this.persist();
  }

  /**
   * Fuellt leere Slots mit passenden Rezepten auf, ohne innerhalb der
   * Woche zu wiederholen. Snacks bleiben frei, die plant man selten durch.
   */
  autofill(pool) {
    const week = { ...this.week };
    const used = new Set(Object.values(week).map((e) => e.recipeId));

    for (let day = 0; day < DAYS.length; day += 1) {
      for (const meal of MEALS) {
        if (meal.id === 'snack') continue;
        const id = slotId(day, meal.id);
        if (week[id]) continue;

        // Historische Originaltexte liest man; ungefragt auf den Plan
        // gehoeren sie nicht.
        const candidates = pool.filter(
          (r) => !r.lesetext && (r.meals || []).includes(meal.id) && !used.has(r.id),
        );
        if (!candidates.length) continue;

        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        week[id] = { recipeId: pick.id, servings: pick.servings || 2 };
        used.add(pick.id);
      }
    }
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  persist(wochen = [this.key]) {
    this.#schreibe('plan', STORAGE_KEY, this.plans, wochen);
    this.emit();
  }

  /**
   * Naehrwerte je Wochentag fuer eine Person: aus jeder geplanten
   * Mahlzeit eine Portion.
   *
   * Frueher wurde mit der geplanten Portionszahl multipliziert — wer fuer
   * acht statt vier Personen kochte, ass danach rechnerisch doppelt so
   * viel. Die Portionszahl bestimmt den Einkauf, nicht, was einer isst.
   *
   * @returns {{werte:object, mahlzeiten:number, belastbar:number}[]}
   */
  naehrwerteProTag() {
    return DAYS.map((_, day) => {
      const werte = Object.fromEntries(NAEHRSTOFFE.map((n) => [n.id, 0]));
      let mahlzeiten = 0;
      let belastbar = 0;
      for (const meal of MEALS) {
        const e = this.entry(day, meal.id);
        const r = e && recipeById.get(e.recipeId);
        if (!r) continue;
        mahlzeiten += 1;
        if (!r.naehrwerte || r.naehrwerte.vertrauen === 'gering') continue;
        belastbar += 1;
        for (const n of NAEHRSTOFFE) werte[n.id] += r.naehrwerte.jePortion[n.id] || 0;
      }
      return { werte, mahlzeiten, belastbar };
    });
  }

  /** Kalorien je Wochentag fuer eine Person. */
  kcalPerDay() {
    return this.naehrwerteProTag().map((t) => t.werte.kcal);
  }

  /** Kennzahlen der Woche fuer die Randspalte. */
  stats() {
    const entries = Object.values(this.week);
    const tage = this.naehrwerteProTag();
    // Ein Tag ist geplant, sobald etwas darauf liegt — ob es dazu
    // Naehrwerte gibt, ist eine andere Frage.
    const plannedDays = tage.filter((t) => t.mahlzeiten > 0).length;
    const mitWerten = tage.filter((t) => t.belastbar > 0);
    const totalSlots = DAYS.length * MEALS.length;
    // Reste werden aufgewaermt, nicht gekocht
    const cookMinutes = entries.reduce((sum, e) => {
      const r = !e.rest && recipeById.get(e.recipeId);
      return sum + (r ? r.totalTime : 0);
    }, 0);

    return {
      count: entries.length,
      totalSlots,
      fill: entries.length / totalSlots,
      plannedDays,
      cookMinutes,
      kcalAvg: mitWerten.length
        ? Math.round(mitWerten.reduce((a, t) => a + t.werte.kcal, 0) / mitWerten.length)
        : 0,
    };
  }

  /**
   * Einkaufsliste der Woche, nach Abteilung gruppiert und um den Vorrat
   * vermindert. Was der Vorrat deckt, steht getrennt in `gedeckt`.
   */
  einkauf() {
    // Reste kauft man nicht, Vorgekochtes mit seinen Extraportionen
    const umrechnen = this.ansicht.metrisch ? (z) => inMetrisch(z, naehrwertRechner) : null;
    return vorratAbziehen(aggregate(kochEintraege(this.week), recipeById, this.checked, { umrechnen }), this.vorrat);
  }

  /** Was noch zu kaufen ist, nach Abteilung gruppiert. */
  shoppingList() {
    return this.einkauf().groups;
  }

  /** Vorrat in Kueche und Kammer, siehe vorrat.js. */
  setVorrat(liste) {
    const neu = bereinigeVorrat(liste);
    const bleibt = new Set(neu.map((p) => LISTEN.vorrat(p)));
    this.#begrabe('vorrat', this.vorrat.map((p) => LISTEN.vorrat(p)).filter((k) => !bleibt.has(k)));
    this.vorrat = neu;
    this.#schreibe('vorrat', VORRAT_KEY, this.vorrat);
    this.emit();
  }

  /** Die zuletzt benutzten Vorgaben fuer "Woche füllen". */
  get vorgaben() {
    return bereinigeVorgaben(readStorage(PLANER_KEY, {}));
  }

  set vorgaben(v) {
    // Was aus den Profilen kommt, wird beim Planen jedes Mal neu bestimmt
    const { ernaehrungen, meidet, ...rest } = bereinigeVorgaben(v);
    this.#schreibe('planer', PLANER_KEY, rest);
  }

  /** Wer im Haushalt mitisst, siehe profile.js */
  setProfile(liste) {
    const neu = bereinigeProfile(liste);
    const bleibt = new Set(neu.map((p) => p.id));
    this.#begrabe('profile', this.profile.map((p) => p.id).filter((id) => !bleibt.has(id)));
    this.profile = neu;
    this.#schreibe('profile', PROFILE_KEY, this.profile);
    this.emit();
  }

  /** Sammlungen, siehe sammlungen.js */
  setSammlungen(liste) {
    const neu = bereinigeSammlungen(liste);
    const bleibt = new Set(neu.map((x) => x.id));
    this.#begrabe('sammlungen', this.sammlungen.map((x) => x.id).filter((id) => !bleibt.has(id)));
    this.sammlungen = neu;
    this.#schreibe('sammlungen', SAMMLUNG_KEY, this.sammlungen);
    this.emit();
  }

  inSammlung(sammlungId, rezeptId) {
    this.setSammlungen(umschalten(this.sammlungen, sammlungId, rezeptId));
  }

  /** Farbschema, Schrift, Umrechnung — nur fuer dieses Geraet */
  setAnsicht(teil) {
    this.ansicht = bereinigeAnsicht({ ...this.ansicht, ...teil });
    writeStorage(ANSICHT_KEY, this.ansicht);
    this.emit();
  }

  /** Bewertung, Notiz und Kochverlauf eines Rezepts */
  bewertung(id) {
    return this.bewertungen[id] || null;
  }

  _bewertungenSetzen(neu) {
    this.bewertungen = neu;
    this.#schreibe('bewertungen', BEWERTUNG_KEY, neu);
    this.emit();
  }

  bewerte(id, sterne) { this._bewertungenSetzen(mitSternen(this.bewertungen, id, sterne)); }

  notiere(id, notiz) { this._bewertungenSetzen(mitNotiz(this.bewertungen, id, notiz)); }

  gekocht(id) { this._bewertungenSetzen(alsGekocht(this.bewertungen, id)); }

  /** Liest nach einer Wiederherstellung oder einem Abgleich alles neu ein */
  neuLaden() {
    this.#lesen();
    this.emit();
  }

  toggleChecked(key) {
    const haken = { ...this.checked };
    if (haken[key]) delete haken[key];
    else haken[key] = true;
    this.abgehakt = { ...this.abgehakt, [this.key]: haken };
    this.#schreibe('abgehakt', ABGEHAKT_KEY, this.abgehakt, [this.key]);
    this.emit();
  }

  /** Alles fuer einen Abgleich: Daten, Zeiten, Geloeschtes. Fotos gehen nicht mit. */
  stand() {
    return {
      daten: {
        plan: this.plans,
        abgehakt: this.abgehakt,
        eigene: this.loadOwn(),
        importe: this.loadImported(),
        vorrat: this.vorrat,
        planer: readStorage(PLANER_KEY, {}),
        profile: this.profile,
        bewertungen: this.bewertungen,
        sammlungen: this.sammlungen,
      },
      zeiten: this.zeiten,
      entfernt: this.entfernt,
    };
  }

  /** Uebernimmt einen abgeglichenen Stand; der Aufrufer hat ihn bereinigt. */
  standSetzen(stand) {
    const d = stand.daten;
    writeStorage(STORAGE_KEY, d.plan);
    writeStorage(ABGEHAKT_KEY, d.abgehakt);
    writeStorage(OWN_KEY, d.eigene);
    writeStorage(IMPORT_KEY, d.importe);
    writeStorage(VORRAT_KEY, d.vorrat);
    writeStorage(PLANER_KEY, d.planer);
    writeStorage(PROFILE_KEY, d.profile);
    writeStorage(BEWERTUNG_KEY, d.bewertungen);
    writeStorage(SAMMLUNG_KEY, d.sammlungen);
    writeStorage(ZEITEN_KEY, { zeiten: stand.zeiten, entfernt: stand.entfernt });
    this.neuLaden();
  }

  /** Rezepte, die der Nutzer per URL importiert hat. */
  loadImported() {
    return readStorage(IMPORT_KEY, []);
  }

  saveImported(list) {
    const bleibt = new Set(list.map((r) => r.id));
    this.#begrabe('importe', this.loadImported().map((r) => r.id).filter((id) => !bleibt.has(id)));
    this.#schreibe('importe', IMPORT_KEY, list);
  }

  /**
   * Selbst geschriebene Rezepte. Sie liegen wie alles andere im
   * localStorage — es gibt keinen Server, der sie aufbewahren koennte —
   * und sind deshalb an diesen Browser gebunden. Deswegen laesst sich
   * die Sammlung als Datei sichern.
   */
  loadOwn() {
    const list = readStorage(OWN_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  /** Legt ein eigenes Rezept an oder ersetzt das gleichnamige. */
  saveOwn(recipe) {
    const list = this.loadOwn().filter((r) => r.id !== recipe.id);
    list.push(recipe);
    this.#schreibe('eigene', OWN_KEY, list);
    this.emit();
    return recipe;
  }

  removeOwn(id) {
    this.#begrabe('eigene', [id]);
    this.#schreibe('eigene', OWN_KEY, this.loadOwn().filter((r) => r.id !== id));
    this.emit();
  }

  /**
   * Nimmt ein Rezept aus allen Wochen heraus. Ohne das bliebe nach dem
   * Loeschen ein Eintrag im Plan stehen, zu dem es kein Rezept gibt.
   */
  purgeRecipe(recipeId) {
    const wochen = [];
    const plans = {};
    for (const [woche, eintraege] of Object.entries(this.plans)) {
      const weg = Object.entries(eintraege).filter(([, e]) => e.recipeId === recipeId).map(([id]) => id);
      plans[woche] = weg.length ? ohneFelder(eintraege, weg) : eintraege;
      if (weg.length) wochen.push(woche);
    }
    if (wochen.length) {
      this.plans = plans;
      this.persist(wochen);
    }
    return wochen.length > 0;
  }
}

export const store = new Store();
