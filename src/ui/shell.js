// @ts-check
// shell.js : éléments permanents (navigation, pastille réseau, bandeau « nouvelle version »).
import { bus, store } from '../state.js';
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { applyUpdate } from '../modules/pwa.js';

const LIENS = [['scene', 'back'], ['projets', 'folder'], ['personnages', 'smile'], ['reglages', 'settings'], ['pro', 'star'], ['apropos', 'info']];

export function renderNav(route = '') {
  const nav = document.getElementById('nav');
  if (!nav) return;
  clear(nav).append(...LIENS.map(([nom, ic]) =>
    h('a', { href: `#/${nom}`, 'aria-current': route === nom ? 'page' : null, 'aria-label': t(nom === 'scene' ? 'nav.retour' : `nav.${nom}`), title: t(nom === 'scene' ? 'nav.retour' : `nav.${nom}`) },
      icon(ic), h('span', { text: t(nom === 'scene' ? 'nav.retour' : `nav.${nom}`) }))));
}

function renderPill() {
  const pill = document.getElementById('net-pill');
  if (!pill) return;
  pill.className = `pill ${store.enLigne ? 'pill-on' : 'pill-off'}`;
  pill.textContent = t(store.enLigne ? 'net.enLigne' : 'net.horsLigne');
}

export function initShell() {
  renderNav();
  renderPill();
  bus.on('net:online', renderPill);
  bus.on('net:offline', renderPill);
  bus.on('sw:update-available', (worker) => {
    const bandeau = document.getElementById('update-banner');
    if (!bandeau) return;
    clear(bandeau).append(
      h('span', { text: t('maj.disponible') }),
      h('button', { type: 'button', class: 'btn btn-primary', text: t('maj.recharger'), onClick: () => applyUpdate(worker) }));
    bandeau.hidden = false;
  });
}

/** Après un changement de langue. */
export function refreshShell(route) {
  renderNav(route);
  renderPill();
}
