// Tests du contrôle automatique de relecture (§4.4-i) : durée, image, son, index du MP4.
// La décision est dans `evaluer`, une fonction pure, donc vérifiable sans navigateur.
import { describe, it, expect } from 'vitest';
import { analyserImages, evaluer, lireFaststart, mesurerImage, resumerVerification, tolere, boite } from '../src/modules/verif-export.js';

/** Concatène des Uint8Array en un seul. */
const coller = (...bouts) => {
  const n = bouts.reduce((a, b) => a + b.length, 0), r = new Uint8Array(n);
  let i = 0;
  for (const b of bouts) { r.set(b, i); i += b.length; }
  return r;
};

const VIDEO = { type: 'video/webm', taille: 1_234_567 };
const bon = {
  ...VIDEO,
  meta: { ok: true, dureeMs: 12_000, largeur: 1080, hauteur: 1920 },
  seek: { ok: true, arrive: 11.95 },
  son: { ok: true, rms: 0.04, crete: 0.6 },
  attendu: { dureeAttendueMs: 12_000, attendSon: true },
};

describe('lireFaststart', () => {
  it('détecte un MP4 dont l’index est au début (moov avant mdat)', () => {
    const r = lireFaststart(coller(boite('ftyp', 8), boite('moov', 5000), boite('mdat', 100)));
    expect(r.indexAuDebut).toBe(true);
    expect(r.moov).toBeLessThan(r.mdat);
  });

  it('détecte un MP4 dont l’index est à la fin (mdat avant moov)', () => {
    const r = lireFaststart(coller(boite('ftyp', 8), boite('mdat', 100), boite('moov', 5000)));
    expect(r.indexAuDebut).toBe(false);
    expect(r.mdat).toBe(16);   // ftyp = 8 + 8 octets utiles
    expect(r.moov).toBe(124);  // mdat = 8 + 100
  });

  it('signale une boîte moov absente', () => {
    const r = lireFaststart(coller(boite('ftyp', 8), boite('mdat', 100)));
    expect(r.indexAuDebut).toBe(false);
    expect(r.raison).toMatch(/moov/);
  });

  it('ne boucle pas sur une boîte de taille nulle', () => {
    const r = lireFaststart(new Uint8Array([0, 0, 0, 0, 109, 100, 97, 116]));
    expect(r.raison).toMatch(/moov/);
  });

  it('accepte un fichier sans mdat (encore vide)', () => {
    const r = lireFaststart(coller(boite('ftyp', 8), boite('moov', 10)));
    expect(r.indexAuDebut).toBe(true);
  });
});

describe('tolere', () => {
  it('accepte un écart de 10 % ou 1,5 s', () => {
    expect(tolere(10_000, 10_900)).toBe(true);   // 900 ms
    expect(tolere(10_000, 11_400)).toBe(true);   // 1,4 s : sous le plancher de 1,5 s
    expect(tolere(10_000, 11_600)).toBe(false);  // 1,6 s : au-delà des 10 % (1 s) et du plancher
    expect(tolere(1000, 2000)).toBe(true);       // plancher 1,5 s
    expect(tolere(60_000, 70_000)).toBe(false);  // 10 s d'écart
  });
});

