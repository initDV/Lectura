// Siwis Piper : retire seulement les marges peu énergétiques ajoutées par le modèle.
// Même seuil et même fondu que VoiceRender.audible() sur Android, sans toucher aux pauses internes.
export function rognerBordsSiwis(samples, rate, peak) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || samples.length < rate / 100 || !Number.isFinite(peak) || peak < 0.003) return samples;
  const floor = Math.max(.0007, Math.min(.005, peak * .008)), win = Math.floor(rate / 250);
  const faible = (start) => {
    let energie = 0;
    for (let i = start; i < start + win; i++) energie += samples[i] ** 2;
    return energie < win * floor ** 2;
  };
  let start = 0, end = samples.length;
  while (start + win < end && faible(start)) start += win;
  while (end - win > start && faible(end - win)) end -= win;
  while (start < end && Math.abs(samples[start]) < .00006) start++;
  while (end > start && Math.abs(samples[end - 1]) < .00006) end--;
  if (end - start < rate / 100 || start === 0 && end === samples.length) return samples;
  const out = samples.slice(start, end), fade = Math.floor(rate / 400);
  for (let i = 0; i < fade; i++) {
    const gain = (i + 1) / fade;
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return out;
}
