// @ts-check
// mp4-audio-aac.js : rendre un MP4 acceptable par TikTok, Instagram, YouTube Shorts.
//
// D'où vient ce module --------------------------------------------------------------------------
// Chrome sait enregistrer du MP4, mais MediaRecorder n'y met QUE de l'Opus en audio : le mime
// « video/mp4;codecs=avc1,mp4a.40.2 » (H.264 + AAC) n'est supporté nulle part. Résultat : un
// fichier qui s'appelle .mp4, qui se lit dans le navigateur, et que TikTok refuse avec
// « le décodage a échoué » — parce qu'aucune plateforme grand public ne décode de l'Opus dans
// un MP4. Mesuré : la vidéo est bien en H.264, seule la piste audio pose problème.
//
// On ne réencode donc PAS la vidéo (elle est déjà en H.264, la recopier ne coûte rien et ne perd
// rien) : on décode le son, on le réencode en AAC, et on réécrit le conteneur.
//
// Trois étapes, séparées pour être testables :
//   1. lirePlat()   — démonter un MP4 non fragmenté en pistes + échantillons ;
//   2. ecrirePlat() — remonter un MP4 (index au début) ; sait remplacer la piste audio ;
//   3. convertirEnAac() — décodage + encodage + remontage, réunis pour l'application.
import { enc, cat, be32, be16, mk, full, enfants } from './mp4-remux.js';

const u64 = (dv, o) => dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4);
const tag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
const trouve = (dv, b, type) => { for (const c of enfants(dv, b.start + b.hdr, b.end)) if (c.type === type) return c; return null; };
const copie = (dv, b) => new Uint8Array(dv.buffer, dv.byteOffset + b.start, b.end - b.start).slice();

/** Fréquences d'échantillonnage indexées par le descripteur AudioSpecificConfig. */
const FREQUENCES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/**
 * Construit l'AudioSpecificConfig (ISO 14496-3) : c'est le petit descripteur que le décodeur lit
 * avant la première trame pour savoir comment la décoder. Deux octets en pratique.
 * @param {number} frequence
 * @param {number} canaux
 */
export function audioSpecificConfig(frequence, canaux) {
  const octets = [];
  let pos = 0;
  const ecrire = (valeur, bits) => {
    for (let i = bits - 1; i >= 0; i--, pos++) {
      const octet = pos >> 3;
      while (octets.length <= octet) octets.push(0);
      if ((valeur >> i) & 1) octets[octet] |= 1 << (7 - (pos & 7));
    }
  };
  ecrire(2, 5); // 2 = AAC-LC (le profil que toutes les plateformes savent décoder)
  const idx = FREQUENCES.indexOf(frequence);
  if (idx >= 0) ecrire(idx, 4); else { ecrire(15, 4); ecrire(frequence, 24); } // 15 = fréquence explicite
  ecrire(canaux, 4);
  ecrire(0, 3); // trame de 1024, pas de cœur, pas d'extension
  return new Uint8Array(octets);
}

