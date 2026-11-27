// One set of cues for the five readers. Android's asset builder serializes the same patterns.
const mot = '[\\p{L}\\p{M}\\p{N}_]';
const mots = motif => new RegExp(`(?<!${mot})(?:${motif})(?!${mot})`, 'giu');

const citation = /(?:«[^»\r\n]+»|“[^”\r\n]+”|"[^"\r\n]+"|‘[^’\r\n]+’|'[^'\r\n]+')/.source;
const terme = '(?:mot|terme|adjectif|verbe|expression|word|term)';
const sentiment = '(?:joie|tristesse|colère|peur|dégoût|inquiétude|joy|sadness|anger|fear|disgust)';
const nuancer = `(?:(?!(?:seulement|uniquement|just|only|mais|but)(?!${mot}))${mot}+(?:['’]${mot}+)?\\s+)`;

export const intentions = {
  mentions: new RegExp(`${/`[^`\r\n]+`/.source}|(?<!${mot})${terme}\\s+${citation}|${citation}(?=\\s+(?:est|désigne|signifie|veut dire|se prononce|means|is an?)\\b)|(?:le|un|du|ce|the)\\s+${terme}\\s+${mot}+|(?:on étudie|on parle de|nous parlons de|we (?:discuss|study))\\s+(?:(?:la|le|the)\\s+)?${sentiment}(?!${mot})|(?<!${mot})(?:great circle|happy path)(?!${mot})`, 'giu'),
  nieAvant: new RegExp(`(?<!${mot})(?:pas|jamais|guère|sans|not|never|without|no)\\s+${nuancer}{0,2}['«“"]?$`, 'iu'),
  nieApres: /^(?:\s+)(?:pas|guère|jamais)(?![\p{L}\p{M}])/iu,
  neAvant: /(?:^|\s)n(?:e\s+|['’])$/iu,
  ambigus: /^(?:je vais|vous allez|il faut|d['’]abord|ensuite|vraiment|lent(?:e|s|es|ement)?|graves?|risques?|problèmes?|top|quoi|tiens|attention|pourquoi|how|really|then|slow(?:ly)?|serious|problem|concern|why|what)$/iu,
  surprise: /[!?]{2,}[\s»”"')\]]*$/u,
  question: /\?[\s»”"')\]]*$/u,
  ouverts: /^\P{L}*(?:comment|pourquoi|quel(?:le)?s?|qui|où|combien|how|why|which|who|where|what)(?![\p{L}\p{M}])/iu,
  gestes: [
    ['compare', mots("d['’]un côté|de l['’]autre côté|d['’]une part|d['’]autre part|deux (?:choix|options|possibilités)|comparons|à la différence de|two (?:choices|options)|let['’]s compare|on (?:the )?(?:one|other) hand|in contrast")],
    ['illustre', mots('voici|here is|here are')],
    ['explique', mots("par exemple|prenons un exemple|expliqu(?:er|e|ons)|pour mieux comprendre|en clair|autrement dit|plus précisément|(?:cela|ça) (?:veut dire|signifie)|parce que|for example|let me (?:explain|show you)|in other words|to illustrate|because")],
    ['enumere', mots("tout d['’]abord|d['’]abord|premièrement|deuxièmement|(?:première|seconde|deuxième|dernière) étape|pour finir|first of all|firstly|secondly|(?:first|second|last) step")],
    ['enumere', /(?:^|(?<=[,;:]))\s*(?:ensuite|puis|next|then|finally)(?![\p{L}\p{M}])/giu],
  ],
  visages: [
    ['inquiet', .93, mots("(?:j['’]ai cru|je pensais) que (?:tu|vous) (?:ne |n['’])(?:viendr|reviendr|arriver)(?:ais|iez) pas")],
    ['content', .96, mots('(?:te|vous|et) voilà|bonne nouvelle|good news')],
    ['enthousiaste', .99, mots('bravo|youpi|hourra|well done|hooray|hurray')],
    ['surpris', .99, mots("je ne m['’]y attendais pas|je n['’]en reviens pas|ça alors|did not see that coming|can['’]t believe (?:it|my eyes)")],
    ['rassurant', .82, mots("(?:ne )?t['’]inquiète pas|n['’]aie pas peur|pas de panique|c(?:e n|)['’]est pas grave|ça va (?:aller|bien se passer)|tu n['’]es pas seul(?:e)?|don['’]t worry|it will be all right")],
    ['soulage', .94, mots("ouf|on l['’]a échappé belle|on peut souffler|quel soulagement|what a relief|that was a close call")],
    ['inquiet', .88, mots("j['’]appréhende|(?:je suis|j['’]étais|je me sens) inqui(?:ets?|ètes?)|je m['’]en fais|ça me préoccupe|il y a un (?:vrai |gros |grave )?problème|c['’]est (?:très )?grave|ça risque de|i am concerned|what if it fails")],
    ['pensif', .79, mots('je me demande si|laisse-moi réfléchir|i wonder if|let me think')],
    ['curieux', .83, mots("j['’]aimerais en savoir plus|j['’]ai une question|want to know more|tell me more")],
  ],
};

export function lireIntentions(texte, moments = []) {
  const { mentions, nieAvant, nieApres, neAvant, ambigus, gestes, visages, surprise, question, ouverts } = intentions;
  const ignores = Array.from(texte.matchAll(mentions), m => [m.index, m.index + m[0].length]);
  const mention = (pos, fin) => ignores.some(([a, b]) => pos < b && fin > a);
  const trouve = (kind, re, force) => Array.from(texte.matchAll(re), m => ({ pos: m.index, fin: m.index + m[0].length, kind, force }))
    .filter(n => !mention(n.pos, n.fin));
  const nie = ({ pos, fin }) => {
    const avant = texte.slice(Math.max(0, pos - 90), pos);
    return nieAvant.test(avant) || (neAvant.test(avant) && nieApres.test(texte.slice(fin, fin + 16)));
  };
  const corps = gestes.flatMap(([kind, re]) => trouve(kind, re)).filter(n => !nie(n)).sort((a, b) => a.pos - b.pos);
  const notes = visages.flatMap(([face, force, re]) => trouve(face, re, force));
  const indices = notes.map(n => ({ pos: n.pos, face: nie(n) ? 'neutre' : n.kind, force: n.force }));
  for (const { pos, fin, emotion, force, nie } of moments) {
    if (!emotion || emotion === 'neutre' || fin <= pos || mention(pos, fin) || notes.some(n => pos < n.fin && fin > n.pos)) continue;
    const motPrononce = texte.slice(pos, fin);
    if (ambigus.test(motPrononce) || /^[!?]+$/.test(motPrononce)) continue;
    // « Pas triste » n'est pas de la joie. « Pas content » garde une déception discrète.
    indices.push({ pos, face: nie && emotion !== 'triste' ? 'neutre' : emotion, force: nie ? Math.min(force, .62) : force });
  }
  const double = !indices.length && surprise.exec(texte);
  if (double && !mention(double.index, double.index + 2)) indices.push({ pos: double.index, face: 'surpris', force: .83 });
  if (!indices.length && question.test(texte)) indices.push({ pos: 0, face: ouverts.test(texte) ? 'curieux' : 'pensif', force: .73 });
  return { corps, indices: indices.sort((a, b) => a.pos - b.pos) };
}
