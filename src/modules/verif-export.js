// @ts-check
// verif-export.js : relit chaque fichier exporté et vérifie qu'il sera lisible partout (§4.4).
//
// Le problème signalé : certaines vidéos se lisent dans le navigateur mais pas dans la galerie du
// téléphone. Trois causes classiques, toutes vérifiées ici :
//   1. durée absente ou fausse (WebM enregistré par Chrome, MP4 fragmenté) → la galerie refuse le fichier ;
//   2. index (moov) à la fin du MP4 → le lecteur doit télécharger tout le fichier avant de lire ;
//   3. piste audio ou vidéo manquante, ou piste audio muette.
//
// Tout se fait en local, sans réseau, en relisant le blob produit. En cas de problème, on le dit en
// français et on propose le format de repli plutôt que de laisser l'utilisateur avec un fichier cassé.
//
// La décision est prise par `evaluer`, une fonction pure sans DOM : c'est elle que les tests
// vérifient. `verifierExport` ne fait que collecter les mesures dans le navigateur.

/** Tolérance entre la durée annoncée et la durée mesurée (10 % ou 1,5 s, au plus large). */
export const tolere = (attendue, mesuree) => Math.abs(attendue - mesuree) <= Math.max(1500, attendue * 0.1);

/** Lit les métadonnées d'un blob vidéo/audio via un élément HTML. */
function metadonnees(blob, balise = 'video') {
  return new Promise((ok) => {
    const el = document.createElement(balise), url = URL.createObjectURL(blob);
    let fini = false;
    const fin = (r) => {
      if (fini) return; fini = true;
      clearTimeout(delai);
      try { el.removeAttribute('src'); el.load(); } catch { /* ignoré */ }
      URL.revokeObjectURL(url);
      ok(r);
    };
    const delai = setTimeout(() => fin({ ok: false, erreur: 'délai dépassé en lisant les métadonnées' }), 15000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => fin({
      ok: true,
      dureeMs: Math.round((el.duration || 0) * 1000),
      largeur: el.videoWidth || 0,
      hauteur: el.videoHeight || 0,
    });
    el.onerror = () => fin({ ok: false, erreur: "le navigateur n'a pas pu lire ce fichier" });
    el.src = url;
  });
}

/** Le fichier accepte-t-il un déplacement au milieu (index valide) ? */
function testSeek(blob, dureeMs) {
  return new Promise((ok) => {
    const v = document.createElement('video'), url = URL.createObjectURL(blob);
    let fini = false;
    const fin = (r) => {
      if (fini) return; fini = true;
      clearTimeout(delai);
      try { v.removeAttribute('src'); v.load(); } catch { /* ignoré */ }
      URL.revokeObjectURL(url);
      ok(r);
    };
    const delai = setTimeout(() => fin({ ok: false, erreur: 'délai dépassé pendant le déplacement' }), 15000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => {
      const cible = Math.max(0.01, dureeMs / 1000 - 0.05);
      v.onseeked = () => fin({ ok: true, arrive: v.currentTime });
      v.onerror = () => fin({ ok: false, erreur: 'erreur pendant le déplacement' });
      try { v.currentTime = cible; } catch (err) { fin({ ok: false, erreur: String(err?.message || err) }); }
    };
    v.onerror = () => fin({ ok: false, erreur: "le navigateur n'a pas pu lire ce fichier" });
    v.src = url;
  });
}

/** Décode la piste audio et mesure son volume : détecte une piste absente ou un enregistrement muet. */
async function pisteAudio(blob) {
  const AC = globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
  if (!AC) return { ok: false, erreur: 'Web Audio indisponible' };
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = buf.getChannelData(0);
    let somme = 0, crete = 0;
    const pas = Math.max(1, Math.floor(d.length / 20000)); // échantillonnage : pas besoin de tout lire
    let n = 0;
    for (let i = 0; i < d.length; i += pas) { const a = Math.abs(d[i]); somme += a * a; if (a > crete) crete = a; n++; }
    const rms = n ? Math.sqrt(somme / n) : 0;
    return { ok: true, dureeMs: Math.round(buf.duration * 1000), canaux: buf.numberOfChannels, rms, crete };
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err) };
  } finally {
    if (ctx.state !== 'closed') await ctx.close().catch(() => {});
  }
}

