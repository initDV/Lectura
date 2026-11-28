#!/usr/bin/env python3
"""Ajoute seulement /app/ à une copie contrôlée du déploiement Pages existant."""
import hashlib
import io
import json
import re
import subprocess
import sys
import tarfile
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = 'initDV/Lectura'
ORIGIN = 'https://initdv.github.io/Lectura/'
BASE_SHA = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
BASE_DEPLOYMENT = 7836267315
BUILD = '2026-11-16 · 76713dcd32'
APK_SHA = '3c5ca6d5a02c1475ca121958bde923f44004af97'
STATIC = ('index.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'LICENSE',
          'THIRD_PARTY_LICENSES.md', 'src', 'characters', 'data', 'icons', 'fonts')
ORT = ('ort.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm',
       'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm')
MODELS = {'gilles', 'mls', 'siwis', 'tom', 'upmc'}
PAGE = 'app/index.html'
APK_URL = 'https://github.com/initDV/Lectura/releases/download/v1.0.0/Lectura.apk'
LIMIT = 128 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def api(route):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{route}']))


def guard_base():
    require(api('git/ref/heads/main')['object']['sha'] == BASE_SHA, 'main a changé : arrêt.')
    for deploy in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deploy["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((deploy['id'], deploy['sha'], deploy['ref']) == (BASE_DEPLOYMENT, BASE_SHA, 'main'),
                    'Le déploiement Pages servi a changé : arrêt.')
            return
    raise SystemExit('Impossible de confirmer le déploiement Pages de référence.')


def guard_release():
    release = api('releases/tags/v1.0.0')
    require(not release['draft'] and not release['prerelease'] and release['target_commitish'] == APK_SHA,
            'Release Android non publiée sur le SHA vérifié.')
    require(api('git/ref/tags/v1.0.0')['object']['sha'] == APK_SHA, 'Tag Android inattendu.')
    require(any(a['name'] == 'Lectura.apk' and a['state'] == 'uploaded' and a['browser_download_url'] == APK_URL
                and re.fullmatch(r'sha256:[0-9a-f]{64}', a.get('digest') or '') for a in release['assets']),
            'APK vérifié absent de la Release.')


