import { describe, it, expect } from 'vitest';
import { signaturePreparation, varianteCommandes } from '../src/ui/scene-calculs.js';
import { nettoyer } from '../src/modules/text-clean.js';

// Chaînes capturées avec signer() dans scene.js avant l'extraction (3adc98e).
const cas = [
  ['Texte brut', {},
    '["Bonjour, Lectura !",false,"voix","","webspeech","",0,"robot_lectura",28]'],
  ['Texte Markdown', { texte: '**Bonjour**, [Lectura](https://example.test) !' },
    '["Bonjour, Lectura !",false,"voix","","webspeech","",0,"robot_lectura",28]'],
  ['Bascule aperçu', { apercu: true },
    '["Bonjour, Lectura !",true,"voix","","webspeech","",0,"robot_lectura",28]'],
  ['Fichier importé', { source: 'fichier', nomFichier: 'voix.wav' },
    '["Bonjour, Lectura !",false,"fichier","voix.wav","webspeech","",0,"robot_lectura",28]'],
  ['Voix Piper à 1×', { moteur: 'piper', id: 'siwis' },
    '["Bonjour, Lectura !",false,"voix","","piper","siwis",1,"robot_lectura",28]'],
  ['Voix Web Speech à 1×', { id: 'fr-voix-locale' },
    '["Bonjour, Lectura !",false,"voix","","webspeech","fr-voix-locale",0,"robot_lectura",28]'],
  ['Personnage différent', { personnageId: 'robot_rouge' },
    '["Bonjour, Lectura !",false,"voix","","webspeech","",0,"robot_rouge",28]'],
  ['Vitesse de frappe différente', { vitesseCps: 36 },
    '["Bonjour, Lectura !",false,"voix","","webspeech","",0,"robot_lectura",36]'],
  ['Voix Piper à 1,25×', { moteur: 'piper', id: 'siwis', vitesse: 1.25 },
    '["Bonjour, Lectura !",false,"voix","","piper","siwis",1.25,"robot_lectura",28]'],
  ['Voix Web Speech à 1,25×', { id: 'fr-voix-locale', vitesse: 1.25 },
    '["Bonjour, Lectura !",false,"voix","","webspeech","fr-voix-locale",0,"robot_lectura",28]'],
  ['Fichier importé, moteur Piper à 1,25×', { source: 'fichier', nomFichier: 'voix.wav', moteur: 'piper', id: 'siwis', vitesse: 1.25 },
    '["Bonjour, Lectura !",false,"fichier","voix.wav","piper","siwis",1.25,"robot_lectura",28]'],
];

describe('signature de préparation', () => {
  it.each(cas)('%s', (_nom, {
    texte = 'Bonjour, Lectura !', apercu = false, source = 'voix', nomFichier = '', moteur = 'webspeech', id = '', vitesse = 1,
    personnageId = 'robot_lectura', vitesseCps = 28,
  }, attendu) => {
    const projet = { audio: { source, nomFichier, voix: { moteur, id, vitesse } }, personnageId, terminal: { vitesseCps } };
    expect(signaturePreparation(nettoyer(texte), apercu, projet)).toBe(attendu);
  });
});

describe('variante affichée des commandes', () => {
  // Valeurs de majUi() avant extraction (74bdfc2) : arrete=false, puis arrete=true.
  it.each([
    ['IDLE', 'repos', 'repos'],
    ['PREPARATION', 'preparation', 'preparation'],
    ['PRET', 'repos', 'repos'],
    ['LECTURE', 'lecture', 'lecture'],
    ['PAUSE', 'pause', 'repos'],
    ['FIN', 'repos', 'repos'],
    ['ERREUR', 'repos', 'repos'],
    ['INCONNU', 'repos', 'repos'],
  ])('%s : conserve les variantes même après plusieurs appels', (etat, enCours, aLArret) => {
    expect(varianteCommandes(etat, false)).toBe(enCours);
    expect(varianteCommandes(etat, true)).toBe(aLArret);
    expect(varianteCommandes(etat, false)).toBe(enCours);
    expect(varianteCommandes(etat, true)).toBe(aLArret);
  });
});
