// A short prerecorded-style scene: known source boundaries, time and trailing synthesis silence.
export const robotSegments = [
  { texte: '# Le faux horaire est 00:01 ?', debutMs: 0, speechEndMs: 360, finMs: 360, type: 'commentaire' },
  { texte: 'Demain, on part à 8 h 30.', debutMs: 360, speechEndMs: 2580, finMs: 2800, type: 'parle' },
  { texte: 'Tu seras là ?', debutMs: 2800, speechEndMs: 3680, finMs: 4040, type: 'parle' },
  { texte: 'Oui ! D’où est-ce qu’on part ?', debutMs: 4040, speechEndMs: 5150, finMs: 5500, type: 'parle' },
  { texte: 'De la gare. Parfait !', debutMs: 5500, speechEndMs: 7247, finMs: 7450, type: 'parle' },
];
export const robotDuration = 7450;
export const robotText = robotSegments.map((s) => s.texte).join('\n');

const spoken = (texte, debutMs, speechEndMs, finMs, expression = 'auto') => ({ texte, debutMs, speechEndMs, finMs, type: 'parle', expression });
export const robotStepCases = [
  { name: 'virgule du moteur HD', duration: 4240, segments: [
    spoken('Demain,', 0, 282, 387), spoken('on part à 8 h 30.', 387, 2320, 2620),
    spoken('Tu seras là ?', 2620, 3260, 3620), spoken('Parfait !', 3620, 3920, 4240),
  ] },
  { name: 'pas de faible amplitude', duration: 660, segments: [spoken('Bonjour.', 0, 580, 660)] },
  { name: 'pose imposée juste après une entrée trop brève', duration: 2200, segments: [
    spoken('Demain,', 0, 282, 387), spoken('on part à 8 h 30.', 387, 1900, 2200, 'pensif'),
  ] },
  { name: 'salut après une parole très brève', duration: 650, segments: [spoken('Oui !', 0, 330, 650)] },
];
