// @ts-check
// Écran Scène : personnage (35 %) + terminal (65 %). Le texte suit TOUJOURS le temps de la source audio.
import { bus, store } from '../state.js';
import { h, clear } from './dom.js';
import { t, taille } from '../modules/i18n.js';
import { transition, majReglages } from '../app.js';
import { go } from '../router.js';
import { AudioEngine } from '../modules/audio.js';
import { prepare } from '../modules/prepare.js';
import { Character, EXPRESSIONS } from '../modules/character.js';
import { Terminal } from '../modules/terminal.js';
import { autoExpression } from '../modules/keywords.js';
import { mouthShape } from '../modules/lipsync.js';
import { applyTheme } from '../modules/themes.js';
import { drawScene, capturePng, downloadBlob } from '../modules/capture.js';
import { startRecording, supportedMime, extensionOf, FORMATS } from '../modules/recorder.js';
import { EXPRESSIONS_BASE, EXPRESSIONS_PRO, fileBase } from '../modules/project.js';
import { wakeLock } from '../modules/pwa.js';
import { getEngine } from '../modules/voice/engine.js';
import { logError, notify, report } from '../modules/errors.js';
import { createControls } from './scene-controls.js';

const GAINS = { calme: 0.6, normal: 1, vif: 1.3 };

