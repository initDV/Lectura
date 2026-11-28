// Recette du build servi : PLAYWRIGHT_MODULE=playwright node tests/atlas-pwa.browser.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { join } from 'node:path';
import { encodeWav } from '../src/modules/audio.js';

const amont = new URL(process.env.LECTURA_URL || 'http://127.0.0.1:4314/');
const prefixe = '/Lectura/';
const captures = process.env.ATLAS_CAPTURES;
if (captures) await mkdir(captures, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let coupe = false, requetesBloquees = 0;
// Vérifie à la fois le chemin de publication et une vraie coupure, aussi pour fetch() du service worker.
const relais = createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost/');
  if (!pathname.startsWith(prefixe)) return res.writeHead(404).end();
  if (coupe) { requetesBloquees++; res.destroy(); return; }
  const r = request(new URL(`./${pathname.slice(prefixe.length)}${search}`, amont), (rep) => {
    res.writeHead(rep.statusCode, rep.headers); rep.pipe(res);
  });
  r.on('error', () => res.writeHead(502).end());
  res.on('close', () => r.destroy());
  r.end();
});

const fenetre = '.stage > .term-pane > .term-window';
const texteZone = `${fenetre} > .term-body`, canvasZone = `${fenetre} > canvas`;
const btn = (p, name) => p.getByRole('button', { name, exact: true });
const menu = async (p, name) => { await btn(p, 'Menu').click(); return btn(p, name); };
async function atlas(p, etaitActif) {
  const choix = await menu(p, 'Atlas');
  assert.equal(await choix.getAttribute('aria-pressed'), String(etaitActif));
  await choix.click();
  await p.locator('.term-bar').waitFor({ state: etaitActif ? 'visible' : 'hidden' });
  if (etaitActif) {
    await p.locator(canvasZone).waitFor({ state: 'hidden' });
    await p.locator(texteZone).waitFor();
  }
  assert.equal(await p.locator('.stage').evaluate((s) => getComputedStyle(s).backgroundImage.includes('fond-atlas.svg')), !etaitActif);
}
async function projeter(p, id) {
  await p.locator(`${canvasZone}[data-planche="${id}"]`).waitFor();
  assert.equal(await p.locator(texteZone).isVisible(), false);
}
async function texteAtlas(p) {
  await p.locator('.stage.stage-atlas').waitFor();
  await p.locator(texteZone).waitFor();
  assert.equal(await p.locator(canvasZone).isVisible(), false);
  assert.equal(await p.locator('.term-bar').isVisible(), false);
}
async function cadreCommun(p) {
  await p.locator(canvasZone).waitFor({ state: 'attached' });
  const { texte, planche } = await p.locator(fenetre).evaluate((zone) => {
    const stage = zone.closest('.stage').getBoundingClientRect();
    const cadre = (selecteur) => {
      const { x, y, width, height } = zone.querySelector(`:scope > ${selecteur}`).getBoundingClientRect();
      return [x - stage.x, y - stage.y, width, height];
    };
    return { texte: cadre('.term-body'), planche: cadre('canvas') };
  });
  assert.deepEqual(planche, texte, 'La planche doit occuper exactement la zone du texte');
  assert.ok(texte[2] > 0 && texte[3] > 0);
  assert.equal(await p.locator('.stage canvas').count(), 1);
  return texte;
}
async function colonnes(p) {
  const gauche = await p.locator('.char-pane').boundingBox(), droite = await p.locator('.term-pane').boundingBox();
  assert.ok(gauche.width > 0 && droite.width / (gauche.width + droite.width) > .65);
  assert.ok(Math.abs(gauche.x + gauche.width - droite.x) <= 1 && Math.abs(gauche.y - droite.y) <= 1);
}
async function importer(p, bouton, fichier) {
  const pop = p.waitForEvent('filechooser');
  await bouton.click();
  await (await pop).setFiles(fichier);
}
const observation = (p) => p.evaluate(() => {
  const t = window.__recetteAtlas;
  return { ...t.temps, transitions: t.transitions, medias: t.medias, memeScene: t.scene === document.querySelector('.stage'),
    memePersonnage: t.personnage === document.querySelector('.char-pane > svg:not(.decor)'),
    memeCadre: t.cadre === document.querySelector('.term-window'), memeZoneTexte: t.zoneTexte === document.querySelector('.term-body') };
});
const attendreImage = (p) => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const poserA = async (p, ms) => {
  await p.evaluate(async (ms) => {
    const piste = window.__recetteAtlas.piste;
    if (!piste?.paused) throw new Error('La piste WAV doit être en pause pour cadrer une image précise');
    piste.currentTime = ms / 1000;
    if (piste.seeking) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Le saut vers ${ms} ms n’a pas abouti`)), 5000);
      piste.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }, ms);
  await attendreImage(p);
};
const attendreTemps = (p, seuil) => p.evaluate(async (seuil) => {
  const { bus } = await import('./src/state.js');
  if (window.__recetteAtlas.temps.ms >= seuil) return;
  await new Promise((resolve, reject) => {
    const delai = setTimeout(() => { off(); reject(new Error(`Le temps ${seuil} ms n’a pas été atteint`)); }, 10000);
    const off = bus.on('timeline:tick', ({ ms }) => { if (ms >= seuil) { clearTimeout(delai); off(); resolve(); } });
  });
}, seuil);

// Passe tout le catalogue par le même canvas que la scène, après redémarrage hors ligne.
async function verifierCatalogue(p) {
  return p.evaluate(async () => {
    const { creerProjection } = await import('./src/modules/atlas/projection.js');
    const { compilerPlanches } = await import('./src/modules/atlas/calage.js');
    const planches = await (await fetch('./src/modules/atlas/planches.json')).json();
    const planifier = compilerPlanches(planches), zone = document.createElement('div');
    zone.style.cssText = 'position:fixed;left:-800px;top:0;width:230px;height:310px;';
    zone.setAttribute('aria-hidden', 'true');
    document.body.append(zone);
    const projection = creerProjection(zone, false), canvas = zone.querySelector('canvas');
    const image = async (timeline, id, ms) => {
      const delai = performance.now() + 3500;
      do {
        projection.image(timeline, ms);
        if (projection.peindre && canvas.dataset.planche === id) return canvas.toDataURL();
        await new Promise(resolve => requestAnimationFrame(resolve));
      } while (performance.now() < delai);
      throw new Error(`Impossible de peindre ${id} à ${ms} ms hors ligne`);
    };
    try {
      projection.charger();
      for (const fiche of planches) {
        let timeline, evenement;
        for (const nom of fiche.expressions) {
          const segs = [{ texte: `Voici ${nom}.`, debutMs: 0, finMs: 7000 }];
          const [e] = planifier(segs);
          if (e?.fiche.id === fiche.id) { timeline = { segs }; evenement = e; break; }
        }
        if (!timeline) throw new Error(`Planche non sélectionnée : ${fiche.id}`);
        const phases = evenement.gestes;
        const g = phases?.find(x => x.fin > 560 && x.debut < 6640);
        const t = g ? (Math.max(g.debut, 560) + Math.min(g.fin, 6650)) / 2 : 100;
        const repos = g && [570, ...phases.map(x => x.fin + 5), 6600].find(ms =>
          ms >= 560 && ms <= 6650 && !phases.some(x => x.debut <= ms && ms < x.fin));
        const mobile = await image(timeline, fiche.id, t);
        const fixe = await image(timeline, fiche.id, repos ?? 6500);
        if (mobile === fixe || await image(timeline, fiche.id, t) !== mobile) {
          throw new Error(`Geste absent ou pose non reproductible : ${fiche.id}`);
        }
      }
      return planches.length;
    } finally {
      projection.dispose(); zone.remove();
    }
  });
}

try {
  await new Promise((r) => relais.listen(0, '0.0.0.0', r));
  const base = `http://127.0.0.1:${relais.address().port}${prefixe}`;
  const c = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, locale: 'fr-FR', acceptDownloads: true });
  const p = await c.newPage(), erreurs = [];
  p.setDefaultTimeout(12000);
  p.on('pageerror', (err) => erreurs.push(err.message));
  p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await p.goto(base);
  await btn(p, 'Passer').click();
  await p.locator('.term-pane').waitFor();
  await p.locator('.char-pane > svg:not(.decor)').waitFor();
  assert.equal(await p.locator('.stage.stage-atlas').count(), 0);
  await p.evaluate(async () => {
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const delai = setTimeout(() => reject(new Error('La page n’est pas contrôlée par le service worker')), 9000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(delai); resolve(); }, { once: true });
    });
    const { bus } = await import('./src/state.js');
    const t = { scene: document.querySelector('.stage'), personnage: document.querySelector('.char-pane > svg:not(.decor)'),
      cadre: document.querySelector('.term-window'), zoneTexte: document.querySelector('.term-body'),
      temps: { ms: 0 }, transitions: [], medias: [] };
    window.__recetteAtlas = t;
    // Accès à la piste réelle dans la recette : échantillons au temps demandé, pas après un délai mural.
    const { AudioEngine } = await import('./src/modules/audio.js');
    const init = AudioEngine.prototype.init;
    AudioEngine.prototype.init = function () { init.call(this); t.piste = this.el; };
    bus.on('timeline:tick', (v) => { t.temps = v; });
    bus.on('app:state', ({ vers }) => t.transitions.push(vers));
    for (const evt of ['audio:ready', 'audio:play', 'audio:pause']) bus.on(evt, () => t.medias.push(evt));
  });
  assert.equal(await p.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.includes('/src/modules/atlas/'))), false);
  const condensation = ['La vapeur redevient liquide sur la paroi froide du verre.',
    'L’air humide se refroidit au contact de la surface. De petites gouttes se forment.',
    'La lumière les fait briller sur la paroi. Elles se rejoignent, puis glissent doucement vers le fond.',
    'Le verre posé sur la table laisse un cercle humide autour de sa base.'].join(' ');
  const textes = ['Dans un réseau local, le routeur relie les appareils.', 'Les appareils échangent des données.',
    'Un instant de calme avant de poursuivre la lecture.', condensation, 'Le silence revient, la lumière baisse et tout devient plus calme.',
    'Dans un prisme optique, le rayon de lumière blanche arrive sur le verre.',
    'À la sortie, les couleurs se séparent : du rouge au violet.', 'La lecture continue.'];
  const srt = [[0, 3], [3, 5], [5, 6], [6, 11], [11, 18], [18, 21], [21, 24], [24, 26]].map(([a, b], i) =>
    `${i + 1}\n00:00:${String(a).padStart(2, '0')},000 --> 00:00:${String(b).padStart(2, '0')},000\n${textes[i]}\n`).join('\n');
  await importer(p, await menu(p, 'Importer .srt / .vtt'), { name: 'temoin.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await p.getByText(`${textes.length} sous-titres importés : leurs dates seront respectées.`, { exact: true }).waitFor();
  const texte = await p.locator('textarea.texte').inputValue();
  assert.ok(textes.every(phrase => texte.includes(phrase)));
  const wav = encodeWav(Float32Array.from({ length: 16000 * 26 }, (_, i) => .15 * Math.sin(i * 2 * Math.PI * 192 / 16000)), 16000);
  await importer(p, btn(p, 'Importer un fichier audio'), { name: 'temoin.wav', mimeType: wav.type, buffer: Buffer.from(await wav.arrayBuffer()) });
  await p.getByText(/• temoin\.wav · /).waitFor();
  await btn(p, 'Lancer').click();
  await btn(p, 'Pause').waitFor();
  const avant = await observation(p), url = p.url();

  await atlas(p, false);
  assert.equal(p.url(), url);
  assert.equal(await p.locator('.char-pane > .decor').isVisible(), false);
  assert.equal(await p.locator('.panel').isVisible(), true);
  assert.equal(await p.locator('textarea.texte').inputValue(), texte);
  await colonnes(p);
  await projeter(p, 'reseau-local');
  const pendant = await observation(p);
  assert.ok(pendant.ms > avant.ms && pendant.memePersonnage && pendant.memeScene && pendant.memeCadre && pendant.memeZoneTexte);
  assert.ok((await p.locator('.stage').boundingBox()).height >= 320);
  assert.deepEqual(pendant.transitions, ['PREPARATION', 'PRET', 'LECTURE']);
  assert.deepEqual(pendant.medias, ['audio:ready', 'audio:play']);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320);
  if (captures) await p.screenshot({ path: join(captures, 'atlas-320.png'), fullPage: true });
  await atlas(p, true);
  assert.equal(await p.locator('.char-pane > .decor').isVisible(), true);
  const retour = await observation(p);
  assert.ok(retour.ms > pendant.ms && retour.memePersonnage && retour.memeScene && retour.memeCadre && retour.memeZoneTexte);
  assert.deepEqual(retour.medias, pendant.medias);
  assert.deepEqual(retour.transitions, pendant.transitions);
  if (captures) await p.screenshot({ path: join(captures, 'terminal-320.png'), fullPage: true });

  await atlas(p, false);
  await btn(p, 'Pause').click();
  await projeter(p, 'reseau-local');
  const image = async () => createHash('sha256').update(await p.locator(canvasZone).evaluate(c => c.toDataURL())).digest('hex');
  const cadrePortrait = await cadreCommun(p);
  await poserA(p, 1000);
  const veille = await image();
  await poserA(p, 1800);
  const routeur = await image();
  assert.notEqual(routeur, veille, 'Le routeur s’allume alors que les liens ne sont pas encore établis');
  await poserA(p, 2670);
  const etabli = await image();
  assert.notEqual(etabli, routeur, 'Les appareils se connectent');
  await poserA(p, 3700);
  assert.equal(await image(), etabli, 'Pas d’animation en boucle avant le passage sur les échanges');
  await poserA(p, 3900);
  const envoi = await image();
  assert.notEqual(envoi, etabli, 'Le signal apparaît pendant le passage sur les échanges');
  await poserA(p, 4140);
  const fixe = await image();
  assert.notEqual(fixe, envoi, 'Le signal se déplace avec la lecture');
  await attendreImage(p);
  assert.equal(await image(), fixe);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await attendreImage(p);
  const reduit = await image();
  assert.notEqual(reduit, fixe, 'Une flèche fixe remplace le signal mobile');
  await attendreImage(p);
  assert.equal(await image(), reduit);
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await attendreImage(p);
  assert.equal(await image(), fixe);
  // Le saut de Lectura (+5 s) tombe dans la seconde planche, puis dans le passage sans planche.
  await p.keyboard.press('ArrowRight');
  await projeter(p, 'meteo-cycle-condensation');
  assert.notEqual(await image(), fixe);
  assert.ok((await p.locator(texteZone).textContent()).includes(textes[2]), 'Le texte a continué même masqué');
  // Les états restent dans le même cadre et sont reproductibles, sans dépendre de la cadence du navigateur.
  const posesVerre = [];
  for (const [ms, nom] of [[7600, 'paroi'], [8870, 'gouttes'], [9350, 'reunion'], [10190, 'glisse']]) {
    await poserA(p, ms);
    await projeter(p, 'meteo-cycle-condensation');
    posesVerre.push(await image());
    if (captures) {
      const data = await p.locator(canvasZone).evaluate(c => c.toDataURL().split(',')[1]);
      await writeFile(join(captures, `condensation-${nom}.png`), Buffer.from(data, 'base64'));
    }
  }
  assert.equal(new Set(posesVerre).size, 4, 'Les quatre états du verre doivent être visibles');
  await poserA(p, 8870);
  assert.equal(await image(), posesVerre[1]);
  await poserA(p, 9140);
  assert.deepEqual(await cadreCommun(p), cadrePortrait);
  await p.keyboard.press('ArrowRight');
  await texteAtlas(p);
  assert.deepEqual(await cadreCommun(p), cadrePortrait);
  const lireZone = () => p.locator(texteZone).evaluate(el => ({ texte: el.textContent, dernier: el.lastElementChild?.textContent,
    scroll: el.scrollTop, reste: el.scrollHeight - el.clientHeight - el.scrollTop }));
  const texteEnCours = await lireZone();
  assert.ok(texteEnCours.texte.includes(condensation));
  assert.ok(texteEnCours.dernier?.startsWith('Le ') && texteEnCours.dernier.length < textes[4].length);
  assert.ok(texteEnCours.scroll > 0 && Math.abs(texteEnCours.reste) <= 1, JSON.stringify(texteEnCours));
  await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
  assert.deepEqual(await lireZone(), texteEnCours);
  if (captures) {
    const pngTexte = p.waitForEvent('download');
    await (await menu(p, 'Capture PNG')).click();
    await (await pngTexte).saveAs(join(captures, 'capture-texte-1080.png'));
    assert.deepEqual(await lireZone(), texteEnCours);
    await p.locator('.stage').screenshot({ path: join(captures, 'texte-320.png') });
  }
  await p.keyboard.press('ArrowLeft');
  await projeter(p, 'meteo-cycle-condensation');
  await p.keyboard.press('ArrowLeft');
  await projeter(p, 'reseau-local');
  assert.equal(await image(), fixe);
  await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  assert.equal(await image(), fixe);
  assert.deepEqual((await observation(p)).medias, ['audio:ready', 'audio:play', 'audio:pause']);
  if (captures) await p.screenshot({ path: join(captures, 'planche-320.png'), fullPage: true });
  await p.getByRole('switch', { name: 'Capturer l’écran' }).click();
  assert.equal(await p.locator('.panel').isVisible(), false);
  assert.equal(await p.locator('.term-pane').isVisible(), true);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 320);
  assert.ok((await p.locator('.stage').boundingBox()).height >= 528);
  await projeter(p, 'reseau-local');
  const cadrePresentation = await cadreCommun(p);
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await texteAtlas(p);
  assert.deepEqual(await cadreCommun(p), cadrePresentation);
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  await projeter(p, 'reseau-local');
  await p.keyboard.press('Escape');
  assert.deepEqual(await cadreCommun(p), cadrePortrait);
  const png = p.waitForEvent('download');
  await (await menu(p, 'Capture PNG')).click();
  const capture = await png;
  if (captures) await capture.saveAs(join(captures, 'capture-atlas-1080.png'));
  const visible = await readFile(await capture.path());
  const pixel = await p.evaluate(async (base64) => {
    const { renderFondAtlas } = await import('./src/modules/capture.js');
    const fond = await renderFondAtlas(), image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const { width: w, height: h } = image, canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const mesurer = () => [...ctx.getImageData(w - 40, 160, 1, 1).data];
    const couleurs = (x, y, l, h, test) => {
      const pixels = ctx.getImageData(x, y, l, h).data;
      let n = 0;
      for (let i = 0; i < pixels.length; i += 4) if (test(...pixels.subarray(i, i + 3))) n++;
      return n;
    };
    ctx.drawImage(image, 0, 0);
    const nx = w * .34, y = h * .43, l = w - nx, hauteur = h * .12;
    const planche = couleurs(nx, y, l, hauteur, (r, g, b) => g > 155 && g > r + 24 && b > 165);
    const personnage = couleurs(0, h * .3, nx, h * .4, (r, g, b) => r > 95 && r > g + 25 && b > g + 45);
    const obtenu = mesurer(), k = Math.max(w / fond.width, h / fond.height);
    ctx.drawImage(fond, (w - fond.width * k) / 2, h - fond.height * k, fond.width * k, fond.height * k);
    return { w, h, obtenu, attendu: mesurer(), planche, personnage };
  }, visible.toString('base64'));
  assert.deepEqual([pixel.w, pixel.h], [1080, 1920]);
  assert.deepEqual(pixel.obtenu, pixel.attendu);
  assert.ok(pixel.planche > 300 && pixel.personnage > 300, JSON.stringify(pixel));

  await p.setViewportSize({ width: 1440, height: 900 });
  await colonnes(p);
  assert.ok((await p.locator('.stage').boundingBox()).width > 1200);
  await projeter(p, 'reseau-local');
  const cadreBureau = await cadreCommun(p);
  // Une nouvelle planche suit deux sous-titres contigus, sans modifier le cadre.
  await poserA(p, 19650);
  await projeter(p, 'physique-prisme-optique');
  const rayon = await image();
  await poserA(p, 22370);
  await projeter(p, 'physique-prisme-optique');
  const spectre = await image();
  assert.notEqual(spectre, rayon, 'Le prisme passe du rayon incident au spectre');
  await poserA(p, 22630);
  assert.notEqual(await image(), spectre, 'Le tracé évolue avec la seconde réplique');
  await poserA(p, 22370);
  assert.equal(await image(), spectre, 'Un saut rétablit exactement la pose du spectre');
  assert.deepEqual(await cadreCommun(p), cadreBureau);
  if (captures) {
    await p.getByText('Capture enregistrée.', { exact: true }).waitFor({ state: 'hidden' });
    await p.locator('.stage').screenshot({ path: join(captures, 'prisme-1440.png') });
  }
  await poserA(p, 24300);
  await texteAtlas(p);
  assert.deepEqual(await cadreCommun(p), cadreBureau);
  await poserA(p, 4140);
  await projeter(p, 'reseau-local');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await texteAtlas(p);
  assert.deepEqual(await cadreCommun(p), cadreBureau);
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  await projeter(p, 'reseau-local');
  if (captures) {
    await p.getByText('Capture enregistrée.', { exact: true }).waitFor({ state: 'hidden' });
    await p.screenshot({ path: join(captures, 'planche-1440.png'), fullPage: true });
  }
  if (process.env.ATLAS_VIDEO === '1') {
    await (await menu(p, 'Enregistrer la vidéo')).click();
    await p.locator('.rec-badge').waitFor();
    await attendreTemps(p, 5300);
    await texteAtlas(p);
    assert.deepEqual(await cadreCommun(p), cadreBureau);
    await attendreTemps(p, 7800);
    await projeter(p, 'meteo-cycle-condensation');
    assert.deepEqual(await cadreCommun(p), cadreBureau);
    await attendreTemps(p, 11300);
    await texteAtlas(p);
    await attendreTemps(p, 19550);
    await projeter(p, 'physique-prisme-optique');
    await attendreTemps(p, 22400);
    await projeter(p, 'physique-prisme-optique');
    assert.deepEqual(await cadreCommun(p), cadreBureau);
    await attendreTemps(p, 24300);
    await texteAtlas(p);
    await (await menu(p, 'Arrêter l’enregistrement')).click();
    const dl = p.getByRole('dialog', { name: 'Télécharger' });
    await dl.locator('#dl-garder').uncheck();
    const telechargement = p.waitForEvent('download');
    await dl.getByRole('button', { name: 'Télécharger', exact: true }).first().click();
    const video = await telechargement;
    const bytes = await readFile(await video.path());
    assert.ok(bytes.length > 20000);
    if (captures) await video.saveAs(join(captures, `video-atlas.${video.suggestedFilename().split('.').at(-1)}`));
  }
  await p.setViewportSize({ width: 320, height: 568 });

  await p.evaluate(async (texte) => {
    const { getDraft } = await import('./src/modules/storage.js');
    const delai = performance.now() + 7000;
    while ((await getDraft())?.texte !== texte) {
      if (performance.now() > delai) throw new Error('Brouillon non sauvegardé');
      await new Promise((r) => setTimeout(r, 60));
    }
    for (const asset of ['./data/fond-atlas.svg', './src/modules/atlas/projection.js', './src/modules/atlas/planches.json',
      './src/modules/atlas/reseau-local.js', './src/modules/atlas/scenarios.js', './src/modules/atlas/gestes.js', './src/modules/atlas/condensation.js']) {
      if (!(await caches.match(asset))) throw new Error(`${asset} absent du cache Lectura`);
    }
  }, texte);
  coupe = true;
  await c.setOffline(true);
  const reponse = await p.reload();
  assert.ok(reponse.fromServiceWorker());
  await p.locator('.stage.stage-atlas').waitFor();
  await p.locator('.char-pane > svg:not(.decor)').waitFor();
  assert.equal(await p.locator('textarea.texte').inputValue(), texte);
  assert.ok(requetesBloquees > 0);
  await atlas(p, true);
  await atlas(p, false);
  await texteAtlas(p);
  await (await menu(p, 'Aperçu sans son')).click();
  await projeter(p, 'reseau-local');
  const cadreHorsLigne = await cadreCommun(p);
  await texteAtlas(p);
  assert.deepEqual(await cadreCommun(p), cadreHorsLigne);
  assert.ok((await lireZone()).texte.includes(textes[0]));
  const nombre = await verifierCatalogue(p);
  const catalogueSource = JSON.parse(await readFile(new URL('../src/modules/atlas/planches.json', import.meta.url), 'utf8'));
  assert.equal(nombre, catalogueSource.length);
  assert.deepEqual(erreurs, []);
  console.log(`Atlas : ${nombre} planches animées hors ligne, états du réseau, du verre et du prisme ; cadre commun, WAV, mouvements réduits, pause, sauts, PNG${process.env.ATLAS_VIDEO === '1' ? ', vidéo' : ''} et hors ligne OK.`);
} finally {
  await browser.close();
  await new Promise((r) => { relais.close(r); relais.closeAllConnections(); });
}
