// @ts-check
// mes-videos.js : liste des vidéos sauvegardées dans l'application, accessibles hors ligne.
import { h } from './dom.js';
import { ouvrirModale } from './modale.js';
import { t, taille } from '../modules/i18n.js';
import { downloadBlob } from '../modules/capture.js';
import { notify, report } from '../modules/errors.js';
import { listerVideos, lireVideo, supprimerVideo } from '../modules/video-store.js';

async function partagerOuTelecharger(blob, nom, mime) {
  try {
    const fichier = new File([blob], nom, { type: mime });
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: nom });
    } else {
      downloadBlob(blob, nom);
      notify(t('dl.partage.indispo'), 'info');
    }
  } catch (err) { if (err && err.name !== 'AbortError') report('partage', err); }
}

async function ouvrirLecteur(id) {
  try {
    const blob = await lireVideo(id);
    if (!blob) return notify(t('mv.introuvable'), 'error');
    const url = URL.createObjectURL(blob);
    ouvrirModale(t('mv.lecteur'), (fermer) => [
      h('video', {
        src: url, controls: true, autoplay: true,
        style: 'width:100%;max-height:70vh;background:#000;border-radius:8px;',
        onEnded: () => {},
      }),
      h('button', { type: 'button', class: 'btn', style: 'margin-top:.5rem;', text: t('commun.fermer'), onClick: () => { URL.revokeObjectURL(url); fermer(); } }),
    ]);
  } catch (err) { report('lecture-video', err); }
}

export async function ouvrirMesVideos() {
  const rendre = async () => {
    const videos = await listerVideos();
    return ouvrirModale(t('mv.titre'), (fermer) => {
      if (!videos.length) return [h('p', { class: 'hint', text: t('mv.vide') })];
      return videos.map((v) => h('div', {
        style: 'border:1px solid #333;padding:.55rem;margin:.4rem 0;border-radius:.4rem;',
      },
        h('strong', { text: v.titre }),
        h('p', { class: 'hint', style: 'margin:.15rem 0;', text: `${new Date(v.date).toLocaleString()} · ${String(v.format).toUpperCase()} · ${taille(v.taille)}` }),
        h('div', { style: 'display:flex;gap:.35rem;margin-top:.35rem;flex-wrap:wrap;' },
          h('button', { type: 'button', class: 'btn', style: 'flex:1;min-width:0;', text: t('mv.lire'), onClick: () => { fermer(); ouvrirLecteur(v.id); } }),
          h('button', { type: 'button', class: 'btn', style: 'flex:1;min-width:0;', text: t('mv.partager'), onClick: async () => {
            const blob = await lireVideo(v.id);
            if (!blob) return notify(t('mv.introuvable'), 'error');
            await partagerOuTelecharger(blob, `${v.titre}.${v.format}`, blob.type);
          } }),
          h('button', { type: 'button', class: 'btn', style: 'flex:1;min-width:0;', text: t('mv.supprimer'), onClick: async () => {
            await supprimerVideo(v.id);
            notify(t('mv.supprimee'), 'ok');
            fermer(); rendre();
          } }),
        ),
      ));
    });
  };
  return rendre();
}
