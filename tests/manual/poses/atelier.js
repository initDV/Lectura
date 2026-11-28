import { loadCharacters, loadCharacterSvg } from './src/modules/character-loader.js';
import { planAicha, poseAicha } from './src/modules/aicha/motion.js';
import { rigAicha } from './src/modules/aicha/rig.js';
import { boucheA, planBouche, REPOS_BOUCHE } from './src/modules/aicha/mouth.js';
import { VISAGES } from './src/modules/aicha/visages.js';
import { Timeline } from './src/modules/timeline.js';
import fr from './src/i18n/fr.js';

const $ = id => document.getElementById(id);
const portrait = $('portrait'), jouer = $('play'), barre = $('time'), time = $('clock');
const select = $('character'), gain = $('motion'), vitesse = $('speed'), repere = $('mark'), zoom = $('zoom');
const repos = planAicha([], 0), controleVisage = $('expression'), enParlant = $('parole');
const replique = { texte: 'Je peux te montrer le chemin.', debutMs: 360, finMs: 2320 };
const demonstration = { paroles: [{ start: .36, end: 2.32 }], lips: planBouche([replique], 'fr') };
const texteVirage = 'J’ai cru que tu ne viendrais pas… mais te voilà !';
const segsVirage = [{ texte: 'J’ai cru que tu ne viendrais pas…', debutMs: 0, finMs: 2440, speechEndMs: 2000 },
  { texte: 'mais te voilà !', debutMs: 2440, finMs: 4000, speechEndMs: 3770 }];
const virage = { texte: texteVirage, nom: 'Inquiétude → joie', max: 4000, mark: 1420,
  desc: 'La lectrice commence inquiète. Au silence, elle relève les yeux ; le sourire arrive sur « te voilà ». Change de lectrice pour comparer au même repère.',
  lips: planBouche(segsVirage, 'fr'), plan: planAicha(new Timeline(texteVirage, segsVirage).segs, 4000, { texte: texteVirage }) };
const vedettes = {
  neutre: ['Neutre', 'Le visage de référence : compare les sourcils, les yeux et le contour de la bouche.'],
  content: ['Joie', 'Les commissures remontent, les joues se soulèvent et les yeux sourient aussi.'],
  colere: ['Colère', 'Les sourcils se rapprochent et s’abaissent vers le nez. Les paupières et les lèvres se resserrent.'],
  triste: ['Tristesse', 'Le regard s’abaisse, le haut des sourcils se soulève au centre et les commissures retombent.'],
  surpris: ['Surprise', 'Les yeux s’ouvrent, les sourcils montent et la bouche s’arrondit.'],
  peur: ['Peur', 'Les yeux s’ouvrent aussi, mais les sourcils se rapprochent et la bouche s’étire.'],
  degoute: ['Dégoût', 'Une moitié du visage se crispe davantage : le nez et les lèvres se plissent.'],
  sceptique: ['Scepticisme', 'Un sourcil se lève plus que l’autre et le regard part de côté.'],
};
const nomsVisages = Object.keys(VISAGES);
const nomVisage = id => vedettes[id]?.[0] || fr['expr.' + id] || id;
for (const id of nomsVisages) {
  const option = document.createElement('option'); option.value = id; option.textContent = nomVisage(id); controleVisage.append(option);
}
const palette = Object.entries(vedettes).map(([id, [nom]]) => {
  const bouton = document.createElement('button'); bouton.type = 'button'; bouton.textContent = nom;
  bouton.addEventListener('click', () => choisirVisage(id)); $('palette').append(bouton);
  return [id, bouton];
});
const parole = (texte, kind, u) => {
  const segments = [{ texte, debutMs: 200, finMs: 2650, speechEndMs: 2210 }];
  const plan = planAicha(segments, 2650), cue = plan.cues.find(c => c.kind === kind && c.hand);
  if (!cue) throw new Error(`Pas de repère pour ${kind}`);
  return { plan, texte, lips: planBouche(segments, 'fr'), max: 2650, mark: 1000 * (cue.start + u * (cue.end - cue.start)) };
};
const poses = [
  { famille: 'Repos', nom: 'Main sur la hanche', desc: 'Le coude se détend et le pouce se replie. La paume suit le vêtement de la lectrice ; une ombre apparaît au contact.',
    debut: 11750, max: 5450, mark: 2250 },
  { famille: 'Explication', nom: 'Présenter une idée', desc: 'Le regard ouvre le geste. Une paume présente l’idée, l’autre main sert d’appui à la hanche.',
    ...parole('Voici le détail qui change tout.', 'illustre', .48) },
  { famille: 'Explication', nom: 'Mettre en balance', desc: 'Les mains n’arrivent pas ensemble. Les yeux passent à la seconde option avant que le buste la suive.',
    ...parole('Deux options : le temps ou le détail.', 'compare', .51) },
  { famille: 'Attente', nom: 'Petit geste parasite', desc: monture => monture ? 'Pendant un silence, la main remonte à la monture, la replace et redescend.'
    : 'Sans lunettes, la main lisse le tissu sur le côté de la cuisse, puis redescend.', debut: 2400, max: 2750, mark: 1380 },
  { famille: 'Divertissement', nom: 'Se réjouir', desc: 'Une légère flexion des jambes prépare l’ouverture. Les mains se lèvent à des hauteurs différentes, avec un sourire.',
    ...parole('Et voilà ! On a réussi.', 'rejouit', .48) },
];

