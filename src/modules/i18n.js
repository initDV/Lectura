// @ts-check
// i18n.js : interface en français, anglais prêt. t('cle', {variable}) ; repli sur le français puis sur la clé.
const CHARGEURS = { fr: () => import('../i18n/fr.js'), en: () => import('../i18n/en.js') };
export const LANGUES = { fr: 'Français', en: 'English' };

let dict = {}, repli = {}, langue = 'fr';

export async function setLang(code) {
  code = CHARGEURS[code] ? code : 'fr';
  if (!Object.keys(repli).length) repli = (await CHARGEURS.fr()).default;
  dict = code === 'fr' ? repli : (await CHARGEURS[code]()).default;
  langue = code;
  document.documentElement.lang = code;
  return code;
}

export const getLang = () => langue;

/** @param {string} cle @param {Record<string, string|number>} [vars] */
export function t(cle, vars) {
  const brut = dict[cle] ?? repli[cle] ?? cle;
  return vars ? brut.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : brut;
}

/** Durée lisible mm:ss. */
export function horloge(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Taille lisible (octets → Ko / Mo / Go). */
export function taille(octets) {
  if (!Number.isFinite(octets)) return '?';
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  if (octets < 1024 ** 3) return `${(octets / 1024 / 1024).toFixed(octets < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
  return `${(octets / 1024 ** 3).toFixed(1)} Go`;
}
