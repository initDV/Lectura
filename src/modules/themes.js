// @ts-check
// Thèmes et polices du terminal.
export const THEMES = {
  // prompt = « $ », cmd = texte d'une commande (accent éclairci pour rester lisible), com = commentaire (atténué), bord = bordure
  sombre: { nom: 'Sombre', bg: '#13131a', bar: '#13131a', fg: '#b0b0b8', prompt: '#9b45e0', cmd: '#c08cf5', com: '#8a8a98', bord: '#2a2a35' },
  matrix: { nom: 'Matrix', bg: '#020a03', bar: '#06150a', fg: '#8dff98', prompt: '#39ff14', cmd: '#d4ffd8', com: '#4f9a58', bord: '#12351a' },
  ambre: { nom: 'Ambre', bg: '#140d02', bar: '#231704', fg: '#ffc66b', prompt: '#ff9f43', cmd: '#ffe2b0', com: '#a37a3c', bord: '#3a2708' },
  ocean: { nom: 'Océan', bg: '#06121f', bar: '#0b1c2e', fg: '#d6e8ff', prompt: '#4f8cff', cmd: '#a9c8ff', com: '#6f87a6', bord: '#16304d' },
};
export const POLICES = {
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  Système: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace',
};
export const themeOf = (nom) => THEMES[nom] || THEMES.sombre;
export const fontOf = (nom) => POLICES[nom] || POLICES['JetBrains Mono'];

/** Applique le thème du projet à la fenêtre de terminal (variables CSS, via CSSOM : compatible CSP). */
export function applyTheme(el, terminal) {
  const th = themeOf(terminal.theme);
  el.style.setProperty('--term-bg', th.bg);
  el.style.setProperty('--term-bar', th.bar);
  el.style.setProperty('--term-fg', th.fg);
  el.style.setProperty('--term-prompt', th.prompt);
  el.style.setProperty('--term-cmd', th.cmd);
  el.style.setProperty('--term-com', th.com);
  el.style.setProperty('--term-bord', th.bord);
  el.style.setProperty('--term-size', `${terminal.taille}px`);
  el.style.setProperty('--term-font', fontOf(terminal.police));
}