let choix = 0, ms = 0, rig, cadreComplet, monture = false, lecture = null, chargement = 0;
let vue = 'gestes', planVisage;
const zoomParMode = { gestes: false, visages: true, replique: true };
const etude = () => vue === 'replique' ? virage : vue === 'visages' ? planVisage : poses[choix];
function choisirVisage(id) {
  controleVisage.value = id;
  palette.forEach(([nom, bouton]) => bouton.setAttribute('aria-pressed', String(nom === id)));
  planVisage = { max: 2640, mark: 1520, nom: nomVisage(id), desc: vedettes[id]?.[1] || 'Observe comment le regard, les sourcils et les lèvres changent ensemble.',
    plan: { ...repos, duration: 2.64, visages: [{ start: .16, end: 2.5, face: id, force: 1 }] } };
  if (vue === 'visages') actualiser();
}
function mode(etape) {
  vue = etape;
  for (const id of Object.keys(zoomParMode)) {
    $(id).hidden = id !== vue;
    $('mode-' + id).setAttribute('aria-pressed', String(id === vue));
  }
  document.querySelector('.workspace').classList.toggle('is-face', vue !== 'gestes');
  barre.setAttribute('aria-label', vue === 'replique' ? 'Position dans la réplique' : vue === 'visages' ? 'Position dans l’expression' : 'Position dans le geste');
  zoom.setAttribute('aria-pressed', String(zoomParMode[vue]));
  actualiser();
}
function cadrer() {
  const detail = vue !== 'gestes' ? '-39 -34 78 69' : choix === 3 && monture ? '-59 -37 118 113' : choix === 0 ? '-65 36 142 91' : '-82 28 164 98';
  portrait.firstElementChild?.setAttribute('viewBox', zoom.getAttribute('aria-pressed') === 'true' ? detail : cadreComplet);
}
const secondes = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const boutons = poses.map(({ nom }, index) => {
  const b = document.createElement('button');
  b.type = 'button';
  for (const [classe, txt] of [['id', `0${index + 1}`], ['nom', nom], ['arrow', '→']]) {
    const el = document.createElement('span'); el.className = classe; el.textContent = txt;
    if (classe !== 'nom') el.setAttribute('aria-hidden', 'true');
    b.append(el);
  }
  b.addEventListener('click', () => choisir(index));
  $('repertoire').append(b);
  return b;
});

function image(t) {
  const pose = etude(), attente = pose.debut === undefined ? 0 : pose.debut + t;
  const voix = vue === 'visages' && enParlant.checked;
  const plan = voix ? { ...pose.plan, paroles: demonstration.paroles } : pose.plan || repos;
  const lips = voix ? demonstration.lips : pose.lips;
  const mouvement = Number(gain.value);
  ms = t; barre.value = String(t);
  time.textContent = `${secondes.format(t / 1000)} / ${secondes.format(pose.max / 1000)} s`;
  for (const b of jalons) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.time) - t) < 6));
  if (!rig) return;
  const frame = poseAicha(plan, pose.plan ? t : 0, { attente, monture, gain: vue === 'gestes' ? mouvement : 0, reduit: !mouvement,
    expression: vue === 'visages' && !mouvement ? controleVisage.value : '', bouche: lips ? boucheA(t, lips) : REPOS_BOUCHE });
  rig.draw(frame, mouvement ? (attente || t) / 1000 : 0);
}

function arreter() {
  if (lecture) cancelAnimationFrame(lecture.id);
  lecture = null; delete jouer.dataset.playing;
  jouer.querySelector('span').textContent = 'Jouer';
  $('state').textContent = Math.abs(ms - etude().mark) <= 5 ? 'Pose repère' : 'En pause';
}

