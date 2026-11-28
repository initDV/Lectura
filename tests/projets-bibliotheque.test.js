import { describe, it, expect, vi } from 'vitest';
import { filtrerProjets } from '../src/ui/projets.js';
import { newProject } from '../src/modules/project.js';
import { saveProject, duplicateProject, getProject, deleteProject, getAudio, saveAudio, getDraft, saveDraft, listProjects, ProjectAudioMissing } from '../src/modules/storage.js';

// Node n'a pas d'IndexedDB : les tests unitaires emploient le stockage mémoire de Lectura.
vi.mock('../src/modules/errors.js', () => ({ logError: vi.fn(), report: vi.fn(), notify: vi.fn() }));

const filtrer = (liste, recherche = '', tri = 'recents') => filtrerProjets(liste, recherche, tri, 'fr', 'Sans titre');

describe('bibliothèque de projets', () => {
  it('cherche sans casse ni accents dans toute la bibliothèque, avant la pagination', () => {
    const ancien = { titre: 'École de théâtre', modifieLe: '2020-01-01' };
    const liste = [...Array.from({ length: 35 }, (_, n) => ({ titre: `Démo ${n}`, modifieLe: '2026-01-01' })), ancien];
    expect(filtrer(liste, '  ECOLE de the\u0301a  ')).toEqual([ancien]);
    expect(filtrer(liste, 'introuvable')).toEqual([]);
    expect(liste.length).toBe(36);
  });

  it('trie par titre ou par date dans les deux sens sans changer l’ordre d’entrée', () => {
    const a = { titre: 'École', modifieLe: '2026-01-01' }, b = { titre: 'Alpha', modifieLe: '2020-01-01' };
    const c = { titre: '', modifieLe: '2024-01-01' }, liste = [a, b, c];
    expect(filtrer(liste)).toEqual([a, c, b]);
    expect(filtrer(liste, '', 'anciens')).toEqual([b, c, a]);
    expect(filtrer(liste, '', 'titre')).toEqual([b, a, c]);
    expect(filtrer(liste, 'SANS TITRE')).toEqual([c]);
    expect(liste).toEqual([a, b, c]);
  });

  it('duplique le projet, ses repères et son Blob sous une clé indépendante sans effacer le brouillon', async () => {
    const source = newProject({ titre: 'École', texte: 'Bonjour !', timing: 'sous-titres', personnageId: 'wend',
      segments: [{ texte: 'Bonjour !', debutMs: 500, finMs: 1800, expression: 'surpris' }],
      audio: { source: 'fichier', nomFichier: 'lecture.wav', dureeMs: 3000 } });
    const brouillon = newProject({ texte: 'Ne pas écraser.' }), audio = new Blob(['audio de test'], { type: 'audio/wav' });
    await saveProject(source); await saveAudio(source.id, audio); await saveDraft(brouillon);

    const copie = await duplicateProject(source.id, 'École (copie)');
    expect(copie.id).not.toBe(source.id);
    expect(copie).toEqual({ ...source, id: copie.id, titre: 'École (copie)', creeLe: copie.creeLe, modifieLe: copie.modifieLe });
    expect(await (await getAudio(copie.id)).text()).toBe('audio de test');
    expect((await getAudio(copie.id)).type).toBe(audio.type);
    expect(await getDraft()).toEqual(brouillon);

    copie.segments[0].expression = 'content';
    await saveProject(copie);
    expect((await getProject(source.id)).segments[0].expression).toBe('surpris');
    await deleteProject(copie.id);
    expect(await getProject(copie.id)).toBeUndefined();
    expect(await getAudio(copie.id)).toBeUndefined();
    expect(await getProject(source.id)).toEqual(source);
    expect(await getAudio(source.id)).toBe(audio);
  });

  it('ne crée aucune entrée si le fichier audio exigé manque ou est vide', async () => {
    const source = newProject({ titre: 'Audio absent', audio: { source: 'fichier', nomFichier: 'introuvable.wav' } });
    await saveProject(source);
    const avant = await listProjects();
    await expect(duplicateProject(source.id, 'Copie')).rejects.toBeInstanceOf(ProjectAudioMissing);
    await saveAudio(source.id, new Blob([]));
    await expect(duplicateProject(source.id, 'Copie')).rejects.toBeInstanceOf(ProjectAudioMissing);
    expect(await listProjects()).toEqual(avant);
  });

  it('duplique un projet utilisant une voix sans associé audio', async () => {
    const source = await saveProject(newProject({ titre: 'Avec voix locale', texte: 'Bonsoir.' }));
    const copie = await duplicateProject(source.id, 'Variante');
    expect((await getProject(copie.id)).audio.source).toBe('voix');
    expect(await getAudio(copie.id)).toBeUndefined();
  });
});
