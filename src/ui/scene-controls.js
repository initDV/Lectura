// @ts-check
// scene-controls.js : barre du bas de la scène (masquable en mode Présentation).
// ⏮ -5 s | ▶/⏸ | +5 s ⏭ | progression | vitesse | 🔊 | 📷 | format + ⏺ | ⛶ | Présentation
import { store } from '../state.js';
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t, horloge } from '../modules/i18n.js';
import { FORMATS } from '../modules/recorder.js';

/** @param {Record<string, Function>} a actions fournies par la scène */
export function createControls(a) {
  const bouton = (ic, cle, action, raccourci) => h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': t(cle), title: `${t(cle)}${raccourci ? ` (${raccourci})` : ''}`, onClick: () => action() }, icon(ic));
  const lecture = bouton('play', 'scene.lecture', a.basculer, t('touche.espace'));
  const muet = bouton('volume', 'scene.muet', a.muet, 'M');
  const rec = bouton('record', 'scene.enregistrer', a.enregistrer, 'R');
  const barre = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: 0, 'aria-label': t('scene.progression') });
  const temps = h('span', { class: 'time', text: '0:00 / 0:00' });
  const vitesse = h('select', { 'aria-label': t('scene.vitesse'), title: t('scene.vitesse') },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => h('option', { value: v, text: `${v}×` })));
  vitesse.value = '1';
  const format = h('select', { 'aria-label': t('scene.format'), title: t('scene.format') },
    ...Object.keys(FORMATS).map((f) => h('option', { value: f, text: f })));
  format.value = FORMATS[store.settings.formatVideo] ? store.settings.formatVideo : '16:9';
  let glisse = false, joue = null, sourd = null, enreg = null;

  barre.addEventListener('pointerdown', () => { glisse = true; });
  barre.addEventListener('input', () => { glisse = true; a.chercher(+barre.value / 1000, true); });
  barre.addEventListener('change', () => { glisse = false; a.chercher(+barre.value / 1000, false); });
  barre.addEventListener('pointerup', () => { glisse = false; });
  vitesse.addEventListener('change', () => a.vitesse(+vitesse.value));
  format.addEventListener('change', () => a.format(format.value));

  const el = h('div', { class: 'controls', role: 'toolbar', 'aria-label': t('scene.commandes') },
    bouton('back', 'scene.retour', a.retour),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    bouton('rewind', 'scene.reculer', a.reculer, '←'), lecture, bouton('forward', 'scene.avancer', a.avancer, '→'),
    h('div', { class: 'progress' }, barre, temps),
    vitesse, muet, bouton('camera', 'scene.capture', a.capture, 'S'),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    format, rec,
    bouton('fullscreen', 'scene.pleinEcran', a.pleinEcran, 'F'),
    bouton('present', 'scene.presentation', a.presentation, 'P'));

  const changer = (btn, ic, cle) => { clear(btn).append(icon(ic)); btn.setAttribute('aria-label', t(cle)); };

  return {
    el,
    get format() { return format.value; },
    /** @param {{ms:number, dureeMs:number, playing:boolean, muted:boolean, recording:boolean, estime:boolean, pret:boolean}} e */
    update(e) {
      if (!glisse) barre.value = String(e.dureeMs ? Math.round((e.ms / e.dureeMs) * 1000) : 0);
      temps.textContent = `${horloge(e.ms)} / ${e.estime ? '≈' : ''}${horloge(e.dureeMs)}`;
      barre.setAttribute('aria-valuetext', temps.textContent);
      if (joue !== e.playing) { joue = e.playing; changer(lecture, joue ? 'pause' : 'play', joue ? 'scene.pause' : 'scene.lecture'); }
      if (sourd !== e.muted) { sourd = e.muted; changer(muet, sourd ? 'mute' : 'volume', sourd ? 'scene.sonActif' : 'scene.muet'); muet.setAttribute('aria-pressed', String(sourd)); }
      if (enreg !== e.recording) {
        enreg = e.recording; changer(rec, enreg ? 'stop' : 'record', enreg ? 'scene.arreterEnregistrement' : 'scene.enregistrer');
        rec.classList.toggle('rec-on', enreg); format.disabled = enreg;
      }
      lecture.disabled = !e.pret;
    },
  };
}
