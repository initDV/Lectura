// @ts-check
// segments.js : liste des phrases du texte avec, pour chacune, l'expression du personnage.
import { store } from '../state.js';
import { h, clear } from './dom.js';
import { t } from '../modules/i18n.js';
import { EXPRESSIONS_BASE, EXPRESSIONS_PRO } from '../modules/project.js';

/** @param {{ onChange: ()=>void, humeur?: (()=>any)|null }} o `humeur` (humeur.js) : affiche à côté de « Auto » l'émotion détectée. */
export function segmentList({ onChange, humeur = null }) {
  const liste = h('ul', { class: 'seg-list' }), compte = h('span', { class: 'muted small' });
  const el = h('details', null, h('summary', null, t('editeur.expressions'), ' ', compte), h('p', { class: 'muted small', text: t('editeur.expressions.aide') }), liste);

  function dessiner(segments) {
    clear(liste);
    const hu = humeur ? humeur() : null;
    compte.textContent = `(${segments.length})`;
    const max = 200; // au-delà, la liste devient inutilement lourde : les phrases suivantes restent en « auto »
    segments.slice(0, max).forEach((s, i) => {
      const sel = h('select', { 'aria-label': t('editeur.expressionDe', { n: i + 1 }) },
        ...EXPRESSIONS_BASE.map((e) => h('option', { value: e, text: t(`expr.${e}`) })),
        ...EXPRESSIONS_PRO.map((e) => h('option', { value: e, text: `${t(`expr.${e}`)}${store.pro ? '' : ' (Pro)'}`, disabled: !store.pro })));
      const auto = hu ? hu.de({ ...s, expression: 'auto' }) : null; // ce que « Auto » jouera pour cette phrase
      if (auto) sel.options[0].textContent = `${t('expr.auto')} → ${t(`expr.${auto.expr}`)}${auto.second ? ` + ${t(`expr.${auto.second}`)}` : ''}`;
      sel.value = s.expression || 'auto';
      sel.addEventListener('change', () => { s.expression = sel.value; onChange(); });
      liste.append(h('li', null, h('span', { class: 'txt', text: s.texte, title: s.texte }), sel));
    });
    if (segments.length > max) liste.append(h('li', null, h('span', { class: 'txt muted', text: t('editeur.expressions.tronque', { n: segments.length - max }) })));
  }
  return { el, dessiner };
}
