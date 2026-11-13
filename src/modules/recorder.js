// @ts-check
// recorder.js : export vidéo. L'export NE FILME PAS l'écran : la scène est redessinée sur un canvas
// (capture.js) et ce canvas est enregistré avec l'audio (MediaRecorder). Le personnage n'est plus redessiné à la
// main : son SVG vivant est sérialisé à chaque image (svgframe.js, correction B5).
export const FORMATS = {
  '16:9': { w: 1280, h: 720, nom: 'Paysage 16:9 (YouTube)' },
  '9:16': { w: 1080, h: 1920, nom: 'Vertical 9:16 (TikTok)' },
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
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let echec = null;
  rec.onerror = (e) => { echec = e.error || new Error('erreur du MediaRecorder'); };
  const done = new Promise((r, rej) => (rec.onstop = () => {
    stream.getVideoTracks().forEach((t) => t.stop());
    if (echec || !chunks.length) rej(new Error(`L'enregistrement a échoué${echec ? ` : ${echec.message}` : ' : aucune image reçue'}. Garde l'onglet visible pendant l'export.`));
    else r(new Blob(chunks, { type: mime.split(';')[0] }));
  }));
  rec.start(1000);
  return { mime, stop: () => { if (rec.state !== 'inactive') rec.stop(); return done; } };
}