/**
 * Analyse quelques images prélevées dans la vidéo. Fonction pure : elle ne voit que des
 * statistiques, ce qui la rend testable sans navigateur.
 *
 * Deux pannes échappent à la lecture des métadonnées : une vidéo entièrement noire (la scène
 * n'a jamais été dessinée) et une vidéo figée (une seule image répétée). Dans les deux cas le
 * fichier est parfaitement valide, la galerie l'ouvre, et l'utilisateur découvre une vidéo vide.
 *
 * @param {{moyenne:number, variance:number, signature:string}[]} images
 * @returns {{noire:boolean, figee:boolean, ok:boolean, notes:string[]}}
 */
export function analyserImages(images) {
  const notes = [];
  const bonnes = (images || []).filter((i) => i && Number.isFinite(i.moyenne));
  if (!bonnes.length) return { noire: false, figee: false, ok: false, notes: ['Aucune image n’a pu être lue.'] };
  // Une image vraiment uniforme : variance quasi nulle. Le seuil laisse passer une scène
  // sombre mais dessinée (fond uni + personnage = variance bien supérieure).
  const noire = bonnes.every((i) => i.variance < 4);
  if (noire) notes.push('Image uniforme sur toute la vidéo : la scène n’a probablement pas été dessinée.');
  const premier = bonnes[0].signature;
  const figee = bonnes.length > 1 && bonnes.every((i) => i.signature === premier);
  if (figee) notes.push('Image figée : la même image du début à la fin.');
  return { noire, figee, ok: !noire && !figee, notes };
}

/** Signature de la vignette entière : un geste discret peut se situer loin des points centraux. */
export function mesurerImage(px) {
  let somme = 0, sommeCarres = 0, signature = '';
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    somme += l; sommeCarres += l * l;
    signature += String.fromCharCode(Math.round(l / 6));
  }
  const n = px.length / 4, moyenne = somme / n;
  return { moyenne, variance: sommeCarres / n - moyenne * moyenne, signature };
}

/**
 * Prélève `n` images dans une vidéo et en tire des statistiques (moyenne, variance, signature).
 * Le décodage se fait dans le navigateur, sur une vignette de 64 pixels : inutile de lire
 * 1080 × 1920 pour savoir si l'image est noire ou figée.
 */
async function prelever(blob, dureeMs, n = 4) {
  const v = document.createElement('video'), cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const url = URL.createObjectURL(blob);
  cv.width = 64; cv.height = 64;
  const stats = [];
  try {
    v.muted = true; v.preload = 'auto'; v.src = url;
    await new Promise((ok, non) => {
      const t = setTimeout(() => non(new Error('délai dépassé en préparant la vidéo')), 20000);
      v.onloadeddata = () => { clearTimeout(t); ok(); };
      v.onerror = () => { clearTimeout(t); non(new Error('vidéo illisible')); };
    });
    for (let k = 1; k <= n; k++) {
      const cible = Math.max(0.02, (dureeMs / 1000) * (k / (n + 1)));
      await new Promise((ok, non) => {
        const t = setTimeout(() => non(new Error('délai dépassé pendant le déplacement')), 15000);
        v.onseeked = () => { clearTimeout(t); ok(); };
        v.onerror = () => { clearTimeout(t); non(new Error('erreur pendant le déplacement')); };
        try { v.currentTime = cible; } catch (err) { clearTimeout(t); non(err); }
      });
      ctx.drawImage(v, 0, 0, cv.width, cv.height);
      stats.push(mesurerImage(ctx.getImageData(0, 0, cv.width, cv.height).data));
    }
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err), stats };
  } finally {
    try { v.removeAttribute('src'); v.load(); } catch { /* ignoré */ }
    URL.revokeObjectURL(url);
  }
  return { ok: true, stats };
}

/** Construit une boîte MP4 minimale (en-tête 8 octets + contenu nul). Sert aux tests. */
export function boite(type, tailleUtile = 0) {
  const t = Array.from(type, (c) => c.charCodeAt(0));
  const taille = 8 + tailleUtile;
  return Uint8Array.from([
    (taille >>> 24) & 255, (taille >>> 16) & 255, (taille >>> 8) & 255, taille & 255,
    ...t, ...new Array(tailleUtile).fill(0),
  ]);
}

