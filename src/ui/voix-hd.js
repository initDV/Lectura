// @ts-check
// voix-hd.js : gestion de la voix « Lectura HD hors ligne ». Carte unique avec menu déroulant
// groupé (Féminin / Masculin) et fiche détaillée de la voix sélectionnée (installer, supprimer, progression).
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t, taille } from '../modules/i18n.js';
import { getEngine } from '../modules/voice/engine.js';
import { report, notify } from '../modules/errors.js';
import { encodeWav } from '../modules/audio.js';

/** Détecte le genre depuis le nom (« · F · » ou « · M · »). */
function genreDe(v) {
  if (/·\s*F\s*·/.test(v.nom)) return 'F';
  if (/·\s*M\s*·/.test(v.nom)) return 'M';
  return 'F'; // par défaut
}

export function voixHdPanel({ onChange } = {}) {
  const el = h('div', { class: 'stack' }, h('p', { class: 'muted small', text: t('voix.hd.aide') }));
  const zone = h('div', { class: 'stack' });
  el.append(zone);
  let moteur = null, annuler = null, voix = [], selectEl = null, detailEl = null, lecteur = null, urlLecteur = null, ecouteEnCours = false, ecouteAbort = null;

  async function dessiner() {
    clear(zone).append(h('p', { class: 'muted', text: t('commun.chargement') }));
    try {
      moteur = await getEngine('piper');
      voix = await moteur.etat();
    } catch (err) {
      clear(zone).append(h('p', { class: 'banner banner-warn', role: 'status', text: err.message }));
      return;
    }
    if (!voix.length) {
      clear(zone).append(h('p', { class: 'muted', text: t('voix.hd.err.absente') }));
      return;
    }
    const feminin = voix.filter((v) => genreDe(v) === 'F');
    const masculin = voix.filter((v) => genreDe(v) === 'M');

    // ── Menu déroulant groupé
    selectEl = h('select', { 'aria-label': t('voix.hd.choisir'), style: 'width:100%;padding:.4rem;font:inherit;' },
      feminin.length ? h('optgroup', { label: t('voix.hd.feminin') }, ...feminin.map((v) => h('option', { value: v.id }, `${v.nom}${v.installe ? ' ✓' : ''}`))) : null,
      masculin.length ? h('optgroup', { label: t('voix.hd.masculin') }, ...masculin.map((v) => h('option', { value: v.id }, `${v.nom}${v.installe ? ' ✓' : ''}`))) : null,
    );
    selectEl.addEventListener('change', () => afficherDetail(selectEl.value));

    detailEl = h('div', { class: 'stack', style: 'margin-top:.6rem;' });
    clear(zone).append(
      h('label', { style: 'display:block;' }, h('span', { class: 'muted small', text: t('voix.hd.choisir') }), selectEl),
      detailEl,
    );
    afficherDetail(voix[0].id);
  }

  function afficherDetail(id) {
    const v = voix.find((x) => x.id === id);
    if (!v) return;
    clear(detailEl);

    const barre = h('progress', { max: 1, value: 0, hidden: true, 'aria-label': t('voix.hd.progression') });
    const statut = h('span', { class: 'muted small', role: 'status', text: v.installe ? t('voix.hd.installee') : t('voix.hd.meta', { type: 'non installée', taille: taille(v.taille) }) });
    const actions = h('div', { class: 'row' });

    // Écouter un court échantillon : synthétise "Bonjour, je suis <Nom>" et joue.
    // Ne peut se faire que si la voix est installée.
    // Protections : (1) un seul appel à la fois (sinon deux syntheses Piper se tuent),
    // (2) annulation propre si on reclique sur une autre voix.
    async function ecouter() {
      if (!v.installe || annuler) return;
      if (ecouteEnCours) {
        // Re-clic sur la même voix pendant qu'elle charge : on annule simplement le précédent.
        ecouteAbort?.abort();
        return;
      }
      // Annule l'écoute précédente (autre voix) si on clique une nouvelle.
      try { lecteur?.pause(); } catch { /* ignoré */ }
      if (urlLecteur) { URL.revokeObjectURL(urlLecteur); urlLecteur = null; }
      ecouteEnCours = true;
      const abort = new AbortController();
      ecouteAbort = abort;
      // Message "chargement" pendant la synthèse (le worker peut mettre 5-15s sur un nouveau modèle)
      notify(t('voix.hd.ecoute.chargement') || 'Chargement de la voix…', 'info', 20000);
      try {
        const nomCourt = (v.nom || '').split(' ·')[0].trim() || 'Lectura';
        const phrase = `Bonjour, je suis ${nomCourt}.`;
        const r = await moteur.synthesize(phrase, { voixId: v.id, vitesse: 1 });
        if (abort.signal.aborted) { ecouteEnCours = false; ecouteAbort = null; return; }
        const wav = encodeWav(r.samples, r.sampleRate);
        urlLecteur = URL.createObjectURL(wav);
        lecteur = new Audio(urlLecteur);
        lecteur.onended = () => { if (urlLecteur) { URL.revokeObjectURL(urlLecteur); urlLecteur = null; } lecteur = null; };
        await lecteur.play();
      } catch (err) {
        if (abort.signal.aborted) return;  // clic d'annulation : pas de message d'erreur
        report('voix-hd', err);
        notify(t('voix.hd.ecoute.echec') || "Impossible d'écouter cet échantillon.", 'warn', 4000);
      } finally {
        if (ecouteAbort === abort) { ecouteEnCours = false; ecouteAbort = null; }
      }
    }

    const boutons = () => {
      clear(actions);
      if (annuler) actions.append(h('button', { type: 'button', class: 'btn', text: t('commun.annuler'), onClick: () => annuler?.abort() }));
      else if (v.installe) {
        // Voix installée : Écouter + Supprimer
        actions.append(h('button', { type: 'button', class: 'btn', onClick: ecouter, title: t('voix.hd.ecouter') }, icon('play'), t('voix.hd.ecouter')));
        actions.append(h('button', { type: 'button', class: 'btn btn-danger', onClick: supprimer }, icon('trash'), t('voix.hd.supprimer')));
      } else {
        // Voix non installée : Installer
        actions.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: telecharger }, icon('download'), t('voix.hd.telecharger', { taille: taille(v.taille) })));
      }
    };

    async function telecharger() {
      if (!confirm(t('voix.hd.confirmer', { taille: taille(v.taille) }))) return;
      annuler = new AbortController();
      barre.hidden = false; boutons();
      try {
        await moteur.download(v.id, { signal: annuler.signal, onProgress: (fait, total) => {
          barre.value = total ? fait / total : 0;
          statut.textContent = t('voix.hd.progressionTexte', { fait: taille(fait), total: taille(total), pct: Math.round((100 * fait) / (total || 1)) });
        } });
        v.installe = true;
        statut.textContent = t('voix.hd.installee');
        notify(t('voix.hd.prete'), 'ok');
        onChange?.();
        // Rafraîchir le menu pour mettre à jour les ✓
        const opt = selectEl?.querySelector(`option[value="${v.id}"]`);
        if (opt) opt.textContent = `${v.nom} ✓`;
      } catch (err) {
        statut.textContent = t('voix.hd.reprise');
        report('voix-hd', err);
      }
      annuler = null; barre.hidden = true; boutons();
    }

    async function supprimer() {
      if (!confirm(t('voix.hd.supprimer.confirmer', { taille: taille(v.taille) }))) return;
      try {
        await moteur.remove(v.id);
        v.installe = false;
        statut.textContent = t('voix.hd.meta', { type: 'non installée', taille: taille(v.taille) });
        notify(t('voix.hd.supprimee'), 'info');
        onChange?.();
        const opt = selectEl?.querySelector(`option[value="${v.id}"]`);
        if (opt) opt.textContent = v.nom;
      } catch (err) { report('voix-hd', err); }
      boutons();
    }

    boutons();
    detailEl.append(
      h('div', { class: 'card stack', style: 'padding:.75rem;border:1px solid #333;border-radius:.5rem;' },
        h('div', { class: 'row between' }, h('strong', { text: v.nom }), statut),
        barre,
        actions,
        h('p', { class: 'muted small', style: 'margin:0;', text: `${t('voix.hd.licence')} : ${v.licence}. ${v.attribution}` }),
      ),
    );
  }

  dessiner();
  return {
    el,
    async toutSupprimer() {
      annuler?.abort();
      await (moteur || (await getEngine('piper'))).removeAll();
      onChange?.();
      await dessiner();
    },
  };
}
