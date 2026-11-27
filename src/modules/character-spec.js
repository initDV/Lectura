// Contrat SVG du catalogue commun : rig historique des robots ou rig Aïcha des cinq lectrices.
export const RIG_AICHA = 'aicha';
const COMMUNES = ['body', 'arm-l', 'arm-r', 'mouth', 'eye-l', 'eye-r', 'brow-l', 'brow-r'];
const AICHA = [
  'aicha-sol', 'ombre-appui', 'pantalon', 'liseres-r', 'bassin', 'buste', 'sweat', 'tete', 'cou', 'cou-ombre', 'plan-visage', 'visage-peau', 'visage-ombre',
  'lunettes', 'joues', 'nez', 'front', 'pli-concentration', 'levres-repos', 'bouche', 'bord-bouche', 'cavite', 'levre-haute',
  'levre-basse', 'dents', 'langue', 'reflet-levre', 'cordons', 'handL', 'clip-bouche',
  ...['l', 'r'].flatMap((c) => ['chaussure', 'ombre-chaussure', 'bras', 'poignet', 'profil', 'paume', 'manche', 'lignes', 'pouce', 'embout', 'oeil', 'sourcil', 'limite',
    'blanc', 'iris', 'ombre-paupiere', 'paupiere-haute', 'paupiere-basse', 'cil', 'cadre-iris'].map((p) => `${p}-${c}`)
    .concat([0, 1, 2].map((i) => `tresse-${c}-${i}`), [0, 1, 2, 3].map((i) => `doigt-${c}-${i}`))),
];
export const piecesSvg = (def) => def.rig === RIG_AICHA ? AICHA : COMMUNES;
