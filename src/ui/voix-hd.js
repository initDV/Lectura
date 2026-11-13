// @ts-check
// voix-hd.js : gestion de la voix « Lectura HD hors ligne » (taille annoncée, accord explicite, progression, suppression).
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t, taille } from '../modules/i18n.js';
import { getEngine } from '../modules/voice/engine.js';
import { report, notify } from '../modules/errors.js';

/** @param {{ onChange?: ()=>void }} o */
export function voixHdPanel({ onChange } = {}) {
  const liste = h('div', { class: 'stack' }), el = h('div', { class: 'stack' }, h('p', { class: 'muted small', text: t('voix.hd.aide') }), liste);
  let moteur = null, annuler = null;

  async function dessiner() {
    clear(liste).append(h('p', { class: 'muted', text: t('commun.chargement') }));
    let voix;
    try {
      moteur = await getEngine('piper');
      voix = await moteur.etat();
    } catch (err) {
      clear(liste).append(h('p', { class: 'banner banner-warn', role: 'status', text: err.message }));
      return;
    }
    clear(liste);
    for (const v of voix) liste.append(ligne(v));
    if (!voix.length) liste.append(h('p', { class: 'muted', text: t('voix.hd.err.absente') }));
  }

  function ligne(v) {
    const barre = h('progress', { max: 1, value: 0, hidden: true, 'aria-label': t('voix.hd.progression') });
    const etat = h('span', { class: 'muted small', role: 'status', text: v.installe ? t('voix.hd.installee') : t('voix.hd.nonInstallee', { taille: taille(v.taille) }) });
    const actions = h('div', { class: 'row' });
    const boutons = () => {
      clear(actions);
      if (annuler) actions.append(h('button', { type: 'button', class: 'btn', text: t('commun.annuler'), onClick: () => annuler?.abort() }));
      else if (v.installe) actions.append(h('button', { type: 'button', class: 'btn btn-danger', onClick: supprimer }, icon('trash'), t('voix.hd.supprimer')));
      else actions.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: telecharger }, icon('download'), t('voix.hd.telecharger', { taille: taille(v.taille) })));
    };
    async function telecharger() {
      if (!confirm(t('voix.hd.confirmer', { taille: taille(v.taille) }))) return;
      annuler = new AbortController();
      barre.hidden = false; boutons();
      try {
        await moteur.download(v.id, { signal: annuler.signal, onProgress: (fait, total) => {
          barre.value = total ? fait / total : 0;
          etat.textContent = t('voix.hd.progressionTexte', { fait: taille(fait), total: taille(total), pct: Math.round((100 * fait) / (total || 1)) });
        } });
        v.installe = true;
        etat.textContent = t('voix.hd.installee');
        notify(t('voix.hd.prete'), 'ok');
        onChange?.();
      } catch (err) {
        etat.textContent = t('voix.hd.reprise');
        report('voix-hd', err);
      }
      annuler = null; barre.hidden = true; boutons();
    }
    async function supprimer() {
      if (!confirm(t('voix.hd.supprimer.confirmer', { taille: taille(v.taille) }))) return;
      try {
        await moteur.remove(v.id);
        v.installe = false;
        etat.textContent = t('voix.hd.nonInstallee', { taille: taille(v.taille) });
        notify(t('voix.hd.supprimee'), 'info');
        onChange?.();
      } catch (err) { report('voix-hd', err); }
      boutons();
    }
    boutons();
    return h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('strong', { text: v.nom }), etat), barre, actions,
      h('p', { class: 'muted small', text: `${t('voix.hd.licence')} : ${v.licence}. ${v.attribution}` }));
  }

  dessiner();
  return {
    el,
    async toutSupprimer() { annuler?.abort(); await (moteur || (await getEngine('piper'))).removeAll(); onChange?.(); await dessiner(); },
  };
}
