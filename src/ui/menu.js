// @ts-check
// menu.js : menu discret de l'écran principal. Tout ce qui n'est pas sur la capture de référence vit ici :
// projet, aperçu, capture PNG, export vidéo, personnages, réglages, à propos.
import { store } from '../state.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { FORMATS } from '../modules/recorder.js';
import { canInstall, promptInstall, isStandalone, isIos } from '../modules/pwa.js';
import { ouvrirModale } from './modale.js';

/**
 * @param {{ projet: any, enregistrement: boolean, format: string, atlas: boolean, onTitre: (v:string)=>void, onFormat: (f:string)=>void,
 *   actions: Record<string, ()=>void> }} a  actions : atlas, enregistrer, exporter, importerTexte, importerSrt, exporterSrt,
 *   exporterVtt, apercu, capture, video, pleinEcran
 */
export function ouvrirMenu(a) {
  ouvrirModale(t('scene.menu'), (fermer) => {
    const bouton = (ic, texte, cle, presse = null) => h('li', null, h('button', { type: 'button', 'aria-pressed': presse, onClick: () => { fermer(); a.actions[cle](); } },
      icon(ic), h('span', { class: 'grow', text: texte })));
    const lien = (ic, route) => h('li', null, h('a', { href: `#/${route}`, onClick: fermer }, icon(ic), h('span', { class: 'grow', text: t(`nav.${route}`) })));
    const titre = h('input', { type: 'text', value: a.projet.titre, maxLength: 200, placeholder: t('editeur.sansTitre'), autocomplete: 'off', 'aria-label': t('editeur.titreProjet') });
    titre.addEventListener('input', () => a.onTitre(titre.value));
    const format = h('select', { 'aria-label': t('scene.format') }, ...Object.entries(FORMATS).map(([k, f]) => h('option', { value: k, text: f.nom })));
    format.value = FORMATS[a.format] ? a.format : '16:9';
    format.addEventListener('change', () => a.onFormat(format.value));
    const installer = isStandalone() ? null
      : canInstall() ? h('ul', { class: 'choix' }, h('li', null, h('button', { type: 'button', onClick: async () => { fermer(); await promptInstall(); } }, icon('download'), h('span', { class: 'grow', text: t('accueil.installer.texte') }))))
        : isIos() ? h('p', { class: 'muted small', text: t('accueil.installer.ios') }) : null;
    return [
      h('ul', { class: 'choix' }, bouton('sparkle', t('scene.atlas'), 'atlas', String(a.atlas))),
      h('h3', { text: t('menu.projet') }),
      h('div', { class: 'field' }, titre),
      h('ul', { class: 'choix' },
        bouton('save', t('editeur.enregistrer'), 'enregistrer'),
        lien('folder', 'projets'),
        bouton('upload', t('editeur.importerTexte'), 'importerTexte'),
        bouton('download', t('editeur.exporter'), 'exporter'),
        bouton('upload', t('editeur.importerSrt'), 'importerSrt'),
        bouton('download', t('menu.exporterSrt'), 'exporterSrt'),
        bouton('download', t('menu.exporterVtt'), 'exporterVtt')),
      h('h3', { text: t('menu.scene') }),
      h('ul', { class: 'choix' },
        bouton('eye', t('scene.apercuSansSon'), 'apercu'),
        bouton('camera', t('scene.capture'), 'capture'),
        bouton(a.enregistrement ? 'stop' : 'record', t(a.enregistrement ? 'scene.arreterEnregistrement' : 'scene.enregistrer'), 'video'),
        bouton('fullscreen', t('scene.pleinEcran'), 'pleinEcran')),
      h('div', { class: 'field' }, h('label', { text: t('scene.format') }), format),
      h('h3', { text: t('menu.avance') }),
      h('ul', { class: 'choix' }, bouton('video', t('menu.mesVideos'), 'mesVideos'), lien('smile', 'personnages'), lien('settings', 'reglages'), lien('info', 'apropos')),
      installer,
      h('p', { class: 'muted small' }, h('span', { class: `pill ${store.enLigne ? 'pill-on' : 'pill-off'}`, text: t(store.enLigne ? 'net.enLigne' : 'net.horsLigne') })),
    ];
  });
}
