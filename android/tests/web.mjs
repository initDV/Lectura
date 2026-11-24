// Capture Pages itself, not a checkout or a mocked network response.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = process.env.LECTURA_REPORT;
const systemVoice = process.env.LECTURA_TEST_SYSTEM_VOICE === '1';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(systemVoice ? { headless: false, args: ['--enable-speech-dispatcher'] } : {});
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
    ...['Enregistrer','Projets','Importer .txt / .md','Aperçu sans son','Plein écran'].map(label => [label,dialog.getByText(label, { exact:true }).locator('..')]),
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

  const wav = process.env.LECTURA_TEST_SPEECH_WAV;
  if (wav) {
    const { lips } = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await page.locator('.texte').fill(lips.text);
    await page.getByRole('button', { name: 'Accélérer' }).click();
    await page.evaluate(async () => {
      const { bus, store } = await import(new URL('src/state.js', location.href));
      const trace = window.lecturaTrace = { store, frames: [], boundaries: [], error: '' };
      bus.on('timeline:tick', ({ ms, chars }) => queueMicrotask(() => {
        const mouth = document.querySelector('.char-pane #mouth');
        trace.frames.push([ms, chars, Number(mouth?.getAttribute('height')), Number(mouth?.getAttribute('width'))]);
      }));
      bus.on('tts:boundary', ({ char }) => trace.boundaries.push(char));
      bus.on('ui:toast', ({ type, message }) => { if (type === 'error') trace.error = message; });
    });
    const play = async (mode) => {
      await page.evaluate(({ text, speed }) => {
        const trace = window.lecturaTrace;
        if (trace.store.projet.texte !== text || trace.store.projet.audio.voix.vitesse !== speed) {
          throw Error('Texte ou vitesse inattendus sur Pages');
        }
        trace.frames.length = trace.boundaries.length = 0;
        trace.error = '';
      }, lips);
      await page.locator('.lancer').click();
      await page.waitForFunction(() => ['FIN', 'ERREUR'].includes(window.lecturaTrace.store.etat), null, { timeout: 20000 });
      const trace = await page.evaluate(() => {
        const { store, frames, boundaries, error } = window.lecturaTrace;
        return { status: store.etat, voice: store.projet.audio.voix, frames, boundaries, error };
      });
      await writeFile(`${out}/web-lips-${mode}.json`, JSON.stringify(trace));
      if (trace.status !== 'FIN' || !trace.frames.some((row) => row[1] > 0) || new Set(trace.frames.map((row) => row[2])).size < 2) {
        throw Error(`Pages ${mode} : lecture ou animation incomplète (${trace.error})`);
      }
      console.log(`::notice file=docs/ANDROID_PARITE.md,title=Lecture Pages::${mode}, ${trace.frames.length} images (texte commun, 1,25×), ${trace.boundaries.length} événements de mot`);
    };
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Importer un fichier audio', exact: true }).click();
    await (await chooser).setFiles(wav);
    await page.waitForFunction(() => window.lecturaTrace.store.projet.audio.source === 'fichier');
    await play('wav');

    if (systemVoice) {
      // Select a real browser voice through the app, without synthesizing or mocking SpeechSynthesis in the harness.
      const voice = await page.waitForFunction(() => {
        const voices = speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang) && v.localService);
        return (voices.find((v) => /^fr[-_]fr$/i.test(v.lang)) || voices[0])?.name;
      }, null, { timeout: 8000 });
      await page.getByRole('button', { name: 'Choisir la voix', exact: true }).click();
      await page.getByRole('dialog', { name: 'Choisir la voix' }).getByRole('button', { name: await voice.jsonValue(), exact: true }).first().click();
      await play('tts');
    }
  }
} finally { await browser.close(); }
