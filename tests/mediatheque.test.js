import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbGet, dbPut, saveAudio } from '../src/modules/storage.js';
import { fichierMedia, listerMedias, lireMedia, renommerMedia, sauverMedia, supprimerMedia } from '../src/modules/video-store.js';

const blob = (format, octets = [1, 0, 15, 255]) => new Blob([new Uint8Array(octets)], { type: format === 'mp3' ? 'audio/mpeg' : `video/${format}` });
const bytes = async (f) => [...new Uint8Array(await f.arrayBuffer())];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const m of await listerMedias()) await supprimerMedia(m.id);
});

describe('Médiathèque privée', () => {
  it('retrouve les entrées existantes et filtre MP3, MP4 et WebM dans les mêmes données', async () => {
    await dbPut('blobs', 'video-ancien', { id: 'video-ancien', titre: 'Vidéo précédente', format: 'webm', date: 1, blob: blob('webm') });
    const audio = await sauverMedia({ titre: 'Introduction', format: 'mp3', blob: blob('mp3') });
    const video = await sauverMedia({ titre: 'Épisode 1', format: 'mp4', blob: blob('mp4') });
    expect((await listerMedias('audio')).map(({ id, type, mime }) => [id, type, mime])).toEqual([[audio, 'audio', 'audio/mpeg']]);
    expect((await listerMedias('video')).map((m) => m.id)).toEqual([video, 'video-ancien']);
    expect(await listerMedias()).toHaveLength(3);
  });

  it('ne change que le titre, avec un nom de fichier sûr et les octets originaux', async () => {
    const id = await sauverMedia({ titre: 'Prise 1', format: 'mp3', blob: blob('mp3') });
    const avant = await lireMedia(id);
    expect(await renommerMedia(id, ' Épisode / révisé ')).toBe(true);
    const apres = await lireMedia(id);
    expect(apres).toMatchObject({ id, date: avant.date, titre: 'Épisode / révisé', format: 'mp3', mime: 'audio/mpeg', taille: 4 });
    expect((await dbGet('blobs', id)).titre).toBe('Épisode / révisé');
    const fichier = fichierMedia(apres);
    expect(fichier.name).toBe('episode-revise.mp3');
    expect(fichier.type).toBe('audio/mpeg');
    expect(await bytes(fichier)).toEqual([1, 0, 15, 255]);
  });

  it('supprime seulement la copie privée, jamais un audio de projet ni un fichier déjà partagé', async () => {
    const id = await sauverMedia({ titre: 'Séquence', format: 'mp4', blob: blob('mp4') });
    const externe = fichierMedia(await lireMedia(id));
    const autre = await sauverMedia({ titre: 'Autre', format: 'mp3', blob: blob('mp3') });
    const projet = 'audio-pour-projet-media';
    await saveAudio(projet, blob('mp3', [42]));
    expect(await supprimerMedia(projet)).toBe(false);
    expect(await supprimerMedia(id)).toBe(true);
    expect(await supprimerMedia(id)).toBe(false);
    expect(await lireMedia(id)).toBeNull();
    expect((await listerMedias()).map((m) => m.id)).toEqual([autre]);
    expect(await bytes(await dbGet('blobs', projet))).toEqual([42]);
    expect(await bytes(externe)).toEqual([1, 0, 15, 255]);
  });

  it('refuse un titre vide et ne ressuscite pas une entrée supprimée', async () => {
    const id = await sauverMedia({ titre: 'Original', format: 'mp4', blob: blob('mp4') });
    await expect(renommerMedia(id, '  \n ')).rejects.toThrow();
    expect((await lireMedia(id)).titre).toBe('Original');
    await Promise.all([supprimerMedia(id), renommerMedia(id, 'Trop tard')]);
    expect(await lireMedia(id)).toBeNull();
  });

  it('garde la limite de 20 entrées pour les deux catégories ensemble', async () => {
    let now = 1;
    vi.spyOn(Date, 'now').mockImplementation(() => ++now);
    const ids = [];
    for (let i = 0; i < 21; i++) {
      const format = i % 2 ? 'mp3' : 'webm';
      ids.push(await sauverMedia({ titre: `Média ${i}`, format, blob: blob(format) }));
    }
    expect((await listerMedias()).map((m) => m.id)).toEqual(ids.slice(1).reverse());
  });
});
