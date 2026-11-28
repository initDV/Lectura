import { describe, expect, it, vi } from 'vitest';
import { drawScene } from '../src/modules/capture.js';

const vue = { viewBox: { baseVal: { x: 0, y: 0, width: 240, height: 600 } }, getAttribute: () => 'xMidYMid meet' };
const fondAtlasImage = { width: 720, height: 480 };
const persoImage = {};
const projet = { reglages: { fond: '#111111' }, terminal: { theme: 'sombre', taille: 18 } };
const fauxCanvas = () => ({
  fillRect: vi.fn(), drawImage: vi.fn(), rect: vi.fn(),
  fillText: vi.fn(), arc: vi.fn(), roundRect: vi.fn(),
  save() {}, restore() {}, beginPath() {}, clip() {}, fill() {}, stroke() {},
  measureText: () => ({ width: 8 }),
});

describe('Composition Atlas dans les captures de la scène', () => {
  it.each([[1280, 720], [1080, 1920]])('partage le même fond en %i × %i : personnage à gauche, projection à droite', (W, H) => {
    const ctx = fauxCanvas(), peindreDecor = vi.fn(), peindreAtlas = vi.fn(), lineAt = vi.fn();
    const gauche = W * .34, s = Math.min(W, H) / 720;
    const yZone = 34 * s, hZone = H - 2 * yZone, wZone = W - gauche - 26 * s;
    const scene = { projet, modeAtlas: true, svg: vue, fondAtlasImage, persoImage, peindreDecor };
    drawScene(ctx, W, H, { ...scene, peindreAtlas, terminal: { shown: 8, lineAt } });
    expect(ctx.fillRect.mock.calls).toEqual([[0, 0, W, H], [gauche, yZone, s, hZone]]);
    expect(ctx.rect.mock.calls).toEqual([[0, 0, W, H], [0, 0, gauche, H], [gauche, yZone, wZone, hZone]]);
    const [[fond, x, y, w, h], [personnage]] = ctx.drawImage.mock.calls;
    expect(fond).toBe(fondAtlasImage);
    expect(x + w / 2).toBeCloseTo(W / 2);
    expect(y + h).toBeCloseTo(H);
    expect(w).toBeGreaterThanOrEqual(W);
    expect(h).toBeGreaterThanOrEqual(H);
    expect(personnage).toBe(persoImage);
    expect(peindreDecor).not.toHaveBeenCalled();
    expect(peindreAtlas.mock.calls).toEqual([[ctx, { x: gauche + s, y: yZone, w: wZone - s, h: hZone }]]);
    expect(lineAt).not.toHaveBeenCalled();

    const ctxTexte = fauxCanvas();
    drawScene(ctxTexte, W, H, { ...scene, terminal: { shown: 0, lineAt: () => -1 } }, 750);
    expect(ctxTexte.rect.mock.calls).toEqual(ctx.rect.mock.calls);
    expect(ctxTexte.fillRect.mock.calls).toEqual(ctx.fillRect.mock.calls);
  });

  it('dessine le texte révélé à droite sans la fenêtre du terminal entre deux planches', () => {
    const ctx = fauxCanvas(), t = 'Le silence revient.';
    const terminal = { shown: t.length, lineAt: vi.fn(() => 0), prompt: '',
      lines: [{ start: 0, end: t.length, tokens: [{ t, cat: null, start: 0 }] }] };
    drawScene(ctx, 1280, 720, { projet, modeAtlas: true, svg: vue, fondAtlasImage, persoImage, terminal, texteVisible: 10 });
    expect(terminal.lineAt).toHaveBeenCalledWith(10);
    expect(ctx.fillText.mock.calls.map(([texte]) => texte)).toEqual(['Le silence']);
    expect(ctx.fillText.mock.calls[0][1]).toBeGreaterThan(1280 * .34);
    expect(ctx.roundRect).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('conserve le décor et le terminal classiques quand Atlas est désactivé', () => {
    const ctx = fauxCanvas(), peindreDecor = vi.fn();
    const lineAt = vi.fn(() => -1);
    drawScene(ctx, 1280, 720, { projet, modeAtlas: false, svg: vue, fondAtlasImage, persoImage, peindreDecor,
      terminal: { shown: 0, lineAt } });
    expect(peindreDecor.mock.calls[0][1].w).toBe(1280 * .38);
    expect(lineAt).toHaveBeenCalledWith(0);
    expect(ctx.drawImage.mock.calls.map(([image]) => image)).toEqual([persoImage]);
  });
});
