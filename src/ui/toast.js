// @ts-check
// toast.js : notifications visibles (zone aria-live="polite" de index.html). Écoute l'événement ui:toast.
import { bus } from '../state.js';
import { h } from './dom.js';
import { t } from '../modules/i18n.js';

const DUREES = { error: 9000, warn: 7000, ok: 4000, info: 4500 };

export function initToasts() {
  const zone = document.getElementById('toasts');
  if (!zone) return;
  bus.on('ui:toast', ({ type = 'info', message, duree }) => {
    const texte = String(message || '').slice(0, 600);
    if (!texte || [...zone.children].some((c) => c.dataset.msg === texte)) return; // pas de doublon affiché
    const fermer = () => el.remove();
    const el = h('div', { class: `toast toast-${type}`, dataset: { msg: texte }, role: type === 'error' ? 'alert' : null },
      h('p', { text: texte }),
      h('button', { type: 'button', 'aria-label': t('commun.fermer'), text: '✕', onClick: fermer }));
    zone.append(el);
    while (zone.children.length > 4) zone.firstElementChild?.remove();
    setTimeout(fermer, duree || DUREES[type] || 4500);
  });
}
