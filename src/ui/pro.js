// @ts-check
// Écran Pro : identifiant d'installation (à copier), clé de licence, état Gratuit / Pro, fonctions débloquées.
import { store } from '../state.js';
import { h, add, clear, field, copyText } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { activerLicence, retirerLicence } from '../app.js';
import { report, notify } from '../modules/errors.js';

const FONCTIONS = ['personnages', 'expressions', 'lipsync', 'mots', 'video', 'formats', 'terminal', 'sousTitres', 'voixHd', 'filigrane'];

export async function render(root) {
  const etat = h('div', { class: 'row', role: 'status' });
  const cle = h('textarea', { class: 'mono', rows: 4, placeholder: t('pro.cle.aide'), autocomplete: 'off', spellcheck: false });
  const valider = h('button', { type: 'button', class: 'btn btn-primary' }, icon('check'), t('pro.valider'));
  const retirer = h('button', { type: 'button', class: 'btn btn-danger', text: t('pro.retirer') });

  function dessiner() {
    add(clear(etat), h('strong', { text: t('pro.etat') }),
      h('span', { class: `badge ${store.pro ? 'badge-ok' : ''}`, text: store.pro ? 'PRO' : t('pro.gratuit') }),
      store.pro && store.licence?.issuedAt ? h('span', { class: 'muted small', text: t('pro.emise', { date: new Date(store.licence.issuedAt).toLocaleDateString() }) }) : null);
    retirer.hidden = !store.pro;
  }

  valider.addEventListener('click', async () => {
    if (!cle.value.trim()) { notify(t('pro.err.format'), 'warn'); cle.focus(); return; }
    valider.disabled = true;
    try {
      const r = await activerLicence(cle.value);
      if (r.ok) { notify(t('pro.active'), 'ok'); cle.value = ''; } else notify(t(`pro.err.${r.reason}`), 'error');
    } catch (err) { report('licence', err); }
    valider.disabled = false;
    dessiner();
  });
  retirer.addEventListener('click', async () => {
    if (!confirm(t('pro.retirer.confirmer'))) return;
    try { await retirerLicence(); notify(t('pro.retiree'), 'info'); } catch (err) { report('licence', err); }
    dessiner();
  });

  add(root,
    h('h1', { text: t('pro.titre') }),
    h('section', { class: 'card' }, etat, h('p', { class: 'muted', text: t('pro.explication') })),
    h('section', { class: 'card' }, h('h2', { text: t('pro.id.titre') }), h('p', { class: 'muted small', text: t('pro.id.aide') }),
      h('div', { class: 'idbox', text: store.settings.idInstallation, 'aria-label': t('pro.id.titre') }),
      h('p', null, h('button', { type: 'button', class: 'btn', onClick: async () => notify(t((await copyText(store.settings.idInstallation)) ? 'commun.copie' : 'commun.copieEchec'), 'info') }, icon('copy'), t('pro.id.copier')))),
    h('section', { class: 'card' }, h('h2', { text: t('pro.cle.titre') }), field(t('pro.cle.label'), cle), h('div', { class: 'row' }, valider, retirer)),
    h('section', { class: 'card' }, h('h2', { text: t('pro.debloque') }),
      h('ul', { class: 'features' }, ...FONCTIONS.map((f) => h('li', { text: t(`pro.f.${f}`) }))),
      h('p', { class: 'muted small', text: t('pro.gratuitReste') })));
  dessiner();
  return null;
}
