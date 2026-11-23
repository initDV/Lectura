// @ts-check
// prepare.js : étape PREPARATION de la scène (dictionnaire, personnage, source audio, timeline).
// Toute impossibilité lève une Error avec un message clair en français, affiché par la scène.
import { store } from '../state.js';
import { buildMatcher, mergeDicts } from './keywords.js';
import { compilerLexique } from './sentiment.js';
import { getCharacter, loadCharacterSvg } from './character-loader.js';
import { autoTiming, segmentsValides, reportExpressions, estimateDurationMs, Timeline, CPS_VOIX } from './timeline.js';
import { FileSource, SpeechSource, SilentSource } from './player.js';
import { SpeechQueue } from './voice/queue.js';
import { getEngine, voiceKey } from './voice/engine.js';
import { PIPER_RENDER_VERSION } from './voice/audio-cache.js';
import { getAudio } from './storage.js';
import { PERSO_DEFAUT } from './project.js';
import { encodeWav } from './audio.js';
import { notify } from './errors.js';
import { t, getLang } from './i18n.js';

async function json(url, quoi) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) {
    throw new Error(`Impossible de charger ${quoi} (${url}) : ${err.message}.`);
  }
}

/** Dictionnaire de mots-clés : base (gratuit) + enrichi et catégories personnalisées (Pro). */
export async function loadDict() {
  const langue = getLang(), base = await json(`data/keywords_${langue === 'en' ? 'en' : 'fr'}.json`, 'les mots-clés');
  if (!store.pro) return base;
  const extras = [await json('data/keywords_fr_pro.json', 'les mots-clés enrichis')];
  const perso = store.settings?.motsPerso;
  if (perso && Object.keys(perso).length) extras.push({ categories: perso });
  return mergeDicts(base, ...extras);
}

const lexiques = new Map();
/** Lexique des sentiments (mots → émotion du robot) de la langue de l'interface, compilé une seule fois. */
export async function loadLexique() {
  const langue = getLang() === 'en' ? 'en' : 'fr';
  if (!lexiques.has(langue)) lexiques.set(langue, compilerLexique(await json(`data/sentiments_${langue}.json`, 'le lexique des sentiments')));
  return lexiques.get(langue);
}

/** Personnage du projet ; un personnage Pro sans licence est remplacé par le Professeur (avec message). */
export async function loadProjectCharacter(projet) {
  let def = await getCharacter(projet.personnageId);
  if (!def || def.erreur) {
    notify(t('scene.persoIntrouvable', { id: projet.personnageId }), 'warn');
    def = await getCharacter(PERSO_DEFAUT);
  } else if (def.pro && !store.pro) {
    notify(t('scene.persoPro', { nom: def.nom }), 'warn');
    def = await getCharacter(PERSO_DEFAUT);
  }
  if (!def) throw new Error('Aucun personnage disponible : le fichier characters/robot_lectura.json est introuvable.');
  return { def, svg: await loadCharacterSvg(def) };
}

async function sourceVoixSysteme(projet) {
  const moteur = await getEngine('webspeech'), v = projet.audio.voix;
  if (!moteur.disponible) throw new Error(t('voix.err.absente'));
  const voix = await moteur.listVoices(getLang());
  if (!voix.length) throw new Error(t('voix.err.aucune'));
  const voice = voix.find((x) => voiceKey(x) === v.id) || voix.find((x) => x.default) || voix[0];
  const volume = store.settings?.volume ?? 1;
  const cps = projet.terminal.vitesseCps;
  const queue = new SpeechQueue(moteur, projet.texte, { voice, rate: v.vitesse, pitch: v.hauteur, volume, cpsFrappe: cps });
  const duree = estimateDurationMs(projet.texte, v.vitesse, cps);
  return { source: new SpeechSource(queue, duree), segments: autoTiming(projet.texte, duree, CPS_VOIX / cps), vitesseBase: v.vitesse };
}

const CACHE_SYNTHESE = 'lectura-synthese', MAX_SYNTHESES = 6;

/** Clé d'une synthèse : texte + voix + vitesse + vitesse de frappe. La révision est commune avec le cache de phrases. */
async function cleSynthese(projet) {
  const v = projet.audio.voix;
  const brut = JSON.stringify([PIPER_RENDER_VERSION, projet.texte, v.id, v.vitesse, projet.terminal.vitesseCps]);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(brut)));
  return new URL(`./__synthese/${[...h].map((x) => x.toString(16).padStart(2, '0')).join('')}`, location.href).href;
}

