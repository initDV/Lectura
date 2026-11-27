// Chromium + Playwright sur « node tools/preview-poses.mjs » (voir docs/AICHA-PWA.md).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const chars = ['aicha', 'charlotte', 'doriane', 'monique', 'prisca'];
const figures = ['Main sur la hanche', 'Présenter une idée', 'Mettre en balance', 'Petit geste parasite', 'Se réjouir'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const erreurs = [];
  page.on('pageerror', err => erreurs.push(err.message));
  const svg = page.locator('#portrait svg'), time = page.locator('#time');
  const btn = name => page.getByRole('button', { name, exact: true });
  const image = () => svg.evaluate(s => s.outerHTML);
  const mainSurLaHanche = (side) => svg.evaluate((s, side) => {
    const main = s.querySelector(`#paume-${side}`);
    const tissus = [...s.querySelectorAll('#pantalon > path:first-child, #sweat > path:first-child')];
    const contient = (e, point) => e.isPointInFill(point.matrixTransform(e.getScreenCTM().inverse()));
    const touche = (point) => tissus.some(tissu => contient(tissu, point));
    const pointDuTracé = (d, distance = d.getTotalLength()) => d.getPointAtLength(distance).matrixTransform(d.getScreenCTM());
    const centre = s.createSVGPoint(); centre.y = 5.7;
    const paume = centre.matrixTransform(main.getScreenCTM());
    const doigts = [...main.querySelectorAll('path[id^="doigt-"]')], pouce = main.querySelector(`#pouce-${side}`);
    const boutPouce = pointDuTracé(pouce);
    return {
      calque: main.parentNode.parentNode.id,
      profilCache: s.querySelector(`#profil-${side}`).getAttribute('display') === 'none',
      paume: touche(paume),
      veste: contient(tissus[1], paume),
      ombre: Number(main.querySelector('#ombre-main-' + side)?.getAttribute('opacity')) || 0,
      pouceDégagé: boutPouce.y < paume.y && touche(boutPouce) && !contient(main.querySelector(`#main-${side}`), boutPouce),
      doigts: doigts.filter(d => {
        const base = pointDuTracé(d, 0), bout = pointDuTracé(d);
        return touche(bout) && bout.y - base.y > Math.abs(bout.x - base.x);
      }).length,
      tracés: [...doigts, pouce].map(d => d.getAttribute('d')),
    };
  }, side);
  const verifierAppui = ({ calque, profilCache, paume, pouceDégagé, doigts, ombre }, label) => {
    assert(ombre > .16 && ombre < .3, `Ombre discrète au contact : ${label}`);
    assert.deepEqual({ calque, profilCache, paume, pouceDégagé, doigts }, { calque: 'buste', profilCache: true, paume: true, pouceDégagé: true, doigts: 4 }, `Contact des doigts : ${label}`);
  };
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173/');
  for (const [width, height, gain] of [[390, 844, '1'], [320, 568, '1.3']]) {
    await page.setViewportSize({ width, height });
    await page.selectOption('#motion', gain);
    await page.evaluate(async () => { await document.fonts.ready; });
    for (const id of chars) {
      await page.selectOption('#character', id);
      await page.locator('#play:enabled').waitFor();
      for (const nom of figures) {
        await btn(nom).click();
        const label = `${id} : ${nom} (${width} × ${height})`;
        const side = nom === figures[0] ? 'r' : nom === figures[1] ? 'l' : '';
        const diagnostic = await svg.evaluate((s, side) => {
          const curseur = document.getElementById('time'), vb = s.viewBox.baseVal;
          const horsCadre = () => {
            const b = s.getBBox();
            return b.x < vb.x || b.x + b.width > vb.x + vb.width || b.y < vb.y || b.y + b.height > vb.y + vb.height;
          };
          const defilement = document.documentElement.scrollWidth > window.innerWidth;
          const ombre = side && s.querySelector('#ombre-main-' + side), pt = s.createSVGPoint();
          const tissus = [...s.querySelectorAll('#pantalon > path:first-child, #sweat > path:first-child')];
          const ombreSurTissu = () => {
            if (!ombre || !(Number(ombre.getAttribute('opacity')) > 0)) return true;
            const { x, y, width, height } = ombre.getBBox(), matrix = ombre.getScreenCTM();
            const surfaces = tissus.map(e => [e, e.getScreenCTM().inverse()]);
            for (let j = 0; j < 12; j++) {
              const u = Math.PI * j / 6;
              pt.x = x + (1 + Math.cos(u)) * width / 2;
              pt.y = y + (1 + Math.sin(u)) * height / 2;
              const v = pt.matrixTransform(matrix);
              if (!surfaces.some(([e, m]) => e.isPointInFill(v.matrixTransform(m)))) return false;
            }
            return true;
          };
          if (horsCadre()) return { defilement, coupe: 'repère' };
          const duree = Number(curseur.max);
          for (let t = 0; t <= duree; t += 100) {
            curseur.value = String(t);
            curseur.dispatchEvent(new Event('input'));
            if (horsCadre()) return { defilement, coupe: `${t} ms` };
            if (!ombreSurTissu()) return { defilement, ombreHorsTissu: `${t} ms` };
          }
          return { defilement, coupe: '' };
        }, side);
        assert(!diagnostic.ombreHorsTissu, `Ombre hors vêtement à ${diagnostic.ombreHorsTissu} : ${label}`);
        assert(!diagnostic.defilement, `Débordement horizontal : ${label}`);
        assert(!diagnostic.coupe, `Personnage coupé à ${diagnostic.coupe} : ${label}`);
        await btn('Poser au repère').click();
        const avant = await image();
        const posée = side && await mainSurLaHanche(side);
        if (posée) {
          verifierAppui(posée, label);
          if (id === 'monique') assert(posée.veste, `L’appui de Monique suit le blazer : ${label}`);
        }
        await time.fill('240');
        assert.notEqual(await image(), avant, `Le curseur doit déplacer ${label}`);
        if (posée) {
          const repos = await mainSurLaHanche(side);
          assert.equal(repos.ombre, 0, `Ombre masquée avant le contact : ${label}`);
          assert(repos.tracés.every((d, i) => d !== posée.tracés[i]), `Les cinq doigts doivent fléchir : ${label}`);
        }
        await btn('Poser au repère').click();
        assert.equal(await image(), avant, `Repère stable : ${label}`);
        if (gain !== '1') continue;
        const pixels = await svg.evaluate(async s => {
          const { renderSvg } = await import(new URL('src/modules/svgframe.js', location.href).href);
          const img = await renderSvg(s, 0);
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
          const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
          return c.getImageData(0, 0, cv.width, cv.height).data.filter((x, i) => i % 4 === 3 && x > 127).length;
        });
        assert(pixels > 5000, `Figure dans le Canvas : ${label}`);
      }
      console.log(`${id} : 5 figures, repères et cadrage ${width} × ${height}${gain === '1' ? ', Canvas validé' : ' en mode vif'}`);
    }
  }

  await btn(figures[0]).click();
  const cadre = await svg.getAttribute('viewBox'), pose = await mainSurLaHanche('r');
  const zoom = btn('Gros plan');
  await zoom.click();
  assert.equal(await zoom.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await svg.getAttribute('viewBox'), cadre);
  assert.deepEqual(await mainSurLaHanche('r'), pose, 'Le zoom ne modifie pas le contact');
  await btn(figures[1]).click();
  verifierAppui(await mainSurLaHanche('l'), 'Présentation en gros plan');
  await zoom.click();
  assert.equal(await svg.getAttribute('viewBox'), cadre, 'Retour au cadrage du personnage entier');
  await btn(figures[0]).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#motion option[value="0"]:checked').waitFor({ state: 'attached' });
  const reduit = await image();
  await time.fill('240');
  assert.equal(await image(), reduit, 'Posture stable en mouvements réduits');
  await page.selectOption('#motion', '1');
  await btn('Poser au repère').click();
  await page.selectOption('#speed', '0.5');
  const debut = Date.now();
  await page.clock.install({ time: debut });
  await page.clock.pauseAt(debut + 1000);
  const basculer = () => page.locator('#play').evaluate(b => b.click());
  await basculer();
  await page.clock.runFor(660);
  const avance = Number(await time.inputValue());
  assert(avance >= 290 && avance <= 340, `À ½×, ≈ 330 ms attendues après 660 ms ; obtenu ${avance} ms`);
  await basculer();
  const pause = await image();
  await page.clock.runFor(400);
  assert.equal(await image(), pause, 'Image figée en pause');
  assert.deepEqual(erreurs, []);
  console.log('Lecture à ½×, pause et préférence de mouvements réduits validées');
} finally { await browser.close(); }
