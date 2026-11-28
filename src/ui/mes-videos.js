// @ts-check
import { clear, field, h } from './dom.js';
import { ouvrirModale } from './modale.js';
import { t, taille } from '../modules/i18n.js';
import { downloadBlob } from '../modules/capture.js';
import { notify, report } from '../modules/errors.js';
import { fichierMedia, listerMedias, lireMedia, renommerMedia, supprimerMedia } from '../modules/video-store.js';

const bouton = (cle, action) => h('button', { type: 'button', class: 'btn', text: t(cle), onClick: action });
const absent = () => notify(t('mv.introuvable'), 'warn');

async function exporter(id, partager) {
  try {
    const media = await lireMedia(id);
    if (!media) return absent();
    const fichier = fichierMedia(media);
    if (partager && typeof navigator.share === 'function' && navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: media.titre });
    } else {
      downloadBlob(fichier, fichier.name);
      if (partager) notify(t('dl.partage.indispo'), 'info');
    }
  } catch (err) { if (err?.name !== 'AbortError') report('mediatheque', err); }
}

function ouvrirLecteur(media, retour) {
  const url = URL.createObjectURL(media.blob);
  const audio = media.type === 'audio';
  const player = h(audio ? 'audio' : 'video', {
    src: url, controls: true, autoplay: true, 'aria-label': media.titre,
    style: audio ? 'width:100%;' : 'width:100%;max-height:70vh;background:#000;border-radius:8px;',
  });
  ouvrirModale(t('mv.lecteur'), (fermer) => [
    h('p', { text: media.titre }), player,
    bouton('mv.retour', () => { fermer(); retour(); }),
  ], () => { player.pause(); URL.revokeObjectURL(url); });
}

function ouvrirRenommage(media, retour) {
  const input = h('input', { type: 'text', maxLength: 120, value: media.titre, required: true, autocomplete: 'off' });
  const envoyer = h('button', { type: 'submit', class: 'btn btn-primary', text: t('editeur.enregistrer') });
  const modale = ouvrirModale(t('mv.renommer'), (fermer) => [h('form', { class: 'stack', onSubmit: async (event) => {
    event.preventDefault();
    if (envoyer.disabled) return;
    if (!input.value.trim()) { input.setCustomValidity(t('mv.nomVide')); input.reportValidity(); return; }
    envoyer.disabled = true;
    try {
      if (!(await renommerMedia(media.id, input.value))) absent();
      if (modale.feuille.isConnected) { fermer(); retour(); }
    } catch (err) { report('mediatheque', err); envoyer.disabled = false; }
  } }, field(t('mv.nom'), input), h('div', { class: 'row' }, envoyer, bouton('commun.annuler', () => { fermer(); retour(); })))]);
  input.addEventListener('input', () => input.setCustomValidity(''));
  input.focus(); input.select();
  return modale;
}

export async function ouvrirMesVideos(filtre = 'tous') {
  try {
    let medias = await listerMedias();
    const select = h('select', { 'aria-label': t('mv.filtre'), onChange: () => { filtre = select.value; rendre(); } },
      ...['tous', 'audio', 'video'].map((valeur) => h('option', { value: valeur }, t(`mv.${valeur}`))));
    select.value = filtre;
    const liste = h('div', { class: 'stack' });
    const retour = () => ouvrirMesVideos(filtre);
    const { fermer, feuille } = ouvrirModale(t('mv.titre'), () => [h('label', null, t('mv.filtre'), ' ', select), liste]);
    function rendre() {
      clear(liste);
      const visibles = medias.filter((m) => filtre === 'tous' || m.type === filtre);
      if (!visibles.length) liste.append(h('p', { class: 'hint', text: t(medias.length ? 'mv.filtreVide' : 'mv.vide') }));
      for (const m of visibles) liste.append(h('article', { class: 'card stack' },
        h('strong', { text: m.titre }),
        h('p', { class: 'hint', text: `${new Date(m.date).toLocaleString()} · ${m.format.toUpperCase()} · ${taille(m.taille)}` }),
        h('div', { class: 'row', style: 'flex-wrap:wrap;' },
          bouton('mv.lire', async () => {
            try {
              const media = await lireMedia(m.id);
              if (!media) return absent();
              if (feuille.isConnected) { fermer(); ouvrirLecteur(media, retour); }
            } catch (err) { report('mediatheque', err); }
          }),
          bouton('mv.partager', () => exporter(m.id, true)),
          bouton('mv.enregistrer', () => exporter(m.id, false)),
          bouton('mv.renommer', () => { fermer(); ouvrirRenommage(m, retour); }),
          bouton('mv.supprimer', async () => {
            if (!confirm(t('mv.confirmer', { titre: m.titre }))) return;
            try {
              if (await supprimerMedia(m.id)) notify(t('mv.supprimee'), 'ok');
              medias = await listerMedias();
              rendre();
            } catch (err) { report('mediatheque', err); }
          }),
        ),
      ));
    }
    rendre();
    return { fermer, feuille };
  } catch (err) { report('mediatheque', err); }
}
