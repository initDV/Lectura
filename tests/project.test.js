import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, normalizeProject, fileBase } from '../src/modules/project.js';
import { parseSubtitles, toSrt, toVtt, cuesToProject } from '../src/modules/subtitles.js';
import { autoTiming, segmentsValides } from '../src/modules/timeline.js';

describe('projet .lectura', () => {
  it('crée un projet complet avec les valeurs par défaut du cahier des charges', () => {
    const p = newProject({ titre: 'Test' });
    expect(p.version).toBe(1);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.personnageId).toBe('robot_lectura');
    expect(p.terminal).toEqual({ theme: 'sombre', police: 'JetBrains Mono', taille: 18, vitesseCps: 28, prompt: '$ ' });
    expect(p.reglages).toEqual({ mouvements: 'normal', fond: '#0d0d12' });
    expect(p.audio.source).toBe('voix');
  });
  it('export puis import : aller-retour identique', () => {
    const texte = 'Attention au phishing. sudo nmap !';
    const p = newProject({ titre: 'Aller-retour é', texte, segments: autoTiming(texte, 4000), personnageId: 'robot_rouge',
      audio: { source: 'fichier', nomFichier: 'voix.mp3', dureeMs: 4000, voix: { moteur: 'piper', id: 'fr_FR-siwis-medium', vitesse: 1.2, hauteur: 0.9 } } });
    const q = parseProject(serializeProject(p));
    expect(q).toEqual(p);
    expect(parseProject(serializeProject(q))).toEqual(q);
  });
  it('corrige les valeurs hors limites et les champs manquants', () => {
    const p = normalizeProject({ texte: 'a\r\nb', terminal: { taille: 999, vitesseCps: -3 }, audio: { voix: { vitesse: 9 } }, reglages: { fond: 'rouge' } });
    expect(p.texte).toBe('a\nb');
    expect(p.terminal.taille).toBe(40);
    expect(p.terminal.vitesseCps).toBe(5);
    expect(p.audio.voix.vitesse).toBe(2);
    expect(p.reglages.fond).toBe('#0d0d12');
  });
  it('refuse les fichiers invalides avec un message clair', () => {
    expect(() => parseProject('pas du json')).toThrow(/JSON/);
    expect(() => parseProject('[1,2]')).toThrow(/projet Lectura/);
    expect(() => parseProject('{"version":99}')).toThrow(/plus récente/);
  });
  it('fabrique un nom de fichier sûr', () => {
    expect(fileBase({ titre: 'Sécurité : les bases / n°1' })).toBe('securite-les-bases-n-1');
    expect(fileBase({ titre: '' })).toBe('projet');
  });
});

describe('sous-titres', () => {
  const segs = [{ id: 1, texte: 'Bonjour à tous.', debutMs: 0, finMs: 1500 }, { id: 2, texte: 'sudo nmap', debutMs: 2000, finMs: 3723004 }];
  it('SRT : aller-retour', () => {
    const srt = toSrt(segs);
    expect(srt).toContain('00:00:02,000 --> 01:02:03,004');
    expect(parseSubtitles(srt)).toEqual(segs.map(({ texte, debutMs, finMs }) => ({ texte, debutMs, finMs })));
  });
  it('VTT : aller-retour, balises et en-têtes ignorés', () => {
    expect(parseSubtitles(toVtt(segs)).length).toBe(2);
    const vtt = 'WEBVTT\n\nNOTE test\n\n1\n00:01.000 --> 00:02.500\n<v Prof>Salut</v>\nà tous\n';
    expect(parseSubtitles(vtt)).toEqual([{ debutMs: 1000, finMs: 2500, texte: 'Salut à tous' }]);
  });
  it('convertit en projet avec des segments valides', () => {
    const { texte, segments } = cuesToProject(parseSubtitles(toSrt(segs)));
    expect(texte).toBe('Bonjour à tous.\nsudo nmap');
    expect(segmentsValides(texte, segments)).toBe(true);
  });
  it('signale un fichier sans sous-titre', () => expect(() => parseSubtitles('rien')).toThrow(/Aucun sous-titre/));
});
