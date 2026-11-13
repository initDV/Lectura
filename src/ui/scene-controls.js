// @ts-check
// scene-controls.js : les lignes de commandes de l'écran principal (D2, de haut en bas) :
// « Capturer l'écran », « Vitesse », ligne voix, zone de texte, barre d'actions (Lancer, Arrêter, volume).
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';

export const VITESSE = { min: 0.5, max: 2, pas: 0.25 };
const borner = (v) => Math.max(VITESSE.min, Math.min(VITESSE.max, Math.round(v / VITESSE.pas) * VITESSE.pas));

/**
 * @param {{ texte: string, vitesse: number, volume: number,
 *   onCapture: (actif:boolean)=>void, onVitesse: (v:number)=>void, onVoix: ()=>void, onFichier: ()=>void,
 *   onTexte: (texte:string)=>void, onLancer: ()=>void, onArreter: ()=>void, onMuet: ()=>void, onVolume: (v:number)=>void }} a
 */
export function createControls(a) {
  let vitesse = borner(a.vitesse);

  // 3. Capturer l'écran
  const bascule = h('button', { type: 'button', class: 'bascule', role: 'switch', 'aria-checked': 'false', 'aria-label': t('scene.capturer') });
  bascule.addEventListener('click', () => a.onCapture(bascule.getAttribute('aria-checked') !== 'true'));
  const ligneCapture = h('div', { class: 'ligne' }, icon('camera'), h('span', { class: 'libelle', text: t('scene.capturer') }), bascule);

  // 4. Vitesse
  const valeur = h('span', { class: 'valeur', role: 'status', 'aria-label': t('scene.vitesse') });
  const moins = h('button', { type: 'button', class: 'rond', 'aria-label': t('scene.vitesse.moins') }, icon('minus'));
  const plus = h('button', { type: 'button', class: 'rond', 'aria-label': t('scene.vitesse.plus') }, icon('plus'));
  const majVitesse = () => { valeur.textContent = `${vitesse.toFixed(2)}x`; moins.disabled = vitesse <= VITESSE.min; plus.disabled = vitesse >= VITESSE.max; };
  const changer = (d) => { const v = borner(vitesse + d); if (v !== vitesse) { vitesse = v; majVitesse(); a.onVitesse(v); } };
  moins.addEventListener('click', () => changer(-VITESSE.pas));
  plus.addEventListener('click', () => changer(VITESSE.pas));
  const ligneVitesse = h('div', { class: 'ligne' }, h('span', { class: 'libelle', text: t('scene.vitesseCourt') }), moins, valeur, plus);

  // 5. Voix
  const nomVoix = h('span', { class: 'nom', text: '• …' });
  const voix = h('button', { type: 'button', class: 'voix-btn', 'aria-haspopup': 'dialog', 'aria-label': t('scene.voix.choisir'), onClick: () => a.onVoix() },
    icon('voice'), nomVoix, icon('chevron'));
  const fichier = h('button', { type: 'button', class: 'btn-discret', 'aria-label': t('scene.voix.fichier'), title: t('scene.voix.fichier'), onClick: () => a.onFichier() }, icon('upload'));
  const ligneVoix = h('div', { class: 'ligne' }, voix, fichier);

  // 6. Texte
  const texte = h('textarea', { class: 'texte', value: a.texte, placeholder: t('scene.texte.placeholder'), 'aria-label': t('scene.texte.label'), spellcheck: true, rows: 2 });
  texte.addEventListener('input', () => a.onTexte(texte.value.replace(/\r\n?/g, '\n')));

  // 7. Actions
  const lancer = h('button', { type: 'button', class: 'pilule lancer', onClick: () => a.onLancer() });
  const arreter = h('button', { type: 'button', class: 'pilule arreter', onClick: () => a.onArreter() }, icon('stop'), t('scene.arreter'));
  const muet = h('button', { type: 'button', class: 'btn-discret', onClick: () => a.onMuet() });
  const volume = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(a.volume * 100), 'aria-label': t('scene.volume') });
  volume.addEventListener('input', () => a.onVolume(+volume.value / 100));
  const actions = h('div', { class: 'actions-bar' }, lancer, arreter, muet, volume);

  const el = h('div', { class: 'panel' }, ligneCapture, ligneVitesse, ligneVoix, texte, actions);
  let dernier = '';
  majVitesse();

  return {
    el, texte,
    setTexte(v) { texte.value = v; },
    setVoix(nom) { nomVoix.textContent = `• ${nom}`; voix.title = nom; },
    setVitesse(v) { vitesse = borner(v); majVitesse(); },
    setCapture(actif) { bascule.setAttribute('aria-checked', String(actif)); },
    /** @param {{ etat: 'repos'|'lecture'|'pause'|'preparation', muet: boolean }} e */
    update(e) {
      const cle = `${e.etat}|${e.muet}`;
      if (cle === dernier) return;
      dernier = cle;
      const [ic, lib] = e.etat === 'lecture' ? ['pause', 'scene.pause'] : e.etat === 'pause' ? ['play', 'scene.reprendre'] : ['play', 'scene.lancer'];
      clear(lancer).append(icon(ic), t(lib));
      lancer.disabled = e.etat === 'preparation';
      arreter.disabled = e.etat === 'repos';
      clear(muet).append(icon(e.muet ? 'mute' : 'volume'));
      muet.setAttribute('aria-label', t(e.muet ? 'scene.sonActif' : 'scene.muet'));
      muet.setAttribute('aria-pressed', String(e.muet));
    },
  };
}
