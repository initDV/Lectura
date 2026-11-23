// @ts-check
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t, taille } from '../modules/i18n.js';
import { getEngine } from '../modules/voice/engine.js';
import { report, notify } from '../modules/errors.js';
import { encodeWav } from '../modules/audio.js';

const genreDe = (v) => /·\s*M\s*·/.test(v.nom) ? 'M' : 'F';

export function voixHdPanel({ onChange } = {}) {
  const zone = h('div', { class: 'stack' });
  const el = h('div', { class: 'stack' }, h('p', { class: 'muted small', text: t('voix.hd.aide') }), zone);
  let moteur, choisi, select, fiche, annuler, travail, lecteur, urlLecteur, ecouteAbort;
  let voix = [];

  function arreterEcoute() {
    ecouteAbort?.abort();
    lecteur?.pause(); lecteur = null;
    if (urlLecteur) { URL.revokeObjectURL(urlLecteur); urlLecteur = null; }
  }

  async function ecouter(v) {
    if (ecouteAbort || lecteur) { arreterEcoute(); return; }
    const abort = new AbortController();
    ecouteAbort = abort;
    notify(t('voix.hd.ecoute.chargement'), 'info', 20000);
    try {
      const nom = v.nom.split(' ·')[0];
      const r = await moteur.synthesize(`Bonjour, je suis ${nom}.`, { voixId: v.id, vitesse: 1, signal: abort.signal });
      if (abort.signal.aborted) return;
      urlLecteur = URL.createObjectURL(encodeWav(r.samples, r.sampleRate));
      lecteur = new Audio(urlLecteur);
      lecteur.onended = arreterEcoute;
      await lecteur.play();
    } catch (err) {
      if (!abort.signal.aborted) report('voix-hd', err);
      if (ecouteAbort === abort) arreterEcoute();
    } finally { if (ecouteAbort === abort) ecouteAbort = null; }
  }

  async function dessiner() {
    try {
      moteur ||= await getEngine('piper');
      const stock = await moteur.stockage();
      voix = stock.voix;
      if (!voix.length) {
        clear(zone).append(h('p', { class: 'muted', text: t('voix.hd.err.absente') }));
        return;
      }
      choisi = voix.some((v) => v.id === choisi) ? choisi : voix[0].id;
      const options = (genre, cle) => {
        const liste = voix.filter((v) => genreDe(v) === genre);
        return liste.length ? h('optgroup', { label: t(cle) }, ...liste.map((v) =>
          h('option', { value: v.id }, `${v.nom}${v.installe ? ' ✓' : ''}`))) : null;
      };
      const libelle = t('voix.hd.choisir');
      select = h('select', { 'aria-label': libelle, onChange: () => { arreterEcoute(); choisi = select.value; detail(); } },
        options('F', 'voix.hd.feminin'), options('M', 'voix.hd.masculin'));
      select.value = choisi;
      fiche = h('div', { class: 'card stack' });
      const info = h('div', { class: 'stack' }, h('strong', { text: t('voix.hd.stockage') }),
        h('p', { class: 'muted small', text: t('voix.hd.stockageTotal', { taille: stock.totalOctets ? taille(stock.totalOctets) : '0 Ko' }) }),
        stock.moteurOctets ? h('p', { class: 'muted small', text: t('voix.hd.stockageMoteur', { taille: taille(stock.moteurOctets) }) }) : null,
        stock.modeles.length ? h('ul', { class: 'small' }, ...stock.modeles.map((m) => h('li', null,
          h('strong', { text: m.noms.join(' / ') }), ' — ', t(m.installe ? 'voix.hd.stockageInstallee' : 'voix.hd.partiel', { taille: taille(m.octets) })))) : null);
      clear(zone).append(h('label', null, h('span', { class: 'muted small', text: libelle }), ' ', select), fiche, info);
      detail();
    } catch (err) {
      clear(zone).append(h('p', { class: 'banner banner-warn', role: 'status', text: err.message }));
    }
  }

  async function appliquer(fn, { silencieux = () => false } = {}) {
    if (travail) return;
    arreterEcoute();
    select.disabled = true;
    try {
      travail = fn();
      await travail;
      onChange?.();
    } catch (err) {
      if (!silencieux()) report('voix-hd', err);
    } finally {
      travail = null;
      await dessiner();
    }
  }

  function detail() {
    const v = voix.find((x) => x.id === choisi);
    const boutons = h('div', { class: 'row' });
    const statut = h('span', { class: 'muted small', role: 'status', text: v.installe ? t('voix.hd.installee')
      : v.partiel ? t('voix.hd.partiel', { taille: taille(v.modele.octets) }) : t('voix.hd.nonInstallee', { taille: taille(v.taille) }) });
    const barre = h('progress', { max: 1, value: 0, hidden: true, 'aria-label': t('voix.hd.progression') });
    const btn = (cle, dessin, onClick, classe = 'btn', args = {}) => h('button', { type: 'button', class: classe, onClick }, icon(dessin), t(cle, args));
    if (v.installe) {
      boutons.append(btn('voix.hd.ecouter', 'play', () => ecouter(v)), btn('voix.hd.supprimer', 'trash', () => {
        const partage = v.modele.noms.length > 1 ? ` ${t('voix.hd.modelePartage', { nom: v.modele.noms.join(' / ') })}` : '';
        if (!confirm(t('voix.hd.supprimer.confirmer', { taille: taille(v.modele.octets) }) + partage)) return;
        clear(boutons);
        appliquer(async () => { await moteur.remove(v.id); notify(t('voix.hd.supprimee'), 'info'); });
      }, 'btn btn-danger'));
    } else {
      boutons.append(btn(v.partiel ? 'voix.hd.reprendrePartiel' : 'voix.hd.telecharger', 'download', () => {
        if (!confirm(t('voix.hd.confirmer', { taille: taille(v.restant) }))) return;
        const abort = new AbortController(); annuler = abort;
        barre.hidden = false;
        clear(boutons).append(h('button', { type: 'button', class: 'btn', text: t('commun.annuler'), onClick: () => abort.abort() }));
        appliquer(async () => {
          try {
            await moteur.download(v.id, { signal: abort.signal, onProgress: (fait, total) => {
              barre.value = total ? fait / total : 0;
              statut.textContent = t('voix.hd.progressionTexte', { fait: taille(fait), total: taille(total), pct: Math.round(100 * barre.value) });
            } });
            notify(t('voix.hd.prete'), 'ok');
          } finally { annuler = null; }
        }, { silencieux: () => abort.signal.aborted });
      }, 'btn btn-primary', { taille: taille(v.restant) }));
      if (v.partiel) boutons.append(btn('voix.hd.effacerPartiel', 'trash', () => {
        if (!confirm(t('voix.hd.effacerPartielConfirmer', { nom: v.modele.noms.join(' / ') }))) return;
        clear(boutons);
        appliquer(async () => { if (await moteur.removePartial(v.id)) notify(t('voix.hd.partielEfface'), 'info'); });
      }, 'btn btn-danger'));
    }
    clear(fiche).append(h('div', { class: 'row between' }, h('strong', { text: v.nom }), statut), barre, boutons,
      h('p', { class: 'muted small', text: `${t('voix.hd.licence')} : ${v.licence}. ${v.attribution}` }));
  }

  zone.append(h('p', { class: 'muted', text: t('commun.chargement') }));
  dessiner();
  return {
    el,
    async toutSupprimer() {
      annuler?.abort();
      await travail?.catch(() => {});
      arreterEcoute();
      await (moteur || (await getEngine('piper'))).removeAll();
      onChange?.();
      await dessiner();
    },
  };
}
