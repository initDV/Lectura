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
  await page.getByRole('button', { name:'Menu', exact:true }).click();
  await page.screenshot({ path:`${out}/web-menu.png` });
  await writeFile(`${out}/web-reference.json`, JSON.stringify({ url:res.url(), status:res.status(), etag:res.headers().etag, date:new Date().toISOString() },null,2));
} finally { await browser.close(); }
