// @ts-check
// mots-perso.js : catégories de mots-clés personnalisées. Stockées dans les réglages (motsPerso).
import { store } from '../state.js';
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { notify } from '../modules/errors.js';

const nomSur = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

/** @param {{ sauver: (patch:any)=>any }} o */
export function motsPersoPanel({ sauver }) {
  const liste = h('div'), el = h('div', { class: 'stack' }, h('p', { class: 'muted small', text: t('reglages.mots.aide') }), liste);
  const cats = () => store.settings.motsPerso || {};
  const enregistrer = (nouveau) => { store.settings.motsPerso = nouveau; sauver({ motsPerso: nouveau }); };

  function dessiner() {
    clear(liste);
    for (const [nom, def] of Object.entries(cats())) {
      const couleur = h('input', { type: 'color', value: def.couleur, 'aria-label': t('reglages.mots.couleur', { nom }) });
      const mots = h('textarea', { value: def.mots.join(', '), class: 'mono', 'aria-label': t('reglages.mots.liste', { nom }), rows: 2 });
      const maj = () => enregistrer({ ...cats(), [nom]: { couleur: couleur.value, mots: mots.value.split(/[,\n]/).map((m) => m.trim()).filter(Boolean).slice(0, 500) } });
      couleur.addEventListener('change', maj);
      mots.addEventListener('change', maj);
      liste.append(h('div', { class: 'kwcat' },
        h('strong', null, h('span', { class: 'swatch' }), nom),
        h('div', { class: 'row' }, couleur, h('button', { type: 'button', class: 'btn btn-icon btn-ghost', 'aria-label': t('reglages.mots.supprimer', { nom }),
          onClick: () => { const c = { ...cats() }; delete c[nom]; enregistrer(c); dessiner(); } }, icon('trash'))),
        mots));
      liste.lastElementChild.querySelector('.swatch').style.background = def.couleur;
    }
  }

  const nom = h('input', { type: 'text', placeholder: t('reglages.mots.nom'), maxLength: 24, 'aria-label': t('reglages.mots.nom') });
  const ajouter = h('button', { type: 'button', class: 'btn', onClick: () => {
    const cle = nomSur(nom.value);
    if (!cle) return notify(t('reglages.mots.nomInvalide'), 'warn');
    if (cats()[cle]) return notify(t('reglages.mots.existe'), 'warn');
    enregistrer({ ...cats(), [cle]: { couleur: '#ff7fb0', mots: [] } });
    nom.value = '';
    dessiner();
  } }, icon('plus'), t('reglages.mots.ajouter'));
  el.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, nom), ajouter));
  dessiner();
  return { el };
}
