import { describe, it, expect, vi } from 'vitest';
import { planRobot, poseRobot, cadran, ROBOT_RIG } from '../src/modules/robot-motion.js';
import { premierHoraire, heuresEnMots } from '../src/modules/horaire.js';
import { WithOutro } from '../src/modules/player.js';
import { robotSegments, robotDuration } from './fixtures/robot-motion.mjs';

const plan = planRobot(robotSegments, robotDuration);
const at = (p, x) => p[0] + (p[1] - p[0]) * x;

describe('horaire civil', () => {
  it.each([
    ['Une réunion à 8 h 30.', 'Une réunion à huit heures trente.', '08:30'],
    ['🚆 à 1:05 !', '🚆 à une heure cinq !', '01:05'],
    ['C’est demain à 00h00.', 'C’est demain à zéro heure.', '00:00'],
    ['À 23\u202fH\u00a059', 'À vingt-trois heures cinquante-neuf', '23:59'],
    ['Huit heures trente', 'Huit heures trente', '08:30'],
    ['Dix‑huit heures trente', 'Dix‑huit heures trente', '18:30'],
    ['Huit heures trente‑deux', 'Huit heures trente‑deux', '08:32'],
    ['Huit heures trente et une', 'Huit heures trente et une', '08:31'],
    ['À 21:00', 'À vingt et une heures', '21:00'],
    ['À une heure et quart', 'À une heure et quart', '01:15'],
    ['À vingt-trois heures trente-deux', 'À vingt-trois heures trente-deux', '23:32'],
    ['Avant 25:59, à x8h30, 08:30:45 ou -8:30.', 'Avant 25:59, à x8h30, 08:30:45 ou -8:30.', null],
    ['Dans huit heures de travail', 'Dans huit heures de travail', null],
  ])('%s', (brut, prononce, affiche) => {
    expect(heuresEnMots(brut)).toBe(prononce);
    expect(premierHoraire(brut)?.label ?? null).toBe(affiche);
  });
  it('garde des positions UTF-16, même après un emoji', () => {
    expect(premierHoraire('🚆 à 08h30 !')).toEqual({ index: 5, length: 5, label: '08:30' });
    expect(cadran('08:30')).toHaveLength(24);
  });
});

describe('mise en scène sur les dates de la source', () => {
  it('anime quatre repères sans prendre l’horaire de la ligne muette ni la seconde question', () => {
    expect(plan.label).toBe('08:30');
    expect(plan.pas[0]).toBeGreaterThan(360);
    expect(plan.pas[1]).toBeLessThanOrEqual(plan.h[0]);
    expect(plan.q[0]).toBeGreaterThan(2800);
    expect(plan.q[1]).toBe(4040);
    expect(plan.salut).toEqual([7247, 8677]);
    expect(plan.end).toBe(8677);
    expect(poseRobot(plan, at(plan.h, .45))).toMatchObject({ clock: 1, armR: -56, foreR: -54 });
    expect(poseRobot(plan, at(plan.q, .48)).tilt).toBeLessThan(-5);
    expect(poseRobot(plan, at(plan.salut, .52))).toMatchObject({ armR: 34, foreR: 73, nod: .89 });
    expect(poseRobot(plan, plan.end)).toMatchObject({ x: 38, clock: 0, blend: 0, nod: 1 });
  });
  it('conserve les appuis, les longueurs et la pose quand on re-saute au même temps', () => {
    const t = at(plan.pas, .34), ref = poseRobot(plan, t);
    const firstLift = [false, false];
    for (let i = 128; i >= 0; i--) {
      const p = poseRobot(plan, at(plan.pas, i / 128));
      expect(p.legs.some((l) => l.lift === 0)).toBe(true);
      p.legs.forEach((l, index) => {
        expect(Math.hypot(l.hx - l.kx, l.hy - l.ky)).toBeCloseTo(70, 7);
        expect(Math.hypot(l.kx - l.fx, l.ky - l.fy)).toBeCloseTo(104, 7);
        if (l.lift > 0) firstLift[index] = true;
        else expect([ROBOT_RIG.x[index], ROBOT_RIG.x[index] + 38]).toContain(l.fx);
      });
    }
    expect(firstLift).toEqual([true, true]);
    expect(poseRobot(plan, t)).toEqual(ref);
  });
  it('respecte les plages manuelles, sans inventer une fin parlée pour un média importé', () => {
    const auto = robotSegments.map(({ speechEndMs: _ignore, ...s }) => s);
    expect(planRobot(auto, robotDuration).salut).toEqual([robotDuration, robotDuration + 1430]);
    expect(planRobot(robotSegments.map((s) => ({ ...s, expression: 'colere' })), robotDuration)).toBeNull();
    expect(planRobot(robotSegments.slice(0, 1), 360)).toBeNull();
    const lastMuet = [...robotSegments, { texte: '$ echo dernière ligne', debutMs: robotDuration, finMs: 8500 }];
    expect(planRobot(lastMuet, 8500)).toMatchObject({ salut: null, end: 8500 });
    const ask = planRobot([{ texte: 'On part à huit heures trente ?', debutMs: 10, speechEndMs: 2600, finMs: 2900 }], 2900);
    expect(ask.h[1]).toBeLessThanOrEqual(ask.q[0]);
    expect(ask.q[1]).toBeLessThanOrEqual(ask.salut[0]);
    expect(poseRobot(plan, at(plan.h, .45), false).clock).toBe(0);
  });
});

function sourceFactice() {
  return {
    dureeMs: 2000, playing: false, ms: 0, stream: {}, timeMs() { return this.ms; },
    play() { this.playing = true; }, pause() { this.playing = false; }, seek(t) { this.ms = t; },
    setRate: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), viseme: () => 2, dispose: vi.fn(),
    complete() { this.ms = this.dureeMs; this.playing = false; this.onEnd(); },
  };
}

describe('marge muette de lecture', () => {
  it('la fin, la pause et le ralenti utilisent un seul curseur logique', async () => {
    let now = 0;
    const audio = sourceFactice(), s = new WithOutro(audio, 3400, () => now), fin = vi.fn();
    s.onEnd = fin;
    expect(s.stream).toBe(audio.stream);
    s.play(); audio.complete(); now += 270;
    expect(s.timeMs()).toBe(2270); expect(s.viseme(now)).toBe(0); expect(s.playing).toBe(true);
    s.pause(); now += 1500;
    expect(s.timeMs()).toBe(2270); expect(s.playing).toBe(false);
    s.play(); s.setRate(.5); now += 300;
    expect(s.timeMs()).toBe(2420); expect(fin).not.toHaveBeenCalled();
    s.seek(710); expect(s.timeMs()).toBe(710); expect(audio.playing).toBe(true);
    s.seek(3200); expect(audio.playing).toBe(false); now += 500;
    expect(s.timeMs()).toBe(3400); expect(s.playing).toBe(false); await Promise.resolve();
    expect(fin).toHaveBeenCalledTimes(1);
    s.play(); expect(s.timeMs()).toBe(0); expect(audio.playing).toBe(true);
    s.dispose(); expect(audio.dispose).toHaveBeenCalledTimes(1);
  });
});
