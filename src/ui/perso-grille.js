// @ts-check
// perso-grille.js : grille de choix du personnage (vignettes en pose de repos).
import { h, clear } from './dom.js';
import { t } from '../modules/i18n.js';
import { loadCharacters, thumbnailUrl } from '../modules/character-loader.js';
import { report } from '../modules/errors.js';

/** @param {{ valeur: string, onChange: (id:string)=>void }} o */
export function characterGrid({ valeur, onChange }) {
  const el = h('div', { class: 'char-grid', role: 'group', 'aria-label': t('editeur.personnage') });
  const cartes = new Map();
  const marquer = () => { for (const [id, c] of cartes) c.setAttribute('aria-pressed', String(id === valeur)); };

  (async () => {
    try {
      const persos = await loadCharacters();
      clear(el);
      for (const def of persos) {
        const img = h('img', { alt: '', width: 64, height: 86, src: 'icons/favicon.svg' });
        const carte = h('button', { type: 'button', class: 'char-card', 'aria-pressed': 'false',
          'aria-label': def.nom, disabled: !!def.erreur, title: def.erreur || def.nom },
        img, h('span', { text: def.nom }));
        carte.addEventListener('click', () => {
          valeur = def.id; marquer(); onChange(def.id);
        });
        cartes.set(def.id, carte);
        el.append(carte);
        if (!def.erreur) thumbnailUrl(def).then((url) => { img.src = url; }).catch((err) => { carte.disabled = true; carte.title = err.message; report('personnage', err); });
      }
      marquer();
    } catch (err) {
      report('personnages', err);
      el.append(h('p', { class: 'muted', text: String(err.message) }));
    }
  })();
  return { el, set: (id) => { valeur = id; marquer(); } };
}
