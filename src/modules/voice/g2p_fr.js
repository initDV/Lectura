// @ts-check
// g2p_fr.js : texte français → phonèmes API attendus par les voix Piper. Module pur, écrit pour Lectura (MIT).
// Remplace espeak-ng (GPLv3, exclu par la règle de licences du projet). Voir docs/DECISIONS.md.
import { LEXIQUE, LETTRES, SYMBOLES, CLITIQUES, TIRET, LIAISONS } from './g2p_lexique.js';
import { nombresEnMots } from './nombres.js';

const VOY = 'aeiouyàâäéèêëîïôöùûüœæ';
const V = (c) => !!c && VOY.includes(c);
const C = (c) => !!c && /[a-zç]/.test(c) && !V(c);
const PHON_VOY = 'aɑeɛəioɔuyøœ';
/** Mots en -ent où la finale se prononce (noms, adjectifs, adverbes) ; ailleurs -ent est une finale verbale muette. */
const ENT = new Set(`souvent différent récent content présent client agent argent accident talent urgent patient évident excellent vent dent lent
 accent absent innocent fréquent prudent permanent équivalent violent parent apparent transparent incident président résident continent
 ingrédient orient coefficient récipient inconvénient intelligent compétent cohérent précédent serpent torrent adolescent comment
 moment document élément argument instrument segment supplément complément vêtement bâtiment événement mouvement paiement traitement
 gouvernement environnement abonnement équipement logement jugement engagement changement chargement développement fonctionnement
 comportement département appartement règlement sentiment testament monument tourment ciment aliment`.split(/\s+/));
const T_SONORE = /(ct|pt|st)$/; // direct, concept, test : le t final s'entend

/** Retire les lettres finales muettes et dit si un « e » muet terminait le mot. */
function finale(m) {
  let w = m;
  if (w.length > 3 && /[^aeiouy]s$/.test(w) && !/(us|is|as|os)$/.test(w)) w = w.slice(0, -1);
  else if (w.length > 2 && /[aeéiou]s$/.test(w)) w = w.slice(0, -1);
  if (LEXIQUE[w] && w !== m) return { w, direct: LEXIQUE[w] };
  if (/(eu|au|ou|oi|ai|ri)x$/.test(w)) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ent') && !ENT.has(w) && !ENT.has(m)) {
    if (w.endsWith('ment') && !/(mm|rm|im|um)ent$/.test(w)) return { w: w.slice(0, -1), muet: false };
    return { w: `${w.slice(0, -3)}e`, muet: true };
  }
  if (w.length > 2 && w.endsWith('e') && !/[éèê]$/.test(w)) return { w, muet: true };
  if (ENT.has(w) || ENT.has(m)) w = w.slice(0, -1);
  else if (w.length > 2 && /[^e][td]$/.test(w) && !T_SONORE.test(w)) return { w: w.slice(0, -1), muet: false, td: true };
  else if (w.length > 3 && /[^i]ng$/.test(w)) w = w.slice(0, -1);
  return { w, muet: false };
}

/** Voyelle nasale possible à la position i (lettre n/m en i+len) ? */
function nasale(w, i) {
  const n = w[i], s = w[i + 1];
  return (n === 'n' || n === 'm') && !V(s) && s !== 'n' && s !== 'm' && s !== 'h';
}

