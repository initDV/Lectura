// Pure animation code shared with the PWA. This is a tree of local SVG shapes,
// not a browser DOM: no HTML, CSS layout, document loader, URL or OS bindings.
import { Character } from '../../src/modules/character.js';
import { planRobot, poseRobot } from '../../src/modules/robot-motion.js';
import { rigRobot } from '../../src/modules/robot-stage.js';
import { planAicha, poseAicha } from '../../src/modules/aicha/motion.js';
import { rigAicha } from '../../src/modules/aicha/rig.js';
import { boucheA, planBouche, REPOS_BOUCHE } from '../../src/modules/aicha/mouth.js';
import { Timeline } from '../../src/modules/timeline.js';
import { bound, HORIZON, smooth, SOL } from '../../src/modules/aicha/math.js';
import { dalles } from '../../src/modules/aicha/decor.js';
import { compilerLexique } from '../../src/modules/sentiment.js';
import { creerHumeur } from '../../src/modules/humeur.js';
import { buildMatcher, mergeDicts } from '../../src/modules/keywords.js';
import sentiments from '../../data/sentiments_fr.json';
import sentimentsEn from '../../data/sentiments_en.json';
import keywords from '../../data/keywords_fr.json';
import keywordsEn from '../../data/keywords_en.json';
import extended from '../../data/keywords_fr_extended.json';

const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function matches(n, s) {
  if (s === '[id]') return n.getAttribute('id') !== null;
  if (s === '[id^="forearm"]') return n.id.startsWith('forearm');
  if (s === 'circle:not([id])') return n.localName === 'circle' && n.getAttribute('id') === null;
  const [tag, id] = s.split('#');
  return (!tag || n.localName === tag) && (id === undefined || n.id === id);
}
class Shape {
  constructor([name, attributes = {}, children = []]) {
    this.localName = this.tagName = name;
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentNode = null;
    this.append(...children.map((child) => new Shape(child)));
  }
  get id() { return this.getAttribute('id') || ''; }
  get firstElementChild() { return this.children[0] || null; }
  get previousElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) - 1] || null; }
  get ownerDocument() { return factory; }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  setAttribute(key, val) { this.attributes.set(key, String(val)); }
  removeAttribute(key) { this.attributes.delete(key); }
  insertBefore(child, next) {
    if (child === next) return;
    const siblings = child.parentNode?.children;
    if (siblings) siblings.splice(siblings.indexOf(child), 1);
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, child);
    child.parentNode = this;
  }
  append(...nodes) { for (const n of nodes) this.insertBefore(n, null); }
  before(...nodes) { for (const n of nodes) this.parentNode.insertBefore(n, this); }
  after(...nodes) {
    const p = this.parentNode, next = p.children.slice(p.children.indexOf(this) + 1).find((n) => !nodes.includes(n));
    for (const n of nodes) p.insertBefore(n, next);
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  *walk() { for (const n of this.children) { yield n; yield* n.walk(); } }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const out = new Set();
    for (const s of selector.split(/,\s*/)) {
      if (s.startsWith(':scope > ')) {
        let groups = [this];
        for (const part of s.split(' > ').slice(1)) groups = groups.flatMap((n) => n.children.filter((c) => matches(c, part)));
        for (const n of groups) out.add(n);
      } else if (s.includes(' ~ ')) {
        const [a, b] = s.split(' ~ ');
        for (const n of this.walk()) if (matches(n, a)) {
          const siblings = n.parentNode.children;
          for (const c of siblings.slice(siblings.indexOf(n) + 1)) if (matches(c, b)) out.add(c);
        }
      } else for (const n of this.walk()) if (matches(n, s)) out.add(n);
    }
    return [...out];
  }
  xml() {
    const attrs = [...this.attributes].map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
    const tag = this.localName;
    return this.children.length ? `<${tag}${attrs}>${this.children.map((n) => n.xml()).join('')}</${tag}>` : `<${tag}${attrs}/>`;
  }
}
const factory = Object.freeze({ createElementNS: (_ns, name) => new Shape([name]) });
// The robot rig asks for a shape factory when it groups limbs, not for a window.
globalThis.document = factory;

