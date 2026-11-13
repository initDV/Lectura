#!/usr/bin/env node
// Licences Pro hors ligne (ECDSA P-256). Aucune dépendance.
//   node tools/generate_license.mjs keygen [--force]      → crée private.pem + écrit la clé publique dans l'app
//   node tools/generate_license.mjs sign <installId> [plan] → affiche la clé de licence à envoyer à l'acheteur
//   node tools/generate_license.mjs verify <cle> <installId> → contrôle une clé (diagnostic)
// private.pem ne doit JAMAIS quitter ta machine (il est dans .gitignore). Sauvegarde-le hors du dépôt.
import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';
import fs from 'node:fs';

const [, , cmd, a1, a2 = 'pro'] = process.argv;
const PEM = 'private.pem', KEYFILE = 'src/modules/license-key.js';
const stop = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

function writePublic(jwk, demo) {
  const pub = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  fs.writeFileSync(KEYFILE, `// Clé PUBLIQUE de vérification des licences Pro (ECDSA P-256).
// Fichier réécrit par : node tools/generate_license.mjs keygen
// DEMO = true signifie « clé de démonstration » : lance keygen avant de vendre des licences.
export const PUB = ${JSON.stringify(pub)};
export const DEMO = ${demo};
`);
  return pub;
}

if (cmd === 'keygen') {
  if (fs.existsSync(PEM) && a1 !== '--force') {
    stop(`${PEM} existe déjà. Le remplacer invaliderait TOUTES les licences déjà vendues. Ajoute --force si c'est voulu.`);
  }
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(PEM, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = writePublic(publicKey.export({ format: 'jwk' }), a2 === '--demo' || a1 === '--demo');
  console.log(`✔ Clé privée : ${PEM} (garde-la secrète, fais-en une sauvegarde hors du dépôt)`);
  console.log(`✔ Clé publique écrite dans ${KEYFILE} :`);
  console.log(JSON.stringify(pub));
  console.log('→ Ensuite : git add src/modules/license-key.js && git commit -m "Clé publique de licence" puis redéploie.');
} else if (cmd === 'sign') {
  if (!a1) stop('Usage : node tools/generate_license.mjs sign <installId> [plan]');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a1)) stop("Identifiant d'installation invalide (attendu : un UUID copié depuis l'écran Pro).");
  if (!fs.existsSync(PEM)) stop(`${PEM} introuvable. Lance d'abord : node tools/generate_license.mjs keygen`);
  const priv = createPrivateKey(fs.readFileSync(PEM));
  const payload = Buffer.from(JSON.stringify({ installId: a1, plan: a2, issuedAt: new Date().toISOString() }));
  const sig = sign('sha256', payload, { key: priv, dsaEncoding: 'ieee-p1363' }); // format attendu par Web Crypto
  console.log(payload.toString('base64url') + '.' + sig.toString('base64url'));
} else if (cmd === 'verify') {
  if (!a1 || !process.argv[4]) stop('Usage : node tools/generate_license.mjs verify <cle> <installId>');
  if (!fs.existsSync(PEM)) stop(`${PEM} introuvable.`);
  const [p, s] = a1.split('.');
  const pub = createPublicKey(createPrivateKey(fs.readFileSync(PEM)));
  const ok = verify('sha256', Buffer.from(p, 'base64url'), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s || '', 'base64url'));
  const data = ok ? JSON.parse(Buffer.from(p, 'base64url').toString()) : null;
  console.log(ok && data.installId === process.argv[4] ? `✔ Licence valide (${data.plan}, émise le ${data.issuedAt})` : '✖ Licence invalide pour cette installation');
  process.exit(ok && data.installId === process.argv[4] ? 0 : 2);
} else {
  console.log('Usage :\n  node tools/generate_license.mjs keygen [--force]\n  node tools/generate_license.mjs sign <installId> [plan]\n  node tools/generate_license.mjs verify <cle> <installId>');
}
