// Les gestes utilisent les repères de lecture existants, pas un chronomètre ou un état d'image accumulé.
import { ID_CONDENSATION, SCENARIOS } from './scenarios.js';

export const borner = (u) => Math.max(0, Math.min(1, u));
export const doux = (u) => { const t = borner(u); return t * t * (3 - 2 * t); };

function compilerTrajet(coordonnees) {
  if (!coordonnees) return null;
  const points = [];
  let distance = 0;
  for (let i = 0; i < coordonnees.length; i += 2) {
    const x = coordonnees[i], y = coordonnees[i + 1];
    if (i) distance += Math.hypot(x - coordonnees[i - 2], y - coordonnees[i - 1]);
    points.push([x, y, distance]);
  }
  return { points, distance };
}

export function compilerScenario(id, cles) {
  const motifs = (s) => s ? s.split('|').map(cles) : [];
  return (SCENARIOS[id] ?? []).map((g, index) => {
    const suite = motifs(g.suite);
    return { index, mots: [...motifs(g.mots), ...suite], suite, zone: g.zone, trajet: compilerTrajet(g.trajet) };
  });
}

export function repererGestes(segment, scenario, trouver) {
  const { debutMs, finMs, speechEndMs, texte } = segment;
  const parle = Math.max(0, Math.min(speechEndMs ?? finMs, finMs) - debutMs);
  const date = (index) => debutMs + parle * index / texte.length;
  const marques = [];
  let suite = false;
  if (parle > 0) for (const geste of scenario) {
    const repere = trouver(geste.mots);
    if (!repere) continue;
    suite ||= Boolean(geste.suite.length && trouver(geste.suite));
    const debut = date(repere[0]), fin = Math.min(finMs, debut + 1520, Math.max(debut + 960, date(repere[1]) + 230));
    if (fin > debut) marques.push({ geste, debut, fin, longueur: repere[1] - repere[0] });
  }
  return { marques, suite };
}

export function calerGestes({ fiche, debut, fin }, scenario, marques) {
  if (marques.length) {
    marques.sort((a, b) => a.debut - b.debut || b.longueur - a.longueur);
    // Deux repères à la même position : garder la locution la plus précise. Une seule mise en avant à la fois.
    const retenues = marques.filter((m, i) => !i || m.debut > marques[i - 1].debut);
    return retenues.map((m, i) => ({ ...m, fin: Math.min(m.fin, retenues[i + 1]?.debut ?? fin), survol: false }));
  }
  // Si le sujet est nommé sans détail, on montre ses éléments, sans inventer de déplacement.
  const gestes = fiche.id === ID_CONDENSATION ? scenario.slice(0, 2) : scenario;
  const duree = fin - debut, entree = debut + Math.min(180, duree * .09);
  const pas = Math.min(900, duree * .79 / Math.max(1, gestes.length));
  return gestes.map((geste, i) => ({ geste, debut: entree + i * pas, fin: entree + (i + 1) * pas, survol: true }));
}

export function progressionGeste(g, ms, reduit) {
  return !g || ms < g.debut ? 0 : reduit ? 1 : borner((ms - g.debut) / (g.fin - g.debut));
}

export function poserGeste(gestes, ms, reduit) {
  const action = gestes?.find(g => g.debut <= ms && ms < g.fin);
  if (!action || (action.survol && reduit)) return null;
  return { action, u: progressionGeste(action, ms, reduit), reduit };
}

export function memePoseGeste(a, b) {
  return a?.action === b?.action && a?.u === b?.u && a?.reduit === b?.reduit;
}

function trajetBrillant(ctx, { points, distance }, u, reduit) {
  const d = distance * (reduit ? 1 : doux((u - .05) / .86));
  if (!d) return;
  let [x, y] = points[0];
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 1; i < points.length; i++) {
    const [X, Y, b] = points[i], a = points[i - 1][2];
    if (d <= b) {
      const f = (d - a) / (b - a);
      x += (X - x) * f; y += (Y - y) * f;
      ctx.lineTo(x, y);
      break;
    }
    x = X; y = Y; ctx.lineTo(x, y);
  }
  if (!reduit) {
    ctx.lineWidth = 7; ctx.strokeStyle = '#a0ffe64a'; ctx.stroke();
  }
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#c0ffe9'; ctx.stroke();
  if (!reduit) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#eafff6'; ctx.fill();
  }
}

function coins(ctx, x, y, w, h) {
  const l = Math.min(w, h, 49) * .24;
  ctx.beginPath();
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const X = x + a * w, Y = y + b * h;
    ctx.moveTo(X, Y + l * (1 - 2 * b)); ctx.lineTo(X, Y); ctx.lineTo(X + l * (1 - 2 * a), Y);
  }
  ctx.lineWidth = 1.9; ctx.strokeStyle = '#a3f4e1'; ctx.stroke();
}

/** Rehausse la partie réellement illustrée sans déplacer le dessin ni créer un autre panneau. */
export function peindreGeste(ctx, dessin, pose) {
  const intensite = pose ? pose.reduit ? .82 : doux(pose.u / .24) * doux((1 - pose.u) / .24) : 0;
  if (!intensite) { ctx.drawImage(dessin, 0, 0, 420, 248); return; }
  const { geste, survol } = pose.action, [x, y, w, h] = geste.zone;
  ctx.save(); ctx.globalAlpha *= 1 - .44 * intensite;
  ctx.drawImage(dessin, 0, 0, 420, 248); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(dessin, 0, 0, 420, 248); ctx.restore();
  ctx.save(); ctx.globalAlpha *= intensite; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  coins(ctx, x, y, w, h);
  if (!survol && geste.trajet) trajetBrillant(ctx, geste.trajet, pose.u, pose.reduit);
  ctx.restore();
}
