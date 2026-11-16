// @ts-check
import { h } from './dom.js';
import { ouvrirModale } from './modale.js';
import { t, taille } from '../modules/i18n.js';
import { downloadBlob } from '../modules/capture.js';
import { videoVersMp3 } from '../modules/audio-export.js';
import { remuxerMp4 } from '../modules/mp4-remux.js';
import { sauverVideo } from '../modules/video-store.js';
import { notify, report } from '../modules/errors.js';

const peutPartager = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

async function partager(blob, nom, mime, fermer) {
  fermer();
  try {
    const fichier = new File([blob], nom, { type: mime });
    if (!peutPartager() || !navigator.canShare({ files: [fichier] })) {
      downloadBlob(blob, nom);
      notify(t('dl.partage.indispo'), 'info');
      return;
    }
    await navigator.share({ files: [fichier], title: nom });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    report('partage', err);
    downloadBlob(blob, nom);
  }
}

export function ouvrirMenuTelechargement({ videoBlob, mime, fileBase }) {
  const estMp4 = mime.startsWith('video/mp4');
  const tailleVideo = taille(videoBlob.size);
  const garder = h('input', { type: 'checkbox', checked: true, id: 'dl-garder' });

  const sauverSiDemande = async (blob, format) => {
    if (!garder.checked) return;
    try { await sauverVideo({ blob, titre: fileBase, format }); }
    catch (err) { report('sauver-video', err); }
  };

  const preparerMp4 = async () => {
    notify(t('dl.mp4.reparation'), 'info', 3000);
    const corrige = await remuxerMp4(videoBlob);
    const base = corrige || videoBlob;
    // Conversion AAC : Chrome enregistre en Opus dans le MP4, qu'aucun reseau social
    // ne decode. On reencode l'audio seul (video H.264 recopiee) avant telechargement/partage.
    try {
      const { convertirEnAac } = await import('../modules/mp4-audio-aac.js');
      const converti = await convertirEnAac(base, {
        surProgres: (etape) => { if (etape === 'encodage') notify(t('dl.mp4.aac'), 'info', 4000); }
      });
      if (converti) {
        notify(t('dl.mp4.aacOk', { taille: taille(converti.blob.size) }), 'ok', 6000);
        return converti.blob;
      }
    } catch (err) {
      report('aac', err);
      notify(t('dl.mp4.aacEchec'), 'warn', 8000);
    }
    return base;
  };

  const telechargerMp4 = async (fermer) => {
    try {
      const b = await preparerMp4();
      await sauverSiDemande(b, 'mp4');
      downloadBlob(b, `${fileBase}.mp4`);
      notify(t('dl.mp4.ok', { taille: taille(b.size) }), 'ok', 6000);
      fermer();
    } catch (err) { report('mp4', err); downloadBlob(videoBlob, `${fileBase}.mp4`); notify(t('dl.mp4.echec'), 'warn'); fermer(); }
  };

  const partagerMp4 = async (fermer) => {
    try {
      const b = await preparerMp4();
      await sauverSiDemande(b, 'mp4');
      await partager(b, `${fileBase}.mp4`, 'video/mp4', fermer);
    } catch (err) { report('mp4', err); await partager(videoBlob, `${fileBase}.mp4`, 'video/mp4', fermer); }
  };

  const telechargerWebm = async (fermer) => { await sauverSiDemande(videoBlob, 'webm'); downloadBlob(videoBlob, `${fileBase}.webm`); fermer(); };

  const genererMp3 = async (fermer, pourPartage) => {
    notify(t('dl.mp3.encours'), 'info', 3000);
    try {
      const mp3 = await videoVersMp3(videoBlob);
      await sauverSiDemande(mp3, 'mp3');
      if (pourPartage) await partager(mp3, `${fileBase}.mp3`, 'audio/mpeg', fermer);
      else { downloadBlob(mp3, `${fileBase}.mp3`); notify(t('dl.mp3.ok', { taille: taille(mp3.size) }), 'ok', 6000); fermer(); }
    } catch (err) { report('audio', err); notify(t('dl.mp3.echec'), 'error'); fermer(); }
  };

  const ligne = ({ nom, sous, tailleTxt, actif, onTelecharger, onPartager }) => h('div', {
    style: `display:flex;flex-direction:column;gap:.25rem;width:100%;margin:.5rem 0;padding:.5rem;border:1px solid #333;border-radius:.4rem;${actif ? '' : 'opacity:.5;'}`,
  },
    h('strong', { text: nom }),
    h('span', { class: 'hint', text: sous }),
    tailleTxt ? h('span', { class: 'hint', text: tailleTxt }) : null,
    actif
      ? h('div', { style: 'display:flex;gap:.4rem;margin-top:.35rem;' },
          h('button', { type: 'button', class: 'btn', onClick: () => onTelecharger(), style: 'flex:1;', text: t('dl.bouton.telecharger') }),
          h('button', { type: 'button', class: 'btn', onClick: () => onPartager(), style: 'flex:1;', text: t('dl.bouton.partager') }))
      : null,
  );

  ouvrirModale(t('dl.titre'), (fermer) => [
    h('p', { class: 'hint', text: t('dl.aide') }),
    h('p', { class: 'hint', text: t('dl.astuceGalerie'), style: 'color:#7fdfff;' }),
    h('label', { for: 'dl-garder', style: 'display:flex;align-items:center;gap:.4rem;margin:.5rem 0;padding:.4rem;background:#1a1a22;border-radius:.4rem;cursor:pointer;' },
      garder,
      h('span', { text: t('dl.garder') })
    ),
    estMp4
      ? ligne({ nom: 'MP4', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onTelecharger: () => telechargerMp4(fermer), onPartager: () => partagerMp4(fermer) })
      : ligne({ nom: 'MP4', sous: t('dl.mp4.indispo'), actif: false }),
    !estMp4
      ? ligne({ nom: 'WebM', sous: t('dl.formatVideo'), tailleTxt: tailleVideo, actif: true, onTelecharger: () => telechargerWebm(fermer), onPartager: () => partager(videoBlob, `${fileBase}.webm`, 'video/webm', fermer) })
      : ligne({ nom: 'WebM', sous: t('dl.webm.indispo'), actif: false }),
    ligne({ nom: 'MP3', sous: t('dl.mp3.genere'), actif: true, onTelecharger: () => genererMp3(fermer, false), onPartager: () => genererMp3(fermer, true) }),
  ]);
}
