// @ts-check
// download-menu.js : après un enregistrement, propose MP4 / WebM / MP3.
// MP4 et WebM : seul celui réellement produit par le navigateur est actif.
// MP3 : généré à la demande depuis la piste audio du fichier.
import { h } from './dom.js';
import { ouvrirModale } from './modale.js';
import { t, taille } from '../modules/i18n.js';
import { downloadBlob } from '../modules/capture.js';
import { videoVersMp3 } from '../modules/audio-export.js';
import { notify, report } from '../modules/errors.js';

/**
 * @param {{ videoBlob: Blob, mime: string, fileBase: string }} o
 */
export function ouvrirMenuTelechargement({ videoBlob, mime, fileBase }) {
  const estMp4 = mime.startsWith('video/mp4');
  const tailleVideo = taille(videoBlob.size);

  const telecharger = (ext, fermer) => { downloadBlob(videoBlob, `${fileBase}.${ext}`); fermer(); };

  const genererMp3 = async (fermer) => {
    fermer();
    notify(t('dl.mp3.encours'), 'info', 3000);
    try {
      const mp3 = await videoVersMp3(videoBlob);
      downloadBlob(mp3, `${fileBase}.mp3`);
      notify(t('dl.mp3.ok', { taille: taille(mp3.size) }), 'ok', 6000);
    } catch (err) {
      report('audio', err);
      notify(t('dl.mp3.echec'), 'error');
    }
  };

  const opt = ({ nom, sous, tailleTxt, actif, onClick }) => h('button', {
    type: 'button', class: 'btn', disabled: !actif, onClick,
    style: 'display:flex;flex-direction:column;align-items:flex-start;gap:.15rem;width:100%;margin:.35rem 0;text-align:left;',
  },
    h('strong', { text: nom }),
    h('span', { class: 'hint', text: sous }),
    tailleTxt ? h('span', { class: 'hint', text: tailleTxt }) : null,
  );

  ouvrirModale(t('dl.titre'), (fermer) => [
    h('p', { class: 'hint', text: t('dl.aide') }),
    estMp4 && /Android/i.test(navigator.userAgent) ? h('p', { class: 'hint', text: t('dl.mp4.galerie') }) : null,
    estMp4
      ? opt({ nom: 'MP4', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onClick: () => telecharger('mp4', fermer) })
      : opt({ nom: 'MP4', sous: t('dl.mp4.indispo'), actif: false }),
    !estMp4
      ? opt({ nom: 'WebM', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onClick: () => telecharger('webm', fermer) })
      : opt({ nom: 'WebM', sous: t('dl.webm.indispo'), actif: false }),
    opt({ nom: 'MP3', sous: t('dl.mp3.genere'), actif: true, onClick: () => genererMp3(fermer) }),
  ]);
}
