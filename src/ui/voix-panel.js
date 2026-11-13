// @ts-check
// voix-panel.js : sélecteur de voix commun à l'éditeur (voix du projet) et aux réglages (voix par défaut).
// Moteur (Système / Lectura HD hors ligne), voix, vitesse 0.5-2, hauteur 0-2, volume, « Écouter un exemple ».
import { store } from '../state.js';
import { h, clear, field } from './dom.js';
import { icon } from './icons.js';
import { t, getLang } from '../modules/i18n.js';
import { getEngine, voiceKey, MOTEURS } from '../modules/voice/engine.js';
import { report, notify } from '../modules/errors.js';

/**
 * @param {{ voix: {moteur:string,id:string,vitesse:number,hauteur:number}, onChange: (v:any)=>void,
 *           volume?: number, onVolume?: (v:number)=>void }} o
 */
export function voicePanel({ voix, onChange, volume, onVolume }) {
  const selMoteur = h('select', null, ...MOTEURS.map((m) => h('option', { value: m, text: t(`voix.moteur.${m}`) })));
  const selVoix = h('select'), aide = h('div', { class: 'banner banner-warn', hidden: true, role: 'status' });
  const etiq = (cle, v) => `${t(cle)} : ${Number(v).toFixed(2).replace(/\.?0+$/, '')}`;
  const vit = h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: voix.vitesse });
  const haut = h('input', { type: 'range', min: 0, max: 2, step: 0.05, value: voix.hauteur });
  const champVit = field(etiq('voix.vitesse', voix.vitesse), vit), champHaut = field(etiq('voix.hauteur', voix.hauteur), haut);
  const ecouter = h('button', { type: 'button', class: 'btn' }, icon('volume'), t('voix.ecouter'));
  let voixSysteme = [], lecteur = null, jeton = 0;
  selMoteur.value = voix.moteur;

  async function remplir() {
    const moi = ++jeton;
    clear(selVoix); aide.hidden = true; clear(aide);
    haut.disabled = voix.moteur === 'piper';
    champHaut.querySelector('label').textContent = voix.moteur === 'piper' ? t('voix.hauteurIndispo') : etiq('voix.hauteur', voix.hauteur);
    try {
      const moteur = await getEngine(voix.moteur);
      if (voix.moteur === 'piper') {
        const liste = await moteur.listVoices();
        if (moi !== jeton) return;
        if (!liste.length) {
          aide.hidden = false;
          aide.append(h('p', { text: t('voix.hd.aucune') }), h('a', { class: 'btn', href: '#/reglages', text: t('voix.hd.gerer') }));
        }
        for (const v of liste) selVoix.append(h('option', { value: v.id, text: v.nom }));
      } else {
        voixSysteme = moteur.disponible ? await moteur.listVoices(getLang()) : [];
        if (moi !== jeton) return;
        if (!voixSysteme.length) {
          aide.hidden = false;
          aide.append(h('p', { text: t(moteur.disponible ? 'voix.err.aucune' : 'voix.err.absente') }));
        }
        for (const v of voixSysteme) selVoix.append(h('option', { value: voiceKey(v), text: `${v.name} (${v.lang})${v.localService ? '' : ` · ${t('voix.enLigne')}`}` }));
      }
      const ids = [...selVoix.options].map((o) => o.value);
      if (ids.length) {
        if (!ids.includes(voix.id)) { voix.id = ids[0]; onChange(voix); }
        selVoix.value = voix.id;
      }
      selVoix.disabled = !ids.length; ecouter.disabled = !ids.length;
    } catch (err) {
      report('voix', err);
    }
  }

  function arreter() {
    if (lecteur) { lecteur.pause(); URL.revokeObjectURL(lecteur.src); lecteur = null; }
    getEngine('webspeech').then((m) => m.stop());
  }

  async function exemple() {
    arreter();
    const texte = t('voix.exemple'), vol = volume ?? store.settings?.volume ?? 1;
    try {
      const moteur = await getEngine(voix.moteur);
      if (voix.moteur === 'piper') {
        ecouter.disabled = true;
        notify(t('voix.hd.synthese'), 'info', 2500);
        const { encodeWav } = await import('../modules/audio.js');
        const r = await moteur.synthesize(texte, { voixId: voix.id, vitesse: voix.vitesse });
        lecteur = new Audio(URL.createObjectURL(encodeWav(r.samples, r.sampleRate)));
        lecteur.volume = vol;
        await lecteur.play();
      } else {
        moteur.speak(texte, {
          voice: voixSysteme.find((v) => voiceKey(v) === voix.id), rate: voix.vitesse, pitch: voix.hauteur, volume: vol,
          onError: (code) => { if (code !== 'interrupted' && code !== 'canceled') notify(t('voix.err.lecture', { code }), 'error'); },
        });
      }
    } catch (err) {
      report('voix', err);
    } finally {
      ecouter.disabled = !selVoix.options.length;
    }
  }

  selMoteur.addEventListener('change', () => { voix.moteur = selMoteur.value; voix.id = ''; onChange(voix); remplir(); });
  selVoix.addEventListener('change', () => { voix.id = selVoix.value; onChange(voix); });
  vit.addEventListener('input', () => { voix.vitesse = +vit.value; champVit.querySelector('label').textContent = etiq('voix.vitesse', voix.vitesse); onChange(voix); });
  haut.addEventListener('input', () => { voix.hauteur = +haut.value; champHaut.querySelector('label').textContent = etiq('voix.hauteur', voix.hauteur); onChange(voix); });
  ecouter.addEventListener('click', exemple);

  const el = h('div', { class: 'stack' },
    h('div', { class: 'grid-2' }, field(t('voix.moteur'), selMoteur), field(t('voix.voix'), selVoix)),
    aide,
    h('div', { class: 'grid-2' }, champVit, champHaut));
  if (onVolume) {
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: volume ?? 1 });
    const champVol = field(`${t('voix.volume')} : ${Math.round((volume ?? 1) * 100)} %`, vol);
    vol.addEventListener('input', () => { volume = +vol.value; champVol.querySelector('label').textContent = `${t('voix.volume')} : ${Math.round(volume * 100)} %`; onVolume(volume); });
    el.append(champVol);
  }
  el.append(h('div', { class: 'row' }, ecouter));
  remplir();
  return { el, refresh: remplir, stop: arreter };
}
