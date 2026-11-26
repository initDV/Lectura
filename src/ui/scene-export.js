// @ts-check
// scene-export.js : capture PNG et enregistrement vidéo de la scène (ouverts depuis le menu ou les raccourcis S et R).
// La vidéo ne filme pas l'écran : la scène est redessinée sur un canvas, le personnage vient du SVG vivant sérialisé (B5).
import { store } from '../state.js';
import { h } from './dom.js';
import { t } from '../modules/i18n.js';
import { drawScene, capturePng, downloadBlob, renderDecor } from '../modules/capture.js';
import { startRecording, supportedMime, FORMATS } from '../modules/recorder.js';
import { SvgFrame } from '../modules/svgframe.js';
import { fileBase } from '../modules/project.js';
import { notify, report } from '../modules/errors.js';
import { ouvrirMenuTelechargement } from './download-menu.js';
import { verifierExport, resumerVerification } from '../modules/verif-export.js';

/**
 * @param {{ projet: any, badge: HTMLElement, pret: ()=>boolean, pourCanvas: ()=>any, source: ()=>any,
 *   pause: ()=>void, chercher: (ms:number)=>void, jouer: ()=>Promise<void>, format: ()=>string }} o
 */
export function creerExport(o) {
  /** @type {any} */ let rec = null;

  async function capture() {
    if (!o.pret()) return notify(t('scene.err.rienACapturer'), 'info');
    try {
      const portrait = window.innerHeight > window.innerWidth;
      const decorCouleurs = store.settings?.decor || null;
      const blob = await capturePng(o.pourCanvas(), { w: portrait ? 1080 : 1280, h: portrait ? 1920 : 720, decorCouleurs });
      downloadBlob(blob, `${fileBase(o.projet)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
      notify(t('scene.captureOk'), 'ok');
    } catch (err) { report('capture', err); }
  }

  async function demarrer() {
    if (!o.pret()) return notify(t('scene.err.rienACapturer'), 'info');
    if (!supportedMime()) return notify(t('scene.err.videoNonGeree'), 'error');
    try {
      const f = FORMATS[o.format()] || FORMATS['16:9'], canvas = h('canvas', { width: f.w, height: f.h }), ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t('scene.err.videoNonGeree'));
      await document.fonts?.ready;
      o.pause(); o.chercher(0);
      // Le SVG vivant doit refléter le début, pas la pose qui était en pause avant le retour à zéro.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const sc = o.pourCanvas(), frame = new SvgFrame(sc.svg);
      sc.terminal.revealTo(0);
      const decorImage = !sc.peindreDecor && store.settings?.decor ? await renderDecor(store.settings.decor) : null;
      drawScene(ctx, f.w, f.h, { ...sc, persoImage: await frame.pret(sc.avance), decorImage });
      const source = o.source(), flux = source.stream, son = Boolean(flux?.getAudioTracks().length);
      const r = await startRecording({ canvas, audioStream: flux, fps: 30 });
      rec = { ...r, ctx, w: f.w, h: f.h, frame, decorImage, son };
      o.badge.hidden = false;
      const prevenir = !son && source.kind !== 'apercu';
      notify(t(prevenir ? 'scene.videoSansSon' : 'scene.videoDebut'), prevenir ? 'warn' : 'info', 7000);
      await o.jouer();
    } catch (err) { rec = null; o.badge.hidden = true; report('video', err); }
  }

  async function arreter() {
    const r = rec;
    if (!r) return;
    rec = null; o.badge.hidden = true;
    o.pause();
    try {
      const blob = await r.stop();
      if (!blob.size) throw new Error('Enregistrement vide.');
      // Vérification : relit le fichier et signale les défauts classiques (durée absente,
      // index à la fin, piste audio muette, images manquantes). Ne bloque jamais le téléchargement.
      try {
        const verif = await verifierExport(blob, { attendSon: r.son });
        const resume = resumerVerification(verif);
        notify(t(verif.ok ? 'scene.video.verifOk' : 'scene.video.verifKo', { detail: resume }), verif.ok ? 'ok' : 'warn', 8000);
      } catch (err) { report('verif-export', err); }
      ouvrirMenuTelechargement({ videoBlob: blob, mime: r.mime, son: r.son, fileBase: fileBase(o.projet) });
    } catch (err) { report('video', err); }
  }

  return {
    get actif() { return !!rec; },
    capture, arreter,
    basculer: () => (rec ? arreter() : demarrer()),
    /** À chaque image de la scène : met à jour l'image du personnage et redessine le canvas enregistré. */
    image(now) {
      if (!rec) return;
      const sc = o.pourCanvas();
      rec.frame.update(sc.avance);
      drawScene(rec.ctx, rec.w, rec.h, { ...sc, avance: rec.frame.avance, persoImage: rec.frame.image, decorImage: rec.decorImage }, now);
    },
    /** Quitte l'écran : on jette l'enregistrement en cours. */
    abandonner() { if (rec) { rec.stop().catch(() => {}); rec = null; } },
  };
}
