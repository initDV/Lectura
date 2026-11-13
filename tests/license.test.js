import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyLicense } from '../src/modules/license.js';

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
let pub, priv;
const fabrique = (installId, cle = priv, plan = 'pro') => {
  const payload = Buffer.from(JSON.stringify({ installId, plan, issuedAt: new Date().toISOString() }));
  const sig = sign('sha256', payload, { key: cle, dsaEncoding: 'ieee-p1363' });
  return payload.toString('base64url') + '.' + sig.toString('base64url');
};

beforeAll(() => {
  const paire = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  priv = paire.privateKey;
  pub = paire.publicKey.export({ format: 'jwk' });
});

describe('licence Pro hors ligne', () => {
  it('accepte une licence valide', async () => {
    const r = await verifyLicense(fabrique(ID), ID, pub);
    expect(r.ok).toBe(true);
    expect(r.data.plan).toBe('pro');
  });
  it('tolère les espaces autour de la clé', async () => {
    expect((await verifyLicense(`  ${fabrique(ID)}\n`, ID, pub)).ok).toBe(true);
  });
  it('refuse une signature invalide (clé d\'un autre vendeur)', async () => {
    const autre = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    expect(await verifyLicense(fabrique(ID, autre), ID, pub)).toEqual({ ok: false, reason: 'signature' });
  });
  it('refuse une charge utile modifiée', async () => {
    const [, sig] = fabrique(ID).split('.');
    const faux = Buffer.from(JSON.stringify({ installId: ID, plan: 'pro', issuedAt: 'x' })).toString('base64url');
    expect(await verifyLicense(`${faux}.${sig}`, ID, pub)).toEqual({ ok: false, reason: 'signature' });
  });
  it('refuse une licence émise pour une autre installation', async () => {
    expect(await verifyLicense(fabrique('00000000-1111-4222-8333-444444444444'), ID, pub)).toEqual({ ok: false, reason: 'installation' });
  });
  it('refuse un format incorrect sans planter', async () => {
    for (const k of ['', 'abc', 'a.b.c', '%%%.%%%', null, undefined]) expect((await verifyLicense(k, ID, pub)).ok).toBe(false);
    expect(await verifyLicense('abc', ID, pub)).toEqual({ ok: false, reason: 'format' });
  });
});
