// Application des poses sur le SVG vivant (la capture sérialise exactement le même arbre).
import { cadran, DIGIT_Y, ROBOT_RIG as R } from './robot-motion.js';

const NS = 'http://www.w3.org/2000/svg';
const f = (v) => v.toFixed(2);
const offset = (x, y) => `translate(${f(x)} ${f(y)})`;
const rotate = (a, x, y) => `rotate(${f(a)} ${x} ${y})`;

export function rigRobot(svg) {
  const get = (name) => svg.querySelector(`#robot-${name}`);
  const trunk = get('trunk');
  if (!trunk) return null;
  const shadow = get('shadow'), clock = get('clock'), digits = get('clock-digits'), antenna = get('antenna');
  const each = ['l', 'r'].map((side) => ['thigh', 'knee', 'shin', 'foot'].map((piece) => get(`${piece}-${side}`)));
  const rest = svg.getAttribute('viewBox');
  let plan = null, painted = false, label = '';
  clock.setAttribute('aria-hidden', 'true');
  return {
    plan(next) {
      if (next === plan) return;
      plan = next;
      svg.setAttribute('viewBox', plan ? (plan.label ? R.clockBox : R.box).join(' ') : rest);
      if (plan?.label && plan.label !== label) {
        label = plan.label;
        digits.replaceChildren(...cadran(label).map(({ x, d }) => {
          const path = svg.ownerDocument.createElementNS(NS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('transform', offset(x, DIGIT_Y));
          return path;
        }));
      }
    },
    paint(p) {
      if (!p) {
        if (!painted) return;
        for (const part of [trunk, shadow, antenna, ...each.flat()]) part.removeAttribute('transform');
        clock.setAttribute('display', 'none');
        painted = false;
        return;
      }
      painted = true;
      trunk.setAttribute('transform', `${offset(p.x, p.y)} ${rotate(p.tilt, 120, R.hip)}`);
      shadow.setAttribute('transform', offset(p.x, 0));
      antenna.setAttribute('transform', rotate(p.antenna, 120, 58));
      p.legs.forEach((l, i) => {
        const x = R.x[i], [thigh, knee, shin, foot] = each[i], k = offset(l.kx - x, l.ky - R.knee);
        thigh.setAttribute('transform', `${offset(l.hx - x, l.hy - R.hip)} ${rotate(l.thigh, x, R.hip)}`);
        knee.setAttribute('transform', k);
        shin.setAttribute('transform', `${k} ${rotate(l.shin, x, R.knee)}`);
        foot.setAttribute('transform', offset(l.fx - x, -l.lift));
      });
      clock.setAttribute('display', p.clock > .01 ? 'inline' : 'none');
      clock.setAttribute('opacity', f(p.clock));
    },
  };
}
