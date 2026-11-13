// @ts-check
// Écran Projets (ouvert depuis le menu) : nouveau projet, ouvrir un .lectura, exemple, projets récents.
// Fournit aussi le projet de départ de l'écran principal (brouillon retrouvé, sinon projet vierge).
import { store } from '../state.js';
import { h, clear, pickFile } from './dom.js';
import { icon } from './icons.js';
import { t, getLang } from '../modules/i18n.js';
import { newProject, parseProject } from '../modules/project.js';
import { listProjects, getProject, deleteProject, getAudio, getDraft } from '../modules/storage.js';
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

export async function render(root) {
  const liste = h('ul', { class: 'list', 'aria-label': t('accueil.recents') });
  const vide = h('p', { class: 'muted', text: t('accueil.aucunProjet') });

  async function recents() {
    const projets = await listProjects();
    clear(liste);
    vide.hidden = projets.length > 0;
    for (const p of projets.slice(0, 30)) {
      const date = new Date(p.modifieLe).toLocaleDateString(getLang(), { day: '2-digit', month: 'short', year: 'numeric' });
      liste.append(h('li', null,
        h('button', { type: 'button', class: 'open', onClick: async () => {
          try { ouvrir((await getProject(p.id)) || p, (await getAudio(p.id)) || null); } catch (err) { report('ouverture', err); }
        } }, h('span', { class: 'title', text: p.titre || t('editeur.sansTitre') }), h('span', { class: 'meta', text: `${date} · ${p.texte.length} ${t('commun.caracteres')}` })),
        h('button', { type: 'button', class: 'btn btn-icon btn-ghost', 'aria-label': t('accueil.supprimer', { titre: p.titre || t('editeur.sansTitre') }), onClick: async () => {
          if (!confirm(t('accueil.confirmerSuppression', { titre: p.titre || t('editeur.sansTitre') }))) return;
          try { await deleteProject(p.id); await recents(); } catch (err) { report('suppression', err); }
        } }, icon('trash'))));
    }
  }

  root.append(
    h('h1', { text: t('nav.projets') }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ouvrir(projetVierge()) }, icon('plus'), t('accueil.nouveau')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirFichier }, icon('folder'), t('accueil.ouvrir')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirExemple }, icon('play'), t('accueil.exemple'))),
    h('section', { class: 'card' }, h('h2', { text: t('accueil.recents') }), vide, liste),
    h('p', null, h('a', { class: 'btn', href: '#/scene' }, icon('back'), t('nav.retour'))));

  try {
    await recents();
  } catch (err) {
    report('projets', err);
  }
  return null;
}
