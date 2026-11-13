// @ts-check
// recorder.js : export vidéo. L'export NE FILME PAS l'écran : la scène est redessinée sur un canvas
// (capture.js) et ce canvas est enregistré avec l'audio (MediaRecorder). Code de référence C6.
import { ensureRoundRect } from './svgcanvas.js';

export function drawCharacter(ctx, x, y, k, p, color = '#3a3f4b', accent = '#4fd8e8') {
  ensureRoundRect();
  const rr = (a, b, w, h, r) => { ctx.beginPath(); ctx.roundRect(a, b, w, h, r); ctx.fill(); };
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.fillStyle = color;
  rr(120, 200, 30, 150, 15); rr(150, 200, 30, 150, 15);
  ctx.save(); ctx.translate(115, 122); ctx.rotate((p.armL * Math.PI) / 180); ctx.translate(-115, -122); rr(60, 105, 55, 34, 17); ctx.restore();
  ctx.save(); ctx.translate(185, 122); ctx.rotate((p.armR * Math.PI) / 180); ctx.translate(-185, -122); rr(185, 105, 55, 34, 17); ctx.restore();
  ctx.save(); ctx.translate(0, p.torsoDy); rr(115, 95, 70, 130, 22); ctx.restore();
  ctx.save(); ctx.translate(0, p.headDy); ctx.translate(150, 95); ctx.rotate((p.headRot * Math.PI) / 180); ctx.translate(-150, -95);
  ctx.beginPath(); ctx.arc(150, 55, 42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accent; const v = p.visor;
  if (p.expr === 'content') { ctx.strokeStyle = accent; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(124, 58); ctx.quadraticCurveTo(150, 40, 176, 58); ctx.stroke(); }
  else { ctx.save(); ctx.translate(150, 54); ctx.rotate(((v.rot || 0) * Math.PI) / 180); ctx.translate(-150, -54); rr(v.x, v.y, v.w, v.h, v.rx); ctx.restore(); }
  ctx.restore(); ctx.restore();
}

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
