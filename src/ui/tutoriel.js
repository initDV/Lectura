// @ts-check
// Mini-tutoriel du premier lancement : 3 écrans, puis un exemple prêt à lire.
import { h, clear } from './dom.js';
import { t } from '../modules/i18n.js';
import { majReglages } from '../app.js';

export function ouvrirTutoriel() {
  let etape = 0;
  const titre = h('h2', { id: 'tuto-titre' }), texte = h('p'), points = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const image = h('img', { src: 'characters/professor_1.svg', alt: '', width: 110, height: 146 });
  const suivant = h('button', { type: 'button', class: 'btn btn-primary' });
  const passer = h('button', { type: 'button', class: 'btn btn-ghost', text: t('tuto.passer') });
  const fond = h('div', { class: 'modal-backdrop' },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tuto-titre' },
      image, titre, texte, points, h('div', { class: 'row end' }, passer, suivant)));

  const fermer = async (exemple) => {
    fond.remove();
    document.removeEventListener('keydown', clavier);
    await majReglages({ tutorielVu: true });
    if (exemple) (await import('./accueil.js')).ouvrirExemple();
  };
  const clavier = (e) => { if (e.key === 'Escape') fermer(false); };
  const dessiner = () => {
    titre.textContent = t(`tuto.${etape + 1}.titre`);
    texte.textContent = t(`tuto.${etape + 1}.texte`);
    clear(points).append(...[0, 1, 2].map((i) => h('i', { class: i === etape ? 'on' : '' })));
    suivant.textContent = etape < 2 ? t('tuto.suivant') : t('tuto.commencer');
  };
  suivant.addEventListener('click', () => { if (etape < 2) { etape++; dessiner(); } else fermer(true); });
  passer.addEventListener('click', () => fermer(false));
  document.addEventListener('keydown', clavier);
  dessiner();
  document.body.append(fond);
  suivant.focus();
}
