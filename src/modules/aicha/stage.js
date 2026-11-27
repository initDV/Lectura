import { getLang } from '../i18n.js';
import { planAicha, poseAicha } from './motion.js';
import { analyserAudioAicha, boucheA, planBouche, REPOS_BOUCHE } from './mouth.js';
import { rigAicha } from './rig.js';
import { creerDecorAicha } from './decor.js';

export function creerAicha(svg, { reduireAnimations, gain, couleurs, appuiHanche }) {
  const rig = rigAicha(svg, appuiHanche), decor = creerDecorAicha(svg, couleurs);
  const monture = !!svg.querySelector('#lunettes *');
  const preference = matchMedia('(prefers-reduced-motion: reduce)'), repos = planAicha([], 0);
  let plan = repos, piste = [], cadre = '', dernierNiveau, depuis;

  function attente(now) {
    if (now === undefined) { depuis = now; return 0; }
    return Math.floor((now - (depuis ??= now)) / 33) * 33;
  }

  function peindre(direction, ms, expression, bouche, attente = 0) {
    const reduit = reduireAnimations || preference.matches;
    if (reduit) attente = 0;
    const cle = `${ms}|${attente}|${expression}|${reduit}|${bouche}`;
    if (cadre === cle) return;
    const pose = poseAicha(direction, ms, { reduit, gain, expression, bouche, attente, monture });
    rig.draw(pose, reduit ? 0 : (ms + attente) / 1000);
    decor.avancer(pose.avance);
    cadre = cle;
  }

  return {
    decor,
    analyserAudio: analyserAudioAicha,
    preparer(prep, projet, humeur) {
      const { segs } = prep.timeline, { audio, reglages } = projet;
      plan = planAicha(segs, prep.source.dureeMs, { emotions: reglages.emotions, humeur, texte: projet.texte });
      const siwis = audio.source === 'voix' && audio.voix.moteur === 'piper' && audio.voix.id === 'siwis';
      piste = planBouche(segs, getLang(), siwis);
      cadre = ''; dernierNiveau = undefined;
    },
    repos(now, expression = '') { peindre(repos, 0, expression, REPOS_BOUCHE, attente(now)); },
    image(prep, { ms, sceneMs, lecture, fin, expression, now }) {
      if (fin) return peindre(plan, plan.duration * 1000, expression, REPOS_BOUCHE, attente(now));
      depuis = undefined;
      const s = prep.source;
      let niveau = 1;
      if (lecture && s.kind === 'voix-systeme' && !s.speaking) niveau = 0;
      else if (prep.enveloppe) niveau = prep.enveloppe(ms);
      else if (s.kind === 'fichier') {
        if (lecture) dernierNiveau = [ms, s.viseme() / 3];
        niveau = Math.abs(ms - dernierNiveau?.[0]) < 95 ? dernierNiveau[1] : 0;
      }
      peindre(plan, sceneMs, expression, boucheA(sceneMs, piste, niveau));
    },
  };
}
