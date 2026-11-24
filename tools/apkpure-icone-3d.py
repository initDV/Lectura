#!/usr/bin/env python3
"""Refresh only the store icon and its instructions, from the approved landing artwork."""
from hashlib import sha256
from pathlib import Path, PurePosixPath
import re
import sys
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE_DIGESTS = {
    '7579b52300f99edd1a0f57bb8f860087d88b26cf9f852507c6fe9ce5ddb00256',
    'addd25609608601baec42e2f95910c102a644eba9bf3daca3daf2c0278ce54a4',
}
ART = ROOT / 'app/assets/lectura-robot.webp'
ICON = 'icone-512.png'


def run(archive, out):
    assert sha256(ART.read_bytes()).hexdigest() == '5479e21e35993a6e411a0472c7d0b32c13f8596ddbc7ac9b2c19dbe3754cbd97'
    assert sha256(archive.read_bytes()).hexdigest() in BASE_DIGESTS, 'Use the verified APKPure kit as input.'
    out.mkdir(parents=True)
    with ZipFile(archive) as kit:
        assert kit.testzip() is None
        files = [m for m in kit.infolist() if not m.is_dir()]
        assert len(files) == 21
        for entry in files:
            path = PurePosixPath(entry.filename)
            assert path.parts and not path.is_absolute() and '..' not in path.parts
        kit.extractall(out)
        with Image.open(ART) as original:
            assert original.size == (1024, 1024)
            original.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS).save(out / ICON, optimize=True)
        guide = out / 'Guide-mobile.html'
        content = guide.read_text()
        content = content.replace('text-underline-offset:.18em}',
                                  'text-underline-offset:.18em;overflow-wrap:anywhere}')
        content, count = re.subn(r'(<a href="icone-512[.]png">)Icône 512 × 512(</a>)',
                                 r'\1Icône APKPure · robot 3D · 512 × 512\2', content)
        assert count == 1
        guide.write_text(content)
        (out / 'LIRE-MOI.txt').write_bytes((ROOT / 'distribution/apkpure/LIRE-MOI.txt').read_bytes())
        for entry in files:
            if entry.filename not in {ICON, 'Guide-mobile.html', 'LIRE-MOI.txt'}:
                assert (out / entry.filename).read_bytes() == kit.read(entry)
    with Image.open(out / ICON) as icon:
        assert icon.format == 'PNG' and icon.size == (512, 512) and icon.mode == 'RGB'
    print('PNG RGB 512 × 512 issu du rendu original ; les dix captures et les preuves sont inchangées.')


if __name__ == '__main__':
    run(*map(Path, sys.argv[1:]))
