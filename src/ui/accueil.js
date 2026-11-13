// @ts-check
// Écran Accueil : nouveau projet, ouvrir un .lectura, exemple, projets récents, installation, brouillon retrouvé.
import { bus, store } from '../state.js';
import { h, clear, pickFile } from './dom.js';
import { icon } from './icons.js';
import { t, getLang } from '../modules/i18n.js';
import { newProject, parseProject } from '../modules/project.js';
import { listProjects, getProject, deleteProject, getAudio, getDraft, clearDraft } from '../modules/storage.js';
import { report, notify } from '../modules/errors.js';
import { canInstall, promptInstall, isStandalone, isIos } from '../modules/pwa.js';
import { go } from '../router.js';

/** Projet neuf qui reprend les réglages par défaut de l'utilisateur. */
export function projetVierge(init = {}) {
  const s = store.settings;
  return newProject({
    terminal: { theme: s.themeTerminal, police: s.policeTerminal, taille: s.tailleTexte, vitesseCps: s.vitesseDefilement, prompt: '$ ' },
    audio: { source: 'voix', voix: { moteur: s.moteurVoix, id: s.voixId, vitesse: s.vitesseVoix, hauteur: s.hauteurVoix } },
    ...init,
  });
}

export function ouvrir(projet, blob = null, route = 'editeur') {
  store.projet = projet;
  store.audioBlob = blob;
  store.modifie = false;
  store.apercu = false;
  go(route);
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
    ouvrir(projetVierge({ titre: t('accueil.exempleTitre'), texte: (await res.text()).trim() }), null, 'scene');
  } catch (err) {
    report('exemple', err);
  }
}

function banniereInstallation() {
  if (isStandalone()) return null;
  const zone = h('div', { class: 'banner', hidden: !canInstall() && !isIos() });
  const dessiner = () => {
    clear(zone);
    if (canInstall()) {
      zone.hidden = false;
      zone.append(h('p', { text: t('accueil.installer.texte') }),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: async () => { if (await promptInstall()) zone.hidden = true; } }, icon('download'), t('accueil.installer.bouton')));
    } else if (isIos()) {
      zone.append(h('p', { text: t('accueil.installer.ios') }));
    }
  };
  dessiner();
  return { zone, off: bus.on('pwa:installable', dessiner) };
}

export async function render(root) {
  const liste = h('ul', { class: 'list', 'aria-label': t('accueil.recents') });
  const vide = h('p', { class: 'muted', text: t('accueil.aucunProjet') });
  const brouillon = h('div', { class: 'banner banner-warn', hidden: true });
  const inst = banniereInstallation();

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
    h('section', { class: 'hero' },
      h('img', { src: 'icons/favicon.svg', alt: '', width: 96, height: 96 }),
      h('h1', { text: 'Lectura' }),
      h('p', { text: t('accueil.slogan') })),
    inst?.zone,
    brouillon,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => ouvrir(projetVierge()) }, icon('plus'), t('accueil.nouveau')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirFichier }, icon('folder'), t('accueil.ouvrir')),
      h('button', { type: 'button', class: 'btn', onClick: ouvrirExemple }, icon('play'), t('accueil.exemple'))),
    h('section', { class: 'card' }, h('h2', { text: t('accueil.recents') }), vide, liste));

  try {
    await recents();
    const d = await getDraft();
    if (d && d.texte) {
      brouillon.hidden = false;
      brouillon.append(h('p', { text: t('accueil.brouillon', { titre: d.titre || t('editeur.sansTitre') }) }),
        h('button', { type: 'button', class: 'btn btn-primary', text: t('accueil.brouillon.reprendre'), onClick: async () => {
          try { ouvrir(parseProject(JSON.stringify(d)), (await getAudio(d.id)) || null); store.modifie = true; } catch (err) { report('brouillon', err); }
        } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: t('accueil.brouillon.supprimer'), onClick: async () => { await clearDraft(); brouillon.hidden = true; } }));
    }
  } catch (err) {
    report('accueil', err);
  }
  return () => inst?.off();
}
