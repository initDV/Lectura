// @ts-check
// text-clean.js : retire les symboles de mise en forme Markdown avant la lecture et l'affichage.
// On préserve :
//  - "$ " en début de ligne (commande terminal, non prononcée)
//  - "# " en début de ligne (commentaire terminal, non prononcé)
// On retire :
//  - "## " à "###### " (titres Markdown, texte conservé et prononcé)
//  - gras/italique (**x**, __x__, *x*, _x_) → x
//  - code inline `x` → x
//  - fences ``` → rien
//  - liens [texte](url) → texte
//  - images ![alt](url) → rien
//  - citations > x → x
//  - séparateurs ---, ***, ___ seuls sur une ligne → ligne vide
//  - espaces multiples → un seul espace (les sauts de ligne sont préservés)
export function nettoyer(texte) {
  if (!texte) return '';
  return String(texte)
    .replace(/^#{2,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/[ \t]+/g, ' ');
}
