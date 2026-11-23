// @ts-check
// engine.js : interface commune des moteurs de voix + fabrique.
/**
 * @typedef {Object} VoiceEngine
 * @property {string} id
 * @property {{audioBuffer:boolean, boundary:boolean}} capabilities
 * @property {(langue?:string)=>Promise<any[]>} listVoices
 * @property {(text:string, opts?:any)=>any} speak
 * @property {()=>void} pause
 * @property {()=>void} resume
 * @property {()=>void} stop
 */
import { WebSpeechEngine } from './webspeech.js';

export const MOTEURS = ['webspeech', 'piper']; // Système (0 Mo) · Lectura HD hors ligne (Piper, chargé à la demande)
const instances = {};

/** @returns {Promise<VoiceEngine & Record<string, any>>} */
export async function getEngine(id) {
  if (id === 'piper') {
    if (!instances.piper) instances.piper = import('./piper.js').then(({ PiperEngine }) => new PiperEngine()).catch((err) => {
      delete instances.piper;
      throw err;
    });
    return instances.piper;
  }
  if (!instances.webspeech) instances.webspeech = new WebSpeechEngine();
  return instances.webspeech;
}

/** Identifiant stable d'une voix du système. */
export const voiceKey = (v) => v?.voiceURI || v?.name || '';