/**
 * Pour un MP4 : l'index (boîte moov) est-il avant les données (mdat) ? C'est le « faststart ».
 * Fonction pure : prend les premiers octets du fichier. Exportée pour les tests.
 * @param {Uint8Array} debut
 */
export function lireFaststart(debut) {
  const txt = (o) => String.fromCharCode(debut[o], debut[o + 1], debut[o + 2], debut[o + 3]);
  let moov = -1, mdat = -1;
  for (let i = 0; i + 8 <= debut.length;) {
    const taille = (debut[i] << 24) | (debut[i + 1] << 16) | (debut[i + 2] << 8) | debut[i + 3];
    const type = txt(i + 4);
    if (type === 'moov' && moov < 0) moov = i;
    if (type === 'mdat' && mdat < 0) mdat = i;
    if (moov >= 0 && mdat >= 0) break;
    if (taille < 8) break;
    i += taille;
  }
  if (moov < 0) return { indexAuDebut: false, raison: 'boîte moov introuvable' };
  return { indexAuDebut: mdat < 0 || moov < mdat, moov, mdat };
}

async function faststart(blob) {
  if (!/mp4/i.test(blob.type)) return null;
  const debut = new Uint8Array(await blob.slice(0, Math.min(blob.size, 2 * 1024 * 1024)).arrayBuffer());
  return lireFaststart(debut);
}

/**
 * Décide si un export est bon, à partir des mesures déjà faites. Fonction pure et testable :
 * aucun DOM, aucun réseau. C'est le cœur du contrôle automatique.
 *
 * @param {{
 *   type: string, taille: number,
 *   meta?: {ok:boolean, dureeMs?:number, largeur?:number, hauteur?:number, erreur?:string},
 *   seek?: {ok:boolean, erreur?:string, arrive?:number},
 *   son?:  {ok:boolean, erreur?:string, rms?:number, crete?:number, dureeMs?:number},
 *   fs?:   {indexAuDebut:boolean, raison?:string} | null,
 *   attendu?: {dureeAttendueMs?:number, attendSon?:boolean},
 * }} m
 */
