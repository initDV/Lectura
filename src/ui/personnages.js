// @ts-check
// Écran Personnages (ouvert depuis le menu) : choix du personnage, style des mouvements, expression par phrase.
import { store } from '../state.js';
import { h, add, field } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { majReglages } from '../app.js';
import { report } from '../modules/errors.js';
import { characterGrid } from './perso-grille.js';
import { segmentList } from './segments.js';
import { projetInitial } from './projets.js';
import { recalculer } from './projet-actions.js';

export async function render(root) {
  if (!store.projet) store.projet = await projetInitial();
  const p = store.projet;
  const toucher = () => { store.modifie = true; };
  const grille = characterGrid({ valeur: p.personnageId, onChange: (id) => {
    p.personnageId = id; toucher();
    majReglages({ personnageId: id }).catch((err) => report('reglages', err)); // devient le personnage des nouveaux projets
  } });
  const mouvements = h('select', null, ...['calme', 'normal', 'vif'].map((m) => h('option', { value: m, text: t(`reglages.mouvements.${m}`) })));
  mouvements.value = p.reglages.mouvements;
  mouvements.addEventListener('change', () => { p.reglages.mouvements = mouvements.value; toucher(); });
  const segs = segmentList({ onChange: toucher });
  add(root,
    h('h1', { text: t('nav.personnages') }),
    h('section', { class: 'card' }, h('h2', { text: t('editeur.personnage') }), h('p', { class: 'muted small', text: t('persos.aide') }), grille.el),
    h('section', { class: 'card' }, field(t('reglages.mouvements'), mouvements), p.texte.trim() ? segs.el : h('p', { class: 'muted small', text: t('persos.sansTexte') })),
    h('p', null, h('a', { class: 'btn btn-primary', href: '#/scene' }, icon('back'), t('nav.retour'))));
  if (p.texte.trim()) segs.dessiner(recalculer(p));
  return null;
}