def fetch(path, limit=LIMIT):
    require(path == '' or re.fullmatch(r'[A-Za-z0-9_./-]+', path) and '..' not in path.split('/'),
            'Nom de fichier Pages inattendu.')
    url = ORIGIN + {'index.html': '', PAGE: 'app/'}.get(path, path)
    for retry in range(3):
        try:
            req = Request(url, headers={'User-Agent': 'Lectura-Android-distribution/1',
                                        'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
            with urlopen(req, timeout=35) as response:
                require(response.geturl() == url and response.status == 200, f'URL Pages inattendue : {path}')
                data = response.read(limit + 1)
                require(len(data) <= limit, f'Fichier trop volumineux : {path}')
                return data
        except (URLError, TimeoutError) as exc:
            if retry == 2 or isinstance(exc, HTTPError) and exc.code < 500 and exc.code != 429:
                raise
            time.sleep(2 ** retry)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stamp(text, pattern, value):
    result, count = re.subn(pattern, lambda _: value, text, count=1)
    require(count == 1, 'Marqueur de la version Pages absent.')
    return result.encode('utf-8')


def base_sources():
    data = subprocess.check_output(['git', 'archive', BASE_SHA, *STATIC, 'tools/build.mjs'])
    with tempfile.TemporaryDirectory() as directory, tarfile.open(fileobj=io.BytesIO(data)) as archive:
        src = Path(directory)
        require(all((m.isdir() or m.isfile()) and not Path(m.name).is_absolute()
                    and '..' not in Path(m.name).parts for m in archive), 'Entrée d’archive source invalide.')
        archive.extractall(src)
        subprocess.run(['node', str(src / 'tools/build.mjs'), '--index'], check=True)
        return {f.relative_to(src).as_posix(): f.read_bytes()
                for f in src.rglob('*') if f.is_file() and f.relative_to(src).parts[0] != 'tools'}


def assemble(site, manifest, android_page, publishing=True):
    guard_base()
    if publishing:
        guard_release()
    try:
        fetch(PAGE)
    except HTTPError as exc:
        require(exc.code == 404, 'Impossible de confirmer que /app/ est libre.')
    else:
        raise SystemExit('Une page /app/ existe déjà : aucun remplacement.')

    expected = base_sources()
    catalogue = fetch('models/index.json', 1024 * 1024)
    contents = json.loads(catalogue)
    require(len(contents['voix']) == 10, 'Catalogue vocal Pages différent de la référence.')
    weights = {}
    for voice in contents['voix']:
        model = voice['config'].removesuffix('.onnx.json')
        require(model in MODELS and len(voice['parts']) == 1, 'Catalogue Pages inattendu.')
        part = voice['parts'][0]
        require(part['fichier'] == f'{model}.onnx' and 0 < part['taille'] <= LIMIT, 'Modèle Pages invalide.')
        require(weights.setdefault(model, part['taille']) == part['taille'], 'Taille de modèle incohérente.')
    require(set(weights) == MODELS, 'Modèle vocal manquant dans la référence Pages.')

    expected['models/index.json'] = catalogue
    shell = sorted(k for k in expected if k not in {'sw.js', 'LICENSE', 'THIRD_PARTY_LICENSES.md'}
                   and not k.startswith('src/vendor/aac/'))
    prebuild = hashlib.sha256()
    for path in shell:
        prebuild.update(path.encode())
        prebuild.update(expected[path])
    require(prebuild.hexdigest()[:10] == BUILD.split(' · ')[1], 'Le précache ne correspond pas au build déjà publié.')
    version = expected['src/version.js'].decode()
    version = stamp(version, r"export const VERSION = '[^']*';", "export const VERSION = '1.0.0';").decode()
    expected['src/version.js'] = stamp(version, r"export const BUILD = '[^']*';", f"export const BUILD = '{BUILD}';")
    sw = stamp(expected['sw.js'].decode(), r"const VERSION = '[^']*';", "const VERSION = 'lectura-v1.0.0-76713dcd32';")
    listing = json.dumps(['./', *['./' + p for p in shell]], separators=(',', ':'))
    expected['sw.js'] = stamp(sw.decode(), r'const SHELL = \[[^\]]*\];', f'const SHELL = {listing};')

    site.mkdir(parents=True, exist_ok=False)

    def copy_live(path):
        data = fetch(path)
        if path in expected:
            require(data == expected[path], f'Le fichier servi diffère de la référence : {path}')
        if path.endswith('.onnx'):
            require(len(data) == weights[Path(path).stem], f'Le modèle vocal a changé : {path}')
        require(data, f'Fichier vide : {path}')
        dest = site / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return path, digest(data)

    models = [*(f'models/{m}.onnx{s}' for m in weights for s in ('', '.json')),
              *(f'models/ort/{f}' for f in ORT)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        original = dict(pool.map(copy_live, sorted(set(expected).union(models))))
    (site / '.nojekyll').touch(exist_ok=False)  # fichier de service vide du build de référence
    original['.nojekyll'] = digest(b'')
    page = android_page.read_bytes()
    require(APK_URL.encode() in page and b'<script' not in page, 'Page Android invalide.')
    (site / PAGE).parent.mkdir()
    (site / PAGE).write_bytes(page)
    emitted = {f.relative_to(site).as_posix(): digest(f.read_bytes()) for f in site.rglob('*') if f.is_file()}
    require(emitted == original | {PAGE: digest(page)}, 'Le seul ajout autorisé est app/index.html.')
    guard_base()
    manifest.write_text(json.dumps(emitted, sort_keys=True, indent=2) + '\n')
    print(f'{len(original)} fichiers de la PWA conservés ; seul ajout : /app/.')


def verify(manifest):
    expected = json.loads(manifest.read_text())

    def verify_live(path):
        require(digest(fetch(path)) == expected[path], f'Le fichier servi a changé : {path}')

    # La nouvelle page peut mettre quelques secondes à apparaître sur le CDN.
    for retry in range(12):
        try:
            page = fetch(PAGE)
            if digest(page) == expected[PAGE]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise SystemExit('La page /app/ n’est pas confirmée sur le site public.')
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(verify_live, [p for p in expected if p not in {'.nojekyll', PAGE}]))
    print(f'/app/ est en ligne ; {len(expected) - 2} fichiers publics préexistants sont identiques.')


if __name__ == '__main__':
    command = sys.argv[1]
    try:
        if command in {'snapshot', 'audit'}:
            assemble(*map(Path, sys.argv[2:]), publishing=command == 'snapshot')
        elif command == 'guard':
            guard_base()
            guard_release()
        elif command == 'verify':
            verify(Path(sys.argv[2]))
        else:
            raise SystemExit(f'Opération Pages inconnue : {command}')
    except (SystemExit, Exception) as exc:
        print(f'::error title=Pages Android::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