export function evaluer(m) {
  const attendu = m.attendu || {};
  const vide = (problemes) => ({
    ok: false, dureeMs: 0, problemes, avertissements: [], details: { taille: m.taille, type: m.type },
    duree: 0, dureeAttendue: (attendu.dureeAttendueMs || 0) / 1000,
    dureeOk: false, pisteVideo: false, pisteAudio: false, sonAudible: false, cherchable: false,
    notes: problemes,
  });

  if (!/^(video|audio)\//.test(m.type)) return vide([`Type de fichier inattendu : ${m.type}`]);

  const meta = m.meta || { ok: false, erreur: 'mesure absente' };
  if (!meta.ok) return vide([meta.erreur || 'fichier illisible']);

  const problemes = [], avertissements = [];
  const details = { taille: m.taille, type: m.type };
  Object.assign(details, meta);
  const estVideo = /^video\//.test(m.type);
  const dureeMs = meta.dureeMs || 0;

  // 1. Durée
  let dureeOk = Number.isFinite(dureeMs) && dureeMs > 0;
  if (!dureeOk) problemes.push('Durée absente du fichier : la galerie du téléphone risque de le refuser.');
  else if (attendu.dureeAttendueMs && !tolere(attendu.dureeAttendueMs, dureeMs)) {
    dureeOk = false;
    problemes.push(`Durée incohérente : ${(dureeMs / 1000).toFixed(1)} s lues pour ${(attendu.dureeAttendueMs / 1000).toFixed(1)} s attendues.`);
  }

  // 2. Image
  let pisteVideo = true, cherchable = true;
  if (estVideo) {
    pisteVideo = !!(meta.largeur && meta.hauteur);
    if (!pisteVideo) problemes.push('Aucune piste vidéo détectée.');
    else details.resolution = `${meta.largeur}×${meta.hauteur}`;

    const seek = m.seek || { ok: false, erreur: 'mesure absente' };
    cherchable = !!seek.ok;
    details.seek = seek;
    if (!cherchable) problemes.push(`Déplacement impossible dans la vidéo (${seek.erreur}).`);

    if (m.fs) {
      details.faststart = m.fs;
      if (!m.fs.indexAuDebut) problemes.push('MP4 : index à la fin du fichier (pas de lecture progressive).');
    }

    // Résolution : elle doit être celle demandée, sinon la vidéo sort dans le mauvais format.
    if (attendu.largeur && attendu.hauteur && (meta.largeur !== attendu.largeur || meta.hauteur !== attendu.hauteur)) {
      problemes.push(`Résolution ${meta.largeur}×${meta.hauteur} au lieu de ${attendu.largeur}×${attendu.hauteur}.`);
    }

    // Contenu : une vidéo peut être valide et pourtant noire ou figée.
    if (m.images) {
      const im = analyserImages(m.images.stats || m.images);
      details.images = im;
      // Si le navigateur n'arrive pas à décoder une image (codec matériel récalcitrant), on ne
      // déclare pas le fichier mauvais : on le dit. Seules les images noires ou figées échouent.
      if (m.images.erreur) avertissements.push(`Images non vérifiées (${m.images.erreur}).`);
      else problemes.push(...im.notes);
    }

    // Taille : à 1080 × 1920, quelques kilo-octets par seconde ne peuvent pas contenir
    // une vidéo. Un fichier aussi petit est un enregistrement qui n'a rien capturé.
    if (dureeMs > 1000 && m.taille && m.taille < (dureeMs / 1000) * 10 * 1024) {
      problemes.push(`Fichier trop petit pour ${(dureeMs / 1000).toFixed(1)} s de vidéo (${Math.round(m.taille / 1024)} Ko).`);
    }
  }

  // 3. Son
  const son = m.son || { ok: false, erreur: 'mesure absente' };
  details.audio = son;
  const pisteAudio = !!son.ok;
  const sonAudible = pisteAudio && (son.rms || 0) >= 1e-5;
  if (attendu.attendSon !== false) {
    if (!pisteAudio) problemes.push(`Piste audio absente ou illisible (${son.erreur}).`);
    else if (!sonAudible) problemes.push('Piste audio présente mais silencieuse (volume nul).');
  }

  return {
    ok: problemes.length === 0,
    dureeMs,
    problemes,
    avertissements,
    details,
    duree: dureeMs / 1000,
    dureeAttendue: (attendu.dureeAttendueMs || 0) / 1000,
    dureeOk,
    pisteVideo,
    pisteAudio,
    sonAudible,
    cherchable,
    notes: problemes,
  };
}

/**
 * Vérifie un fichier exporté. Ne jette jamais : renvoie toujours un rapport.
 * @param {Blob} blob
 * @param {{dureeAttendueMs?:number, attendSon?:boolean}} [attendu]
 */
export async function verifierExport(blob, attendu = {}) {
  const estVideo = /^video\//.test(blob.type);
  if (!/^(video|audio)\//.test(blob.type)) return evaluer({ type: blob.type, taille: blob.size, attendu });

  const meta = await metadonnees(blob, /^audio\//.test(blob.type) ? 'audio' : 'video');
  if (!meta.ok) return evaluer({ type: blob.type, taille: blob.size, meta, attendu });

  const seek = estVideo ? await testSeek(blob, meta.dureeMs || 0) : { ok: true };
  const fs = estVideo ? await faststart(blob) : null;
  const images = estVideo ? await prelever(blob, meta.dureeMs || 0) : null;
  const son = await pisteAudio(blob);
  return evaluer({ type: blob.type, taille: blob.size, meta, seek, son, fs, images, attendu });
}

/** Résumé lisible d'une vérification, pour l'afficher à l'utilisateur. */
export function resumerVerification(v) {
  if (v.ok) {
    const s = (v.dureeMs / 1000).toFixed(1);
    const contenu = v.sonAudible ? 'image et son présents' : 'image présente, vidéo sans son';
    const base = `Vérifié : ${s} s, ${contenu}.`;
    return v.avertissements?.length ? `${base} ${v.avertissements.join(' ')}` : base;
  }
  return `Attention : ${[...v.problemes, ...(v.avertissements || [])].join(' ')}`;
}
