// @ts-check
// Écran Éditeur : titre, texte (coller / .txt / .md), voix (fichier audio OU voix intégrée), personnage,
// expression par segment, aperçu, lancement de la scène. Brouillon automatique toutes les 5 s.
import { store } from '../state.js';
import { h, field, pickFile, debounce } from './dom.js';
import { icon } from './icons.js';
import { t, horloge } from '../modules/i18n.js';
import { serializeProject, fileBase } from '../modules/project.js';
import { autoTiming, segmentsValides, reportExpressions, estimateDurationMs } from '../modules/timeline.js';
import { parseSubtitles, cuesToProject, toSrt, toVtt } from '../modules/subtitles.js';
import { saveProject, saveAudio, saveDraft, clearDraft } from '../modules/storage.js';
import { MSG_FORMAT, FORMATS_AUDIO } from '../modules/audio.js';
import { downloadBlob } from '../modules/capture.js';
import { report, notify } from '../modules/errors.js';
import { go } from '../router.js';
import { projetVierge } from './accueil.js';
import { voicePanel } from './voix-panel.js';
import { characterGrid } from './perso-grille.js';
import { segmentList } from './editeur-segments.js';

/** Durée d'un fichier audio, ou erreur claire si le navigateur ne sait pas le lire. */
function dureeAudio(blob) {
  return new Promise((res, rej) => {
    const a = new Audio(), url = URL.createObjectURL(blob);
    const fin = (fn, v) => { clearTimeout(delai); URL.revokeObjectURL(url); a.removeAttribute('src'); fn(v); };
    const delai = setTimeout(() => fin(rej, new Error(MSG_FORMAT)), 15000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => fin(res, Number.isFinite(a.duration) ? a.duration * 1000 : 0);
    a.onerror = () => fin(rej, new Error(MSG_FORMAT));
    a.src = url;
  });
}

export async function render(root) {
  if (!store.projet) { store.projet = projetVierge(); store.audioBlob = null; }
  const p = store.projet;
  let brouillonSale = false;
  const etat = h('span', { class: 'muted small', role: 'status' });
  const toucher = () => { store.modifie = true; brouillonSale = true; etat.textContent = t('editeur.nonEnregistre'); };
  const dureeRef = () => (p.audio.source === 'fichier' && p.audio.dureeMs) || estimateDurationMs(p.texte, p.audio.voix.vitesse);
  const segs = segmentList({ onChange: toucher });
  const recalculer = () => {
    if (p.timing === 'sous-titres' && !segmentsValides(p.texte, p.segments)) {
      p.timing = 'auto'; // le texte ne correspond plus aux sous-titres importés : retour au minutage automatique
      notify(t('editeur.timingPerdu'), 'warn');
    }
    if (p.timing !== 'sous-titres') p.segments = reportExpressions(autoTiming(p.texte, dureeRef()), p.segments);
    segs.dessiner(p.segments);
    compteur.textContent = t('editeur.compteur', { n: p.texte.length, phrases: p.segments.length });
  };

  // --- Titre + texte ---
  const titre = h('input', { type: 'text', value: p.titre, maxLength: 200, placeholder: t('editeur.sansTitre'), autocomplete: 'off' });
  const texte = h('textarea', { value: p.texte, placeholder: t('editeur.texte.aide'), spellcheck: true, rows: 9 });
  const compteur = h('span', { class: 'muted small' });
  titre.addEventListener('input', () => { p.titre = titre.value; toucher(); });
  const recalculerDoux = debounce(recalculer, 350);
  texte.addEventListener('input', () => { p.texte = texte.value.replace(/\r\n?/g, '\n'); toucher(); recalculerDoux(); });
  const importerTexte = async () => {
    const f = await pickFile('.txt,.md,.markdown,text/plain,text/markdown');
    if (!f) return;
    try {
      if (f.size > 2_000_000) throw new Error(t('editeur.err.tropGros'));
      p.texte = (await f.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
      texte.value = p.texte;
      if (!p.titre) { p.titre = f.name.replace(/\.[^.]+$/, ''); titre.value = p.titre; }
      toucher(); recalculer();
    } catch (err) { report('import-texte', err); }
  };
  const importerSousTitres = async () => {
    if (!store.pro) return notify(t('pro.requis.sousTitres'), 'info');
    const f = await pickFile('.srt,.vtt,text/vtt');
    if (!f) return;
    try {
      const r = cuesToProject(parseSubtitles(await f.text()));
      p.texte = r.texte; p.segments = r.segments; p.timing = 'sous-titres'; texte.value = p.texte;
      toucher(); recalculer();
      notify(t('editeur.sousTitresImportes', { n: r.segments.length }), 'ok');
    } catch (err) { report('import-sous-titres', err); }
  };
  const exporterSousTitres = (format) => {
    if (!store.pro) return notify(t('pro.requis.sousTitres'), 'info');
    if (!p.texte.trim()) return notify(t('scene.err.texteVide'), 'warn');
    recalculer();
    downloadBlob(new Blob([format === 'srt' ? toSrt(p.segments) : toVtt(p.segments)], { type: 'text/plain' }), `${fileBase(p)}.${format}`);
  };

  // --- Voix : fichier audio OU voix intégrée ---
  const nomFichier = h('span', { class: 'muted', text: p.audio.nomFichier ? `${p.audio.nomFichier} · ${horloge(p.audio.dureeMs)}` : t('editeur.aucunFichier') });
  const blocFichier = h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn', onClick: choisirAudio }, icon('upload'), t('editeur.choisirFichier')), nomFichier);
  const panneau = voicePanel({ voix: p.audio.voix, onChange: () => { toucher(); } });
  const radio = (valeur, cle) => h('label', null, h('input', { type: 'radio', name: 'source-voix', value: valeur, checked: p.audio.source === valeur,
    onChange: () => { p.audio.source = valeur; toucher(); basculer(); recalculer(); } }), t(cle));
  const basculer = () => { blocFichier.hidden = p.audio.source !== 'fichier'; panneau.el.hidden = p.audio.source !== 'voix'; };
  async function choisirAudio() {
    const f = await pickFile(FORMATS_AUDIO);
    if (!f) return;
    try {
      const duree = await dureeAudio(f); // échoue avec un message clair si le format n'est pas lisible
      store.audioBlob = f;
      p.audio.nomFichier = f.name; p.audio.dureeMs = Math.round(duree);
      nomFichier.textContent = `${f.name} · ${horloge(duree)}`;
      await saveAudio(p.id, f);
      toucher(); recalculer();
    } catch (err) { report('audio', err); }
  }

  // --- Personnage ---
  const grille = characterGrid({ valeur: p.personnageId, onChange: (id) => { p.personnageId = id; toucher(); } });

  // --- Actions ---
  const verifier = (pourScene) => {
    if (!p.texte.trim()) { notify(t('scene.err.texteVide'), 'warn'); texte.focus(); return false; }
    if (pourScene && p.audio.source === 'fichier' && !store.audioBlob) { notify(t('scene.err.sansAudio'), 'warn'); return false; }
    return true;
  };
  const enregistrer = async (silencieux) => {
    try {
      recalculer();
      await saveProject(p);
      await clearDraft();
      store.modifie = false; brouillonSale = false;
      etat.textContent = t('editeur.enregistre');
      if (!silencieux) notify(t('editeur.enregistre'), 'ok');
      return true;
    } catch (err) { report('enregistrement', err); return false; }
  };
  const lancer = async (apercu) => {
    panneau.stop();
    if (!verifier(!apercu)) return;
    if (!(await enregistrer(true))) return;
    store.apercu = apercu;
    go('scene');
  };
  const exporter = () => {
    try { recalculer(); downloadBlob(new Blob([serializeProject(p)], { type: 'application/json' }), `${fileBase(p)}.lectura`); } catch (err) { report('export', err); }
  };

  root.append(
    h('div', { class: 'row between' }, h('h1', { text: t('editeur.titre') }),
      h('div', { class: 'row' }, etat, h('a', { class: 'btn btn-ghost', href: '#/reglages' }, icon('settings'), t('nav.reglages')))),
    h('section', { class: 'card' },
      field(t('editeur.titreProjet'), titre),
      field(t('editeur.texte'), texte),
      h('div', { class: 'row between' }, compteur,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onClick: importerTexte }, icon('upload'), t('editeur.importerTexte')),
          h('button', { type: 'button', class: 'btn', onClick: importerSousTitres }, icon('upload'), t('editeur.importerSrt'), h('span', { class: 'badge badge-pro', text: 'PRO' }))))),
    h('section', { class: 'card' }, h('h2', { text: t('editeur.voix') }),
      h('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': t('editeur.voix') }, radio('fichier', 'editeur.voix.fichier'), radio('voix', 'editeur.voix.integree')),
      h('p', { class: 'muted small', text: t('editeur.voix.aide') }),
      blocFichier, panneau.el),
    h('section', { class: 'card' }, h('h2', { text: t('editeur.personnage') }), grille.el, segs.el),
    h('section', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onClick: () => lancer(true) }, icon('eye'), t('editeur.apercu')),
          h('button', { type: 'button', class: 'btn', onClick: () => enregistrer(false) }, icon('save'), t('editeur.enregistrer')),
          h('button', { type: 'button', class: 'btn', onClick: exporter }, icon('download'), t('editeur.exporter')),
          h('button', { type: 'button', class: 'btn', onClick: () => exporterSousTitres('srt') }, icon('download'), '.srt', h('span', { class: 'badge badge-pro', text: 'PRO' })),
          h('button', { type: 'button', class: 'btn', onClick: () => exporterSousTitres('vtt') }, icon('download'), '.vtt', h('span', { class: 'badge badge-pro', text: 'PRO' }))),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => lancer(false) }, icon('play'), t('editeur.lancer'))),
      h('p', { class: 'muted small', text: t('editeur.apercu.aide') })));
  basculer();
  recalculer();
  etat.textContent = store.modifie ? t('editeur.nonEnregistre') : '';

  // Brouillon automatique toutes les 5 s (seulement s'il y a eu un changement)
  const auto = setInterval(async () => {
    if (!brouillonSale) return;
    brouillonSale = false;
    try { await saveDraft(JSON.parse(JSON.stringify(p))); etat.textContent = t('editeur.brouillon'); } catch (err) { brouillonSale = true; report('brouillon', err); }
  }, 5000);
  return () => { clearInterval(auto); panneau.stop(); };
}
