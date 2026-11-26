import { afterEach, expect, it, vi } from 'vitest';
import { SvgFrame } from '../src/modules/svgframe.js';

afterEach(() => vi.unstubAllGlobals());

it('garde la position du décor liée à l’image décodée, même si la lecture a avancé', async () => {
  const pretes = [];
  vi.stubGlobal('XMLSerializer', class { serializeToString() { return '<svg viewBox="0 0 240 600"></svg>'; } });
  vi.stubGlobal('Image', class { decode() { return new Promise(resolve => pretes.push(resolve)); } });
  const frame = new SvgFrame({ viewBox: { baseVal: { x: 0, y: 0, width: 240, height: 600 } } });
  const premier = frame.pret(0);
  pretes.shift()(); await premier;
  const ancienne = frame.image;
  frame.update(22);
  frame.update(30); // l'image suivante ne doit pas voler le décor de celle qui est en cours
  expect(pretes).toHaveLength(1);
  expect(frame.image).toBe(ancienne);
  expect(frame.avance).toBe(0);
  pretes.shift()();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(frame.image).not.toBe(ancienne);
  expect(frame.avance).toBe(22);
});
