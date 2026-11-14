// @ts-check
// recorder.js : export vidéo. L'export NE FILME PAS l'écran : la scène est redessinée sur un canvas
// (capture.js) et ce canvas est enregistré avec l'audio (MediaRecorder). Le personnage n'est plus redessiné à la
// main : son SVG vivant est sérialisé à chaque image (svgframe.js, correction B5).
export const FORMATS = {
  '16:9': { w: 1280, h: 720, nom: 'Paysage 16:9 (YouTube)' },
  '9:16': { w: 720, h: 1280, nom: 'Vertical 9:16 (TikTok)' },
};
const MIMES = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

/** Format vidéo que ce navigateur sait enregistrer (null si aucun). */
export function supportedMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
export const extensionOf = (mime) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');

export async function startRecording({ canvas, audioStream, fps = 30 }) {
  if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new Error("Ce navigateur ne sait pas enregistrer de vidéo. Utilise Chrome ou Edge.");
  }
  const stream = canvas.captureStream(fps);
  audioStream?.getAudioTracks().forEach((t) => stream.addTrack(t)); // audioStream = audioCtx.createMediaStreamDestination().stream
  const mime = supportedMime();
  if (!mime) throw new Error("Ce navigateur ne sait pas enregistrer de vidéo. Utilise Chrome ou Edge.");
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let echec = null, debut = 0;
  rec.onerror = (e) => { echec = e.error || new Error('erreur du MediaRecorder'); };
  const done = new Promise((r, rej) => (rec.onstop = async () => {
    stream.getVideoTracks().forEach((t) => t.stop());
    if (echec || !chunks.length) rej(new Error(`L'enregistrement a échoué${echec ? ` : ${echec.message}` : ' : aucune image reçue'}. Garde l'onglet visible pendant l'export.`));
    else {
      const brut = new Blob(chunks, { type: mime.split(';')[0] });
      r(mime.startsWith('video/webm') ? await reparerWebm(brut, performance.now() - debut) : brut);
    }
  }));
  debut = performance.now();
  rec.start(1000);
  return { mime, stop: () => { if (rec.state !== 'inactive') rec.stop(); return done; } };
}

/**
 * Chrome enregistre les WebM sans durée : la galerie du téléphone les refuse. On écrit la durée dans le fichier
 * avant le téléchargement (fix-webm-duration, MIT, copiée dans src/vendor : aucun réseau). En cas d'échec, on garde l'original.
 */
async function reparerWebm(blob, dureeMs) {
  try {
    const { chargerFixWebm } = await import('../vendor/fixwebm.js');
    const fix = await chargerFixWebm();
    const corrige = await fix(blob, Math.max(1, Math.round(dureeMs)), { logger: false });
    return (await dureeLisible(corrige)) ? corrige : blob;
  } catch {
    return blob;
  }
}

/** Le navigateur lit-il une durée finie dans ce fichier ? (contrôle du résultat avant de le proposer) */
function dureeLisible(blob) {
  return new Promise((ok) => {
    const v = document.createElement('video'), url = URL.createObjectURL(blob);
    const fin = (r) => { clearTimeout(delai); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); ok(r); };
    const delai = setTimeout(() => fin(false), 8000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => fin(Number.isFinite(v.duration) && v.duration > 0);
    v.onerror = () => fin(false);
    v.src = url;
  });
}