/** Cœur du convertisseur : un mot en minuscules → phonèmes (sans accent tonique). */
function regles(mot) {
  const { w, direct, muet, td } = finale(mot);
  if (direct) return direct;
  const n = w.length;
  let o = '', i = 0;
  const p = (s, k) => { o += s; i += k; };
  while (i < n) {
    const c = w[i], d = w[i + 1], e = w[i + 2], r = w.slice(i), prev = w[i - 1];
    const fin = (k) => i + k >= n; // les k lettres terminent le mot
    if (c === d && C(c) && !'lsc'.includes(c)) { i++; continue; }
    // --- groupes de voyelles ---
    if (r.startsWith('eau')) p('o', 3);
    else if (r.startsWith('œu') || r.startsWith('oeu')) p('œ', c === 'œ' ? 2 : 3);
    else if (c === 'œ') p('œ', 1);
    else if (/^(ou|où|oû)ill/.test(r)) p('uj', 5);
    else if (/^(ou|où|oû)/.test(r)) { if (V(e) && !(e === 'e' && fin(3) && muet)) p('w', 2); else p('u', 2); }
    else if (r.startsWith('oin') && nasale(w, i + 2)) p('wɛ̃', 3);
    else if (r.startsWith('oy') && V(e)) p('waj', 2);
    else if (/^o[iî]/.test(r)) p('wa', 2);
    else if (/^(ueil|euil)l?/.test(r)) p('œj', r[4] === 'l' ? 5 : 4);
    else if (/^(a|e)ill/.test(r)) p(c === 'a' ? 'aj' : 'ɛj', 4);
    else if (/^(a|e)il$/.test(r)) p(c === 'a' ? 'aj' : 'ɛj', 3);
    else if (/^(ain|aim|ein)/.test(r) && nasale(w, i + 2)) p('ɛ̃', 3);
    else if (r.startsWith('ay') && V(e)) p('ɛj', 2);
    else if (/^(ai|aî|ei)/.test(r)) p('ɛ', 2);
    else if (/^(au)/.test(r)) p('o', 2);
    else if (/^(eu|eû)/.test(r)) p(/^e[uû](r|[lfvnbp](e?$))/.test(r) ? 'œ' : 'ø', 2);
    else if (r.startsWith('ien') && nasale(w, i + 2)) p('ct'.includes(w[i + 3] || ' ') && !fin(3) ? 'jɑ̃' : 'jɛ̃', 3);
    else if (r.startsWith('éen') && fin(3)) p('eɛ̃', 3);
    else if (/^(an|am|en|em)/.test(r) && nasale(w, i + 1)) p('ɑ̃', 2);
    else if (r.startsWith('emm')) p('ɑ̃m', 3);
    else if (r === 'um') p('ɔm', 2);
    else if (/^(un|um)/.test(r) && nasale(w, i + 1)) p('œ̃', 2);
    else if (/^(in|im|yn|ym|în)/.test(r) && nasale(w, i + 1)) p('ɛ̃', 2);
    else if (/^(on|om)/.test(r) && nasale(w, i + 1)) p('ɔ̃', 2);
    // --- consonnes composées ---
    else if (r.startsWith('chr')) p('kʁ', 3);
    else if (r.startsWith('ch')) p('ʃ', 2);
    else if (r.startsWith('ph')) p('f', 2);
    else if (r.startsWith('th')) p('t', 2);
    else if (r.startsWith('gn')) p('nj', 2);
    else if (r.startsWith('qu')) p('k', 2);
    else if (c === 'q') p('k', 1);
    else if (r.startsWith('gu') && 'eiyéèê'.includes(e || ' ')) p('ɡ', 2);
    else if (r.startsWith('ge') && 'aoô'.includes(e || ' ')) p('ʒ', 2);
    else if (r.startsWith('sc') && 'eiyéèê'.includes(e || ' ')) p('s', 2);
    else if (r.startsWith('ss')) p('s', 2);
    else if (r.startsWith('cc')) p('eiyéè'.includes(e || ' ') ? 'ks' : 'k', 2);
    else if (r.startsWith('ill') && C(prev)) p('ij', 3);
    else if (r.startsWith('ill') && V(prev)) p('j', 3);
    else if (r.startsWith('ll')) p('l', 2);
    else if (r === 'ing') p('iŋ', 3);
    else if (/^ti(on|el|al|eu|en)/.test(r) && prev !== 's' && i > 0) p('sj', 2);
    else if (r.startsWith('ex') && i === 0 && (V(e) || e === 'h')) p('ɛɡz', 2);
    // --- lettres simples ---
    else if (c === 'c' || c === 'ç') p(c === 'ç' || 'eiyéèêë'.includes(d || ' ') ? 's' : 'k', 1);
    else if (c === 'g') p('eiyéèê'.includes(d || ' ') ? 'ʒ' : 'ɡ', 1);
    else if (c === 's') p(V(prev) && V(d) ? 'z' : 's', 1);
    else if (c === 'x') p(fin(1) && /[aeo]u$|i$/.test(w.slice(0, i)) ? '' : 'ks', 1);
    else if (c === 'h') p('', 1);
    else if (c === 'j') p('ʒ', 1);
    else if (c === 'r') p('ʁ', 1);
    else if (c === 'y') p(V(prev) || V(d) ? 'j' : 'i', 1);
    else if (c === 'i' || c === 'î' || c === 'ï') p(V(d) && !(d === 'e' && fin(2) && muet) && C(prev) && !(C(w[i - 2]) && 'rl'.includes(prev)) ? 'j' : 'i', 1);
    else if (c === 'u' || c === 'û' || c === 'ù' || c === 'ü') p('y', 1);
    else if ('aàâä'.includes(c)) p('a', 1);
    else if ('oôö'.includes(c)) p(c !== 'ô' && (d === 'r' || (C(d) && C(e) && !fin(2) && !('rl'.includes(e) && 'bcdfgkptv'.includes(d)))) ? 'ɔ' : 'o', 1);
    else if (c === 'é') p('e', 1);
    else if ('èêë'.includes(c)) p('ɛ', 1);
    else if (c === 'e') {
      if (fin(1)) p(muet && n > 2 ? '' : 'ə', 1);
      else if (fin(2) && d === 'r' && n > 3 && !td) p('e', 2);
      else if (fin(2) && (d === 'z' || d === 'd')) p('e', 2);
      else if (fin(2) && d === 't') p('ɛ', 2);
      else if (fin(2) && C(d)) p('ɛ', 1);
      else if (d === 'x') p('ɛ', 1);
      else if (C(d) && d === e) p(i === 0 && 'fs'.includes(d) ? 'e' : d === 's' && w.startsWith('ress') ? 'ə' : 'ɛ', 1);
      else if (C(d) && C(e) && !('rl'.includes(e) && 'bcdfgkptv'.includes(d)) && !/^.(ch|ph|th|gn|qu)/.test(r)) p('ɛ', 1);
      else if (V(d)) p('', 1);
      else p('ə', 1);
    } else if (/[a-z]/.test(c)) p(c, 1);
    else i++;
  }
  return o.replace(/g/g, 'ɡ');
}