function details() {
  const { desc } = etude(), texte = vue === 'visages' && enParlant.checked ? replique.texte : etude().texte;
  $('direction').textContent = typeof desc === 'function' ? desc(monture) : desc;
  $('line').hidden = !texte;
  $('line').textContent = texte ? `« ${texte} »` : '';
}

function actualiser() {
  const pose = etude();
  $('scene-number').textContent = vue === 'replique' ? 'R' : vue === 'visages' ? 'V' : `0${choix + 1}`;
  $('scene-family').textContent = vue === 'gestes' ? pose.famille : pose.nom;
  barre.max = String(pose.max); cadrer(); details(); image(pose.mark);
  arreter();
}
function choisir(index) {
  choix = index;
  boutons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  actualiser();
}

function jouerPose() {
  if (lecture) { arreter(); return; }
  if (!rig) return;
  const pose = etude(), debut = Math.abs(ms - pose.mark) <= 5 || ms >= pose.max ? 0 : ms;
  const etat = lecture = { t0: performance.now(), ms: debut, id: 0 };
  jouer.dataset.playing = '';
  jouer.querySelector('span').textContent = 'Pause';
  $('state').textContent = 'En lecture';
  image(debut);
  const tic = maintenant => {
    if (lecture !== etat) return;
    // ~30 i/s, avec toujours la même pose quand on revient au même instant.
    const t = Math.min(pose.max, etat.ms + Math.floor((maintenant - etat.t0) * Number(vitesse.value) / 33) * 33);
    if (t !== ms) image(t);
    if (t >= pose.max) arreter();
    else etat.id = requestAnimationFrame(tic);
  };
  etat.id = requestAnimationFrame(tic);
}

async function distribuer(def) {
  const cle = ++chargement;
  arreter(); jouer.disabled = true; barre.disabled = true; repere.disabled = true; zoom.disabled = true;
  $('message').textContent = '';
  try {
    const dessin = await loadCharacterSvg(def);
    if (cle !== chargement) return;
    rig = rigAicha(dessin, def.appuiHanche); monture = !!dessin.querySelector('#lunettes *');
    cadreComplet = dessin.getAttribute('viewBox');
    portrait.replaceChildren(dessin);
    $('name').textContent = def.nom;
    jouer.disabled = false; barre.disabled = false; repere.disabled = false; zoom.disabled = false;
    cadrer(); details(); image(ms);
  } catch (err) {
    if (cle === chargement) $('message').textContent = `Impossible d’afficher ${def.nom} : ${err.message}`;
  }
}

jouer.addEventListener('click', jouerPose);
barre.addEventListener('input', () => { image(Number(barre.value)); arreter(); });
repere.addEventListener('click', () => { image(etude().mark); arreter(); });
for (const id of Object.keys(zoomParMode)) $('mode-' + id).addEventListener('click', () => mode(id));
const jalons = [...$('replique').querySelectorAll('[data-time]')];
for (const b of jalons) b.addEventListener('click', () => { image(Number(b.dataset.time)); arreter(); });
controleVisage.addEventListener('change', () => choisirVisage(controleVisage.value));
enParlant.addEventListener('change', actualiser);
zoom.addEventListener('click', () => {
  zoomParMode[vue] = zoom.getAttribute('aria-pressed') !== 'true';
  zoom.setAttribute('aria-pressed', String(zoomParMode[vue]));
  cadrer();
});
gain.addEventListener('change', () => { arreter(); image(ms); });
vitesse.addEventListener('change', () => { if (lecture) { lecture.t0 = performance.now(); lecture.ms = ms; } });
const prefereReduit = matchMedia('(prefers-reduced-motion: reduce)');
if (prefereReduit.matches) gain.value = '0';
prefereReduit.addEventListener('change', ({ matches }) => { gain.value = matches ? '0' : '1'; arreter(); image(ms); });
const params = new URLSearchParams(location.search), demandé = params.get('expression');
choisirVisage(nomsVisages.includes(demandé) ? demandé : 'content');
choisir(0);
if (params.has('replique')) mode('replique');
else if (nomsVisages.includes(demandé)) mode('visages');

try {
  const lectrices = (await loadCharacters()).filter(c => c.rig === 'aicha');
  if (!lectrices.length) throw new Error('Aucune lectrice disponible');
  for (const l of lectrices) {
    const option = document.createElement('option'); option.value = l.id; option.textContent = l.nom; select.append(option);
  }
  select.disabled = false;
  select.addEventListener('change', () => distribuer(lectrices.find(l => l.id === select.value)));
  await distribuer(lectrices[0]);
} catch (err) {
  $('message').textContent = err.message;
}