/** Longueur d'un descripteur au format ISO 14496-1 (7 bits par octet, bit haut = « ce n'est pas fini »). */
function longueurDescripteur(n) {
  if (n < 0x80) return new Uint8Array([n]);
  const o = [n & 0x7f]; n >>= 7;
  while (n > 0) { o.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return new Uint8Array(o);
}
const descripteur = (etiquette, ...corps) => {
  const c = cat(corps);
  return cat([new Uint8Array([etiquette]), longueurDescripteur(c.length), c]);
};

/**
 * Boîte esds : la description du flux audio qu'un MP4 doit porter pour qu'un lecteur sache quoi
 * faire de la piste. Sans elle, la piste est muette ou rejetée.
 * @param {number} frequence
 * @param {number} canaux
 * @param {number} debit
 */
export function boiteEsds(frequence, canaux, debit = 0) {
  const asc = audioSpecificConfig(frequence, canaux);
  const dsi = descripteur(0x05, asc);
  const dcd = descripteur(0x04,
    new Uint8Array([0x40]), // objectTypeIndication : 0x40 = MPEG-4 Audio
    new Uint8Array([0x15]), // streamType : 0x05 (audio) décalé + réservé
    new Uint8Array([0, 0, 0]), // bufferSizeDB
    be32(debit), be32(debit),
    dsi);
  const sl = descripteur(0x06, new Uint8Array([2, 0, 0, 0])); // SLConfigDescriptor prédéfini
  const es = descripteur(0x03, be16(0), new Uint8Array([0]), dcd, sl);
  return full('esds', 0, 0, es);
}

/**
 * Une entrée « url » dite autonome : elle dit que les données sont dans ce fichier. C'est ce que
 * Chrome et ffmpeg écrivent ; un dref sans aucune entrée est légal sur le papier mais rejeté par
 * des lecteurs bien réels, alors on écrit la forme que tout le monde sait lire.
 */
const drefUrl = () => cat([be32(13), enc.encode('url '), be32(1), new Uint8Array([0])]);

/** Entrée d'échantillon audio mp4a complète (ce qui remplace l'entrée « Opus » de Chrome). */
export function entreeAac(frequence, canaux, debit = 0) {
  return mk('mp4a',
    new Uint8Array(6), // réservé
    be16(1), // data_reference_index
    be16(0), be16(0), new Uint8Array(4), // version, révision, fournisseur
    be16(canaux), be16(16), // canaux, profondeur
    be16(0), new Uint8Array(2), // pré-défini, réservé
    be32(frequence << 16), // fréquence en 16.16
    boiteEsds(frequence, canaux, debit));
}

/**
 * Retire les en-têtes ADTS pour ne garder que les trames AAC brutes.
 * Un MP4 veut des trames nues (l'information de l'en-tête est dans l'esds), alors que les
 * encodeurs sortent de l'ADTS, fait pour être diffusé tel quel.
 * @param {Uint8Array} adts
 */
export function tramesAac(adts) {
  const trames = [];
  let p = 0;
  while (p < adts.length) {
    if (p + 7 > adts.length || adts[p] !== 0xff || (adts[p + 1] & 0xf0) !== 0xf0) throw new Error('en-tête ADTS invalide');
    const avecCrc = (adts[p + 1] & 0x01) === 0; // protection_absent
    const entete = avecCrc ? 9 : 7;
    const taille = ((adts[p + 3] & 0x03) << 11) | (adts[p + 4] << 3) | (adts[p + 5] >> 5);
    if (taille <= entete || p + taille > adts.length) throw new Error('trame ADTS tronquée');
    trames.push(adts.subarray(p + entete, p + taille));
    p += taille;
  }
  return trames;
}

/** Le codec audio d'un MP4, tel qu'annoncé dans la description des échantillons. */
export function codecAudio(dv, moov) {
  for (const b of enfants(dv, moov.start + moov.hdr, moov.end)) {
    if (b.type !== 'trak') continue;
    const mdia = trouve(dv, b, 'mdia'); if (!mdia) continue;
    const hdlr = trouve(dv, mdia, 'hdlr');
    if (!hdlr || tag(dv, hdlr.start + hdlr.hdr + 8) !== 'soun') continue;
    const minf = trouve(dv, mdia, 'minf'), stbl = minf && trouve(dv, minf, 'stbl');
    const stsd = stbl && trouve(dv, stbl, 'stsd'); if (!stsd) continue;
    const premier = enfants(dv, stsd.start + stsd.hdr + 8, stsd.end).next();
    return premier.done ? null : premier.value.type;
  }
  return null;
}

/**
 * Démonte un MP4 NON fragmenté (ftyp + moov + mdat, celui que produit remuxerMp4).
 * Renvoie les pistes avec la position de chaque échantillon dans le fichier.
 * @param {Blob} blob
 */
export async function lirePlat(blob) {
  const donnees = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(donnees.buffer);
  let ftyp = null, moov = null;
  for (const b of enfants(dv, 0, dv.byteLength)) {
    if (b.type === 'ftyp' && !ftyp) ftyp = b;
    else if (b.type === 'moov' && !moov) moov = b;
  }
  if (!moov) throw new Error('moov absent : ce fichier n\'est pas un MP4 lisible.');

  let mvhd = null;
  const traks = [];
  for (const b of enfants(dv, moov.start + moov.hdr, moov.end)) {
    if (b.type === 'mvhd') mvhd = b;
    else if (b.type === 'trak') traks.push(b);
    // mvex est une boîte de moov, pas de premier niveau : le chercher ailleurs ne trouvait rien
    // et on lisait un fichier fragmenté en croyant le comprendre.
    else if (b.type === 'mvex') throw new Error('MP4 fragmenté : il faut le remuxer avant de toucher à la piste audio.');
  }
  if (!mvhd) throw new Error('mvhd absent');

  const vm = dv.getUint8(mvhd.start + mvhd.hdr);
  const timescaleFilm = dv.getUint32(mvhd.start + mvhd.hdr + (vm === 1 ? 20 : 12)) || 1000;

  const pistes = traks.map((b) => lirePiste(dv, b, donnees));
  return { donnees, dv, ftyp: ftyp ? copie(dv, ftyp) : null, moov, mvhd, vm, timescaleFilm, pistes };
}

function lireStbl(dv, stbl) {
  const stsd = trouve(dv, stbl, 'stsd'), stts = trouve(dv, stbl, 'stts'), stsc = trouve(dv, stbl, 'stsc');
  const stco = trouve(dv, stbl, 'stco'), co64 = trouve(dv, stbl, 'co64');
  const stsz = trouve(dv, stbl, 'stsz'), stz2 = trouve(dv, stbl, 'stz2');
  if (!stsd || !stts || !stsc || !(stco || co64) || !(stsz || stz2)) throw new Error('table d\'échantillons incomplète');
  return { stsd, stts, stsc, stco, co64, stsz, stz2, stss: trouve(dv, stbl, 'stss'), ctts: trouve(dv, stbl, 'ctts') };
}

function lirePiste(dv, trak, donnees) {
  const tkhd = trouve(dv, trak, 'tkhd'), mdia = trouve(dv, trak, 'mdia');
  if (!tkhd || !mdia) throw new Error('piste incomplète');
  const mdhd = trouve(dv, mdia, 'mdhd'), hdlr = trouve(dv, mdia, 'hdlr'), minf = trouve(dv, mdia, 'minf');
  if (!mdhd || !hdlr || !minf) throw new Error('piste incomplète');
  const vm = dv.getUint8(mdhd.start + mdhd.hdr);
  const timescale = dv.getUint32(mdhd.start + mdhd.hdr + (vm === 1 ? 20 : 12)) || 1;
  const type = tag(dv, hdlr.start + hdlr.hdr + 8);
  const stbl = trouve(dv, minf, 'stbl'); if (!stbl) throw new Error('stbl absent');

  const tb = lireStbl(dv, stbl);
  const entree = enfants(dv, tb.stsd.start + tb.stsd.hdr + 8, tb.stsd.end).next();
  const codec = entree.done ? null : entree.value.type;

  // stts : suites (nombre × durée) → durée de chaque échantillon.
  const durees = [];
  { const n = dv.getUint32(tb.stts.start + tb.stts.hdr + 4);
    for (let i = 0; i < n; i++) {
      const c = dv.getUint32(tb.stts.start + tb.stts.hdr + 8 + i * 8), d = dv.getUint32(tb.stts.start + tb.stts.hdr + 12 + i * 8);
      for (let k = 0; k < c; k++) durees.push(d);
    } }

  // ctts : décalage d'affichage de chaque échantillon (vidéo avec images B).
  let ctos = null;
  if (tb.ctts) {
    ctos = [];
    const n = dv.getUint32(tb.ctts.start + tb.ctts.hdr + 4), v = dv.getUint8(tb.ctts.start + tb.ctts.hdr);
    for (let i = 0; i < n; i++) {
      const c = dv.getUint32(tb.ctts.start + tb.ctts.hdr + 8 + i * 8);
      const d = v === 1 ? dv.getInt32(tb.ctts.start + tb.ctts.hdr + 12 + i * 8) : dv.getUint32(tb.ctts.start + tb.ctts.hdr + 12 + i * 8);
      for (let k = 0; k < c; k++) ctos.push(d);
    }
  }

  // stss : quels échantillons sont des images clés.
  let sync = null;
  if (tb.stss) {
    sync = new Set();
    const n = dv.getUint32(tb.stss.start + tb.stss.hdr + 4);
    for (let i = 0; i < n; i++) sync.add(dv.getUint32(tb.stss.start + tb.stss.hdr + 8 + i * 4));
  }

  // stsz / stz2 : taille de chaque échantillon.
  const tailles = [];
  if (tb.stsz) {
    const def = dv.getUint32(tb.stsz.start + tb.stsz.hdr + 4), n = dv.getUint32(tb.stsz.start + tb.stsz.hdr + 8);
    for (let i = 0; i < n; i++) tailles.push(def || dv.getUint32(tb.stsz.start + tb.stsz.hdr + 12 + i * 4));
  } else {
    // stz2 : tailles compactées sur 4, 8 ou 16 bits.
    const largeur = dv.getUint8(tb.stz2.start + tb.stz2.hdr + 5) || 4;
    const n = dv.getUint32(tb.stz2.start + tb.stz2.hdr + 8);
    for (let i = 0; i < n; i++) {
      if (largeur === 16) tailles.push(dv.getUint16(tb.stz2.start + tb.stz2.hdr + 12 + i * 2));
      else if (largeur === 8) tailles.push(dv.getUint8(tb.stz2.start + tb.stz2.hdr + 12 + i));
      else { const o = tb.stz2.start + tb.stz2.hdr + 12 + (i >> 1); tailles.push((i & 1) ? (dv.getUint8(o) & 0x0f) : (dv.getUint8(o) >> 4)); }
    }
  }

  // stsc + stco : groupes d'échantillons (chunks) et leur position dans le fichier.
  const entreesStsc = [];
  { const n = dv.getUint32(tb.stsc.start + tb.stsc.hdr + 4);
    for (let i = 0; i < n; i++) entreesStsc.push({
      premier: dv.getUint32(tb.stsc.start + tb.stsc.hdr + 8 + i * 12),
      parChunk: dv.getUint32(tb.stsc.start + tb.stsc.hdr + 12 + i * 12),
    }); }
  const offsetsChunks = [];
  if (tb.stco) { const n = dv.getUint32(tb.stco.start + tb.stco.hdr + 4);
    for (let i = 0; i < n; i++) offsetsChunks.push(dv.getUint32(tb.stco.start + tb.stco.hdr + 8 + i * 4)); }
  else { const n = u64(dv, tb.co64.start + tb.co64.hdr + 4);
    for (let i = 0; i < n; i++) offsetsChunks.push(u64(dv, tb.co64.start + tb.co64.hdr + 8 + i * 8)); }

  // On remet tout à plat : un échantillon = sa position absolue, sa taille, sa durée, son décalage.
  const echantillons = [];
  const spc = (chunk1based) => { let v = 0; for (const e of entreesStsc) if (e.premier <= chunk1based) v = e.parChunk; return v; };
  let index = 0;
  for (let c = 0; c < offsetsChunks.length; c++) {
    const combien = spc(c + 1);
    let pos = offsetsChunks[c];
    for (let j = 0; j < combien; j++, index++) {
      const taille = tailles[index];
      if (taille === undefined) break;
      const depuis = pos;
      if (depuis + taille > donnees.length) throw new Error('échantillon hors du fichier');
      pos += taille;
      echantillons.push({
        depuis, taille,
        dur: durees[index] || 0,
        cto: ctos ? (ctos[index] || 0) : 0,
        sync: sync ? sync.has(index + 1) : true,
      });
    }
  }
  return { box: trak, tkhd, mdia, mdhd, hdlr, minf, stbl, stsd: copie(dv, tb.stsd), codec, type, timescale, echantillons, vmMdhd: vm };
}

const suites = (liste, cle) => { const r = []; for (const x of liste) { const v = cle(x), d = r[r.length - 1]; if (d && d[1] === v) d[0]++; else r.push([1, v]); } return r; };

/**
 * Remonte un MP4 non fragmenté, index (moov) au début pour que la lecture commence sans
 * attendre la fin du fichier.
 *
 * @param {Awaited<ReturnType<typeof lirePlat>>} source
 * @param {{ timescale: number, entree: Uint8Array, echantillons: {donnees: Uint8Array, dur: number}[] }|null} audio
 *        Nouvelle piste audio, ou null pour conserver celle du fichier.
 */
export function ecrirePlat(source, audio = null) {
  const { dv, donnees, timescaleFilm } = source;
  const blocs = []; // { piste, echantillons, debut } — un bloc = un groupe d'échantillons contigus

  for (const p of source.pistes) {
    if (audio && p.type === 'soun') continue;
    decouper({ piste: p, echantillons: p.echantillons }, blocs);
  }
  if (audio) {
    // Une taille manquante passerait inaperçue : la piste serait déclarée mais chaque échantillon
    // annoncerait 0 octet, et le fichier sortirait muet. On la calcule plutôt que d'y croire.
    for (const e of audio.echantillons) if (!Number.isFinite(e.taille)) e.taille = e.donnees.length;
    decouper({ piste: { type: 'soun', timescale: audio.timescale, entree: audio.entree }, echantillons: audio.echantillons }, blocs);
  }

  // Entrelacement : on avance les pistes « au plus tôt » pour que le lecteur n'ait pas à sauter
  // d'un bout à l'autre du fichier. Fenêtre d'une demi-seconde.
  blocs.sort((a, b) => a.debut - b.debut);
  const pistes = [];
  for (const b of blocs) {
    let p = pistes.find((x) => x.piste === b.piste);
    if (!p) { p = { piste: b.piste, blocs: [] }; pistes.push(p); }
    p.blocs.push(b);
  }

  const ftyp = source.ftyp || mk('ftyp', enc.encode('isom'), be32(512), enc.encode('isom'), enc.encode('iso2'), enc.encode('avc1'), enc.encode('mp41'));
  const construire = (decalageMdat) => {
    let cur = 0;
    const ordre = [];
    const stcos = new Map(), stscs = new Map();
    // On parcourt les blocs DANS L'ORDRE TRIÉ : c'est l'ordre réel des données dans le fichier.
    // Les parcourir piste par piste (ce que faisait la première version) défaisait
    // l'entrelacement : toute la vidéo partait d'un bloc, puis tout le son.
    for (const b of blocs) {
      if (!stcos.has(b.piste)) { stcos.set(b.piste, []); stscs.set(b.piste, []); }
      stcos.get(b.piste).push(decalageMdat + cur);
      const entrees = stscs.get(b.piste), dernier = entrees[entrees.length - 1];
      if (dernier && dernier[1] === b.echantillons.length) dernier[0]++;
      else entrees.push([1, b.echantillons.length]);
      for (const e of b.echantillons) { ordre.push(e); cur += e.taille; }
    }
    const traks = pistes.map(({ piste }) => {
      const bs = blocs.filter((b) => b.piste === piste);
      const tous = bs.flatMap((b) => b.echantillons);
      // stbl attend une boîte stsd qui CONTIENT l'entrée d'échantillon. Pour la vidéo on recopie
      // celle du fichier ; pour la piste audio neuve on n'a que l'entrée, à envelopper.
      const stsd = piste.stsd || full('stsd', 0, 0, be32(1), piste.entree);
      const stbl = mk('stbl',
        stsd,
        full('stts', 0, 0, (() => { const r = suites(tous, (e) => e.dur); return cat([be32(r.length), ...r.map(([c, v]) => cat([be32(c), be32(v)]))]); })()),
        ...(tous.some((e) => e.cto) ? [full('ctts', tous.some((e) => e.cto < 0) ? 1 : 0, 0, (() => {
          const r = suites(tous, (e) => e.cto); return cat([be32(r.length), ...r.map(([c, v]) => cat([be32(c), be32(v >>> 0)]))]);
        })())] : []),
        ...(piste.type === 'vide' && tous.some((e) => !e.sync) ? [full('stss', 0, 0, (() => {
          const idx = []; tous.forEach((e, i) => { if (e.sync) idx.push(i + 1); }); return cat([be32(idx.length), ...idx.map(be32)]);
        })())] : []),
        full('stsc', 0, 0, (() => {
          const e = stscs.get(piste);
          // first_chunk = 1 + le nombre de groupes déjà écrits par les entrées précédentes.
          const entrees = e.map(([, parGroupe], i) => cat([be32(e.slice(0, i).reduce((s, x) => s + x[0], 0) + 1), be32(parGroupe), be32(1)]));
          return cat([be32(e.length), ...entrees]);
        })()),
        full('stsz', 0, 0, be32(0), be32(tous.length), ...tous.map((e) => be32(e.taille))),
        (() => { const o = stcos.get(piste); return o.some((x) => x > 0xffffffff)
          ? full('co64', 0, 0, be32(o.length), ...o.map((x) => cat([be32(Math.floor(x / 4294967296)), be32(x % 4294967296)])))
          : full('stco', 0, 0, be32(o.length), ...o.map(be32)); })());

      if (!piste.box) {
        // Piste entièrement reconstruite (audio AAC) : on écrit les boîtes à la main.
        const dureeMedia = tous.reduce((a, e) => a + e.dur, 0);
        const id = 2, largeur = 0, hauteur = 0;
        return mk('trak',
          full('tkhd', 0, 7, be32(0), be32(0), be32(id), new Uint8Array(4), be32(Math.round((dureeMedia / piste.timescale) * timescaleFilm)),
            new Uint8Array(8), be16(0), be16(0), be16(0x0100), new Uint8Array(2),
            cat([be32(0x00010000), be32(0), be32(0), be32(0), be32(0x00010000), be32(0), be32(0), be32(0), be32(0x40000000)]),
            be32(largeur << 16), be32(hauteur << 16)),
          mk('mdia',
            full('mdhd', 0, 0, be32(0), be32(0), be32(piste.timescale), be32(dureeMedia), be16(0x55c4), be16(0)),
            full('hdlr', 0, 0, be32(0), enc.encode('soun'), new Uint8Array(12), enc.encode('Lectura AAC')),
            mk('minf', full('smhd', 0, 0, be16(0), be16(0)), mk('dinf', full('dref', 0, 0, be32(1), drefUrl())), stbl)));
      }
      // Piste existante (vidéo) : on garde toutes les boîtes telles quelles, seul stbl change,
      // et on corrige les durées que la nouvelle répartition a pu modifier.
      const reecrit = (b, remplacer) => {
        const fils = [];
        for (const c of enfants(dv, b.start + b.hdr, b.end)) { const r = remplacer(c); if (r !== null) fils.push(r === undefined ? copie(dv, c) : r); }
        return mk(b.type, ...fils);
      };
      const dureeMedia = tous.reduce((a, e) => a + e.dur, 0);
      const dureeFilm = Math.round((dureeMedia / piste.timescale) * timescaleFilm);
      return reecrit(piste.box, (c) => {
        if (c.type === 'edts') return null;
        if (c.type === 'tkhd') {
          const x = copie(dv, c), d = new DataView(x.buffer);
          if (x[c.hdr] === 1) { d.setUint32(c.hdr + 28, Math.floor(dureeFilm / 4294967296)); d.setUint32(c.hdr + 32, dureeFilm % 4294967296); }
          else d.setUint32(c.hdr + 20, dureeFilm);
          return x;
        }
        if (c.type === 'mdia') return reecrit(c, (m) => {
          if (m.type === 'mdhd') {
            const x = copie(dv, m), d = new DataView(x.buffer);
            if (x[m.hdr] === 1) { d.setUint32(m.hdr + 24, Math.floor(dureeMedia / 4294967296)); d.setUint32(m.hdr + 28, dureeMedia % 4294967296); }
            else d.setUint32(m.hdr + 16, dureeMedia);
            return x;
          }
          if (m.type === 'minf') return reecrit(m, (n) => (n.type === 'stbl' ? stbl : undefined));
          return undefined;
        });
        return undefined;
      });
    });

    const dureeFilm = Math.max(...pistes.map(({ piste, blocs: bs }) => {
      const dureeMedia = bs.flatMap((b) => b.echantillons).reduce((a, e) => a + e.dur, 0);
      return Math.round((dureeMedia / piste.timescale) * timescaleFilm);
    }));
    const mvhd = copie(dv, source.mvhd), md = new DataView(mvhd.buffer), h = source.mvhd.hdr;
    if (source.vm === 1) { md.setUint32(h + 24, Math.floor(dureeFilm / 4294967296)); md.setUint32(h + 28, dureeFilm % 4294967296); }
    else md.setUint32(h + 16, dureeFilm);
    return { moov: mk('moov', mvhd, ...traks), ordre, total: cur };
  };

  let essai = construire(0);
  const debutMdat = ftyp.length + essai.moov.length + 8;
  essai = construire(debutMdat);
  const parties = [ftyp, essai.moov, be32(essai.total + 8), enc.encode('mdat')];
  for (const e of essai.ordre) parties.push(e.donnees || donnees.subarray(e.depuis, e.depuis + e.taille));
  return new Blob(parties, { type: 'video/mp4' });
}

/**
 * Découpe une piste en blocs d'environ une demi-seconde, en commençant de préférence sur une image
 * clé (une image clé en tête de bloc, c'est un point d'entrée pour la lecture au vol).
 * `debut` est l'instant du premier échantillon du bloc : c'est lui qui permet l'entrelacement.
 * @param {{piste: any, echantillons: any[]}} src
 * @param {any[]} blocs
 */
function decouper(src, blocs) {
  const FENETRE = 0.5;
  // On compte en TICKS entiers, pas en secondes : additionner 1/30 quinze fois donne
  // 0,4999999999999999, et le bloc ne se fermait jamais (le son partait alors tout entier
  // après la vidéo, à l'opposé de ce que l'entrelacement doit produire).
  const limite = FENETRE * src.piste.timescale;
  let courant = null, cumul = 0, ticks = 0;
  for (const e of src.echantillons) {
    if (!courant) { courant = { piste: src.piste, echantillons: [], debut: ticks / src.piste.timescale }; blocs.push(courant); cumul = 0; }
    courant.echantillons.push(e);
    cumul += e.dur; ticks += e.dur;
    // On aimerait fermer le bloc sur une image clé (c'est un point d'entrée pour la lecture).
    // Mais l'exiger serait une erreur : Chrome n'émet des images clés que toutes les quelques
    // secondes, et avec des images clés rares le bloc ne se fermait jamais — toute la vidéo
    // partait d'un bloc, suivie de tout le son. D'où la limite de secours à 4 fenêtres.
    const ferme = src.piste.type !== 'vide' || e.sync || cumul >= limite * 4;
    if (cumul >= limite && ferme) courant = null;
  }
}

/** Vrai si cette piste audio est déjà dans un format que les plateformes acceptent. */
const AUDIO_ACCEPTE = new Set(['mp4a', 'ac-3', 'ec-3']);

/**
 * Convertit la piste audio d'un MP4 en AAC-LC. Renvoie null s'il n'y a rien à faire
 * (pas de son, ou son déjà compatible).
 *
 * @param {Blob} blob MP4 non fragmenté (sortie de remuxerMp4)
 * @param {{ debit?: number, surProgres?: (etape: string) => void }} [options]
 */
export async function convertirEnAac(blob, options = {}) {
  const debit = options.debit || 160;
  const dire = options.surProgres || (() => {});
  const source = await lirePlat(blob);
  const audio = source.pistes.find((p) => p.type === 'soun');
  if (!audio) return null;
  if (AUDIO_ACCEPTE.has(audio.codec || '')) return null;

  const frequence = audio.timescale;
  dire('decodage');
  const pcm = await decoderSon(blob, frequence);
  if (!pcm) return null;

  dire('encodage');
  const { trames, frameLength } = await encoderAac(pcm, debit);
  const dureeEchantillon = frameLength || 1024;
  const entree = entreeAac(pcm.sampleRate, pcm.numberOfChannels, debit * 1000);

  dire('assemblage');
  const sortie = ecrirePlat(source, {
    timescale: pcm.sampleRate,
    entree,
    echantillons: trames.map((t) => ({ donnees: t, taille: t.length, dur: dureeEchantillon })),
  });
  return {
    blob: sortie,
    avant: { codec: audio.codec, octets: blob.size },
    apres: { codec: 'mp4a', octets: sortie.size, trames: trames.length },
    dureeAudio: (trames.length * dureeEchantillon) / pcm.sampleRate,
  };
}

/** Décode le son d'un fichier avec l'API Web Audio (aucun démultiplexage à écrire). */
async function decoderSon(blob, frequence) {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!AC) return null;
  let ctx = null;
  try {
    // On tente la fréquence d'origine pour ne pas rééchantillonner ; certains navigateurs
    // refusent et on retombe sur le contexte par défaut.
    try { ctx = new AC({ sampleRate: frequence }); } catch { ctx = new AC(); }
    // decodeAudioData détache le tampon qu'on lui donne : on passe une copie, les octets
    // de la vidéo sont encore nécessaires pour écrire le fichier.
    const tampon = await blob.arrayBuffer();
    return await ctx.decodeAudioData(tampon.slice(0));
  } catch { return null; } finally { ctx?.close?.(); }
}