/** Élision du « e » caduc entre deux consonnes simples (samedi → samdi), hors première syllabe. */
function caduc(ph) {
  const s = [...ph];
  for (let i = 3; i < s.length - 1; i++) {
    if (s[i] !== 'ə') continue;
    const av = s[i - 2] === '̃' ? s[i - 3] : s[i - 2];
    if (!PHON_VOY.includes(s[i - 1]) && s[i - 1] !== '̃' && PHON_VOY.includes(av) && !PHON_VOY.includes(s[i + 1])) s[i] = '';
  }
  return s.join('');
}

/** Place l'accent tonique (ˈ) devant la dernière voyelle pleine. */
function accent(ph) {
  const s = [...ph];
  let k = -1;
  for (let i = s.length - 1; i >= 0; i--) if (PHON_VOY.includes(s[i]) && (s[i] !== 'ə' || k < 0)) { k = i; if (s[i] !== 'ə') break; }
  if (k < 0) return ph;
  s.splice(k, 0, 'ˈ');
  return s.join('');
}

const epeler = (m) => [...m.toLowerCase()].map((l) => LETTRES[l] || '').filter(Boolean);
const SIGLE_NON = new Set(['non', 'oui', 'eau', 'ami', 'bon', 'mal', 'cas', 'vie', 'fin', 'nom', 'mot', 'peu', 'pas', 'sur', 'par', 'air', 'feu', 'mur', 'fil', 'clé', 'vol', 'jeu', 'loi', 'roi']);

