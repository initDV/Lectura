// @ts-check
// Thèmes et polices du terminal (personnalisation = Pro ; « sombre » + JetBrains Mono = gratuit).
export const THEMES = {
  sombre: { nom: 'Sombre', bg: '#0d1117', bar: '#161c24', fg: '#e6edf3', prompt: '#4fd8e8' },
  matrix: { nom: 'Matrix', bg: '#020a03', bar: '#06150a', fg: '#8dff98', prompt: '#39ff14' },
  ambre: { nom: 'Ambre', bg: '#140d02', bar: '#231704', fg: '#ffc66b', prompt: '#ff9f43' },
  ocean: { nom: 'Océan', bg: '#06121f', bar: '#0b1c2e', fg: '#d6e8ff', prompt: '#4f8cff' },
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
  el.style.setProperty('--term-size', `${terminal.taille}px`);
  el.style.setProperty('--term-font', fontOf(terminal.police));
}
