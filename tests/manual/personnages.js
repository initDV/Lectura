// Test manuel : affiche chaque personnage (SVG animé + rendu canvas). Ouvrir tests/manual/personnages.html
// Paramètres d'URL : ?expr=content  ?parle=1  ?fige=1 (temps fixe, pour les captures)
import { loadCharacters, loadCharacterSvg } from '../../src/modules/character-loader.js';
import { Character } from '../../src/modules/character.js';
import { drawSvg } from '../../src/modules/svgcanvas.js';
import { drawCharacter } from '../../src/modules/recorder.js';

const q = new URLSearchParams(location.search), planche = document.getElementById('planche');
const persos = [];
for (const def of await loadCharacters()) {
  const fig = document.createElement('figure'), duo = document.createElement('div'), cap = document.createElement('figcaption');
  duo.className = 'duo'; cap.textContent = `${def.nom}${def.pro ? ' (Pro)' : ''}`;
  fig.append(duo, cap); planche.append(fig);
  try {
    const svg = await loadCharacterSvg(def);
    svg.removeAttribute('id'); // plusieurs personnages dans la même page
    const canvas = document.createElement('canvas'); canvas.width = 210; canvas.height = 280;
    duo.append(svg, canvas);
    const c = new Character(svg, def);
    c.setExpression(q.get('expr') || 'neutre'); c.setTalking(q.get('parle') ? 1 : 0.15); c.setViseme(q.get('parle') ? 2 : 0);
    if (q.get('riche')) c.setRich(true);
    persos.push({ c, def, svg, ctx: canvas.getContext('2d') });
  } catch (err) {
    cap.textContent = err.message; cap.className = 'err';
  }
}
function frame(t) {
  if (q.get('fige')) t = 1234;
  for (const { c, def, svg, ctx } of persos) {
    c.blinkUntil = 0; c.nextBlink = Infinity; c.talkS = c.talk; c.tick(t);
    ctx.clearRect(0, 0, 210, 280);
    if (def.renduCanvas === 'pose') drawCharacter(ctx, 0, 0, 0.7, c.getPose(), def.couleurCorps, def.couleurAccent);
    else drawSvg(ctx, svg, 0, 0, 0.7);
  }
  document.body.dataset.pret = '1';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
