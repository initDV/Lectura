// @ts-check
// Écran Projets (ouvert depuis le menu) : nouveau projet, ouvrir un .lectura, exemple, bibliothèque.
// Fournit aussi le projet de départ de l'écran principal (brouillon retrouvé, sinon projet vierge).
import { store } from '../state.js';
import { h, clear, field, pickFile } from './dom.js';
import { icon } from './icons.js';
import { t, getLang } from '../modules/i18n.js';
import { newProject, parseProject } from '../modules/project.js';
import { listProjects, getProject, deleteProject, duplicateProject, ProjectAudioMissing, getAudio, getDraft } from '../modules/storage.js';
import { report, notify } from '../modules/errors.js';
import { go } from '../router.js';

/** Projet neuf qui reprend les réglages par défaut de l'utilisateur. */
export function projetVierge(init = {}) {
  const s = store.settings;
  return newProject({
    terminal: { theme: s.themeTerminal, police: s.policeTerminal, taille: s.tailleTexte, vitesseCps: s.vitesseDefilement, prompt: '' },
    personnageId: s.personnageId,
    audio: { source: 'voix', voix: { moteur: s.moteurVoix, id: s.voixId, vitesse: s.vitesseVoix, hauteur: s.hauteurVoix } },
    ...init,
  });
}

/** Ouvre un projet sur l'écran principal. */
export function ouvrir(projet, blob = null) {
  store.projet = projet;
  store.audioBlob = blob;
  store.modifie = false;
  store.apercu = false;
  go('scene');
}

/** Projet affiché au démarrage : le brouillon enregistré automatiquement s'il existe, sinon un projet vierge. */
export async function projetInitial() {
  try {
    const d = await getDraft();
    if (d && d.texte) {
      store.audioBlob = (await getAudio(d.id)) || null;
      return parseProject(JSON.stringify(d));
    }
  } catch (err) {
    report('brouillon', err);
  }
  return projetVierge();
}

async function ouvrirFichier() {
  const f = await pickFile('.lectura,.json,application/json');
  if (!f) return;
  try {
    const p = parseProject(await f.text());
    ouvrir(p);
    store.modifie = true; // importé mais pas encore enregistré sur cet appareil
    if (p.audio.source === 'fichier') notify(t('accueil.audioARechoisir', { nom: p.audio.nomFichier || '?' }), 'warn', 9000);
  } catch (err) {
    report('import', err);
  }
}

export async function ouvrirExemple() {
  try {
    const en = getLang() === 'en', res = await fetch(`data/samples/exemple_${en ? 'en' : 'fr'}.txt`);
    if (!res.ok) throw new Error(t('accueil.exempleIntrouvable'));
    ouvrir(projetVierge({ titre: t('accueil.exempleTitre'), texte: (await res.text()).trim() }));
  } catch (err) {
    report('exemple', err);
  }
}

const PAGE = 30;
const sansAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Filtre la bibliothèque entière avant de paginer ; ne modifie pas la liste stockée. */
export function filtrerProjets(projets, recherche, tri, langue, sansTitre) {
  const mot = sansAccents(recherche.trim());
  const titre = (p) => p.titre || sansTitre;
  const recents = (a, b) => String(b.modifieLe).localeCompare(String(a.modifieLe));
  const index = tri === 'titre' ? new Intl.Collator(langue, { sensitivity: 'base' }) : null;
  return projets.filter((p) => !mot || sansAccents(titre(p)).includes(mot)).sort((a, b) => {
    if (index) return index.compare(titre(a), titre(b)) || recents(a, b);
    return tri === 'anciens' ? recents(b, a) : recents(a, b);
  });
}

export async function render(root) {
  const langue = getLang(), sansTitre = t('editeur.sansTitre');
  const titres = [['recents', t('accueil.tri.recents')], ['anciens', t('accueil.tri.anciens')], ['titre', t('accueil.tri.titre')]];
  let projets = [], limite = PAGE, chargement = 0;
  const enCours = new Set();
  const liste = h('ul', { class: 'list', 'aria-label': t('accueil.bibliotheque') });
  const vide = h('p', { class: 'muted', role: 'status', hidden: true });
  const recherche = h('input', { type: 'search', maxLength: 200, onInput: reinitialiser });
  const tri = h('select', { onChange: reinitialiser }, titres.map(([value, text]) => h('option', { value, text })));
  const plus = h('button', { type: 'button', class: 'btn', hidden: true, text: t('accueil.plusProjets'), onClick: () => { limite += PAGE; afficher(); } });

  function reinitialiser() { limite = PAGE; afficher(); }

  async function charger() {
    const ticket = ++chargement, resultat = await listProjects();
    if (ticket !== chargement) return;
    projets = resultat;
    afficher();
  }

  async function dupliquer(p, titre) {
    if (enCours.has(p.id)) return;
    enCours.add(p.id); afficher();
    try {
      const copie = await duplicateProject(p.id, t('accueil.titreCopie', { titre: titre.slice(0, 180) }));
      await charger();
      notify(t('accueil.projetDuplique', { titre: copie.titre }), 'ok');
    } catch (err) {
      if (err instanceof ProjectAudioMissing) notify(t('accueil.duplicationAudioManquant'), 'warn');
      else report('duplication', err);
    } finally { enCours.delete(p.id); afficher(); }
  }

  function afficher() {
    const resultats = filtrerProjets(projets, recherche.value, tri.value, langue, sansTitre);
    clear(liste);
    vide.hidden = resultats.length > 0;
    vide.textContent = projets.length ? t('accueil.aucunResultat') : t('accueil.aucunProjet');
    plus.hidden = resultats.length <= limite;
    for (const p of resultats.slice(0, limite)) {
      const titre = p.titre || sansTitre, occupe = enCours.has(p.id);
      const date = new Date(p.modifieLe).toLocaleDateString(langue, { day: '2-digit', month: 'short', year: 'numeric' });
      liste.append(h('li', null,
        h('button', { type: 'button', class: 'open', onClick: async () => {
          try { ouvrir((await getProject(p.id)) || p, (await getAudio(p.id)) || null); } catch (err) { report('ouverture', err); }
        } }, h('span', { class: 'title', text: titre }), h('span', { class: 'meta', text: `${date} · ${p.texte.length} ${t('commun.caracteres')}` })),
        h('button', { type: 'button', class: 'btn btn-icon btn-ghost', disabled: occupe, 'aria-label': t('accueil.dupliquer', { titre }), onClick: () => dupliquer(p, titre) }, icon('copy')),
        h('button', { type: 'button', class: 'btn btn-icon btn-ghost', disabled: occupe, 'aria-label': t('accueil.supprimer', { titre }), onClick: async () => {
          if (enCours.has(p.id) || !confirm(t('accueil.confirmerSuppression', { titre }))) return;
          try { await deleteProject(p.id); await charger(); } catch (err) { report('suppression', err); }
        } }, icon('trash'))));
    }
  }

  root.append(
    h('h1', { text: t('nav.projets') }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ouvrir(projetVierge()) }, icon('plus'), t('accueil.nouveau')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirFichier }, icon('folder'), t('accueil.ouvrir')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirExemple }, icon('play'), t('accueil.exemple'))),
    h('section', { class: 'card stack' }, h('h2', { text: t('accueil.bibliotheque') }), field(t('accueil.rechercher'), recherche),
      field(t('accueil.trier'), tri), vide, liste, plus),
    h('p', null, h('a', { class: 'btn', href: '#/scene' }, icon('back'), t('nav.retour'))));

  try { await charger(); } catch (err) { report('projets', err); }
  return null;
}
