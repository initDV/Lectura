// @ts-check
// Écran Réglages : langue, voix, voix HD, terminal, animations, mots-clés personnalisés (Pro), stockage, version.
import { store } from '../state.js';
import { h, add, clear, field, debounce } from './dom.js';
import { t, taille, LANGUES } from '../modules/i18n.js';
import { majReglages } from '../app.js';
import { THEMES, POLICES } from '../modules/themes.js';
import { storageInfo, requestPersist } from '../modules/pwa.js';
import { report, notify } from '../modules/errors.js';
import { VERSION, BUILD } from '../version.js';
import { voicePanel } from './voix-panel.js';
import { voixHdPanel } from './voix-hd.js';
import { motsPersoPanel } from './mots-perso.js';

export async function render(root) {
  const s = store.settings;
  const sauver = (patch) => majReglages(patch).catch((err) => report('reglages', err));
  /** Section Décor : 4 couleurs modifiables + bouton Réinitialiser. */
  const decorPanel = () => {
    const d = store.settings.decor || {};
    const DEF = { mur: '#1a2340', sol: '#1c1429', horizon: '#00d4ff', neon: '#ff3ea5' };
    const entrees = [
      ['mur', 'reglages.decor.mur'],
      ['sol', 'reglages.decor.sol'],
      ['horizon', 'reglages.decor.horizon'],
      ['neon', 'reglages.decor.neon'],
    ];
    const champs = entrees.map(([cle, label]) => {
      const inp = h('input', { type: 'color', value: d[cle] || DEF[cle], id: `decor-${cle}`, 'aria-label': t(label) });
      inp.addEventListener('change', () => sauver({ decor: { ...store.settings.decor, [cle]: inp.value } }));
      return h('div', { class: 'field' }, h('label', { for: `decor-${cle}`, text: t(label) }), inp);
    });
    return h('div', null,
      h('div', { class: 'grid-2' }, ...champs),
      h('p', { class: 'muted small', text: t('reglages.decor.aide') }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', text: t('reglages.decor.reset'), onClick: () => sauver({ decor: { ...DEF } }) })),
    );
  };
  const sauverDoux = debounce(sauver, 300);
  /** Reporte aussi le réglage du terminal sur le projet ouvert (les réglages sont les valeurs par défaut). */
  const terminal = (cleReglage, cleProjet, v) => { if (store.projet) { store.projet.terminal[cleProjet] = v; store.modifie = true; } sauverDoux({ [cleReglage]: v }); };
  const pro = () => h('span', { class: 'badge badge-pro', text: 'PRO' });

  // Langue
  const langue = h('select', null, ...Object.entries(LANGUES).map(([c, n]) => h('option', { value: c, text: n })));
  langue.value = s.langue;
  langue.addEventListener('change', () => sauver({ langue: langue.value }));

  // Voix par défaut
  const voix = { moteur: s.moteurVoix, id: s.voixId, vitesse: s.vitesseVoix, hauteur: s.hauteurVoix };
  const panneau = voicePanel({
    voix, volume: s.volume,
    onChange: (v) => {
      if (store.projet) { Object.assign(store.projet.audio.voix, v); store.modifie = true; }
      sauverDoux({ moteurVoix: v.moteur, voixId: v.id, vitesseVoix: v.vitesse, hauteurVoix: v.hauteur });
    },
    onVolume: (v) => sauverDoux({ volume: v }),
  });
  const hd = voixHdPanel({ onChange: () => panneau.refresh() });

  // Terminal
  const verrou = !store.pro;
  const theme = h('select', { disabled: verrou }, ...Object.entries(THEMES).map(([c, d]) => h('option', { value: c, text: d.nom })));
  theme.value = THEMES[s.themeTerminal] ? s.themeTerminal : 'sombre';
  theme.addEventListener('change', () => terminal('themeTerminal', 'theme', theme.value));
  const police = h('select', { disabled: verrou }, ...Object.keys(POLICES).map((p) => h('option', { value: p, text: p })));
  police.value = POLICES[s.policeTerminal] ? s.policeTerminal : 'JetBrains Mono';
  police.addEventListener('change', () => terminal('policeTerminal', 'police', police.value));
  const tailleTxt = h('input', { type: 'range', min: 12, max: 40, step: 1, value: s.tailleTexte });
  const champTaille = field(`${t('reglages.taille')} : ${s.tailleTexte} px`, tailleTxt);
  tailleTxt.addEventListener('input', () => { champTaille.querySelector('label').textContent = `${t('reglages.taille')} : ${tailleTxt.value} px`; terminal('tailleTexte', 'taille', +tailleTxt.value); });
  const vitesse = h('input', { type: 'range', min: 5, max: 120, step: 1, value: s.vitesseDefilement, disabled: verrou });
  const champVitesse = field(`${t('reglages.vitesse')} : ${s.vitesseDefilement} ${t('reglages.cps')}`, vitesse, t('reglages.vitesse.aide'));
  vitesse.addEventListener('input', () => { champVitesse.querySelector('label').textContent = `${t('reglages.vitesse')} : ${vitesse.value} ${t('reglages.cps')}`; terminal('vitesseDefilement', 'vitesseCps', +vitesse.value); });
  const fond = h('input', { type: 'color', value: store.projet?.reglages.fond || '#0b0f14', disabled: !store.projet });
  fond.addEventListener('input', () => { if (store.projet) { store.projet.reglages.fond = fond.value; store.modifie = true; } });
  const mouvements = h('select', { disabled: !store.projet }, ...['calme', 'normal', 'vif'].map((m) => h('option', { value: m, text: t(`reglages.mouvements.${m}`) })));
  mouvements.value = store.projet?.reglages.mouvements || 'normal';
  mouvements.addEventListener('change', () => { if (store.projet) { store.projet.reglages.mouvements = mouvements.value; store.modifie = true; } });

  const titreTerm = h('input', { type: 'text', value: s.titreTerminal, maxLength: 60, autocomplete: 'off', spellcheck: false });
  titreTerm.addEventListener('input', () => sauverDoux({ titreTerminal: titreTerm.value }));

  // Animations / présentation
  const coche = (cle, texte) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!s[cle], onChange: (e) => sauver({ [cle]: e.target.checked }) }), texte);

  // Stockage
  const stock = h('dl', { class: 'kv' }), jauge = h('progress', { max: 1, value: 0, 'aria-label': t('reglages.stockage') });
  async function majStockage() {
    const i = await storageInfo();
    jauge.value = i.ratio || 0;
    clear(stock).append(
      h('dt', { text: t('reglages.stockage.utilise') }), h('dd', { text: Number.isFinite(i.usage) ? `${taille(i.usage)} / ${taille(i.quota)} (${Math.round(i.ratio * 100)} %)` : t('reglages.stockage.inconnu') }),
      h('dt', { text: t('reglages.stockage.persistant') }), h('dd', { text: t(i.persiste ? 'commun.oui' : 'commun.non') }));
  }
  const proteger = h('button', { type: 'button', class: 'btn', text: t('reglages.stockage.proteger'), onClick: async () => {
    notify(t((await requestPersist()) ? 'reglages.stockage.protegeOk' : 'reglages.stockage.protegeNon'), 'info');
    majStockage();
  } });
  const liberer = h('button', { type: 'button', class: 'btn btn-danger', text: t('reglages.stockage.liberer'), onClick: async () => {
    if (!confirm(t('reglages.stockage.confirmer'))) return;
    try { await hd.toutSupprimer(); notify(t('reglages.stockage.libere'), 'ok'); } catch (err) { report('stockage', err); }
    majStockage();
  } });

  add(root,
    h('h1', { text: t('nav.reglages') }),
    store.projet ? h('p', { class: 'muted', text: t('reglages.projetOuvert', { titre: store.projet.titre || t('editeur.sansTitre') }) }) : null,
    h('section', { class: 'card' }, h('h2', { text: t('reglages.langue') }), field(t('reglages.langue.choix'), langue)),
    h('section', { class: 'card' }, h('h2', { text: t('reglages.voix') }), panneau.el),
    h('section', { class: 'card' }, h('h2', { text: t('voix.hd.titre') }), hd.el),
    h('section', { class: 'card' }, h('h2', null, t('reglages.terminal'), ' ', verrou ? pro() : null),
      verrou ? h('p', { class: 'muted small', text: t('reglages.terminal.pro') }) : null,
      field(t('reglages.titreTerminal'), titreTerm),
      h('section', { class: 'card' }, h('h2', { text: t('reglages.themeApp') || 'Apparence' }),
      h('p', { class: 'muted small', text: t('reglages.themeApp.aide') || 'Choisis un thème visuel. L\'aperçu est immédiat.' }),
      h('select', { id: 'theme-app', style: 'width:100%;padding:.4rem;font:inherit;',
        onChange: (e) => { document.documentElement.setAttribute('data-theme', e.target.value); sauver({ themeApp: e.target.value }); } },
        ...[['actuel','1 · Actuel (violet)'],['eminence-clair','2 · Eminence clair'],['eminence-sombre','3 · Eminence sombre'],['pastel','4 · Pastel'],['papier','5 · Papier journal'],['minimaliste','6 · Minimaliste'],['ocean','7 · Océan'],['foret','8 · Forêt'],['retro','9 · Rétro'],['safran','10 · Safran']]
          .map(([v, label]) => h('option', { value: v, selected: s.themeApp === v, text: label })),
      )),
    h('div', { class: 'grid-2' }, field(t('reglages.theme'), theme), field(t('reglages.police'), police), champTaille, champVitesse,
        field(t('reglages.fond'), fond, store.projet ? null : t('reglages.projetRequis')), field(t('reglages.mouvements'), mouvements, store.projet ? null : t('reglages.projetRequis')))),
    h('section', { class: 'card' }, h('h2', { text: t('reglages.animations') }),
      coche('reduireAnimations', t('reglages.reduire')), coche('modePresentation', t('reglages.presentation'))),
    h('section', { class: 'card' }, h('h2', { text: t('reglages.decor') }), decorPanel()),
    h('section', { class: 'card' }, h('h2', null, t('reglages.mots'), ' ', pro()), motsPersoPanel({ sauver }).el),
    h('section', { class: 'card' }, h('h2', { text: t('reglages.stockage') }), jauge, stock, h('div', { class: 'row' }, proteger, liberer)),
    h('section', { class: 'card' }, h('h2', { text: t('reglages.version') }), h('p', { text: `Lectura ${VERSION} (${BUILD})` }),
      h('a', { class: 'btn', href: '#/apropos', text: t('nav.apropos') })),
    h('p', null, h('a', { class: 'btn btn-primary', href: '#/scene', text: t('nav.retour') })));
  majStockage();
  return () => panneau.stop();
}
