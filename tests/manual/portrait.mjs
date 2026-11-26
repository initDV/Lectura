// Test navigateur du build local avec Playwright (voir docs/AICHA-PWA.md).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const cas = [
  [390, 844, true], [480, 720, true], [481, 800, false], [540, 1130, true],
  [600, 900, false], [600, 999, false], [600, 1000, true], [600, 1243, true],
  [720, 1200, true], [721, 1500, false], [1243, 600, false], [1280, 800, false],
];
const noms = ['Aïcha', 'Charlotte', 'Doriane', 'Monique', 'Prisca', 'Robot Lectura', 'Robot rouge'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'fr-FR', reducedMotion: 'reduce', deviceScaleFactor: 1.8 });
  page.setDefaultTimeout(8000);
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const svg = '.char-pane > svg:not(.decor)';
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173/');
  await btn('Passer').click();
  for (const nom of noms) {
    await btn('Menu').click();
    await page.getByRole('link', { name: 'Personnages', exact: true }).click();
    await btn(nom).click();
    await page.locator('#app').getByRole('link', { name: 'Retour à la scène', exact: true }).click();
    await page.waitForFunction(({ svg, nom }) => document.querySelector(svg)?.getAttribute('aria-label') === nom, { svg, nom });
    for (const [width, height, empilee] of cas) {
      const label = `${nom} ${width}×${height}`;
      await page.setViewportSize({ width, height });
      const aspect = empilee ? 'none' : 'xMidYMax slice';
      // Le changement de matchMedia peut arriver une image après le redimensionnement.
      await page.waitForFunction(({ width, height, aspect }) => {
        const decor = document.querySelector('.char-pane > svg.decor');
        return window.innerWidth === width && window.innerHeight === height
          && (!decor || decor.getAttribute('preserveAspectRatio') === aspect);
      }, { width, height, aspect }).catch((cause) => { throw new Error(`${label} : cadrage du décor`, { cause }); });
      const rects = await page.evaluate((svg) => {
        const pane = document.querySelector('.char-pane');
        const r = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
        const perso = pane.querySelector(svg), box = perso.getBBox(), m = perso.getScreenCTM();
        const top = new window.DOMPoint(box.x, box.y).matrixTransform(m);
        const bottom = new window.DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(m);
        return { stage: r('.stage'), art: r('.char-pane'), term: r('.term-window'), eye: r('.oeil'), fab: r('.fab-settings'),
          sprite: { top: top.y, left: top.x, bottom: bottom.y, right: bottom.x },
          overflow: document.documentElement.scrollWidth > window.innerWidth };
      }, svg);
      const { stage, art, term, eye, fab, sprite, overflow } = rects;
      assert(!overflow, `${label} : débordement`);
      if (empilee) {
        assert(art.width === stage.width && term.width === stage.width && term.top >= art.bottom + 7.5,
          `${label} : le terminal doit être sous le personnage, en pleine largeur`);
        assert(sprite.left >= art.left - 2 && sprite.right <= art.right + 2 && sprite.top >= art.top - 2 && sprite.bottom <= art.bottom + 2,
          `${label} : le personnage doit être visible en entier`);
        assert(eye.top >= term.top && eye.bottom <= term.top + 50 && fab.bottom < term.top, `${label} : commandes superposées`);
      } else {
        assert(term.top === art.top && Math.abs(art.width - stage.width * .38) < 1, `${label} : deux colonnes 38/62 attendues`);
      }

    }
    console.log(`${nom} : ${cas.length} formats validés`);
    await page.setViewportSize({ width: 390, height: 844 });
  }
} finally { await browser.close(); }
