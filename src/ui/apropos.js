// @ts-check
// Écran À propos : version, confidentialité, aide à l'installation, raccourcis, licences, journal d'erreurs.
import { h, add, clear, copyText } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { VERSION, BUILD } from '../version.js';
import { getJournal, clearJournal, buildReport, notify } from '../modules/errors.js';
import { isIos, isStandalone } from '../modules/pwa.js';
import { majReglages } from '../app.js';

const RACCOURCIS = [['touche.espace', 'scene.lecture'], ['← →', 'aide.pm5'], ['P', 'scene.presentation'], ['S', 'scene.capture'],
  ['R', 'scene.enregistrer'], ['M', 'scene.muet'], ['F', 'scene.pleinEcran'], ['E', 'aide.expression']];

export async function render(root) {
  const journal = h('pre', { class: 'log', tabindex: 0, 'aria-label': t('apropos.journal') });
  const dessiner = () => {
    const j = getJournal();
    journal.textContent = j.length ? j.slice().reverse().map((e) => `[${e.date}] ${e.ou} : ${e.message}`).join('\n') : t('apropos.journal.vide');
  };
  dessiner();

  add(root,
    h('h1', { text: t('nav.apropos') }),
    h('section', { class: 'card' }, h('h2', { text: `Lectura Web ${VERSION}` }),
      h('p', { text: t('apropos.description') }), h('p', { class: 'muted small', text: `${t('reglages.version')} : ${VERSION} (${BUILD})` }),
      h('button', { type: 'button', class: 'btn', text: t('apropos.revoirTuto'), onClick: async () => { await majReglages({ tutorielVu: false }); (await import('./tutoriel.js')).ouvrirTutoriel(); } })),
    h('section', { class: 'card' }, h('h2', { text: t('apropos.confidentialite') }), h('p', { text: t('apropos.confidentialite.texte') })),
    isStandalone() ? null : h('section', { class: 'card' }, h('h2', { text: t('apropos.installer') }),
      h('p', { text: t(isIos() ? 'accueil.installer.ios' : 'apropos.installer.texte') })),
    h('section', { class: 'card' }, h('h2', { text: t('apropos.raccourcis') }),
      h('dl', { class: 'kv' }, ...RACCOURCIS.flatMap(([k, cle]) => [h('dt', null, h('kbd', { text: k.includes('.') ? t(k) : k })), h('dd', { text: t(cle) })]))),
    h('section', { class: 'card' }, h('h2', { text: t('apropos.licences') }), h('p', { text: t('apropos.licences.texte') }),
      h('ul', { class: 'features' }, ...['apropos.lic.code', 'apropos.lic.polices', 'apropos.lic.voix', 'apropos.lic.ort'].map((c) => h('li', { text: t(c) })))),
    h('section', { class: 'card' }, h('h2', { text: t('apropos.journal') }), h('p', { class: 'muted small', text: t('apropos.journal.aide') }), journal,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: async () => notify(t((await copyText(buildReport())) ? 'commun.copie' : 'commun.copieEchec'), 'info') }, icon('copy'), t('apropos.journal.copier')),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { clearJournal(); clear(journal); dessiner(); } }, icon('trash'), t('apropos.journal.vider')))));
  return null;
}