describe('evaluer', () => {
  it('valide un export complet et cohérent', () => {
    const v = evaluer(bon);
    expect(v.ok).toBe(true);
    expect(v.problemes).toEqual([]);
    expect(v.duree).toBe(12);
    expect(v.dureeAttendue).toBe(12);
    expect(v.dureeOk).toBe(true);
    expect(v.pisteVideo).toBe(true);
    expect(v.pisteAudio).toBe(true);
    expect(v.sonAudible).toBe(true);
    expect(v.cherchable).toBe(true);
    expect(v.details.resolution).toBe('1080×1920');
  });

  it('refuse un type de fichier inattendu', () => {
    const v = evaluer({ type: 'text/plain', taille: 10 });
    expect(v.ok).toBe(false);
    expect(v.pisteVideo).toBe(false);
    expect(v.pisteAudio).toBe(false);
    expect(v.problemes[0]).toMatch(/inattendu/);
  });

  it('refuse un fichier illisible', () => {
    const v = evaluer({ ...VIDEO, meta: { ok: false, erreur: 'le navigateur n’a pas pu lire ce fichier' } });
    expect(v.ok).toBe(false);
    expect(v.notes[0]).toMatch(/lire ce fichier/);
  });

  it('refuse une durée absente (le cas qui fait rejeter le fichier par la galerie)', () => {
    const v = evaluer({ ...bon, meta: { ok: true, dureeMs: 0, largeur: 1080, hauteur: 1920 } });
    expect(v.ok).toBe(false);
    expect(v.dureeOk).toBe(false);
    expect(v.problemes[0]).toMatch(/Durée absente/);
  });

  it('refuse une durée incohérente avec celle annoncée', () => {
    const v = evaluer({ ...bon, meta: { ...bon.meta, dureeMs: 4000 } });
    expect(v.ok).toBe(false);
    expect(v.dureeOk).toBe(false);
    expect(v.problemes[0]).toMatch(/Durée incohérente/);
  });

  it('accepte une durée dans la tolérance', () => {
    const v = evaluer({ ...bon, meta: { ...bon.meta, dureeMs: 12_500 } });
    expect(v.dureeOk).toBe(true);
    expect(v.ok).toBe(true);
  });

  it('refuse une vidéo sans piste image', () => {
    const v = evaluer({ ...bon, meta: { ok: true, dureeMs: 12_000, largeur: 0, hauteur: 0 } });
    expect(v.ok).toBe(false);
    expect(v.pisteVideo).toBe(false);
    expect(v.problemes.some((p) => /Aucune piste vidéo/.test(p))).toBe(true);
  });

  it('refuse une vidéo où le déplacement échoue (index invalide)', () => {
    const v = evaluer({ ...bon, seek: { ok: false, erreur: 'délai dépassé' } });
    expect(v.ok).toBe(false);
    expect(v.cherchable).toBe(false);
    expect(v.problemes.some((p) => /Déplacement impossible/.test(p))).toBe(true);
  });

  it('refuse un MP4 dont l’index est à la fin', () => {
    const v = evaluer({ ...bon, type: 'video/mp4', fs: { indexAuDebut: false } });
    expect(v.ok).toBe(false);
    expect(v.problemes.some((p) => /index à la fin/.test(p))).toBe(true);
  });

  it('refuse une piste audio absente', () => {
    const v = evaluer({ ...bon, son: { ok: false, erreur: 'Web Audio indisponible' } });
    expect(v.ok).toBe(false);
    expect(v.pisteAudio).toBe(false);
    expect(v.sonAudible).toBe(false);
    expect(v.problemes.some((p) => /Piste audio absente/.test(p))).toBe(true);
  });

  it('refuse une piste audio présente mais muette', () => {
    const v = evaluer({ ...bon, son: { ok: true, rms: 0, crete: 0 } });
    expect(v.ok).toBe(false);
    expect(v.pisteAudio).toBe(true);
    expect(v.sonAudible).toBe(false);
    expect(v.problemes.some((p) => /silencieuse/.test(p))).toBe(true);
  });

  it('n’exige pas de son quand l’enregistrement était muet', () => {
    const v = evaluer({ ...bon, son: { ok: false, erreur: 'aucun son' }, attendu: { dureeAttendueMs: 12_000, attendSon: false } });
    expect(v.ok).toBe(true);
  });

  it('n’exige ni image ni déplacement pour un MP3', () => {
    const v = evaluer({
      type: 'audio/mpeg', taille: 50_000,
      meta: { ok: true, dureeMs: 12_000 },
      son: { ok: true, rms: 0.05 },
      attendu: { dureeAttendueMs: 12_000, attendSon: true },
    });
    expect(v.ok).toBe(true);
    expect(v.pisteVideo).toBe(true); // non pertinent pour un audio : aucun problème signalé
    expect(v.cherchable).toBe(true);
  });

  it('cumule plusieurs problèmes', () => {
    const v = evaluer({
      ...VIDEO,
      meta: { ok: true, dureeMs: 0, largeur: 0, hauteur: 0 },
      seek: { ok: false, erreur: 'erreur' },
      son: { ok: false, erreur: 'absente' },
    });
    expect(v.ok).toBe(false);
    // durée absente + piste image + déplacement + piste audio
    expect(v.problemes.length).toBe(4);
    expect(v.notes.length).toBe(4);
  });
});

