// @ts-check
// project.js : modèle de projet (.lectura, JSON version 1), validation, export / import. Module pur.

export const VERSION_PROJET = 1;
export const PERSO_DEFAUT = 'robot_lectura';
const ANCIENS_PERSOS = { professor_1: 'robot_lectura', robot: 'robot_rouge' }; // projets créés avant le robot « outline »
export const EXPRESSIONS_BASE = ['auto', 'neutre', 'content', 'concentre', 'surpris'];
export const EXPRESSIONS_PRO = ['sceptique', 'fatigue', 'triste'];

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newProject(init = {}) {
  const now = new Date().toISOString();
  return normalizeProject({ id: uuid(), creeLe: now, modifieLe: now, ...init });
}

const str = (v, d = '') => (typeof v === 'string' ? v : d);
const num = (v, d, min, max) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(min, Math.min(max, +v)) : d);

/** Complète / corrige un objet projet. Lève une erreur en français si l'objet n'est pas un projet Lectura. */
export function normalizeProject(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error("Ce fichier n'est pas un projet Lectura valide.");
  if (o.version !== undefined && +o.version > VERSION_PROJET) {
    throw new Error(`Ce projet vient d'une version plus récente de Lectura (format ${o.version}). Mets l'application à jour.`);
  }
  const a = o.audio || {}, v = a.voix || {}, t = o.terminal || {}, r = o.reglages || {};
  const now = new Date().toISOString();
  return {
    version: VERSION_PROJET,
    id: str(o.id) || uuid(),
    titre: str(o.titre).slice(0, 200),
    creeLe: str(o.creeLe, now),
    modifieLe: str(o.modifieLe, now),
    texte: str(o.texte).replace(/\r\n?/g, '\n'),
    segments: (Array.isArray(o.segments) ? o.segments : [])
      .filter((s) => s && typeof s.texte === 'string' && s.texte)
      .map((s, i) => ({
        id: i + 1,
        texte: s.texte,
        debutMs: num(s.debutMs, 0, 0, 1e9),
        finMs: num(s.finMs, 0, 0, 1e9),
        expression: [...EXPRESSIONS_BASE, ...EXPRESSIONS_PRO].includes(s.expression) ? s.expression : 'auto',
      })),
    audio: {
      source: a.source === 'fichier' ? 'fichier' : 'voix',
      nomFichier: str(a.nomFichier),
      dureeMs: num(a.dureeMs, 0, 0, 1e9),
      voix: {
        moteur: v.moteur === 'piper' ? 'piper' : 'webspeech',
        id: str(v.id),
        vitesse: num(v.vitesse, 1, 0.5, 2),
        hauteur: num(v.hauteur, 1, 0, 2),
      },
    },
    timing: o.timing === 'sous-titres' ? 'sous-titres' : 'auto', // 'sous-titres' = dates importées d'un .srt/.vtt, à respecter
    personnageId: ANCIENS_PERSOS[o.personnageId] || str(o.personnageId, PERSO_DEFAUT) || PERSO_DEFAUT,
    terminal: {
      theme: str(t.theme, 'sombre'),
      police: str(t.police, 'JetBrains Mono'),
      taille: num(t.taille, 18, 12, 40),
      vitesseCps: num(t.vitesseCps, 28, 5, 120),
      prompt: typeof t.prompt === 'string' ? t.prompt.slice(0, 12) : '$ ',
    },
    reglages: {
      mouvements: ['calme', 'normal', 'vif'].includes(r.mouvements) ? r.mouvements : 'normal',
      fond: /^#[0-9a-f]{6}$/i.test(r.fond || '') && r.fond !== '#0b0f14' ? r.fond : '#0d0d12', // #0b0f14 = ancien fond par défaut
    },
  };
}

/** Projet → texte JSON du fichier .lectura (l'audio importé n'est pas inclus : seul son nom est gardé). */
export function serializeProject(p) {
  return JSON.stringify(normalizeProject(p), null, 2);
}

/** Texte d'un fichier .lectura → projet validé. */
export function parseProject(json) {
  let o;
  try {
    o = JSON.parse(json);
  } catch {
    throw new Error('Fichier .lectura illisible : ce n\'est pas du JSON valide.');
  }
  return normalizeProject(o);
}

/** Nom de fichier sûr à partir du titre. */
export function fileBase(p) {
  const base = (p.titre || 'projet')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'projet';
}
