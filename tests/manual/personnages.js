// Test manuel : affiche chaque personnage (SVG animé + rendu canvas par sérialisation du SVG, comme l'export vidéo). Ouvrir tests/manual/personnages.html
// Paramètres d'URL : ?expr=content  ?force=1  ?mix=surpris&poids=0.4  ?parle=1  ?fige=1 (temps fixe, pour les captures)
//                    ?toutes=1 : toutes les expressions d'un seul personnage (?perso=robot_lectura)
//                    ?geste=coucou|hoche|secoue|sursaut|bras (&depuis=500 : millisecondes écoulées, avec ?fige=1)
import { loadCharacters, loadCharacterSvg } from '../../src/modules/character-loader.js';
import { RIG_AICHA } from '../../src/modules/character-spec.js';
import { planAicha, poseAicha } from '../../src/modules/aicha/motion.js';
import { boucheA, planBouche } from '../../src/modules/aicha/mouth.js';
import { rigAicha } from '../../src/modules/aicha/rig.js';
import { Character } from '../../src/modules/character.js';
import { NOMS } from '../../src/modules/expressions.js';
import { SvgFrame, drawSvgImage } from '../../src/modules/svgframe.js';

const q = new URLSearchParams(location.search), planche = document.getElementById('planche');
const persos = [], tous = await loadCharacters();
const cases = q.get('toutes')
  ? NOMS.map((expr) => ({ def: tous.find((d) => d.id === (q.get('perso') || 'robot_lectura')) || tous[0], expr, titre: expr }))
  : tous.map((def) => ({ def, expr: q.get('expr') || 'neutre', titre: `${def.nom}` }));
const voix = [{ texte: 'Bonjour Lectura !', debutMs: 0, finMs: 3000 }];
const pistes = planBouche(voix, 'fr'), lecture = planAicha(voix, 3000), repos = planAicha([], 0);
function isoler(svg, prefixe) {
  for (const n of svg.querySelectorAll('[id]')) n.id = prefixe + n.id;
  for (const n of svg.querySelectorAll('[href],[clip-path]')) {
    for (const k of ['href', 'clip-path']) if (n.hasAttribute(k)) n.setAttribute(k, n.getAttribute(k).replace('#', `#${prefixe}`));
  }
}
for (const [index, { def, expr, titre }] of cases.entries()) {
  const fig = document.createElement('figure'), duo = document.createElement('div'), cap = document.createElement('figcaption');
  duo.className = 'duo'; cap.textContent = titre;
  fig.append(duo, cap); planche.append(fig);
  try {
    const svg = await loadCharacterSvg(def);
    svg.removeAttribute('id'); // plusieurs personnages dans la même page
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 300;
    const aicha = def.rig === RIG_AICHA;
    let tick;
    if (aicha) {
      const rig = rigAicha(svg), monture = !!svg.querySelector('#lunettes *'), parle = q.has('parle');
      tick = (t) => rig.draw(poseAicha(parle ? lecture : repos, parle ? t % 3000 : 0,
        { attente: parle ? 0 : t, expression: expr, bouche: boucheA(t % 3000, pistes, +parle), monture }), t / 1000);
    } else {
      const c = new Character(svg, def);
      c.setExpression(expr, +(q.get('force') || 1), q.get('mix') || '', +(q.get('poids') || 0));
      c.setTalking(q.get('parle') ? 1 : 0.15); c.setViseme(q.get('parle') ? 2 : 0);
      if (q.get('fige')) { c.nextBlink = Infinity; c.nextCoup = Infinity; c.phase = 1.2; }
      if (q.get('geste')) c.gesture(q.get('fige') ? 1234 - +(q.get('depuis') || 500) : performance.now(), q.get('geste'));
      tick = (t) => c.tick(t);
    }
    isoler(svg, `ref${index}-`); duo.append(svg, canvas);
    const vb = svg.viewBox.baseVal, k = Math.min(canvas.width / vb.width, canvas.height / vb.height);
    persos.push({ tick, vb, w: k * vb.width, h: k * vb.height, aicha, frame: new SvgFrame(svg), ctx: canvas.getContext('2d') });
  } catch (err) {
    cap.textContent = err.message; cap.className = 'err';
  }
}
function frame(t) {
  if (q.get('fige')) t = 1234;
  for (const { tick, frame, ctx, vb, w, h, aicha } of persos) {
    tick(t);
    frame.update();
    ctx.clearRect(0, 0, 120, 300);
    if (frame.image) drawSvgImage(ctx, frame.image, vb, (120 - w) / 2, (300 - h) * (aicha ? .5 : 1), w, h);
  }
  document.body.dataset.pret = '1';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