/** Garde seulement les dernières synthèses (le cache ne grossit pas sans limite). */
async function elaguer(cache) {
  const cles = (await cache.keys()).filter((k) => k.url.endsWith('.wav'));
  for (const k of cles.slice(0, Math.max(0, cles.length - MAX_SYNTHESES))) {
    await cache.delete(k);
    await cache.delete(k.url.replace(/\.wav$/, '.json'));
  }
}

async function sourcePiper(projet, audio, onProgress, signal) {
  const v = projet.audio.voix;
  const cle = await cleSynthese(projet);
  let cache = null, wav = null, segs = null;
  try { // synthèse déjà faite pour ce texte, cette voix et cette vitesse : on la reprend, sans rien recalculer
    cache = await caches.open(CACHE_SYNTHESE);
    const [a, j] = await Promise.all([cache.match(`${cle}.wav`), cache.match(`${cle}.json`)]);
    if (a && j) {
      const dates = await j.json();
      if (segmentsValides(projet.texte, dates)) { wav = await a.blob(); segs = dates; onProgress?.(1, 1, t('scene.prep.audio')); }
    }
  } catch { cache = null; wav = null; segs = null; }
  signal?.throwIfAborted();
  if (!wav) {
    const moteur = await getEngine('piper');
    const r = await moteur.synthesize(projet.texte, { voixId: v.id, vitesse: v.vitesse, cpsFrappe: projet.terminal.vitesseCps, onProgress, signal });
    signal?.throwIfAborted();
    wav = encodeWav(r.samples, r.sampleRate); segs = r.segments;
    try { // mémorise pour la prochaine fois ; un échec (stockage plein) ne bloque jamais la lecture
      if (cache) {
        await cache.put(`${cle}.wav`, new Response(wav, { headers: { 'Content-Type': 'audio/wav' } }));
        await cache.put(`${cle}.json`, new Response(JSON.stringify(segs), { headers: { 'Content-Type': 'application/json' } }));
        await elaguer(cache);
      }
    } catch { /* ignoré */ }
  }
  signal?.throwIfAborted();
  await audio.load(wav, signal);
  return { source: new FileSource(audio), segments: segs.map((s, i) => ({ id: i + 1, expression: 'auto', ...s })), vitesseBase: v.vitesse };
}

async function sourceFichier(projet, audio, signal) {
  const blob = store.audioBlob || (await getAudio(projet.id));
  if (!blob) throw new Error(t('scene.err.sansAudio'));
  const duree = await audio.load(blob, signal);
  const ok = projet.timing === 'sous-titres' && segmentsValides(projet.texte, projet.segments); // dates d'un .srt/.vtt
  return { source: new FileSource(audio), segments: ok ? projet.segments : autoTiming(projet.texte, duree) };
}

/**
 * @param {any} projet
 * @param {{audio: import('./audio.js').AudioEngine, apercu?: boolean, perso?: {def:any, svg:any}|null, signal?: AbortSignal, onProgress?: (fait:number, total:number, etape:string)=>void}} o
 */
export async function prepare(projet, { audio, apercu = false, perso: dejaCharge = null, onProgress, signal }) {
  if (!projet.texte.trim()) throw new Error(t('scene.err.texteVide'));
  onProgress?.(0, 1, t('scene.prep.ressources'));
  const [dict, perso, lexique] = await Promise.all([loadDict(), dejaCharge || loadProjectCharacter(projet), loadLexique()]);
  signal?.throwIfAborted();
  const matcher = buildMatcher(dict);
  let res;
  if (apercu) {
    const duree = (projet.texte.length / projet.terminal.vitesseCps) * 1000;
    res = { source: new SilentSource(duree, projet.texte), segments: autoTiming(projet.texte, duree, 1) };
  } else if (projet.audio.source === 'fichier') {
    onProgress?.(0, 1, t('scene.prep.audio'));
    res = await sourceFichier(projet, audio, signal);
  } else if (projet.audio.voix.moteur === 'piper') {
    res = await sourcePiper(projet, audio, onProgress, signal);
  } else {
    res = await sourceVoixSysteme(projet);
  }
  const segments = reportExpressions(res.segments, res.segments === projet.segments ? [] : projet.segments);
  if (!segments.length) throw new Error(t('scene.err.texteVide'));
  // vitesseBase = vitesse déjà « cuite » dans la source (voix) ; la scène applique ensuite vitesse ÷ vitesseBase.
  return { dict, matcher, lexique, def: perso.def, svg: perso.svg, source: res.source, segments, timeline: new Timeline(projet.texte, segments), vitesseBase: res.vitesseBase || 1 };
}
