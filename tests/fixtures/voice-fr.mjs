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

// The six shared word corrections and the two model-specific pronunciations approved in the comparisons.
export const siwis = [
  ['Demain, on part à 8 h 30. Tu seras là ?', 'dəmˈɛ̃, ɔ̃ pˈaʁ a yˈit ˈœʁ tʁˈɑ̃t. ty səʁˈa lˈa?', 'dəmˈɛ̃, ɔ̃ pˈaʁ a ɥˈit ˈœʁ tʁˈɑ̃t. ty səʁˈa lˈa?'],
  ['La nuit, la pluie et lui.', 'la- nyˈi, la- plɥˈi e lɥˈi.', 'la- nɥˈi, la- plɥˈi e lɥˈi.'],
  ['Huit heures trente-deux.', 'ɥˈit ˈœʁ tʁˈɑ̃t dˈø.', 'ɥˈit ˈœʁ tʁˈɑ̃t dˈø.'],
  ['Huit heures de travail.', 'ɥˈit ˈœʁ də- tʁavˈaj.', 'ɥˈit ˈœʁ də- tʁavˈaj.'],
  ['18:30 et 8 h 30.', 'dˈis ɥˈit ˈœʁ tʁˈɑ̃t e yˈit ˈœʁ tʁˈɑ̃t.', 'dˈis ɥˈit ˈœʁ tʁˈɑ̃t e ɥˈit ˈœʁ tʁˈɑ̃t.'],
  ['Huit heures trente et une.', 'ɥˈit ˈœʁ tʁˈɑ̃t e yn.', 'ɥˈit ˈœʁ tʁˈɑ̃t e yn.'],
  ['D’où est-ce qu’on part ?', 'dˈu ɛs kɔ̃ pˈaʁ?', 'dˈu ɛs kɔ̃ pˈaʁ?'],
  ['Qu’est-ce ? N’est‑ce pas ?', 'kɛs? nˈɛs pˈa?', 'kɛs? nˈɛs pˈa?'],
];
export const corrections = [['notamment','notamɑ̃'], ['faisait','fəzɛ'], ['derrière','dɛʁjɛʁ'],
  ['compter','kɔ̃te'], ['moyen','mwajɛ̃'], ['doigt','dwa']];
