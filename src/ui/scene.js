// @ts-check
// Écran principal (D2/D3) : scène (robot + terminal) et commandes sur une seule page.
// Le texte suit TOUJOURS le temps de la source (voix ou fichier audio), jamais une minuterie séparée.
import { bus, store } from '../state.js';
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t } from '../modules/i18n.js';
import { transition, majReglages } from '../app.js';
import { go } from '../router.js';
import { AudioEngine } from '../modules/audio.js';
import { prepare, loadProjectCharacter } from '../modules/prepare.js';
import { planRobot, poseRobot } from '../modules/robot-motion.js';
import { rigRobot } from '../modules/robot-stage.js';
import { WithOutro } from '../modules/player.js';
import { RIG_AICHA } from '../modules/character-spec.js';
import { Character } from '../modules/character.js';
import { creerHumeur } from '../modules/humeur.js';
import { Terminal } from '../modules/terminal.js';
import { typeLigne } from '../modules/timeline.js';
import { mouthShape } from '../modules/lipsync.js';
import { applyTheme } from '../modules/themes.js';
import { wakeLock } from '../modules/pwa.js';
import { getEngine } from '../modules/voice/engine.js';
import { prechaufferTexte, annulerPrechauffage } from '../modules/voice/prechauffer-texte.js';
import { logError, notify, report } from '../modules/errors.js';
import { prochaineExpression, signaturePreparation, varianteCommandes } from './scene-calculs.js';
import { createControls } from './scene-controls.js';
import { creerExport } from './scene-export.js';
import { nettoyer } from '../modules/text-clean.js';
import { creerDecor } from '../modules/scene-decor.js';
import { ouvrirMesVideos } from './mes-videos.js';
import { nomVoix, ouvrirListeVoix, choisirAudio } from './voix-liste.js';
import { ouvrirMenu } from './menu.js';
import { projetInitial } from './projets.js';
import * as actionsProjet from './projet-actions.js';

const GAINS = { calme: 0.6, normal: 1, vif: 1.3 };