let encodeurAacCharge = null;
async function chargerEncodeur() {
  if (!encodeurAacCharge) encodeurAacCharge = import('../vendor/aac/aac-encode.js').then((m) => m.default || m);
  return encodeurAacCharge;
}

/** Encode un AudioBuffer en trames AAC brutes. Essaie WebCodecs (rien à télécharger), sinon le module fourni. */
async function encoderAac(audioBuffer, debitKbps) {
  const canaux = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) canaux.push(audioBuffer.getChannelData(c));
  const total = audioBuffer.length;

  // 1. WebCodecs : l'encodeur du système. Rien à charger, mais absent selon la plateforme
  //    (pas d'AAC sur Linux ni Firefox) — d'où le repli.
  if (typeof AudioEncoder !== 'undefined') {
    try {
      const cfg = { codec: 'mp4a.40.2', sampleRate: audioBuffer.sampleRate, numberOfChannels: audioBuffer.numberOfChannels, bitrate: debitKbps * 1000 };
      if ((await AudioEncoder.isConfigSupported(cfg)).supported) return await encoderWebCodecs(cfg, canaux, total);
    } catch { /* on tombe sur le module */ }
  }

  // 2. Le module fourni : WebCodecs s'il existe, sinon FDK-AAC compilé en WebAssembly.
  const aac = await chargerEncodeur();
  const enc2 = await aac({ sampleRate: audioBuffer.sampleRate, channels: audioBuffer.numberOfChannels, bitrate: debitKbps });
  const morceaux = [];
  const BLOC = 1024 * 32;
  for (let p = 0; p < total; p += BLOC) {
    const n = Math.min(BLOC, total - p);
    morceaux.push(await enc2.encode(canaux.map((c) => c.subarray(p, p + n))));
  }
  morceaux.push(await enc2.flush());
  const adts = new Uint8Array(morceaux.reduce((a, m) => a + m.length, 0));
  let o = 0;
  for (const m of morceaux) { adts.set(m, o); o += m.length; }
  enc2.free?.();
  return { trames: tramesAac(adts), frameLength: enc2.frameLength || 1024, amorcage: enc2.priming || 0 };
}

async function encoderWebCodecs(cfg, canaux, total) {
  const trames = [];
  let erreur = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const t = new Uint8Array(chunk.byteLength);
      chunk.copyTo(t);
      trames.push(t);
      void meta;
    },
    error: (e) => { erreur = e; },
  });
  enc.configure(cfg);
  // WebCodecs veut des trames de 1024 échantillons pour l'AAC.
  const FL = 1024;
  const taux = cfg.sampleRate;
  for (let p = 0; p < total; p += FL) {
    const n = Math.min(FL, total - p);
    const plan = canaux.map((c) => {
      const v = new Float32Array(FL);
      v.set(c.subarray(p, p + n));
      return v;
    });
    const temps = Math.round((p / taux) * 1e6);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: taux, numberOfFrames: FL, numberOfChannels: plan.length, timestamp: temps, data: cat(plan.map((c) => new Uint8Array(c.buffer))) }));
  }
  await enc.flush();
  enc.close();
  if (erreur) throw erreur;
  return { trames, frameLength: FL, amorcage: 0 };
}
