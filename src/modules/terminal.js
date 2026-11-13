// @ts-check
// terminal.js : révélation progressive pilotée par une position en caractères
// (donc par l'audio, jamais par un Timer indépendant).
// Par rapport à la référence : même API (load, revealTo, total, shown) mais le DOM est « virtualisé » :
// seules les 40 dernières lignes sont montées, pour rester fluide au-delà de 20 000 caractères.
import { bus } from '../state.js';
import { typeLigne } from './timeline.js';

const LONG = 600; // au-delà, un paragraphe est affiché une phrase par ligne (sinon chaque image recalcule tout le paragraphe)

/**
 * Découpe une ligne très longue en morceaux séparés par exactement 1 caractère d'espacement,
 * pour que les positions restent identiques à celles du texte d'origine.
 * @param {string} ligne @returns {string[]}
 */
export function decouper(ligne) {
  if (ligne.length <= LONG) return [ligne];
  const out = [];
  let debut = 0;
  const couper = (fin) => { out.push(ligne.slice(debut, fin)); debut = fin + 1; }; // ligne[fin] est un espace
  for (const m of ligne.matchAll(/[.!?…]["'»)\]]*\s+|\s+/g)) {
    const fin = m.index + m[0].length - 1, phrase = /^[.!?…]/.test(m[0]);
    if (fin + 1 >= ligne.length) break;
    if (phrase ? fin - debut >= 20 : fin - debut >= LONG) couper(fin);
  }
  out.push(ligne.slice(debut));
  return out;
}

export class Terminal {
  constructor(root, dict, matcher, { maxRows = 40 } = {}) {
    this.root = root; this.total = 0; this.shown = 0; this.maxRows = maxRows;
    /** @type {{start:number,end:number,tokens:{t:string,cat:string|null,start:number}[]}[]} */
    this.lines = [];
    /** @type {{el:HTMLElement,spans:HTMLElement[],full:boolean}[]} */
    this.rows = []; // lignes montées, de this.first à this.cur
    this.first = 0; this.cur = -1; this.prompt = '$ ';
    this.colors = {};
    for (const [cat, { couleur }] of Object.entries(dict.categories)) {
      root.style.setProperty(`--kw-${cat}`, couleur);
      this.colors[cat] = couleur;
    }
    this.matcher = matcher;
    this.cursor = document.createElement('span');
    this.cursor.className = 'term-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
  }

  /** Charge le texte. « $ » = commande (prompt + couleur d'accent), « # » = commentaire (atténué), sinon texte + mots-clés. */
  load(text) {
    this.root.textContent = ''; this.lines = []; this.rows = []; this.shown = -1; this.first = 0; this.cur = -1;
    this.prompt = ''; // plus de prompt automatique : seules les lignes « $ » en portent un (écrit dans le texte)
    let pos = 0;
    for (const brute of text.split(/\n/)) {
      const type = typeLigne(brute);
      for (const line of type === 'parle' ? decouper(brute) : [brute]) {
        const start = pos, tokens = [];
        if (type === 'commande') { tokens.push({ t: '$ ', cat: '__prompt', start: pos }, { t: line.slice(2), cat: '__cmd', start: pos + 2 }); pos += line.length; }
        else if (type === 'commentaire') { tokens.push({ t: line, cat: '__com', start: pos }); pos += line.length; }
        else for (const tok of this.matcher(line)) { tokens.push({ t: tok.t, cat: tok.cat, start: pos }); pos += tok.t.length; }
        this.lines.push({ start, end: pos, tokens, type });
        pos += 1; // séparateur (retour à la ligne ou espace entre deux phrases) compté comme 1 caractère
      }
    }
    this.total = pos;
    this.revealTo(0);
  }

  /** Indice de la ligne qui contient la position n (recherche dichotomique). */
  lineAt(n) {
    let a = 0, b = this.lines.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (this.lines[m].start <= n) a = m; else b = m - 1; }
    return a;
  }

  makeRow(i) {
    const line = this.lines[i], el = document.createElement('div'), spans = [];
    el.className = 'term-line';
    for (const tok of line.tokens) {
      const s = document.createElement('span');
      if (tok.cat?.startsWith('__')) s.className = `tk-${tok.cat.slice(2)}`; // prompt, cmd, com
      else if (tok.cat) { s.className = 'kw'; s.style.color = `var(--kw-${tok.cat})`; }
      s.textContent = ''; spans.push(s); el.append(s);
    }
    return { el, spans, full: false };
  }

  fill(i, n) { // affiche la ligne i jusqu'à la position absolue n
    const row = this.rows[i - this.first], line = this.lines[i];
    if (!row) return;
    const full = n >= line.end;
    if (full && row.full) return;
    line.tokens.forEach((tok, k) => {
      const len = Math.max(0, Math.min(tok.t.length, n - tok.start)), s = row.spans[k];
      if (s.textContent.length !== len) s.textContent = tok.t.slice(0, len);
    });
    row.full = full;
  }

  revealTo(n) { // n = nombre de caractères visibles, peut reculer (seek)
    n = Math.max(0, Math.min(this.total, n | 0));
    if (n === this.shown || !this.lines.length) return;
    const li = this.lineAt(n), first = Math.max(0, li - this.maxRows + 1);
    if (li < this.cur || first > this.cur + 1 || this.cur < 0) {
      // recul ou grand saut : on reconstruit la fenêtre visible (40 lignes au plus)
      this.root.textContent = ''; this.rows = []; this.first = first; this.cur = first - 1;
    }
    while (this.cur < li) { // avance : termine la ligne courante puis monte les suivantes
      if (this.cur >= this.first) this.fill(this.cur, Infinity);
      this.cur++;
      const row = this.makeRow(this.cur); this.rows.push(row); this.root.append(row.el);
      bus.emit('terminal:line', { index: this.cur });
    }
    while (this.first < first) { this.rows.shift().el.remove(); this.first++; } // démonte les lignes trop anciennes
    this.fill(li, n);
    this.rows[li - this.first].el.append(this.cursor);
    this.shown = n;
    this.root.scrollTop = this.root.scrollHeight;
  }
}
