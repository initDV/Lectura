// @ts-check
// projet-actions.js : actions sur le projet ouvert, appelées depuis le menu (enregistrer, importer, exporter).
import { store } from '../state.js';
import { pickFile } from './dom.js';
import { t } from '../modules/i18n.js';
import { serializeProject, fileBase } from '../modules/project.js';
import { autoTiming, segmentsValides, reportExpressions, estimateDurationMs } from '../modules/timeline.js';
import { parseSubtitles, cuesToProject, toSrt, toVtt } from '../modules/subtitles.js';
import { saveProject, clearDraft } from '../modules/storage.js';
import { downloadBlob } from '../modules/capture.js';
import { report, notify } from '../modules/errors.js';

/** Recalcule les phrases du projet (minutage automatique, sauf dates importées d'un .srt/.vtt encore valides). */
export function recalculer(p) {
  if (p.timing === 'sous-titres' && !segmentsValides(p.texte, p.segments)) {
    p.timing = 'auto'; // le texte ne correspond plus aux sous-titres importés
    notify(t('editeur.timingPerdu'), 'warn');
  }
  if (p.timing !== 'sous-titres') {
    const duree = (p.audio.source === 'fichier' && p.audio.dureeMs) || estimateDurationMs(p.texte, p.audio.voix.vitesse, p.terminal.vitesseCps);
    p.segments = reportExpressions(autoTiming(p.texte, duree, p.audio.source === 'fichier' ? 0 : 0.5), p.segments);
  }
  return p.segments;
}

export async function enregistrer(p, silencieux = false) {
  try {
    recalculer(p);
    await saveProject(p);
    await clearDraft();
    store.modifie = false;
    if (!silencieux) notify(t('editeur.enregistre'), 'ok');
    return true;
  } catch (err) { report('enregistrement', err); return false; }
}

export function exporterLectura(p) {
  try { recalculer(p); downloadBlob(new Blob([serializeProject(p)], { type: 'application/json' }), `${fileBase(p)}.lectura`); } catch (err) { report('export', err); }
}

/** Importe un fichier .txt / .md dans le projet. Renvoie true si le texte a changé. */
export async function importerTexte(p) {
  const f = await pickFile('.txt,.md,.markdown,text/plain,text/markdown');
  if (!f) return false;
  try {
    if (f.size > 2_000_000) throw new Error(t('editeur.err.tropGros'));
    p.texte = (await f.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!p.titre) p.titre = f.name.replace(/\.[^.]+$/, '');
    recalculer(p);
    return true;
  } catch (err) { report('import-texte', err); return false; }
}

/** Importe des sous-titres .srt / .vtt (texte + dates). */
export async function importerSousTitres(p) {
  const f = await pickFile('.srt,.vtt,text/vtt');
  if (!f) return false;
  try {
    const r = cuesToProject(parseSubtitles(await f.text()));
    p.texte = r.texte; p.segments = r.segments; p.timing = 'sous-titres';
    notify(t('editeur.sousTitresImportes', { n: r.segments.length }), 'ok');
    return true;
  } catch (err) { report('import-sous-titres', err); return false; }
}

/** Exporte les phrases prononcées en .srt ou .vtt (les commandes et commentaires ne sont pas des sous-titres). */
export function exporterSousTitres(p, format) {
  if (!p.texte.trim()) return notify(t('scene.err.texteVide'), 'warn');
  const segs = recalculer(p).filter((s) => s.type !== 'commande' && s.type !== 'commentaire');
  downloadBlob(new Blob([format === 'srt' ? toSrt(segs) : toVtt(segs)], { type: 'text/plain' }), `${fileBase(p)}.${format}`);
}