const resources = {
  fr: { lexique: compilerLexique(sentiments), matcher: buildMatcher(mergeDicts(keywords, extended)) },
  en: { lexique: compilerLexique(sentimentsEn), matcher: buildMatcher(mergeDicts(keywordsEn, extended)) },
};
let scene;
export function configure(treeJson, definitionJson, trackJson) {
  const root = new Shape(JSON.parse(treeJson)), def = JSON.parse(definitionJson);
  const { text, segments, duration, siwis, lang, gain, emotions } = JSON.parse(trackJson);
  const timeline = new Timeline(text, segments);
  const humeur = creerHumeur({ ...resources[lang === 'en' ? 'en' : 'fr'], actif: emotions });
  if (def.rig === 'aicha') {
    const rig = rigAicha(root, def.appuiHanche), glasses = !!root.querySelector('#lunettes')?.children.length;
    const plan = planAicha(timeline.segs, duration, { emotions, humeur, texte: text }), lips = planBouche(segments, lang, siwis);
    const rest = planAicha([], 0);
    scene = { root, timeline, animate(ms, level, reduced, idle) {
      const t = ms < 0 ? 0 : ms, wait = reduced ? 0 : idle;
      const mouth = ms < 0 ? REPOS_BOUCHE : boucheA(t, lips, level);
      const pose = poseAicha(ms < 0 ? rest : plan, t, { gain, reduit: reduced, bouche: mouth, attente: wait, monture: glasses });
      rig.draw(pose, reduced ? 0 : (t + wait) / 1000);
      return pose.avance;
    } };
  } else {
    const rig = def.id === 'robot_lectura' ? rigRobot(root) : null;
    const plan = rig && emotions && duration ? planRobot(segments, duration) : null;
    rig?.plan(plan);
    const robot = new Character(root, def);
    // Recompute from the media time (including blinks); seeking doesn't replay random gestures.
    robot.nextBlink = robot.nextCoup = robot.nextParasite = Infinity;
    scene = { root, timeline, animate(ms, level, reduced, idle) {
      const t = Math.max(0, ms), now = t + idle, part = timeline.segmentAt(t);
      const speaking = ms >= 0 && part?.type === 'parle' && t < (part.speechEndMs ?? part.finMs);
      const pose = !reduced && ms >= 0 && plan ? poseRobot(plan, t) : null;
      const mood = ms >= 0 && part && (emotions || part.expression !== 'auto') ? humeur.etat(part, timeline.charAt(t) - part.start) : null;
      robot.setExpression(mood?.expr || 'neutre', mood?.force, mood?.mix, mood?.poids);
      robot.setReduced(reduced); robot.setGain(reduced ? 0 : gain);
      robot.dernier = 0;
      robot.phase = reduced ? 0 : now / 1000 * robot.mp.vitesse;
      robot.blinkUntil = !reduced && now % 3720 >= 3600 ? now + 1 : 0;
      robot.setTalking(speaking ? level : 0); robot.talkLisse = robot.talk;
      robot.setViseme(speaking ? Math.round(3 * level) : 0, text.slice(timeline.charAt(t), timeline.charAt(t) + 2));
      robot.tick(now, pose, !speaking || level < .025); rig?.paint(pose);
      return 0;
    } };
  }
}

export function frame(ms, level, reduced, idle) {
  if (!scene) throw new Error('Animation non initialisée');
  const advance = scene.animate(ms, bound(level), reduced, idle);
  return JSON.stringify({ svg: scene.root.xml(), advance, chars: ms < 0 ? 0 : scene.timeline.charAt(ms) });
}

// Same projection math as the Web corridor, consumed by the native painter.
export function corridor(bottom, advance) {
  return JSON.stringify({ horizon: HORIZON, floor: SOL, tiles: Array.from(dalles(bottom, advance),
    ({ n, k, y }) => [n, k, y, smooth(.32, .93, k), .57 * (1 - smooth(1.19, 1.65, k))]) });
}
