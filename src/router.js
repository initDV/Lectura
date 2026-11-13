// @ts-check
// router.js : navigation par hash (#/accueil #/editeur #/scene #/reglages #/pro #/apropos).
// Chaque écran est un module chargé à la demande qui exporte render(conteneur) → fonction de nettoyage.
import { renderNav } from './ui/shell.js';
import { report } from './modules/errors.js';
import { t } from './modules/i18n.js';
import { h, clear } from './ui/dom.js';

const ROUTES = {
  accueil: () => import('./ui/accueil.js'),
  editeur: () => import('./ui/editeur.js'),
  scene: () => import('./ui/scene.js'),
  reglages: () => import('./ui/reglages.js'),
  pro: () => import('./ui/pro.js'),
  apropos: () => import('./ui/apropos.js'),
};
let nettoyer = null, jeton = 0, courante = '';

export const currentRoute = () => courante;

export function go(route) {
  if (location.hash === `#/${route}`) naviguer();
  else location.hash = `#/${route}`;
}

export async function naviguer() {
  const app = document.getElementById('app');
  if (!app) return;
  let nom = (location.hash.match(/^#\/([a-z]+)/) || [])[1] || 'accueil';
  if (!ROUTES[nom]) nom = 'accueil';
  const moi = ++jeton;
  try { nettoyer?.(); } catch (err) { report('navigation', err); }
  nettoyer = null;
  courante = nom;
  document.body.classList.toggle('route-scene', nom === 'scene');
  renderNav(nom);
  document.title = `${t(`nav.${nom}`)} · Lectura`;
  try {
    const mod = await ROUTES[nom]();
    if (moi !== jeton) return; // l'utilisateur a déjà changé d'écran
    clear(app);
    const fin = await mod.render(app);
    if (moi !== jeton) { fin?.(); return; }
    nettoyer = fin || null;
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    report('navigation', err, t('err.ecran'));
    clear(app).append(h('div', { class: 'card' }, h('h1', { text: t('err.ecranTitre') }), h('p', { text: String(err?.message || err) }),
      h('button', { type: 'button', class: 'btn btn-primary', text: t('commun.reessayer'), onClick: naviguer })));
  }
}

export function initRouter() {
  window.addEventListener('hashchange', naviguer);
  return naviguer();
}
