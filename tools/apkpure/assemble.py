#!/usr/bin/env python3
"""Build the mobile submission sheets and verify the required files in the kit."""
from html import escape
from pathlib import Path
import re
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'distribution' / 'apkpure'
TOOLS = ROOT / 'tools' / 'apkpure'
FIELD_NAMES = {
    'FR': ('Nom de l’application', 'Description courte', 'Description longue', 'Catégorie', 'Mots-clés', 'Nouveautés'),
    'EN': ('App name', 'Short description', 'Long description', 'Category', 'Keywords', 'What’s new'),
}
SHOTS = (
    ('01-scene.png', '1 · Scène en lecture', '1 · Scene playing'),
    ('02-menu.png', '2 · Menu', '2 · Menu'),
    ('03-reglages.png', '3 · Réglages', '3 · Settings'),
    ('04-personnages.png', '4 · Personnages', '4 · Characters'),
    ('05-export.png', '5 · Export', '5 · Export'),
)


def dimension(path, wh):
    with path.open('rb') as stream:
        h = stream.read(24)
    if h[:8] != b'\x89PNG\r\n\x1a\n' or h[12:16] != b'IHDR' or struct.unpack('>II', h[16:24]) != wh:
        raise ValueError(f'{path} should be PNG {wh[0]} × {wh[1]}')


def fields(lang):
    file = f'Fiche-{lang}.txt'
    headings = '|'.join(re.escape(label.upper()) for label in FIELD_NAMES[lang])
    bodies = re.split(rf'(?m)^(?:{headings})[ \t]*$', (SHEETS / file).read_text())
    values = [part.strip() for part in bodies if part.strip()]
    if len(values) != 6:
        # Each heading appears once, on a line of its own.
        raise ValueError(f'{file}: found {len(values)} fields instead of six.')
    title, short, long, category, keywords, notes = values
    nwords = len(re.findall(r"[^\W_]+(?:[-’'][^\W_]+)*", long))
    if not (title == 'Lectura' and len(short) <= 80 and nwords <= 500 and 5 <= len(keywords.split(',')) <= 10):
        raise ValueError(f'{file}: limits not met: {title!r}, {len(short)} characters, {nwords} words.')
    print(f'{file}: {len(short)} characters, {nwords} words, {len(keywords.split(","))} keywords.')
    return values


def guide(out):
    sheets = []
    screenshots = []
    for lang in FIELD_NAMES:
        language = 'Français' if lang == 'FR' else 'English'
        copy = 'Copier' if lang == 'FR' else 'Copy'
        rendered = []
        for i, (label, value) in enumerate(zip(FIELD_NAMES[lang], fields(lang), strict=True)):
            field_id = f'{lang.lower()}-{i}'
            rendered.append(f'<div class="field"><div class="field-head"><h3>{escape(label)}</h3>'
                            f'<button type="button" class="copy" data-copy="{field_id}">{copy}</button></div>'
                            f'<p id="{field_id}" class="value">{escape(value)}</p></div>')
        sheets.append(f'<details lang="{lang.lower()}"><summary>{language}</summary><div class="fields">'
                      f'<p><a href="Fiche-{lang}.txt">Fiche TXT · {lang}</a></p>' + ''.join(rendered) + '</div></details>')
        thumbs = []
        for name, fr, en in SHOTS:
            source = f'captures/{lang}/{name}'
            dimension(out / source, (1080, 1920))
            title = fr if lang == 'FR' else en
            thumbs.append(f'<a class="snap" href="{source}"><img src="{source}" alt="{escape(title)}" '
                          f'width="1080" height="1920" loading="lazy">{escape(title)}</a>')
        screenshots.append(f'<details lang="{lang.lower()}"><summary>{language}</summary><div class="fields grid">'
                           + ''.join(thumbs) + '</div></details>')
    content = (TOOLS / 'Guide-mobile.template.html').read_text()
    (out / 'Guide-mobile.html').write_text(content.replace('@@FICHES@@', ''.join(sheets))
                                         .replace('@@CAPTURES@@', ''.join(screenshots)))


def assemble(out):
    dimension(out / 'icone-512.png', (512, 512))
    for lang in FIELD_NAMES:
        dimension(out / 'bannieres' / f'banniere-{lang}-1024x500.png', (1024, 500))
    for file in ('LIRE-MOI.txt', 'Fiche-FR.txt', 'Fiche-EN.txt'):
        shutil.copyfile(SHEETS / file, out / file)
    shutil.copyfile(ROOT / 'privacy' / 'index.html', out / 'Confidentialite.html')
    guide(out)
    if not (out / 'Verification-APK.txt').is_file():
        raise ValueError('Missing the SDK proof of official APK signature.')
    expected = {f'captures/{lang}/{shot[0]}' for lang in FIELD_NAMES for shot in SHOTS}
    expected |= {f'bannieres/banniere-{lang}-1024x500.png' for lang in FIELD_NAMES}
    expected |= {f'export-{lang}.json' for lang in FIELD_NAMES}
    expected |= {'icone-512.png', 'Verification-APK.txt', 'Guide-mobile.html', 'Confidentialite.html',
                 'LIRE-MOI.txt', 'Fiche-FR.txt', 'Fiche-EN.txt'}
    actual = {p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file()}
    if actual != expected:
        raise ValueError(f'Unexpected/missing kit files: {actual ^ expected}')


if __name__ == '__main__':
    if sys.argv[1:] == ['--text-only']:
        for language in FIELD_NAMES:
            fields(language)
    else:
        assemble(Path(sys.argv[1]))
