// @ts-check
// modale.js : petite fenêtre modale accessible (Échap, clic à côté, retour du focus), utilisée par le menu et la liste des voix.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';

/**
 * @param {string} titre @param {(fermer: ()=>void) => (Node|null)[]} contenu
 * @param {()=>void} [nettoyer] Libère les ressources propres à cette fenêtre, quel que soit le mode de fermeture.
 * @returns {{ fermer: ()=>void, feuille: HTMLElement }}
 */
export function ouvrirModale(titre, contenu, nettoyer) {
  const avant = /** @type {HTMLElement|null} */ (document.activeElement);
  let fermee = false;
  const fermer = () => {
    if (fermee) return;
    fermee = true;
    fond.remove(); document.removeEventListener('keydown', clavier, true); avant?.focus?.();
    nettoyer?.();
  };
  const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } };
  const croix = h('button', { type: 'button', class: 'btn-discret', 'aria-label': t('commun.fermer'), onClick: fermer }, icon('x'));
  const feuille = h('div', { class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre }, h('h2', null, titre, croix), ...contenu(fermer));
  const fond = h('div', { class: 'modal-backdrop' }, feuille);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
  document.addEventListener('keydown', clavier, true);
  document.body.append(fond);
  croix.focus();
  return { fermer, feuille };
}