export async function render(root) {
  const projet = store.projet;
  if (!projet) { notify(t('scene.aucunProjet'), 'warn'); go('accueil'); return null; }
  const audio = new AudioEngine();
  /** @type {any} */ let prep = null; /** @type {any} */ let character = null; /** @type {any} */ let terminal = null; /** @type {any} */ let rec = null;
  let raf = 0, vivant = true, exprManuelle = '', derniereExpr = '', dernierSeg = null, muet = false, dernierUi = 0, clic = 0, apercu = store.apercu;
  const autos = new Map();

  const charPane = h('div', { class: 'char-pane' });
  const termBody = h('div', { class: 'term-body', 'aria-label': t('scene.terminal'), 'aria-live': 'off' });
  const fenetre = h('div', { class: 'term-window' }, h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', { text: `lectura : ${projet.titre || 'terminal'}` })), termBody);
  const overlay = h('div', { class: 'overlay', hidden: true });
  const badgeRec = h('div', { class: 'rec-badge', hidden: true, text: 'REC' });
  const stage = h('div', { class: 'stage' }, charPane, h('div', { class: 'term-pane' }, fenetre), overlay, badgeRec,
    store.pro ? null : h('div', { class: 'watermark', text: 'Lectura', 'aria-hidden': 'true' }));
  const controls = createControls({
    retour: () => go('editeur'), reculer: () => chercher(temps() - 5000), avancer: () => chercher(temps() + 5000), basculer,
    chercher: (f) => prep && chercher(f * prep.source.dureeMs), vitesse: (v) => prep?.source.setRate(v), muet: basculerMuet,
    capture, enregistrer: () => (rec ? arreterEnregistrement() : demarrerEnregistrement()), pleinEcran, presentation,
    format: (f) => majReglages({ formatVideo: f }).catch((err) => report('reglages', err)),
  });
  const scene = h('section', { class: 'scene', 'aria-label': t('nav.scene') }, stage, controls.el);
  root.append(scene);
  scene.style.setProperty('--stage-bg', projet.reglages.fond);
  applyTheme(fenetre, projet.terminal);

  const temps = () => (prep ? prep.source.timeMs() : 0);
  const pourCanvas = () => ({ projet, character, def: prep.def, svg: prep.svg, terminal, pro: store.pro, titreTerminal: `lectura : ${projet.titre || 'terminal'}` });
  const majUi = () => controls.update({ ms: temps(), dureeMs: prep ? prep.source.dureeMs : 0, playing: store.etat === 'LECTURE', muted: muet, recording: !!rec, estime: prep?.source.kind === 'voix-systeme', pret: !!prep && ['PRET', 'LECTURE', 'PAUSE', 'FIN'].includes(store.etat) });

  function carte(titre, ...contenu) { clear(overlay).append(h('div', { class: 'card', role: 'alert' }, h('h2', { text: titre }), ...contenu)); overlay.hidden = false; }

  function erreur(err) {
    logError('scene', err);
    try { prep?.source.pause(); } catch { /* source déjà arrêtée */ }
    if (rec) arreterEnregistrement();
    transition('ERREUR', err.message);
    wakeLock(false);
    carte(t('scene.err.titre'), h('p', { text: String(err?.message || err) }), h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn', text: t('scene.retour'), onClick: () => go('editeur') }),
      h('button', { type: 'button', class: 'btn', text: t('nav.reglages'), onClick: () => go('reglages') }),
      apercu ? null : h('button', { type: 'button', class: 'btn', text: t('scene.apercuSansSon'), onClick: () => preparer(true) }),
      h('button', { type: 'button', class: 'btn btn-primary', text: t('commun.reessayer'), onClick: () => preparer(apercu) })));
    majUi();
  }

  async function preparer(enApercu) {
    apercu = enApercu;
    if (store.etat === 'LECTURE') { prep?.source.pause(); transition('PAUSE'); }
    transition('PREPARATION');
    const etape = h('p', { class: 'muted', text: t('scene.prep.ressources') }), barre = h('progress', { max: 1, value: 0 });
    carte(t('scene.prep.titre'), etape, barre);
    try {
      prep?.source.dispose();
      prep = null;
      const pret = await prepare(projet, { audio, apercu, onProgress: (fait, total, texte) => { barre.value = total ? fait / total : 0; if (texte) etape.textContent = texte; } });
      if (!vivant) { pret.source.dispose(); return; }
      prep = pret; autos.clear(); derniereExpr = ''; dernierSeg = null;
      clear(charPane).append(prep.svg);
      character = new Character(prep.svg, prep.def);
      character.setReduced(store.settings.reduireAnimations || character.reduce);
      character.setGain(GAINS[projet.reglages.mouvements] || 1);
      character.setRich(store.pro);
      terminal = new Terminal(termBody, prep.dict, prep.matcher);
      terminal.load(projet.texte, projet.terminal.prompt);
      prep.source.onEnd = fin;
      prep.source.onError = erreur;
      prep.source.setVolume(store.settings.volume ?? 1);
      prep.source.setMuted(muet);
      overlay.hidden = true;
      transition('PRET');
      if (apercu) notify(t('scene.apercuActif'), 'info');
    } catch (err) {
      if (vivant) erreur(err);
    }
    majUi();
  }

  async function jouer() {
    if (!prep || !['PRET', 'PAUSE', 'FIN'].includes(store.etat)) return;
    try {
      if (store.etat === 'FIN') prep.source.seek(0);
      await prep.source.play();
      transition('LECTURE');
      wakeLock(true);
    } catch (err) { erreur(err); }
  }
  function pause() { if (store.etat !== 'LECTURE') return; prep.source.pause(); transition('PAUSE'); wakeLock(false); }
  function basculer() { if (store.etat === 'LECTURE') pause(); else jouer(); }
  function fin() { transition('FIN'); wakeLock(false); if (rec) setTimeout(arreterEnregistrement, 600); }
  function chercher(ms) {
    if (!prep || !['PRET', 'LECTURE', 'PAUSE', 'FIN'].includes(store.etat)) return;
    prep.source.seek(Math.max(0, Math.min(prep.source.dureeMs - 1, ms)));
    if (store.etat === 'FIN') transition('PAUSE');
    majUi();
  }
  function basculerMuet() { muet = !muet; prep?.source.setMuted(muet); majUi(); }

  function expressionDe(seg) {
    if (!seg) return 'neutre';
    const e = seg.expression;
    if (e && e !== 'auto' && (store.pro || !EXPRESSIONS_PRO.includes(e)) && EXPRESSIONS[e]) return e;
    if (!autos.has(seg.id)) autos.set(seg.id, autoExpression(seg.texte, prep.matcher));
    return autos.get(seg.id);
  }
  function expressionSuivante() { // touche E : force une expression (puis revient à « auto »)
    const liste = ['', ...EXPRESSIONS_BASE.slice(1), ...(store.pro ? EXPRESSIONS_PRO : [])];
    exprManuelle = liste[(liste.indexOf(exprManuelle) + 1) % liste.length];
    notify(`${t('scene.expression')} : ${t(`expr.${exprManuelle || 'auto'}`)}`, 'info', 1800);
  }

  function image(now) {
    if (!vivant) return;
    raf = requestAnimationFrame(image);
    if (!prep || !character || store.etat === 'PREPARATION') return;
    const s = prep.source, lecture = store.etat === 'LECTURE', ms = s.timeMs();
    const chars = store.etat === 'FIN' ? projet.texte.length : s.charPos ? s.charPos() : prep.timeline.charAt(ms);
    terminal.revealTo(chars);
    const seg = prep.timeline.segmentAtChar(chars), expr = exprManuelle || expressionDe(seg);
    if (expr !== derniereExpr) { derniereExpr = expr; character.setExpression(expr); bus.emit('character:expression', expr); }
    if (seg !== dernierSeg) { dernierSeg = seg; if (lecture && seg && prep.matcher(seg.texte).some((j) => j.cat)) character.gesture(); }
    const niveau = lecture ? s.viseme(now) : 0;
    character.setViseme(niveau);
    character.setTalking(lecture ? (niveau > 0 ? 1 : 0.15) : 0);
    if (store.pro && s.bands) character.setMouthShape(lecture ? mouthShape(s.bands()) : 'normal'); // Pro : lip-sync multibande
    character.tick(now);
    if (rec) drawScene(rec.ctx, rec.w, rec.h, pourCanvas(), now);
    if (now - dernierUi > 200) { dernierUi = now; majUi(); bus.emit('timeline:tick', { ms, chars }); }
  }

  async function capture() {
    if (!prep || !terminal) return;
    try {
      const portrait = window.innerHeight > window.innerWidth;
      const blob = await capturePng(pourCanvas(), portrait ? { w: 1080, h: 1920 } : { w: 1280, h: 720 });
      downloadBlob(blob, `${fileBase(projet)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
      notify(t('scene.captureOk'), 'ok');
    } catch (err) { report('capture', err); }
  }

  async function demarrerEnregistrement() {
    if (!store.pro) return notify(t('pro.requis.video'), 'info');
    if (!prep || !['PRET', 'LECTURE', 'PAUSE', 'FIN'].includes(store.etat)) return;
    if (!supportedMime()) return notify(t('scene.err.videoNonGeree'), 'error');
    try {
      const f = FORMATS[controls.format] || FORMATS['16:9'], canvas = h('canvas', { width: f.w, height: f.h }), ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t('scene.err.videoNonGeree'));
      await document.fonts?.ready;
      pause(); chercher(0);
      terminal.revealTo(0);
      drawScene(ctx, f.w, f.h, pourCanvas());
      const r = await startRecording({ canvas, audioStream: prep.source.stream, fps: 30 });
      rec = { ...r, ctx, w: f.w, h: f.h };
      badgeRec.hidden = false;
      notify(t(prep.source.stream ? 'scene.videoDebut' : 'scene.videoSansSon'), prep.source.stream ? 'info' : 'warn', 7000);
      await jouer();
    } catch (err) { rec = null; badgeRec.hidden = true; report('video', err); }
    majUi();
  }
  async function arreterEnregistrement() {
    const r = rec;
    if (!r) return;
    rec = null; badgeRec.hidden = true;
    pause(); majUi();
    try {
      const blob = await r.stop(), ext = extensionOf(r.mime);
      downloadBlob(blob, `${fileBase(projet)}.${ext}`);
      notify(t('scene.videoPrete', { format: ext.toUpperCase(), taille: taille(blob.size) }), 'ok', 9000);
    } catch (err) { report('video', err); }
  }

  async function pleinEcran() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (scene.requestFullscreen) await scene.requestFullscreen();
      else notify(t('scene.err.pleinEcran'), 'warn');
    } catch (err) { logError('plein-ecran', err); notify(t('scene.err.pleinEcran'), 'warn'); }
  }
  function presentation(force) {
    const actif = typeof force === 'boolean' ? force : !scene.classList.contains('presenting');
    scene.classList.toggle('presenting', actif);
    if (actif) notify(t('scene.presentationAide'), 'info', 3500);
  }

  const clavier = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    const actions = { ' ': basculer, arrowleft: () => chercher(temps() - 5000), arrowright: () => chercher(temps() + 5000), p: presentation, s: capture,
      r: () => (rec ? arreterEnregistrement() : demarrerEnregistrement()), m: basculerMuet, f: pleinEcran, e: expressionSuivante, escape: () => presentation(false) };
    if (!actions[k] || (e.target?.type === 'range' && k.startsWith('arrow'))) return;
    if (k === ' ' && e.target?.tagName === 'BUTTON') return; // Espace active déjà le bouton qui a le focus
    e.preventDefault();
    actions[k]();
  };
  // Mode Présentation : un toucher = lecture/pause, double toucher = retour des commandes
  const toucher = () => {
    if (!scene.classList.contains('presenting')) return;
    if (clic) { clearTimeout(clic); clic = 0; presentation(false); return; }
    clic = window.setTimeout(() => { clic = 0; basculer(); }, 280);
  };
  window.addEventListener('keydown', clavier);
  stage.addEventListener('click', toucher);
  const off = bus.on('app:state', majUi);
  raf = requestAnimationFrame(image);
  if (store.settings.modePresentation) presentation(true);
  preparer(apercu);

  return () => {
    vivant = false;
    cancelAnimationFrame(raf); clearTimeout(clic); off();
    window.removeEventListener('keydown', clavier);
    if (rec) { rec.stop().catch(() => {}); rec = null; }
    try { prep?.source.dispose(); } catch (err) { logError('scene', err); }
    getEngine('webspeech').then((m) => m.stop());
    audio.close();
    wakeLock(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    transition('IDLE');
  };
}
