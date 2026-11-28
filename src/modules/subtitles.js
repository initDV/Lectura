// @ts-check
// subtitles.js : import / export de sous-titres .srt et .vtt. Module pur.

const RE_TEMPS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const ms = (h, m, s, f) => (+(h || 0) * 3600 + +m * 60 + +s) * 1000 + +String(f).padEnd(3, '0');

/** Lit un fichier SRT ou VTT → [{debutMs, finMs, texte}]. Lève une erreur claire si rien n'est lisible. */
export function parseSubtitles(source) {
  const blocs = String(source).replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/);
  const cues = [];
  for (const bloc of blocs) {
    const lignes = bloc.split('\n').filter((l) => l.trim() !== '');
    const i = lignes.findIndex((l) => RE_TEMPS.test(l));
    if (i < 0) continue; // en-tête WEBVTT, NOTE, STYLE…
    const m = lignes[i].match(RE_TEMPS);
    const texte = lignes.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!texte) continue;
    cues.push({ debutMs: ms(m[1], m[2], m[3], m[4]), finMs: ms(m[5], m[6], m[7], m[8]), texte });
  }
  if (!cues.length) throw new Error('Aucun sous-titre lisible dans ce fichier (formats acceptés : .srt, .vtt).');
  cues.sort((a, b) => a.debutMs - b.debutMs);
  return cues;
}

/** Sous-titres → texte + segments d'un projet (une ligne de terminal par sous-titre). */
export function cuesToProject(cues) {
  return {
    texte: cues.map((c) => c.texte).join('\n'),
    segments: cues.map((c, i) => ({ id: i + 1, texte: c.texte, debutMs: c.debutMs, finMs: Math.max(c.finMs, c.debutMs + 1), expression: 'auto' })),
  };
}

function horodatage(t, sep) {
  t = Math.max(0, Math.round(t));
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)}${sep}${p(t % 1000, 3)}`;
}

export function toSrt(segments) {
  return segments.map((s, i) => `${i + 1}\n${horodatage(s.debutMs, ',')} --> ${horodatage(s.finMs, ',')}\n${s.texte}\n`).join('\n');
}

export function toVtt(segments) {
  return 'WEBVTT\n\n' + segments.map((s) => `${horodatage(s.debutMs, '.')} --> ${horodatage(s.finMs, '.')}\n${s.texte}\n`).join('\n');
}
