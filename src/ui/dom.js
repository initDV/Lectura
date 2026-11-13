// @ts-check
// dom.js : petites aides DOM. Tout texte passe par textContent / nœuds texte : jamais de innerHTML.

/**
 * Crée un élément. props : class, text, dataset, on<Event>, propriétés (value, checked…) ou attributs.
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} kids
 * @returns {any}
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !k.startsWith('aria') && k !== 'role' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...kids.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  return el;
}

export const clear = (el) => { el.textContent = ''; return el; };

/** Ajoute des enfants en ignorant null / undefined / false (comme h). */
export const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); return el; };

let compteur = 0;
/** Identifiant unique pour relier <label for> et champ. */
export const uid = (p = 'c') => `${p}-${++compteur}`;

/** Champ avec étiquette (et aide facultative). `champ` reçoit l'id. */
export function field(label, champ, aide) {
  const id = champ.id || uid('champ');
  champ.id = id;
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), champ, aide ? h('span', { class: 'hint', text: aide }) : null);
}

/** Ouvre le sélecteur de fichier du système. Renvoie le fichier choisi (ou null si annulé). */
export function pickFile(accept) {
  return new Promise((res) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => { res(input.files?.[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { res(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Copie un texte dans le presse-papiers (avec repli pour les contextes sans API Clipboard). */
export async function copyText(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const ta = h('textarea', { value: texte, readOnly: true, class: 'sr-only' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Limite la fréquence d'appel d'une fonction (pour la saisie). */
export function debounce(fn, ms = 250) {
  let timer = 0;
  return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
}
