/**
 * Zustand des Wochenplans: Eintraege, Persistenz, abgeleitete Werte.
 *
 * Ein Eintrag haengt an einem Slot "<tagIndex>:<mahlzeit>" innerhalb einer
 * Kalenderwoche. Alles liegt im localStorage, es gibt keinen Server.
 */

import { recipeById, MEALS, DAYS } from '../data/index.js';
import { startOfWeek, weekKey, isoWeekNumber } from './week.js';
import { aggregate } from './shopping.js';

export { startOfWeek, weekKey, isoWeekNumber };

const STORAGE_KEY = 'kochbuch.plan.v1';
const IMPORT_KEY = 'kochbuch.imported.v1';

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

class Store {
  constructor() {
    this.plans = readStorage(STORAGE_KEY, {});
    this.checked = {};
    this.weekStart = startOfWeek(new Date());
    this.listeners = new Set();
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
    const week = { ...this.week };
    week[slotId(dayIndex, mealId)] = {
      recipeId,
      servings: servings || recipe.servings || 2,
    };
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  remove(dayIndex, mealId) {
    const week = { ...this.week };
    delete week[slotId(dayIndex, mealId)];
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
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
    week[slotId(dayIndex, mealId)] = { ...e, servings: Math.max(1, Math.min(24, servings)) };
    this.plans = { ...this.plans, [this.key]: week };
    this.persist();
  }

  clearWeek() {
    this.plans = { ...this.plans, [this.key]: {} };
    this.checked = {};
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

        const candidates = pool.filter(
          (r) => (r.meals || []).includes(meal.id) && !used.has(r.id),
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

  persist() {
    writeStorage(STORAGE_KEY, this.plans);
    this.emit();
  }

  /** Kalorien je Wochentag, aus Portionen hochgerechnet. */
  kcalPerDay() {
    return DAYS.map((_, day) =>
      MEALS.reduce((sum, meal) => {
        const e = this.entry(day, meal.id);
        if (!e) return sum;
        const r = recipeById.get(e.recipeId);
        if (!r) return sum;
        return sum + (r.kcal || 0) * (e.servings / (r.servings || 1));
      }, 0),
    );
  }

  /** Kennzahlen der Woche fuer die Randspalte. */
  stats() {
    const entries = Object.values(this.week);
    const kcal = this.kcalPerDay();
    const plannedDays = this.kcalPerDay().filter((k) => k > 0).length;
    const totalSlots = DAYS.length * MEALS.length;
    const cookMinutes = entries.reduce((sum, e) => {
      const r = recipeById.get(e.recipeId);
      return sum + (r ? r.totalTime : 0);
    }, 0);

    return {
      count: entries.length,
      totalSlots,
      fill: entries.length / totalSlots,
      plannedDays,
      cookMinutes,
      kcalAvg: plannedDays ? Math.round(kcal.reduce((a, b) => a + b, 0) / plannedDays) : 0,
    };
  }

  /** Aggregierte Einkaufsliste der Woche, nach Abteilung gruppiert. */
  shoppingList() {
    return aggregate(Object.values(this.week), recipeById, this.checked);
  }

  toggleChecked(key) {
    this.checked = { ...this.checked, [key]: !this.checked[key] };
    this.emit();
  }

  /** Rezepte, die der Nutzer per URL importiert hat. */
  loadImported() {
    return readStorage(IMPORT_KEY, []);
  }

  saveImported(list) {
    writeStorage(IMPORT_KEY, list);
  }
}

export const store = new Store();
