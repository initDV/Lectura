// Chromium + Playwright sur « node tools/preview-poses.mjs ».
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 800 }, locale: 'fr-FR' });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const btn = name => page.getByRole('button', { name, exact: true });
  const svg = page.locator('#portrait svg'), time = page.locator('#time');
  const visage = () => svg.evaluate(s => {
    const get = id => s.querySelector('#' + id), sourcil = get('sourcil-l'), b = get('plan-visage').getBBox();
    const path = el => el.getAttribute('d');
    const iris = get('iris-l').transform.baseVal.getItem(0).matrix;
    const cavite = get('cavite').getBBox(), svgBox = s.viewBox.baseVal;
    return {
      d: ['sourcil-l', 'sourcil-r', 'blanc-l', 'blanc-r', 'cavite'].map(id => path(get(id))).join('|'),
      cadre: s.getAttribute('viewBox'),
      masque: path(get('limite-l')) === path(get('blanc-l')) && path(get('limite-r')) === path(get('blanc-r')),
      froisse: get('nez').getAttribute('transform'), joues: get('joues').getAttribute('transform'),
      coin: get('cavite').getPointAtLength(0).y, pli: Number(get('pli-concentration').getAttribute('opacity')),
      sourcil: sourcil.getPointAtLength(sourcil.getTotalLength()).y, ouverture: get('blanc-l').getBBox().height,
      bouche: cavite.height, largeur: cavite.width, regard: iris.f,
      recadre: b.width < svgBox.width && b.y > svgBox.y && b.y + b.height < svgBox.y + svgBox.height,
    };
  });
  const choose = async expression => { await page.selectOption('#expression', expression); return visage(); };
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173/');
  await page.locator('#play:enabled').waitFor();
  await btn('Expressions').click();
  const repertoire = await page.locator('#expression option').evaluateAll(nodes => nodes.map(n => n.value));
  assert.equal(repertoire.length, 38);
  for (const id of ['aicha', 'charlotte', 'doriane', 'monique', 'prisca']) {
    await page.selectOption('#character', id);
    await page.locator('#play:enabled').waitFor();
    const notes = {};
    for (const expression of repertoire) {
      const f = notes[expression] = await choose(expression);
      assert(f.masque && f.recadre && !/NaN|Infinity/.test(f.d), `${id} : ${expression}`);
      assert.equal(f.cadre, '-39 -34 78 69');
    }
    assert.equal(new Set(Object.values(notes).map(v => v.d)).size, repertoire.length, `${id} : tracés distincts`);
    const { neutre, content, colere, triste, fatigue, surpris, peur, degoute } = notes;
    assert(content.coin < neutre.coin - .8 && content.joues !== neutre.joues, `${id} : sourire des joues et bouche`);
    assert(colere.sourcil > neutre.sourcil + 2 && colere.ouverture < neutre.ouverture - .65 && colere.pli > .38, `${id} : sourcils et paupières de colère`);
    assert(triste.sourcil < neutre.sourcil - 1.2 && triste.coin > neutre.coin + 1 && triste.regard > colere.regard + .85, `${id} : sourcils, commissures et regard tristes`);
    assert(triste.ouverture > fatigue.ouverture && triste.coin > fatigue.coin + .7, `${id} : tristesse différente de la fatigue`);
    assert(surpris.largeur < peur.largeur - 1 && surpris.bouche > peur.bouche + .9 && surpris.ouverture > neutre.ouverture, `${id} : surprise et peur`);
    assert(degoute.froisse !== neutre.froisse, `${id} : nez du dégoût`);
    console.log(`${id} : 38 visages distincts, cadrage et masques identiques`);
  }

  await choose('surpris');
  const pose = await visage();
  await time.fill('0');
  assert.notEqual((await visage()).d, pose.d, 'Départ neutre avant la montée de l’expression');
  await btn('Poser au repère').click();
  assert.deepEqual(await visage(), pose, 'Recherche déterministe au repère');

  const parole = page.getByRole('checkbox', { name: /En parlant/ });
  await parole.check();
  const bouche = await svg.evaluate(async s => {
    const { planBouche } = await import(new URL('src/modules/aicha/mouth.js', location.href));
    const phrase = document.getElementById('line').textContent.replace(/^«\s*|\s*»$/g, '');
    const piste = planBouche([{ texte: phrase, debutMs: 360, finMs: 2320 }], 'fr')[0];
    const cavite = s.querySelector('#cavite'), barre = document.getElementById('time');
    const hauteur = son => {
      barre.value = String((son.start + son.end) / 2); barre.dispatchEvent(new Event('input'));
      return cavite.getBBox().height;
    };
    return [hauteur(piste.phones.find(p => p.value[0] === .96)), hauteur(piste.phones.find(p => p.value[1] > 2.5))];
  });
  assert(bouche[0] < .35 && bouche[1] > 2, `Lèvres fermées sur M/P et ouvertes sur les voyelles malgré la surprise : ${bouche}`);
  await parole.uncheck();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#motion option[value="0"]:checked').waitFor({ state: 'attached' });
  await choose('triste');
  const fixe = await visage();
  await time.fill('440');
  assert.deepEqual(await visage(), fixe, 'Expression lisible mais fixe en mouvements réduits');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.setViewportSize({ width: 320, height: 568 });
  await btn('Colère').click();
  assert.equal(await page.locator('#expression').inputValue(), 'colere');
  const vue = await page.locator('.stage').boundingBox();
  assert(vue.y >= 0 && vue.y + vue.height < 565, 'Portrait visible pendant la sélection sur téléphone');
  const pixels = await svg.evaluate(async s => {
    const { renderSvg } = await import(new URL('src/modules/svgframe.js', location.href));
    const img = await renderSvg(s, 0);
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, cv.width, cv.height).data.some((x, i) => i % 4 === 3 && x > 200);
  });
  assert(pixels, 'Expression rendue sur Canvas');
  await btn('Gestes').click();
  assert.equal(await svg.getAttribute('viewBox'), '-101 -40 202 296');
  assert.deepEqual(erreurs, []);
  console.log('Parole, repère, mouvements réduits, cadrage mobile et export SVG → Canvas validés');
} finally { await browser.close(); }
