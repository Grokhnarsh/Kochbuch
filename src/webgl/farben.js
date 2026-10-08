/**
 * Farben des Plans auf der WebGL-Buehne, hell und dunkel. Die Texturen
 * werden auf Canvas gezeichnet und kennen keine CSS-Variablen; deshalb
 * liegen die Werte hier und folgen dem Farbschema der Seite
 * (html[data-dunkel]).
 */

const HELL = {
  grund: 0xffffff,
  linie: 0x000000,
  zelle: '#ffffff',
  tinte: '#000000',
  tinteWeich: '#444444',
  tinteLeise: '#8a8a8a',
  kopf: '#f2f2f2',
  heute: '#ffeee7',
  heuteTinte: '#b33b12',
  plus: '#d0d0d0',
  kcal: '#3f7d63',
  aktiv: 0xffe2d4,
  rest: '#3f7d63',
};

const DUNKEL = {
  grund: 0x121418,
  linie: 0x3a3f48,
  zelle: '#1b1e24',
  tinte: '#eef0f3',
  tinteWeich: '#b9bec7',
  tinteLeise: '#7f8691',
  kopf: '#23272e',
  heute: '#3a2219',
  heuteTinte: '#ff9a74',
  plus: '#4a505a',
  kcal: '#7cc3a2',
  aktiv: 0x4a2a1d,
  rest: '#7cc3a2',
};

export const istDunkel = () => typeof document !== 'undefined' && document.documentElement.dataset.dunkel === '1';

export const farben = () => (istDunkel() ? DUNKEL : HELL);
