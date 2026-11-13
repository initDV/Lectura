// Test manuel : affiche chaque personnage (SVG animé + rendu canvas par sérialisation du SVG, comme l'export vidéo). Ouvrir tests/manual/personnages.html
// Paramètres d'URL : ?expr=content  ?parle=1  ?fige=1 (temps fixe, pour les captures)
import { loadCharacters, loadCharacterSvg } from '../../src/modules/character-loader.js';
import { Character } from '../../src/modules/character.js';
import { SvgFrame } from '../../src/modules/svgframe.js';

const q = new URLSearchParams(location.search), planche = document.getElementById('planche');
const persos = [];
for (const def of await loadCharacters()) {
  const fig = document.createElement('figure'), duo = document.createElement('div'), cap = document.createElement('figcaption');
  duo.className = 'duo'; cap.textContent = `${def.nom}${def.pro ? ' (Pro)' : ''}`;
  fig.append(duo, cap); planche.append(fig);
  try {
    const svg = await loadCharacterSvg(def);
    svg.removeAttribute('id'); // plusieurs personnages dans la même page
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 300;
    duo.append(svg, canvas);
    const c = new Character(svg, def);
    c.setExpression(q.get('expr') || 'neutre'); c.setTalking(q.get('parle') ? 1 : 0.15); c.setViseme(q.get('parle') ? 2 : 0);
    if (q.get('riche')) c.setRich(true);
    persos.push({ c, frame: new SvgFrame(svg), ctx: canvas.getContext('2d') });
  } catch (err) {
    cap.textContent = err.message; cap.className = 'err';
  }
}
function frame(t) {
  if (q.get('fige')) t = 1234;
  for (const { c, frame, ctx } of persos) {
    c.blinkUntil = 0; c.nextBlink = Infinity; c.tick(t);
    frame.update();
    ctx.clearRect(0, 0, 120, 300);
    if (frame.image) ctx.drawImage(frame.image, 0, 0, 120, 300);
  }
  document.body.dataset.pret = '1';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
