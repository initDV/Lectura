// @ts-check
// prepare.js : étape PREPARATION de la scène (dictionnaire, personnage, source audio, timeline).
// Toute impossibilité lève une Error avec un message clair en français, affiché par la scène.
import { store } from '../state.js';
import { buildMatcher, mergeDicts } from './keywords.js';
import { getCharacter, loadCharacterSvg } from './character-loader.js';
import { autoTiming, segmentsValides, reportExpressions, estimateDurationMs, Timeline, CPS_VOIX } from './timeline.js';
import { FileSource, SpeechSource, SilentSource } from './player.js';
import { SpeechQueue } from './voice/queue.js';
import { getEngine, voiceKey } from './voice/engine.js';
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

async function sourcePiper(projet, audio, onProgress) {
  const moteur = await getEngine('piper'), v = projet.audio.voix;
  const r = await moteur.synthesize(projet.texte, { voixId: v.id, vitesse: v.vitesse, cpsFrappe: projet.terminal.vitesseCps, onProgress });
  await audio.load(encodeWav(r.samples, r.sampleRate));
  return { source: new FileSource(audio), segments: r.segments.map((s, i) => ({ id: i + 1, expression: 'auto', ...s })), vitesseBase: v.vitesse };
}

async function sourceFichier(projet, audio) {
  const blob = store.audioBlob || (await getAudio(projet.id));
  if (!blob) throw new Error(t('scene.err.sansAudio'));
  const duree = await audio.load(blob);
  const ok = projet.timing === 'sous-titres' && segmentsValides(projet.texte, projet.segments); // dates d'un .srt/.vtt
  return { source: new FileSource(audio), segments: ok ? projet.segments : autoTiming(projet.texte, duree) };
}

/**
 * @param {any} projet
 * @param {{audio: import('./audio.js').AudioEngine, apercu?: boolean, perso?: {def:any, svg:any}|null, onProgress?: (fait:number, total:number, etape:string)=>void}} o
 */
export async function prepare(projet, { audio, apercu = false, perso: dejaCharge = null, onProgress }) {
  if (!projet.texte.trim()) throw new Error(t('scene.err.texteVide'));
  onProgress?.(0, 1, t('scene.prep.ressources'));
  const [dict, perso] = await Promise.all([loadDict(), dejaCharge || loadProjectCharacter(projet)]);
  const matcher = buildMatcher(dict);
  let res;
  if (apercu) {
    const duree = (projet.texte.length / projet.terminal.vitesseCps) * 1000;
    res = { source: new SilentSource(duree, projet.texte), segments: autoTiming(projet.texte, duree, 1) };
  } else if (projet.audio.source === 'fichier') {
    onProgress?.(0, 1, t('scene.prep.audio'));
    res = await sourceFichier(projet, audio);
  } else if (projet.audio.voix.moteur === 'piper') {
    res = await sourcePiper(projet, audio, onProgress);
  } else {
    res = await sourceVoixSysteme(projet);
  }
  const segments = reportExpressions(res.segments, res.segments === projet.segments ? [] : projet.segments);
  if (!segments.length) throw new Error(t('scene.err.texteVide'));
  // vitesseBase = vitesse déjà « cuite » dans la source (voix) ; la scène applique ensuite vitesse ÷ vitesseBase.
  return { dict, matcher, def: perso.def, svg: perso.svg, source: res.source, segments, timeline: new Timeline(projet.texte, segments), vitesseBase: res.vitesseBase || 1 };
}
