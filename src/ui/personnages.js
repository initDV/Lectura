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
import { loadLexique, loadDict } from '../modules/prepare.js';
import { buildMatcher } from '../modules/keywords.js';
import { creerHumeur } from '../modules/humeur.js';
import { loadCharacters } from '../modules/character-loader.js';
import { RIG_AICHA } from '../modules/character-spec.js';
import { lireIntentions } from '../modules/aicha/intentions.js';
import { typeLigne } from '../modules/timeline.js';

export async function render(root) {
  if (!store.projet) store.projet = await projetInitial();
  const p = store.projet;
  const fiches = await loadCharacters().catch(() => []);
  const toucher = () => { store.modifie = true; };
  const grille = characterGrid({ valeur: p.personnageId, onChange: (id) => {
    p.personnageId = id; toucher();
    if (p.texte.trim()) segs.dessiner(p.segments);
    majReglages({ personnageId: id }).catch((err) => report('reglages', err)); // devient le personnage des nouveaux projets
  } });
  const mouvements = h('select', null, ...['calme', 'normal', 'vif'].map((m) => h('option', { value: m, text: t(`reglages.mouvements.${m}`) })));
  mouvements.value = p.reglages.mouvements;
  mouvements.addEventListener('change', () => { p.reglages.mouvements = mouvements.value; toucher(); });
  // Émotions automatiques : le robot réagit aux mots du texte (lexique des sentiments).
  const lexique = await loadLexique().catch((err) => { report('sentiments', err); return null; });
  const matcher = await loadDict().then(buildMatcher).catch((err) => { report('mots-cles', err); return () => []; });
  const humeur = () => {
    const base = creerHumeur({ lexique, matcher, actif: p.reglages.emotions });
    if (fiches.find(def => def.id === p.personnageId)?.rig !== RIG_AICHA) return base;
    return { de(s) {
      const notes = p.reglages.emotions && typeLigne(s.texte) === 'parle' ? lireIntentions(s.texte, base.de(s).moments).indices : [];
      return { expr: notes.find(n => n.face !== 'neutre')?.face || 'neutre' };
    } };
  };
  const segs = segmentList({ onChange: toucher, humeur });
  const emotions = h('input', { type: 'checkbox', checked: p.reglages.emotions });
  emotions.addEventListener('change', () => { p.reglages.emotions = emotions.checked; toucher(); if (p.texte.trim()) segs.dessiner(p.segments); });
  add(root,
    h('h1', { text: t('nav.personnages') }),
    h('section', { class: 'card' }, h('h2', { text: t('editeur.personnage') }), h('p', { class: 'muted small', text: t('persos.aide') }), grille.el),
    h('section', { class: 'card' }, h('h2', { text: t('persos.emotions') }),
      h('label', { class: 'check' }, emotions, t('persos.emotions.auto')), h('p', { class: 'muted small', text: t('persos.emotions.aide') }),
      field(t('reglages.mouvements'), mouvements), p.texte.trim() ? segs.el : h('p', { class: 'muted small', text: t('persos.sansTexte') })),
    h('p', null, h('a', { class: 'btn btn-primary', href: '#/scene' }, icon('back'), t('nav.retour'))));
  if (p.texte.trim()) segs.dessiner(recalculer(p));
  return null;
}