describe('resumerVerification', () => {
  it('résume un succès en français', () => {
    expect(resumerVerification(evaluer(bon))).toMatch(/Vérifié : 12\.0 s/);
  });
  it('décrit un enregistrement volontairement sans son sans le déclarer cassé', () => {
    const v = evaluer({ ...bon, son: { ok: false, erreur: 'absente' }, attendu: { attendSon: false } });
    expect(v.ok).toBe(true);
    expect(resumerVerification(v)).toMatch(/Vérifié.*vidéo sans son/);
  });
  it('résume les problèmes', () => {
    expect(resumerVerification(evaluer({ ...bon, son: { ok: false, erreur: 'absente' } }))).toMatch(/^Attention :/);
  });
});

// ── Le contenu de la vidéo (ajout §4.4) ─────────────────────────────────────
describe('analyserImages : le contenu, pas seulement les métadonnées', () => {
  const image = (moyenne, variance, signature) => ({ moyenne, variance, signature });
  const animees = [image(90, 220, 'abc'), image(95, 240, 'def'), image(88, 210, 'ghi')];

  it('accepte une vidéo dont les images bougent', () => {
    const r = analyserImages(animees);
    expect(r).toMatchObject({ ok: true, noire: false, figee: false });
    expect(r.notes).toEqual([]);
  });

  it('voit un mouvement à gauche de l’image même si le terminal ne change pas', () => {
    const px = new Uint8ClampedArray(64 * 64 * 4).fill(29);
    for (let y = 22; y < 35; y++) px.fill(81, (y * 64 + 12) * 4, (y * 64 + 18) * 4);
    const pose1 = mesurerImage(px);
    for (let y = 21; y < 24; y++) px.fill(147, (y * 64 + 8) * 4, (y * 64 + 12) * 4);
    expect(analyserImages([pose1, mesurerImage(px)])).toMatchObject({ ok: true, figee: false });
    expect(analyserImages([pose1, pose1])).toMatchObject({ ok: false, figee: true });
  });
  it('détecte une vidéo entièrement noire', () => {
    const r = analyserImages([image(0, 0, 'aaa'), image(0, 0, 'aaa')]);
    expect(r.noire).toBe(true);
    expect(r.notes[0]).toMatch(/uniforme/);
  });

  it('laisse passer une scène sombre mais dessinée', () => {
    // Le fond de Lectura est très sombre : sans ce seuil, tout export serait déclaré noir.
    const r = analyserImages([image(18, 42, 'abc'), image(19, 45, 'abd')]);
    expect(r.noire).toBe(false);
  });

  it('détecte une image figée sur toute la vidéo', () => {
    const r = analyserImages([image(90, 220, 'idem'), image(90, 220, 'idem'), image(90, 220, 'idem')]);
    expect(r.figee).toBe(true);
    expect(r.notes.some((n) => /figée/.test(n))).toBe(true);
  });

  it('ne crie pas à l’image figée sur une seule image', () => {
    expect(analyserImages([image(90, 220, 'seule')]).figee).toBe(false);
  });

  it('dit qu’elle n’a rien pu lire plutôt que de valider', () => {
    const r = analyserImages([]);
    expect(r.ok).toBe(false);
    expect(r.notes[0]).toMatch(/Aucune image/);
  });

  it('ignore les images illisibles au milieu des autres', () => {
    const r = analyserImages([image(90, 220, 'abc'), null, image(95, 240, 'def')]);
    expect(r.ok).toBe(true);
  });
});