/** Un mot (casse d'origine) → phonèmes avec accent, ou liste de lettres épelées. */
export function motEnPhonemes(brut) {
  const m = brut.toLowerCase();
  const ton = CLITIQUES.has(m) ? (x) => x : accent;
  if (LEXIQUE[m]) return ton(LEXIQUE[m]);
  const sigle = brut.length > 1 && brut === brut.toUpperCase() && /[A-Z]/.test(brut) &&
    (!/[aeiouy]/.test(m) ? brut.length <= 6 : brut.length <= 3 && !SIGLE_NON.has(m) && !CLITIQUES.has(m));
  if (sigle || (m.length === 1 && !'aày'.includes(m)) || (m.length > 1 && !/[aeiouyàâäéèêëîïôöùûüœ]/.test(m))) return epeler(m).map(accent).join(' ');
  return ton(caduc(regles(m)));
}

const ELISION = /^(l|d|j|n|s|m|t|c|qu|jusqu|lorsqu|puisqu|quelqu)'$/;
const ELIDE = { l: 'l', d: 'd', j: 'ʒ', n: 'n', s: 's', m: 'm', t: 't', c: 's', qu: 'k', jusqu: 'ʒysk', lorsqu: 'lɔʁsk', puisqu: 'pyisk', quelqu: 'kɛlk' };

/** Phrase → chaîne de phonèmes (ponctuation conservée), prête à être convertie en identifiants Piper. */
export function phonemiser(texte) {
  let t = texte.normalize('NFC').replace(/[’`]/g, "'").replace(/[«»“”"()[\]{}]/g, ' ').replace(/\.{3}|…/g, '.').replace(/aujourd'hui/gi, 'aujourdhui');
  t = nombresEnMots(t.replace(/(\d)\s*%/g, '$1 pour cent'));
  t = t.replace(/[@%&+=/\\#$€*_|<>~°]/g, (s) => ` ${SYMBOLES[s]} `).replace(/([A-Za-zÀ-ÿ])-(?=[A-Za-zÀ-ÿ])/g, '$1 ').replace(/(^|\s)-+(?=\S)/g, '$1');
  const jetons = t.match(/[A-Za-zÀ-ÿœŒ]+'?|[.,;:!?]/g) || [];
  const out = [];
  for (let k = 0; k < jetons.length; k++) {
    const j = jetons[k];
    if (/^[.,;:!?]$/.test(j)) { if (out.length) out[out.length - 1] = out[out.length - 1].replace(/ $/, '') + j + ' '; continue; }
    const m = j.toLowerCase();
    if (ELISION.test(m)) { out.push(ELIDE[m.slice(0, -1)] || 'k'); continue; }
    let ph = motEnPhonemes(j.replace(/'$/, ''));
    const suiv = jetons[k + 1];
    if (TIRET.has(m)) ph += '-';
    if (LIAISONS[m] && suiv && /^[aeiouyhàâéèêîôûœAEIOUYHÀÂÉÈÊÎÔÛŒ]/.test(suiv) && !/^(h[aiou]|onze|oui|y[aeo])/i.test(suiv)) ph += LIAISONS[m];
    out.push(`${ph} `);
  }
  return out.join('').trim().replace(/\s+/g, ' ').replace(/g/g, 'ɡ').replace(/ɥ/g, 'y').replace(/ɲ/g, 'nj');
}

/**
 * Phonèmes → identifiants Piper : ^ + (phonème, pad)… + $.
 * @param {string} phonemes @param {Record<string, number[]>} carte table phoneme_id_map du modèle
 */
export function phonemesEnIds(phonemes, carte) {
  const ids = [...carte['^'], ...carte['_']];
  for (const p of phonemes.normalize('NFD')) { const v = carte[p]; if (v) ids.push(...v, ...carte['_']); }
  ids.push(...carte['$']);
  return ids;
}
