import { describe, it, expect, vi } from 'vitest';
import { dbGet, dbPut, loadSettings } from '../src/modules/storage.js';

describe('lecteur gratuit après mise à jour', () => {
  it('ne crée aucun identifiant et retire uniquement les anciens champs de paiement', async () => {
    // The Node test uses the documented in-memory fallback; the browser test uses real IndexedDB.
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await loadSettings()).not.toHaveProperty('idInstallation');
      const ancien = { themeTerminal: 'matrix', voixId: 'siwis', titreTerminal: 'Mon titre', motsPerso: { train: { mots: ['gare'], couleur: '#aabbcc' } } };
      const projet = { id: 'p', texte: 'Bonjour.', personnageId: 'pirate' };
      await dbPut('settings', 'main', { ...ancien, idInstallation: 'ancien-id', licence: 'ancienne-cle' });
      await dbPut('projects', 'p', projet);
      await dbPut('drafts', 'courant', projet);
      const blob = new Blob(['audio']); await dbPut('blobs', 'p', blob);
      const s = await loadSettings();
      expect(s).toMatchObject(ancien);
      expect(s).not.toHaveProperty('licence');
      expect(await dbGet('settings', 'main')).toEqual(ancien);
      expect(await dbGet('projects', 'p')).toEqual(projet);
      expect(await dbGet('drafts', 'courant')).toEqual(projet);
      expect(await dbGet('blobs', 'p')).toBe(blob);
    } finally { silence.mockRestore(); }
  });
});
