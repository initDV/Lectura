// @ts-check
// nombres.js : nombres → mots français (pour la voix Lectura HD). Module pur.
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function sous100(n) {
  if (n < 17) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) return `${DIZAINES[d]}${d === 7 && u === 1 ? ' et ' : '-'}${sous100(10 + u)}`;
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d];
  return `${DIZAINES[d]}${u === 1 && d !== 8 ? ' et un' : `-${UNITES[u]}`}`;
}

function sous1000(n) {
  const c = Math.floor(n / 100), r = n % 100;
  if (!c) return sous100(r);
  return `${c > 1 ? `${UNITES[c]} ` : ''}cent${c > 1 && !r ? 's' : ''}${r ? ` ${sous100(r)}` : ''}`;
}

/** Entier positif (jusqu'à 999 999 999 999) → mots. */
export function entierEnMots(n) {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return sous1000(n);
  const parts = [];
  for (const [val, nom, invariable] of [[1e9, 'milliard', false], [1e6, 'million', false], [1e3, 'mille', true]]) {
    const q = Math.floor(n / val);
    if (!q) continue;
    n %= val;
    if (invariable) parts.push(q === 1 ? nom : `${sous1000(q)} ${nom}`);
    else parts.push(`${sous1000(q)} ${nom}${q > 1 ? 's' : ''}`);
  }
  if (n) parts.push(sous1000(n));
  return parts.join(' ');
}

/** Suite de chiffres (éventuellement avec zéros en tête) → mots ; les nombres trop longs sont lus chiffre par chiffre. */
export function chiffresEnMots(s) {
  if (s.length > 12 || (s.length > 1 && s[0] === '0')) return [...s].map((c) => UNITES[+c]).join(' ');
  return entierEnMots(parseInt(s, 10));
}

/** Remplace les nombres d'un texte : 3,5 → « trois virgule cinq » ; 192.168.1.10 → « … point … » ; 80 % reste géré ailleurs. */
export function nombresEnMots(texte) {
  return texte
    .replace(/(\d+),(\d+)/g, (_, a, b) => `${chiffresEnMots(a)} virgule ${chiffresEnMots(b)}`)
    .replace(/(\d+)((?:\.\d+)+)/g, (_, a, reste) => `${chiffresEnMots(a)}${reste.replace(/\.(\d+)/g, (m, d) => ` point ${chiffresEnMots(d)}`)}`)
    .replace(/(\d)\s(?=\d{3}\b)/g, '$1') // 10 000 → 10000
    .replace(/\d+/g, (m) => ` ${chiffresEnMots(m)} `);
}
