// Capture Pages itself, not a checkout or a mocked network response.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.LECTURA_REPORT;
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width:390, height:780 }, deviceScaleFactor:1,
    isMobile:true, hasTouch:true, locale:'fr-FR', reducedMotion:'reduce' });
  const res = await page.goto('https://initdv.github.io/Lectura/', { waitUntil:'networkidle' });
  if (!res?.ok()) throw Error(`Pages HTTP ${res?.status()}`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByText('Passer', { exact:true }).waitFor();
  await page.screenshot({ path:`${out}/web-tuto.png` });
  await page.getByText('Passer', { exact:true }).click();
  await page.locator('.char-pane svg#lectura-char').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path:`${out}/web-scene.png` });
  const boxes = {};
  for (const selector of ['.stage', '.char-pane', '.term-window', '.term-bar', '.panel', '.texte', '.actions-bar', '.fab-settings']) {
    boxes[selector] = await page.locator(selector).first().boundingBox();
  }
  await writeFile(`${out}/web-boxes.json`, JSON.stringify(boxes, null, 2));
  await page.getByRole('button', { name:'Menu', exact:true }).click();
  await page.screenshot({ path:`${out}/web-menu.png` });
  const dialog = page.getByRole('dialog', { name:'Menu' });
  const menuBoxes = {};
  for (const [label, element] of [
    ['dialog', dialog], ['title', dialog.locator('h2')], ['name', dialog.locator('input[type=text]')],
    ...['Enregistrer','Projets','Importer .txt / .md','Aperçu sans son','Plein écran'].map(label => [label,dialog.getByText(label, { exact:true })]),
  ]) {
    const r = await element.boundingBox();
    if (r) menuBoxes[label] = [r.x, r.y, r.width, r.height];
  }
  await writeFile(`${out}/web-menu-boxes.json`, JSON.stringify(menuBoxes,null,2));
  const version = await (await page.request.get(new URL('src/version.js', res.url()).href)).text();
  const models = await (await page.request.get(new URL('models/index.json', res.url()).href)).json();
  await writeFile(`${out}/web-reference.json`, JSON.stringify({ url:res.url(), status:res.status(),
    etag:res.headers().etag, version, voices:models.voix, date:new Date().toISOString() },null,2));
  const summary = `HTTP ${res.status()} ; ${version.match(/BUILD = '([^']+)'/)?.[1] || 'build inconnu'} ; ${models.voix?.length ?? 0} voix déclarées`;
  console.log(`::notice file=docs/ANDROID_PARITE.md,title=Référence Pages::${summary}`);
} finally { await browser.close(); }
