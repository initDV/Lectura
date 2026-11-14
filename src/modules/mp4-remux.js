// @ts-check
// mp4-remux.js : remet en forme un MP4 fragmenté (celui de MediaRecorder) en MP4 classique :
// index (moov) au début, durée correcte, tables d'échantillons complètes. Aucun transcodage,
// pur JavaScript, aucune dépendance, aucun réseau.
const enc = new TextEncoder();
const cat = (parts) => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const be32 = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const be16 = (v) => new Uint8Array([(v >>> 8) & 255, v & 255]);
const mk = (type, ...parts) => { const body = cat(parts); return cat([be32(body.length + 8), enc.encode(type), body]); };
const full = (type, version, flags, ...parts) => mk(type, new Uint8Array([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const tag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
const u64 = (dv, o) => dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4);

function* enfants(dv, debut, fin) {
  let p = debut;
  while (p + 8 <= fin) {
    let taille = dv.getUint32(p), hdr = 8;
    const type = tag(dv, p + 4);
    if (taille === 1) { taille = u64(dv, p + 8); hdr = 16; } else if (taille === 0) taille = fin - p;
    if (taille < hdr || p + taille > fin) throw new Error(`boîte « ${type} » invalide`);
    yield { type, start: p, hdr, end: p + taille };
    p += taille;
  }
}
const copie = (dv, b) => new Uint8Array(dv.buffer, dv.byteOffset + b.start, b.end - b.start).slice();
const trouve = (dv, b, type) => { for (const c of enfants(dv, b.start + b.hdr, b.end)) if (c.type === type) return c; return null; };

async function lire(blob, debut, fin) { return new DataView(await blob.slice(debut, fin).arrayBuffer()); }

async function* niveau1(blob) {
  let p = 0;
  while (p + 8 <= blob.size) {
    const dv = await lire(blob, p, Math.min(blob.size, p + 16));
    let taille = dv.getUint32(0), hdr = 8;
    const type = tag(dv, 4);
    if (taille === 1) { taille = u64(dv, 8); hdr = 16; } else if (taille === 0) taille = blob.size - p;
    if (taille < hdr) throw new Error(`boîte « ${type} » invalide`);
    yield { type, start: p, hdr, end: Math.min(blob.size, p + taille) };
    p += taille;
  }
}

function lireMoov(dv, moov) {
  const info = { mvhd: null, traks: [], trex: new Map() };
  for (const b of enfants(dv, moov.start + moov.hdr, moov.end)) {
    if (b.type === 'mvhd') info.mvhd = b;
    else if (b.type === 'trak') info.traks.push(b);
    else if (b.type === 'mvex') {
      for (const c of enfants(dv, b.start + b.hdr, b.end)) {
        if (c.type !== 'trex') continue;
        const o = c.start + c.hdr;
        info.trex.set(dv.getUint32(o + 4), { sdi: dv.getUint32(o + 8), dur: dv.getUint32(o + 12), size: dv.getUint32(o + 16), flags: dv.getUint32(o + 20) });
      }
    }
  }
  if (!info.mvhd) throw new Error('mvhd absent');
  return info;
}

function lireTrak(dv, trak) {
  const t = { box: trak, id: 0, timescale: 0, type: '', stsd: null, samples: [], chunks: [], debut: null, sdi: 1 };
  const tkhd = trouve(dv, trak, 'tkhd'), mdia = trouve(dv, trak, 'mdia');
  if (!tkhd || !mdia) throw new Error('piste incomplète');
  const v = dv.getUint8(tkhd.start + tkhd.hdr);
  t.id = dv.getUint32(tkhd.start + tkhd.hdr + (v === 1 ? 20 : 12));
  const mdhd = trouve(dv, mdia, 'mdhd'), hdlr = trouve(dv, mdia, 'hdlr'), minf = trouve(dv, mdia, 'minf');
  if (!mdhd || !hdlr || !minf) throw new Error('piste incomplète');
  const vm = dv.getUint8(mdhd.start + mdhd.hdr);
  t.timescale = dv.getUint32(mdhd.start + mdhd.hdr + (vm === 1 ? 20 : 12));
  t.type = tag(dv, hdlr.start + hdlr.hdr + 8);
  const stbl = trouve(dv, minf, 'stbl'), stsd = stbl && trouve(dv, stbl, 'stsd');
  if (!stsd) throw new Error('stsd absent');
  t.stsd = copie(dv, stsd);
  return t;
}

function lireMoof(dv, moofStartAbs, pistes, trex) {
  let finPrec = moofStartAbs;
  for (const traf of enfants(dv, 8, dv.byteLength)) {
    if (traf.type !== 'traf') continue;
    let tfhd = null, tfdt = null; const truns = [];
    for (const c of enfants(dv, traf.start + traf.hdr, traf.end)) {
      if (c.type === 'tfhd') tfhd = c; else if (c.type === 'tfdt') tfdt = c; else if (c.type === 'trun') truns.push(c);
    }
    if (!tfhd) throw new Error('tfhd absent');
    const fl = dv.getUint32(tfhd.start + tfhd.hdr) & 0xffffff; let o = tfhd.start + tfhd.hdr + 4;
    const id = dv.getUint32(o); o += 4;
    const piste = pistes.get(id); if (!piste) continue;
    const def = { ...(trex.get(id) || { sdi: 1, dur: 0, size: 0, flags: 0 }) };
    let base = null;
    if (fl & 0x1) { base = u64(dv, o); o += 8; }
    if (fl & 0x2) { def.sdi = dv.getUint32(o); o += 4; }
    if (fl & 0x8) { def.dur = dv.getUint32(o); o += 4; }
    if (fl & 0x10) { def.size = dv.getUint32(o); o += 4; }
    if (fl & 0x20) { def.flags = dv.getUint32(o); o += 4; }
    if (base === null) base = (fl & 0x20000) ? moofStartAbs : finPrec;
    piste.sdi = def.sdi || 1;
    if (tfdt && piste.debut === null) {
      const vv = dv.getUint8(tfdt.start + tfdt.hdr);
      piste.debut = vv === 1 ? u64(dv, tfdt.start + tfdt.hdr + 4) : dv.getUint32(tfdt.start + tfdt.hdr + 4);
    }
    let curseur = base;
    for (const trun of truns) {
      const vr = dv.getUint8(trun.start + trun.hdr), tf = dv.getUint32(trun.start + trun.hdr) & 0xffffff;
      let p = trun.start + trun.hdr + 4;
      const n = dv.getUint32(p); p += 4;
      let off = curseur;
      if (tf & 0x1) { off = base + dv.getInt32(p); p += 4; }
      let premier = null;
      if (tf & 0x4) { premier = dv.getUint32(p); p += 4; }
      const debutChunk = off, avant = piste.samples.length;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const dur = (tf & 0x100) ? dv.getUint32(p) : def.dur; if (tf & 0x100) p += 4;
        const size = (tf & 0x200) ? dv.getUint32(p) : def.size; if (tf & 0x200) p += 4;
        let flags = def.flags; if (tf & 0x400) { flags = dv.getUint32(p); p += 4; } else if (i === 0 && premier !== null) flags = premier;
        let cto = 0; if (tf & 0x800) { cto = vr === 1 ? dv.getInt32(p) : dv.getUint32(p); p += 4; }
        piste.samples.push({ size, dur, sync: !(flags & 0x10000), cto });
        total += size;
      }
      piste.chunks.push({ src: debutChunk, taille: total, n, premier: avant });
      curseur = off + total; finPrec = curseur;
    }
  }
}

const runs = (liste, cle) => { const r = []; for (const x of liste) { const v = cle(x), d = r[r.length - 1]; if (d && d[1] === v) d[0]++; else r.push([1, v]); } return r; };

function tablesEchantillons(t, offsetsChunks) {
  const s = t.samples, parts = [t.stsd];
  { const r = runs(s, (x) => x.dur); parts.push(full('stts', 0, 0, be32(r.length), ...r.map(([c, v]) => cat([be32(c), be32(v)])))); }
  if (s.some((x) => x.cto !== 0)) {
    const r = runs(s, (x) => x.cto), neg = s.some((x) => x.cto < 0);
    parts.push(full('ctts', neg ? 1 : 0, 0, be32(r.length), ...r.map(([c, v]) => cat([be32(c), be32(v >>> 0)]))));
  }
  if (t.type === 'vide' && s.some((x) => !x.sync)) {
    const idx = []; s.forEach((x, i) => { if (x.sync) idx.push(i + 1); });
    parts.push(full('stss', 0, 0, be32(idx.length), ...idx.map(be32)));
  }
  parts.push(full('stsc', 0, 0, (() => { const r = []; t.chunks.forEach((c, i) => { if (!r.length || r[r.length - 1][1] !== c.n) r.push([i + 1, c.n]); }); return cat([be32(r.length), ...r.map(([a, n]) => cat([be32(a), be32(n), be32(t.sdi)]))]); })()));
  parts.push(full('stsz', 0, 0, be32(0), be32(s.length), ...s.map((x) => be32(x.size))));
  parts.push(full('stco', 0, 0, be32(offsetsChunks.length), ...offsetsChunks.map(be32)));
  return mk('stbl', ...parts);
}

export async function remuxerMp4(blob) {
  let moov = null, moovDv = null, info = null; const pistes = new Map(); let fragments = 0;
  for await (const b of niveau1(blob)) {
    if (b.type === 'moov' && !moov) {
      moov = b; moovDv = await lire(blob, b.start, b.end);
      const rel = { type: 'moov', start: 0, hdr: b.hdr, end: b.end - b.start };
      info = lireMoov(moovDv, rel);
      for (const tk of info.traks) { const t = lireTrak(moovDv, tk); pistes.set(t.id, t); }
    } else if (b.type === 'moof') {
      if (!info) throw new Error('moof avant moov');
      fragments++;
      lireMoof(await lire(blob, b.start, b.end), b.start, pistes, info.trex);
    }
  }
  if (!moov || !fragments) return null;
  for (const t of pistes.values()) {
    while (t.chunks.length && t.chunks[t.chunks.length - 1].src + t.chunks[t.chunks.length - 1].taille > blob.size) {
      const c = t.chunks.pop(); t.samples.length = c.premier;
    }
  }
  const liste = [...pistes.values()].filter((t) => t.samples.length);
  if (!liste.length) throw new Error('aucun échantillon');

  const vv = moovDv.getUint8(info.mvhd.start + info.mvhd.hdr);
  const tsFilm = moovDv.getUint32(info.mvhd.start + info.mvhd.hdr + (vv === 1 ? 20 : 12)) || 1000;
  const secondes = (t, x) => x / t.timescale;
  const minDebut = Math.min(...liste.map((t) => secondes(t, t.debut || 0)));
  let dureeFilm = 0;
  for (const t of liste) {
    t.dureeMedia = t.samples.reduce((a, x) => a + x.dur, 0);
    t.decalage = Math.round((secondes(t, t.debut || 0) - minDebut) * tsFilm);
    t.dureeFilm = Math.round(secondes(t, t.dureeMedia) * tsFilm);
    dureeFilm = Math.max(dureeFilm, t.decalage + t.dureeFilm);
  }

  const construire = (decalageMdat) => {
    let cur = 0; const nouveaux = [];
    for (const t of liste) t.nouveaux = [];
    const ordre = [];
    for (const t of liste) for (const c of t.chunks) ordre.push({ t, c });
    ordre.sort((a, b) => a.c.src - b.c.src);
    for (const { t, c } of ordre) { t.nouveaux.push(decalageMdat + cur); c.dest = cur; cur += c.taille; nouveaux.push(c); }
    const reecrit = (dv, b, remplace) => {
      const fils = []; for (const c of enfants(dv, b.start + b.hdr, b.end)) { const r = remplace(c); if (r !== null) fils.push(r === undefined ? copie(dv, c) : r); }
      return mk(b.type, ...fils);
    };
    const traks = liste.map((t) => reecrit(moovDv, t.box, (c) => {
      if (c.type === 'edts') return null;
      if (c.type === 'tkhd') {
        const x = copie(moovDv, c), d = new DataView(x.buffer), v = x[c.hdr];
        if (v === 1) { d.setUint32(c.hdr + 28, Math.floor((t.decalage + t.dureeFilm) / 4294967296)); d.setUint32(c.hdr + 32, (t.decalage + t.dureeFilm) % 4294967296); } else d.setUint32(c.hdr + 20, t.decalage + t.dureeFilm);
        return x;
      }
      if (c.type === 'mdia') return reecrit(moovDv, c, (m) => {
        if (m.type === 'mdhd') {
          const x = copie(moovDv, m), d = new DataView(x.buffer), v = x[m.hdr];
          if (v === 1) { d.setUint32(m.hdr + 24, Math.floor(t.dureeMedia / 4294967296)); d.setUint32(m.hdr + 28, t.dureeMedia % 4294967296); } else d.setUint32(m.hdr + 16, t.dureeMedia);
          return x;
        }
        if (m.type === 'minf') return reecrit(moovDv, m, (n) => (n.type === 'stbl' ? tablesEchantillons(t, t.nouveaux) : undefined));
        return undefined;
      });
      return undefined;
    }));
    const trakEdts = liste.map((t, i) => {
      if (!t.decalage) return traks[i];
      const elst = full('elst', 0, 0, be32(2), be32(t.decalage), be32(0xffffffff), be16(1), be16(0), be32(t.dureeFilm), be32(0), be16(1), be16(0));
      const d = new DataView(traks[i].buffer), n = traks[i].length;
      let p = 8; while (p < n) { const taille = d.getUint32(p), ty = String.fromCharCode(d.getUint8(p + 4), d.getUint8(p + 5), d.getUint8(p + 6), d.getUint8(p + 7)); if (ty === 'tkhd') { p += taille; break; } p += taille; }
      return cat([be32(n + 8 + elst.length), traks[i].slice(4, p), mk('edts', elst), traks[i].slice(p)]);
    });
    const mvhd = copie(moovDv, info.mvhd), md = new DataView(mvhd.buffer), h = info.mvhd.hdr;
    const dMvhd = dureeFilm;
    if (vv === 1) { md.setUint32(h + 24, Math.floor(dMvhd / 4294967296)); md.setUint32(h + 28, dMvhd % 4294967296); } else md.setUint32(h + 16, dMvhd);
    return { moov: mk('moov', mvhd, ...trakEdts), ordre: nouveaux, total: cur };
  };
  const ftypNeuf = mk('ftyp', enc.encode('isom'), be32(512), enc.encode('isom'), enc.encode('iso2'), enc.encode('avc1'), enc.encode('mp41'));
  let essai = construire(0);
  const debutMdat = ftypNeuf.length + essai.moov.length + 8;
  if (debutMdat + essai.total > 0xffffffff) throw new Error('fichier trop grand pour un MP4 simple');
  essai = construire(debutMdat);
  const parts = [ftypNeuf, essai.moov, be32(essai.total + 8), enc.encode('mdat')];
  for (const c of essai.ordre) parts.push(blob.slice(c.src, c.src + c.taille));
  return new Blob(parts, { type: 'video/mp4' });
}