export async function render(root) {
  if (!store.projet) store.projet = await projetInitial();
  const projet = store.projet, audio = new AudioEngine();
  /** @type {any} */ let prep = null; /** @type {any} */ let perso = null; /** @type {any} */ let character = null; /** @type {any} */ let terminal = null;
  /** @type {any} */ let humeur = null;
  let preparation = null, chargementPerso = null, aicha = null, essaiLecture = 0, robotRig = null, direction = null, pausedFrame = null;
  let raf = 0, vivant = true, exprManuelle = '', derniereExpr = '', dernierSeg = null, dernierRang = 0, muet = false, clic = 0, arrete = true, signature = '', masque = false;

  const charPane = h('div', { class: 'char-pane' });
  const termBody = h('div', { class: 'term-body', 'aria-label': t('scene.terminal'), 'aria-live': 'off' });
  const oeil = h('button', { type: 'button', class: 'oeil', 'aria-pressed': 'false', onClick: basculerTexte });
  const fenetre = h('div', { class: 'term-window' }, h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', { text: store.settings.titreTerminal }), oeil), termBody);
  const overlay = h('div', { class: 'overlay', hidden: true });
  const badgeRec = h('div', { class: 'rec-badge', hidden: true, text: 'REC' });
  const menuBtn = h('button', { type: 'button', class: 'menu-btn', 'aria-label': t('scene.menu'), title: t('scene.menu'), 'aria-haspopup': 'dialog', onClick: menu }, icon('menu'));
  const fabBtn = h('button', { type: 'button', class: 'fab-settings', 'aria-label': t('reglages.themeApp') || 'Réglages', title: t('reglages.themeApp') || 'Réglages', onClick: () => go('reglages') }, icon('settings'));
  const stage = h('div', { class: 'stage' }, menuBtn, fabBtn, charPane, h('div', { class: 'term-pane' }, fenetre), overlay, badgeRec);
  const toucher = () => { store.modifie = true; };
  const controls = createControls({
    texte: projet.texte, vitesse: projet.audio.voix.vitesse, volume: store.settings.volume ?? 1,
    onCapture: presentation, onVitesse: changerVitesse, onVoix: () => ouvrirListeVoix(projet, voixChangee),
    onFichier: async () => { if (await choisirAudio(projet)) voixChangee(); },
    onTexte: (v) => {
      projet.texte = v; toucher();
      annulerPreparation();
      prechauffer();
    }, onLancer: lancer, onArreter: arreter, onMuet: basculerMuet,
    onVolume: (v) => { prep?.source.setVolume(v); majReglages({ volume: v }).catch((err) => report('reglages', err)); },
  });
  const scene = h('section', { class: 'scene', 'aria-label': t('nav.scene') }, stage, controls.el);
  root.append(scene);
  scene.style.setProperty('--stage-bg', projet.reglages.fond);
  applyTheme(fenetre, projet.terminal);

  const temps = () => (prep ? prep.source.timeMs() : 0);
  const pret = () => !!prep && ['PRET', 'LECTURE', 'PAUSE', 'FIN'].includes(store.etat);
  const pourCanvas = () => ({ projet, svg: perso.svg, terminal, titreTerminal: store.settings.titreTerminal, texteMasque: masque,
    peindreDecor: aicha?.decor.peindre, avance: aicha?.decor.avance });
  const exportScene = creerExport({ projet, badge: badgeRec, pret: () => pret() && !!terminal, pourCanvas, source: () => prep.source, pause, chercher, jouer, format: () => store.settings.formatVideo });
  const majUi = () => controls.update({ etat: varianteCommandes(store.etat, arrete), muet });
  let _brut = '', _propre = '';
  const textePropre = () => {
    if (_brut !== projet.texte) { _brut = projet.texte; _propre = nettoyer(projet.texte); }
    return _propre;
  };
  const signer = (apercu) => signaturePreparation(textePropre(), apercu, projet);

  function prechauffer() {
    const v = projet.audio.voix;
    if (!document.hidden && projet.audio.source === 'voix' && v.moteur === 'piper' && !preparation && store.etat !== 'LECTURE') {
      prechaufferTexte(textePropre(), v.id, { vitesse: v.vitesse });
    } else annulerPrechauffage();
  }

  function annulerPreparation() {
    if (!preparation) return;
    preparation.abort(); preparation = null;
    audio.close();
    signature = ''; overlay.hidden = true;
    transition('IDLE');
  }

  function carte(titre, ...contenu) { clear(overlay).append(h('div', { class: 'card', role: 'alert' }, h('h2', { text: titre }), ...contenu)); overlay.hidden = false; }
  function basculerTexte(force) {
    masque = typeof force === 'boolean' ? force : !masque;
    termBody.classList.toggle('masque', masque);
    clear(oeil).append(icon(masque ? 'eye-off' : 'eye'));
    oeil.setAttribute('aria-pressed', String(masque));
    oeil.setAttribute('aria-label', t(masque ? 'scene.oeil.afficher' : 'scene.oeil.masquer'));
    oeil.title = oeil.getAttribute('aria-label');
  }

  /** Une seule lecture du SVG, même si « Lancer » arrive pendant le chargement initial. */
  function chargerPerso() {
    if (chargementPerso) return chargementPerso;
    chargementPerso = (async () => {
      const p = await loadProjectCharacter(projet);
      if (!vivant) return;
      const gain = GAINS[projet.reglages.mouvements] || 1;
      if (p.def.rig === RIG_AICHA) {
        const { creerAicha } = await import('../modules/aicha/stage.js');
        if (!vivant) return;
        aicha = creerAicha(p.svg, { reduireAnimations: store.settings.reduireAnimations, gain, couleurs: store.settings.decor });
        aicha.repos();
      } else {
        character = new Character(p.svg, p.def);
        robotRig = p.def.id === 'robot_lectura' ? rigRobot(p.svg) : null;
        character.setReduced(store.settings.reduireAnimations || character.reduce);
        character.setGain(gain);
      }
      perso = p;
      clear(charPane).append(aicha?.decor.element || creerDecor(store.settings.decor), p.svg);
    })().catch((err) => { chargementPerso = null; throw err; });
    return chargementPerso;
  }

  function erreur(err) {
    logError('scene', err);
    try { prep?.source.pause(); } catch { /* source déjà arrêtée */ }
    exportScene.arreter();
    transition('ERREUR', err.message);
    wakeLock(false);
    signature = '';
    carte(t('scene.err.titre'), h('p', { text: String(err?.message || err) }), h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn', text: t('commun.fermer'), onClick: () => { overlay.hidden = true; transition('IDLE'); arrete = true; majUi(); } }),
      h('button', { type: 'button', class: 'btn', text: t('nav.reglages'), onClick: () => go('reglages') }),
      h('button', { type: 'button', class: 'btn', text: t('scene.apercuSansSon'), onClick: () => lancer(true) }),
      h('button', { type: 'button', class: 'btn btn-primary', text: t('commun.reessayer'), onClick: () => lancer(false) })));
    majUi();
  }

  /** Prépare la source (voix ou fichier) si le texte ou la voix ont changé ; sinon réutilise la préparation précédente. */
  async function preparer(apercu) {
    const sig = signer(apercu);
    if (prep && sig === signature && pret()) return true;
    if (store.etat === 'LECTURE') { prep?.source.pause(); transition('PAUSE'); }
    const a = new AbortController(); preparation = a;
    transition('PREPARATION'); majUi();
    const etape = h('p', { class: 'muted', text: t('scene.prep.ressources') }), barre = h('progress', { max: 1, value: 0 });
    carte(t('scene.prep.titre'), etape, barre);
    try {
      prep?.source.dispose(); prep = null;
      if (!perso) await chargerPerso();
      a.signal.throwIfAborted();
      const projetLecture = { ...projet, texte: textePropre(), audio: { ...projet.audio, voix: { ...projet.audio.voix } } };
      const nouveau = await prepare(projetLecture, { audio, apercu, perso, analyserAudio: aicha?.analyserAudio, signal: a.signal, onProgress: (fait, total, texte) => { barre.value = total ? fait / total : 0; if (texte) etape.textContent = texte; } });
      if (!vivant || a.signal.aborted) { nouveau.source.dispose(); return false; }
      prep = nouveau; signature = sig; derniereExpr = ''; dernierSeg = null; pausedFrame = null;
      direction = robotRig && !character.reduce && projet.reglages.emotions ? planRobot(prep.segments, prep.source.dureeMs) : null;
      robotRig?.plan(direction);
      if (direction?.end > prep.source.dureeMs) prep.source = new WithOutro(prep.source, direction.end);
      humeur = creerHumeur({ lexique: prep.lexique, matcher: prep.matcher, actif: projet.reglages.emotions });
      aicha?.preparer(prep, projetLecture, humeur);
      terminal = new Terminal(termBody, prep.dict, prep.matcher);
      terminal.load(textePropre());
      prep.source.onEnd = fin;
      prep.source.onError = erreur;
      prep.source.setVolume(store.settings.volume ?? 1);
      prep.source.setMuted(muet);
      prep.source.setRate(apercu || projet.audio.source === 'fichier' ? projet.audio.voix.vitesse : projet.audio.voix.vitesse / prep.vitesseBase);
      overlay.hidden = true;
      transition('PRET');
      if (apercu) notify(t('scene.apercuActif'), 'info');
      return true;
    } catch (err) {
      if (vivant && !a.signal.aborted) erreur(err);
      return false;
    } finally { if (preparation === a) preparation = null; }
  }

  async function jouer() {
    if (!pret() || store.etat === 'LECTURE') return;
    const id = ++essaiLecture, source = prep.source;
    const courant = () => vivant && id === essaiLecture && prep?.source === source;
    try {
      if (store.etat === 'FIN' || arrete) source.seek(0);
      arrete = false;
      await source.play();
      if (!courant()) return;
      transition('LECTURE');
      wakeLock(true);
    } catch (err) { if (courant()) erreur(err); }
    majUi();
  }
  function pause() { if (store.etat !== 'LECTURE') return; prep.source.pause(); transition('PAUSE'); wakeLock(false); majUi(); }
  /** Bouton « Lancer » : démarre, met en pause ou reprend. */
  async function lancer(apercu = false) {
    if (store.etat === 'PREPARATION') return;
    annulerPrechauffage();
    if (store.etat === 'LECTURE' && (apercu !== true || signer(true) === signature)) return pause();
    const reprend = store.etat === 'PAUSE' && !arrete && apercu !== true;
    const sansSon = apercu === true || (reprend && prep?.source.kind === 'apercu');
    if (reprend && signer(sansSon) === signature) return jouer();
    if (!textePropre().trim()) { notify(t('scene.err.texteVide'), 'warn'); controls.texte.focus(); return; }
    arrete = true;
    if (await preparer(sansSon)) await jouer();
  }
  /** Bouton « Arrêter » : coupe la voix, remet le personnage au repos, garde le texte affiché. */
  function arreter() {
    essaiLecture++;
    annulerPrechauffage(); annulerPreparation();
    exportScene.arreter();
    prep?.source.pause();
    if (store.etat === 'LECTURE') transition('PAUSE');
    arrete = true; wakeLock(false);
    character?.setExpression('neutre'); derniereExpr = 'neutre';
    aicha?.repos();
    majUi();
  }
  function fin() { transition('FIN'); arrete = true; wakeLock(false); majUi(); if (exportScene.actif) setTimeout(() => exportScene.arreter(), 600); }
  function chercher(ms) {
    if (!pret()) return;
    prep.source.seek(Math.max(0, Math.min(prep.source.dureeMs - 1, ms)));
    if (store.etat === 'FIN') { transition('PAUSE'); arrete = false; }
    if (aicha) arrete = false;
    majUi();
  }
  function basculerMuet() { muet = !muet; prep?.source.setMuted(muet); majUi(); }
  function changerVitesse(v) {
    annulerPreparation(); annulerPrechauffage();
    projet.audio.voix.vitesse = v; toucher();
    prechauffer();
    if (prep) prep.source.setRate(prep.source.kind === 'apercu' || projet.audio.source === 'fichier' ? v : v / prep.vitesseBase);
    majReglages({ vitesseVoix: v }).catch((err) => report('reglages', err));
  }
  async function voixChangee() {
    arreter();
    prep?.source.dispose(); prep = null; signature = '';
    transition('IDLE');
    toucher(); prechauffer();
    controls.setVoix(await nomVoix(projet));
    if (projet.audio.source === 'voix') majReglages({ moteurVoix: projet.audio.voix.moteur, voixId: projet.audio.voix.id }).catch((err) => report('reglages', err));
  }

  function expressionSuivante() { // touche E : force une expression (puis revient à « auto »)
    exprManuelle = prochaineExpression(exprManuelle);
    notify(`${t('scene.expression')} : ${t(`expr.${exprManuelle || 'auto'}`)}`, 'info', 1800);
  }

  let dernierSegPonc = null, dernierePosPonc = -1;
  function detecterPonctuation(seg, chars, now) {
    if (seg !== dernierSegPonc) { dernierSegPonc = seg; dernierePosPonc = -1; }
    const pos = chars - seg.start;
    if (pos > dernierePosPonc) {
      const debut = dernierePosPonc >= 0 ? dernierePosPonc + 1 : 0;
      const inter = seg.texte.slice(debut, pos + 1);
      for (const c of inter) {
        if (c === '?') character.reagir('interro', now);
        else if (c === '!') character.reagir('excla', now);
        else if (c === '\u2026') character.reagir('suspens', now);
        else if (c === ',') character.reagir('virgule', now);
      }
    }
    dernierePosPonc = pos;
  }
  function image(now) {
    if (!vivant) return;
    raf = requestAnimationFrame(image);
    if (!character && !aicha) return;
    let robot = null, quietMouth = false;
    if (prep && terminal && store.etat !== 'PREPARATION' && store.etat !== 'ERREUR') {
      const s = prep.source, lecture = store.etat === 'LECTURE', ms = s.timeMs();
      const chars = store.etat === 'FIN' ? textePropre().length : s.charPos ? s.charPos() : prep.timeline.charAt(ms);
      terminal.revealTo(chars);
      const seg = prep.timeline.segmentAtChar(chars);
      const audioSpan = s.kind === 'voix-systeme' ? seg : prep.timeline.segmentAt(ms);
      const parle = lecture && !!audioSpan && typeLigne(audioSpan.texte) === 'parle' && ms < (audioSpan.speechEndMs ?? audioSpan.finMs);
      const anime = direction && (!arrete || store.etat === 'FIN');
      // Web Speech fournit un curseur réel/estimé par mot ; sa projection dans la timeline respecte les plages parlées.
      const sceneMs = s.kind === 'voix-systeme' && ms < (s.finAudio ?? s.dureeMs) ? prep.timeline.timeAt(chars) : ms;
      if (aicha) {
        if (arrete && store.etat !== 'FIN') aicha.repos(now);
        else aicha.image(prep, { ms, sceneMs, lecture, fin: store.etat === 'FIN', expression: exprManuelle, now: exportScene.actif ? undefined : now });
        if (lecture) bus.emit('timeline:tick', { ms, chars });
        exportScene.image(now);
        return;
      }
      if (anime) robot = poseRobot(direction, sceneMs, !exprManuelle);
      quietMouth = !parle;
      if (lecture && seg && parle && !robot?.blend) detecterPonctuation(seg, chars, now);
      // Expression : imposée (touche E), sinon humeur de la phrase à la position du texte (donc au temps de la voix).
      const hu = arrete || !seg ? { expr: 'neutre', force: 1, mix: '', poids: 0, rang: 0, geste: '' }
        : exprManuelle ? { expr: exprManuelle, force: 1, mix: '', poids: 0, rang: 0, geste: '' } : humeur.etat(seg, chars - seg.start);
      const cle = `${hu.expr}|${hu.force.toFixed(2)}|${hu.mix}`;
      if (cle !== derniereExpr) { derniereExpr = cle; character.setExpression(hu.expr, hu.force, hu.mix, hu.poids); bus.emit('character:expression', hu.expr); }
      if (seg !== dernierSeg) { dernierSeg = seg; dernierRang = 0; if (parle && seg && !robot?.blend && prep.matcher(seg.texte).some((j) => j.cat)) character.gesture(now); }
      if (lecture && hu.rang !== dernierRang) { if (hu.rang > dernierRang && hu.geste && !robot?.blend) character.gesture(now, hu.geste); dernierRang = hu.rang; } // mot déclencheur
      const niveau = parle ? s.viseme(now) : 0; // commandes et commentaires : bouche fermée, bras au repos
      // Passer la lettre en cours au personnage : mouth.js l'utilise pour arrondir (o/u)
      // ou étirer (i/e) la bouche → lip-sync naturel au lieu d'un simple rectangle qui bouge.
      const texteLu = textePropre();
      const lettreEnCours = chars < texteLu.length ? texteLu[chars] : '';
      character.setViseme(niveau, lettreEnCours);
      character.setTalking(parle ? (niveau > 0 ? 1 : 0.15) : 0);
      const bandes = parle ? s.bands?.() : null;
      character.setMouthShape(bandes ? mouthShape(bandes) : 'normal');
      if (lecture) bus.emit('timeline:tick', { ms, chars });
      // Un arrêt sur image conserve la pose jusqu'au prochain déplacement du curseur.
      const cadre = !lecture && robot ? `${ms}|${exprManuelle}|${store.etat}` : null;
      if (cadre !== null && cadre === pausedFrame) { exportScene.image(now); return; }
      pausedFrame = cadre;
    } else if (aicha) { aicha.repos(now); return; }
    else { pausedFrame = null; character.setViseme(0); character.setTalking(0); character.setMouthShape('normal'); }
    character.tick(now, robot, quietMouth);
    robotRig?.paint(robot);
    exportScene.image(now);
  }

  async function pleinEcran() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (scene.requestFullscreen) await scene.requestFullscreen();
      else notify(t('scene.err.pleinEcran'), 'warn');
    } catch (err) { logError('plein-ecran', err); notify(t('scene.err.pleinEcran'), 'warn'); }
  }
  /** Mode capture (« Capturer l'écran ») : masque l'interface autour de la scène. */
  function presentation(force) {
    const actif = typeof force === 'boolean' ? force : !scene.classList.contains('presenting');
    scene.classList.toggle('presenting', actif);
    controls.setCapture(actif);
    if (actif) { window.scrollTo(0, 0); notify(t('scene.presentationAide'), 'info', 3500); }
  }
  function menu() {
    ouvrirMenu({ projet, enregistrement: exportScene.actif, format: store.settings.formatVideo,
      onTitre: (v) => { projet.titre = v; toucher(); },
      onFormat: (f) => majReglages({ formatVideo: f }).catch((err) => report('reglages', err)),
      actions: {
        enregistrer: () => actionsProjet.enregistrer(projet), exporter: () => actionsProjet.exporterLectura(projet),
        importerTexte: async () => { if (await actionsProjet.importerTexte(projet)) { controls.setTexte(projet.texte); toucher(); annulerPreparation(); prechauffer(); } },
        importerSrt: async () => { if (await actionsProjet.importerSousTitres(projet)) { controls.setTexte(projet.texte); toucher(); annulerPreparation(); prechauffer(); } },
        exporterSrt: () => actionsProjet.exporterSousTitres(projet, 'srt'), exporterVtt: () => actionsProjet.exporterSousTitres(projet, 'vtt'),
        apercu: () => lancer(true), capture: () => exportScene.capture(), video: () => exportScene.basculer(), pleinEcran, mesVideos: () => ouvrirMesVideos(),
      } });
  }

  const clavier = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) || document.querySelector('.modal-backdrop')) return;
    const k = e.key.toLowerCase();
    const actions = { ' ': () => lancer(), arrowleft: () => chercher(temps() - 5000), arrowright: () => chercher(temps() + 5000), p: presentation, s: () => exportScene.capture(),
      r: () => exportScene.basculer(), m: basculerMuet, f: pleinEcran, e: expressionSuivante, escape: () => presentation(false) };
    if (!actions[k] || (k === ' ' && e.target?.tagName === 'BUTTON')) return; // Espace active déjà le bouton qui a le focus
    e.preventDefault();
    actions[k]();
  };
  // Mode capture : un toucher = lecture/pause, double toucher = retour des commandes
  const toucherScene = (e) => {
    if (!scene.classList.contains('presenting') || e.target.closest?.('button')) return;
    if (clic) { clearTimeout(clic); clic = 0; presentation(false); return; }
    clic = window.setTimeout(() => { clic = 0; lancer(); }, 280);
  };
  const visibilite = () => { if (document.hidden) annulerPrechauffage(); };
  document.addEventListener('visibilitychange', visibilite);
  window.addEventListener('keydown', clavier);
  stage.addEventListener('click', toucherScene);
  const off = bus.on('app:state', majUi);
  basculerTexte(false);
  majUi();
  raf = requestAnimationFrame(image);
  chargerPerso().catch((err) => { if (vivant && !preparation) erreur(err); });
  nomVoix(projet).then((nom) => controls.setVoix(nom)).catch((err) => report('voix', err));
  if (store.settings.modePresentation) presentation(true);
  if (store.apercu) { store.apercu = false; lancer(true); }
  else prechauffer();

  return () => {
    vivant = false; essaiLecture++;
    annulerPrechauffage(); preparation?.abort(); preparation = null;
    document.removeEventListener('visibilitychange', visibilite);
    cancelAnimationFrame(raf); clearTimeout(clic); off();
    window.removeEventListener('keydown', clavier);
    exportScene.abandonner(); aicha?.decor.dispose();
    try { prep?.source.dispose(); } catch (err) { logError('scene', err); }
    getEngine('webspeech').then((m) => m.stop());
    audio.close();
    wakeLock(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    transition('IDLE');
  };
}