describe('evaluer : résolution et taille', () => {
  it('refuse une résolution différente de celle demandée', () => {
    const r = evaluer({ ...bon, attendu: { ...bon.attendu, largeur: 1920, hauteur: 1080 } });
    expect(r.ok).toBe(false);
    expect(r.problemes.join(' ')).toMatch(/Résolution 1080×1920 au lieu de 1920×1080/);
  });

  it('accepte la résolution demandée', () => {
    const r = evaluer({ ...bon, attendu: { ...bon.attendu, largeur: 1080, hauteur: 1920 } });
    expect(r.ok).toBe(true);
  });

  it('refuse un fichier trop petit pour sa durée', () => {
    const r = evaluer({ ...bon, taille: 20_000 }); // 20 Ko pour 12 s
    expect(r.ok).toBe(false);
    expect(r.problemes.join(' ')).toMatch(/trop petit/);
  });

  it('n’applique pas le plancher de taille à un fichier très court', () => {
    const r = evaluer({ ...bon, taille: 20_000, meta: { ok: true, dureeMs: 800, largeur: 1080, hauteur: 1920 }, attendu: { dureeAttendueMs: 800 } });
    expect(r.problemes.join(' ')).not.toMatch(/trop petit/);
  });

  it('refuse une vidéo dont les images sont noires', () => {
    const r = evaluer({ ...bon, images: { ok: true, stats: [{ moyenne: 0, variance: 0, signature: 'a' }, { moyenne: 0, variance: 0, signature: 'a' }] } });
    expect(r.ok).toBe(false);
    expect(r.problemes.join(' ')).toMatch(/uniforme/);
  });

  it('accepte une vidéo dont les images bougent', () => {
    const r = evaluer({ ...bon, images: { ok: true, stats: [{ moyenne: 90, variance: 220, signature: 'a' }, { moyenne: 92, variance: 230, signature: 'b' }] } });
    expect(r.ok).toBe(true);
  });

  it('n’exige pas d’images pour un MP3', () => {
    const r = evaluer({ type: 'audio/mpeg', taille: 500_000, meta: { ok: true, dureeMs: 12_000 },
      son: { ok: true, rms: 0.04, crete: 0.6 }, attendu: { dureeAttendueMs: 12_000 } });
    expect(r.ok).toBe(true);
  });
});

describe('avertissements : ce qui ne doit pas faire échouer un export', () => {
  it('un décodage d’image impossible est signalé sans invalider le fichier', () => {
    const r = evaluer({ ...bon, images: { ok: false, erreur: 'délai dépassé', stats: [] } });
    expect(r.ok).toBe(true);
    expect(r.avertissements.join(' ')).toMatch(/Images non vérifiées/);
    expect(r.problemes).toEqual([]);
  });

  it('le résumé d’un export bon mais non vérifié le dit', () => {
    const r = evaluer({ ...bon, images: { ok: false, erreur: 'codec', stats: [] } });
    expect(resumerVerification(r)).toMatch(/Vérifié/);
    expect(resumerVerification(r)).toMatch(/Images non vérifiées/);
  });

  it('le résumé d’un export mauvais cumule problèmes et avertissements', () => {
    const r = evaluer({ ...bon, taille: 10_000, images: { ok: false, erreur: 'codec', stats: [] } });
    expect(resumerVerification(r)).toMatch(/trop petit/);
    expect(resumerVerification(r)).toMatch(/Images non vérifiées/);
  });

  it('un export refusé dès le départ ne perd pas les avertissements', () => {
    const r = evaluer({ type: 'application/x-bidon', taille: 10, attendu: {} });
    expect(r.avertissements).toEqual([]);
    expect(r.ok).toBe(false);
  });
});
