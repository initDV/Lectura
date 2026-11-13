// @ts-check
// icons.js : icônes maison (tracés simples 24x24, trait rond), aucune ressource externe.
const NS = 'http://www.w3.org/2000/svg';
const TRACES = {
  home: 'M3 11l9-7 9 7 M5 10v10h14V10',
  menu: 'M12 5v.5 M12 12v.5 M12 19v.5',
  chevron: 'M6 9l6 6 6-6',
  minus: 'M6 12h12',
  voice: 'M12 4v16 M8 8v8 M4 10.5v3 M16 7v10 M20 10.5v3',
  'eye-off': 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z M4 4l16 16',
  settings: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M16 4v4 M10 10v4 M18 16v4',
  star: 'M12 3l2.7 5.6 6.3.9-4.5 4.3 1 6.2L12 17l-5.5 3 1-6.2L3 9.5l6.3-.9z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5v.5',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  rewind: 'M11 5L3 12l8 7z M21 5l-8 7 8 7z',
  forward: 'M13 5l8 7-8 7z M3 5l8 7-8 7z',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  record: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  stop: 'M6 6h12v12H6z',
  fullscreen: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  present: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  download: 'M12 4v11 M7 11l5 5 5-5 M4 20h16',
  upload: 'M12 16V5 M7 9l5-5 5 5 M4 20h16',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5 9-10',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
  x: 'M6 6l12 12 M18 6L6 18',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 14c1 1.5 2.5 2 4 2s3-.5 4-2 M9 9.5v.5 M15 9.5v.5',
  sparkle: 'M12 3v6 M12 15v6 M3 12h6 M15 12h6',
};

/** @param {keyof typeof TRACES} nom @returns {SVGSVGElement} */
export function icon(nom) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', TRACES[nom] || TRACES.info);
  svg.append(p);
  return svg;
}
