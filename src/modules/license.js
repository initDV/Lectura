// @ts-check
// license.js : vérification HORS LIGNE de la licence Pro (ECDSA P-256 + SHA-256, Web Crypto).
// Clé = base64url(charge utile JSON) + "." + base64url(signature au format IEEE P1363).
import { PUB } from './license-key.js';

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * @param {string} key clé de licence collée par l'utilisateur
 * @param {string} installId identifiant d'installation de cet appareil
 * @param {JsonWebKey} [pub] clé publique (par défaut celle de l'application ; paramètre utile aux tests)
 * @returns {Promise<{ok:true,data:any}|{ok:false,reason:'format'|'signature'|'installation'|'indisponible'}>}
 */
export async function verifyLicense(key, installId, pub = PUB) {
  const [p, sig, ...reste] = String(key || '').trim().split('.');
  if (!p || !sig || reste.length) return { ok: false, reason: 'format' };
  if (!globalThis.crypto?.subtle) return { ok: false, reason: 'indisponible' }; // page non sécurisée (http)
  let payload, signature, data;
  try {
    payload = b64u(p);
    signature = b64u(sig);
  } catch {
    return { ok: false, reason: 'format' };
  }
  try {
    const k = await crypto.subtle.importKey('jwk', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, signature, payload);
    if (!ok) return { ok: false, reason: 'signature' };
  } catch {
    return { ok: false, reason: 'signature' };
  }
  try {
    data = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!data || data.installId !== installId) return { ok: false, reason: 'installation' };
  return { ok: true, data };
}

/** Fonctions réservées à Pro (D3). Tout le reste est gratuit. */
export const FONCTIONS_PRO = ['personnages', 'expressions', 'gestes', 'lipsync-multibande', 'mots-cles', 'video',
  'format-vertical', 'terminal-perso', 'sous-titres', 'sans-filigrane'];
