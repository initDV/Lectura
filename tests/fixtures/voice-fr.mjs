// Golden cases (not generated from one implementation). Used by Vitest and Android instrumentation.
export const words = [
  ['yeux', 'jø'], ['monsieur', 'məsjø'], ['poêle', 'pwal'], ['poêles', 'pwal'], ['accueil', 'akœj'],
  ['orgueil', 'ɔʁɡœj'], ['fauteuil', 'fotœj'], ['écureuil', 'ekyʁœj'], ['aïeul', 'ajœl'], ['aïeux', 'ajø'],
  ['vraiment', 'vʁɛmɑ̃'], ['poliment', 'polimɑ̃'], ['suffisamment', 'syfizamɑ̃'], ['constamment', 'kɔ̃stamɑ̃'],
  ['absolument', 'apsɔlymɑ̃'], ['aiment', 'ɛm'], ['dorment', 'dɔʁm'], ['prudent', 'pʁydɑ̃'], ['fils', 'fis'],
  ['huit', 'ɥit'], ['pluie', 'plɥi'], ['nuit', 'nɥi'], ['issue', 'isy'], ['chœur', 'kœʁ'], ['oeufs', 'ø'],
];
export const groups = [
  ...['les', 'des', 'mes', 'tes', 'ses', 'ces', 'nos', 'vos', 'leurs', 'aux', 'deux'].map((m) => [`${m} yeux`, 'z jø']),
  ['les hommes', 'lez ɔm'], ['les héros', 'le eʁo'], ['les haricots', 'le aʁiko'], ['les yaourts', 'le jauʁt'],
  ['Les, yeux.', 'le, jø.'], ['Mon fils joue.', 'fis'], ['Les fils de cuivre.', 'fil də kɥivʁ'], ['Ces fils électriques.', 'fil elɛktʁik'],
  ['Le couvent.', 'kuvɑ̃.'], ['Elles couvent.', 'kuv.'], ['Ils le couvent.', 'kuv.'], ['Ils président.', 'pʁezid.'],
  ['Le président.', 'pʁezidɑ̃.'], ['Vraiment ?', 'vʁɛmɑ̃?'],
];
export const questions = [
  ['Tu viens ce soir ?', true], ['Vraiment ?', true], ['« Vraiment ? »', true], ['Est-ce qu’on lit ?', true],
  ['Est-ce que tu viens ?', true], ['Viendra-t-il ?', true], ['Pourquoi, à ton avis, tu viens ?', false],
  ['Où vas-tu ?', false], ['Tu viens quand ?', false], ['Quel jour venez-vous ?', false], ['Tu prends du thé ou du café ?', false],
  ['Tu viens ?!', false], ['! Vraiment.', false], ['Tu viens ce soir.', false], ['Mr. Lectura ?', false],
];
