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
