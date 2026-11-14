// @ts-check
import { h } from './dom.js';
import { ouvrirModale } from './modale.js';
import { t, taille } from '../modules/i18n.js';
import { downloadBlob } from '../modules/capture.js';
import { videoVersMp3 } from '../modules/audio-export.js';
import { remuxerMp4 } from '../modules/mp4-remux.js';
import { notify, report } from '../modules/errors.js';

export function ouvrirMenuTelechargement({ videoBlob, mime, fileBase }) {
  const estMp4 = mime.startsWith('video/mp4');
  const tailleVideo = taille(videoBlob.size);

  const telechargerMp4 = async (fermer) => {
    fermer();
    notify(t('dl.mp4.reparation'), 'info', 3000);
    try {
      const blobCorrige = await remuxerMp4(videoBlob);
      const blobFinal = blobCorrige || videoBlob;
      downloadBlob(blobFinal, `${fileBase}.mp4`);
      notify(t('dl.mp4.ok', { taille: taille(blobFinal.size) }), 'ok', 6000);
    } catch (err) {
      report('mp4', err);
      downloadBlob(videoBlob, `${fileBase}.mp4`);
      notify(t('dl.mp4.echec'), 'warn');
    }
  };

  const telechargerWebm = (fermer) => { downloadBlob(videoBlob, `${fileBase}.webm`); fermer(); };

  const genererMp3 = async (fermer) => {
    fermer();
    notify(t('dl.mp3.encours'), 'info', 3000);
    try {
      const mp3 = await videoVersMp3(videoBlob);
      downloadBlob(mp3, `${fileBase}.mp3`);
      notify(t('dl.mp3.ok', { taille: taille(mp3.size) }), 'ok', 6000);
    } catch (err) { report('audio', err); notify(t('dl.mp3.echec'), 'error'); }
  };

  const opt = ({ nom, sous, tailleTxt, actif, onClick }) => h('button', {
    type: 'button', class: 'btn', disabled: !actif, onClick,
    style: 'display:flex;flex-direction:column;align-items:flex-start;gap:.15rem;width:100%;margin:.35rem 0;text-align:left;',
  },
    h('strong', { text: nom }), h('span', { class: 'hint', text: sous }),
    tailleTxt ? h('span', { class: 'hint', text: tailleTxt }) : null,
  );

  ouvrirModale(t('dl.titre'), (fermer) => [
    h('p', { class: 'hint', text: t('dl.aide') }),
    estMp4
      ? opt({ nom: 'MP4 (lisible partout)', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onClick: () => telechargerMp4(fermer) })
      : opt({ nom: 'MP4', sous: t('dl.mp4.indispo'), actif: false }),
    !estMp4
      ? opt({ nom: 'WebM', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onClick: () => telechargerWebm(fermer) })
      : opt({ nom: 'WebM', sous: t('dl.webm.indispo'), actif: false }),
    opt({ nom: 'MP3', sous: t('dl.mp3.genere'), actif: true, onClick: () => genererMp3(fermer) }),
  ]);
}
