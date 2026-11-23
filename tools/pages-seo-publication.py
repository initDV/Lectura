#!/usr/bin/env python3
"""Ajout ponctuel du sitemap ; assure l’intégrité des fichiers publics existants."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zipfile import ZipFile

REPO = 'initDV/Lectura'
BRANCH = 'arena/d2229c4f-lectura'
SITE = 'https://initdv.github.io/Lectura/'
MAIN = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
PREVIOUS = (8010079615, '818047613d3dba00ad67633309dd240cf71ba4d7', BRANCH)
OLD_APP = 'f26ed54898f4cbff82162097402d6ceb3e6622ebdd5678c5a820ce4b8b1c80be'
PROOF = (14857684077, 45258761750, 'preuve-landing-sha256', '4b0f2b5c90062546a5f87744eabf43576d0e04704d6236c93b13e24784c467f2')
PAGE = 'app/index.html'
SOCIAL = 'app/assets/lectura-social.jpg'
CHANGE = {PAGE, SOCIAL, 'sitemap.xml'}
LIMIT = 128 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def api(route):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{route}']))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(file):
    with file.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def main_ref():
    require(api('git/ref/heads/main')['object']['sha'] == MAIN, 'main a changé : arrêt.')


def artifact_meta(info, commit):
    artifact, run, name, digest = info
    meta = api(f'actions/artifacts/{artifact}')
    require(meta['id'] == artifact and not meta['expired'] and meta['name'] == name
            and meta['digest'] == 'sha256:' + digest and meta['workflow_run']['id'] == run
            and meta['workflow_run']['head_sha'] == commit, f'Provenance de l’archive {name} non confirmée.')
    return f'repos/{REPO}/actions/artifacts/{artifact}/zip'


def safe_path(path):
    return re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', path) and not {'.', '..'} & set(path.split('/'))


def read_previous_manifest():
    endpoint = artifact_meta(PROOF, PREVIOUS[1])
    raw = subprocess.check_output(['gh', 'api', endpoint])
    require(len(raw) <= 64 * 1024 and sha(raw) == PROOF[3], 'Archive de preuve du site invalide.')
    with ZipFile(io.BytesIO(raw)) as proof:
        name = 'site-sha256.json'
        require(proof.namelist() == [name] and proof.getinfo(name).file_size <= 96 * 1024, 'Inventaire de référence invalide.')
        data = json.loads(proof.read(name))
    require(len(data) == 228 and data.get('.nojekyll') == sha(b'') and data.get(PAGE) == OLD_APP
            and not ({SOCIAL, 'sitemap.xml'} & set(data))
            and all(safe_path(k) and re.fullmatch(r'[0-9a-f]{64}', v) for k, v in data.items()),
            'L’inventaire du déploiement précédent ne correspond pas à la référence.')
    return data


def fetch_digest(path, *, copy_to=None):
    require(safe_path(path), f'Chemin non autorisé : {path}')
    url = SITE + {'index.html': '', PAGE: 'app/'}.get(path, path)
    req = Request(url, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                'User-Agent': 'Lectura-landing-verification/1'})
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            size = 0
            with urlopen(req, timeout=35) as response:
                require(response.geturl() == url and response.status == 200, f'URL publique inattendue : {path}')
                if path == PAGE:
                    require('noindex' not in response.headers.get('X-Robots-Tag', '').lower(), 'Pages renvoie un en-tête noindex pour la landing.')
                if path == 'sitemap.xml':
                    require(response.headers.get_content_type() in {'text/xml', 'application/xml'}, 'Le sitemap doit être servi comme XML.')
                if path == SOCIAL:
                    require(response.headers.get_content_type() == 'image/jpeg', 'Image sociale servie avec un mauvais Content-Type.')
                with (copy_to.open('wb') if copy_to else io.BytesIO()) as f:
                    for chunk in iter(lambda: response.read(1024 * 1024), b''):
                        size += len(chunk)
                        require(size <= LIMIT, f'Fichier public trop volumineux : {path}')
                        digest.update(chunk)
                        if copy_to:
                            f.write(chunk)
            return digest.hexdigest()
        except (URLError, TimeoutError) as exc:
            if attempt >= 2 or isinstance(exc, HTTPError) and exc.code < 500 and exc.code != 429:
                raise
            time.sleep(2 ** attempt)


def guard_previous():
    main_ref()
    for deploy in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deploy["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((deploy['id'], deploy['sha'], deploy['ref']) == PREVIOUS, 'Le déploiement de référence a changé.')
            require(fetch_digest(PAGE) == OLD_APP, 'Le contenu actuel de la landing a changé de façon concurrente.')
            try:
                fetch_digest('sitemap.xml')
            except HTTPError as exc:
                require(exc.code == 404, 'Impossible de confirmer que le chemin du sitemap est libre.')
            else:
                raise RuntimeError('Un sitemap existe déjà, il ne sera pas remplacé.')
            return
    raise RuntimeError('Déploiement Pages de référence introuvable.')


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.canonical = []

    def handle_starttag(self, name, attrs):
        attrs = dict(attrs)
        if name == 'meta' and ('name' in attrs or 'property' in attrs):
            key = attrs.get('name', attrs.get('property'))
            require(key not in self.meta, f'Méta-donnée dupliquée : {key}')
            self.meta[key] = attrs.get('content', '')
        if name == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))


def validate():
    for path in map(Path, CHANGE):
        require(path.is_file() and not path.is_symlink(), f'Fichier de publication invalide : {path}')
    sitemap = ET.parse('sitemap.xml').getroot()
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    require(sitemap.tag == ns + 'urlset' and [x.text for x in sitemap.findall(f'{ns}url/{ns}loc')] == [SITE, SITE + 'app/'],
            'Seules les deux pages canoniques Lectura doivent figurer dans le sitemap.')
    head = Head()
    head.feed(Path(PAGE).read_text().split('</head>', 1)[0])
    require(head.canonical == [SITE + 'app/'] and head.meta.get('og:url') == SITE + 'app/'
            and all(head.meta.get(k) for k in ('description', 'og:title', 'og:description', 'og:image:alt',
                                                'twitter:title', 'twitter:description', 'twitter:image:alt'))
            and 'noindex' not in head.meta.get('robots', '').lower()
            and head.meta.get('twitter:card') == 'summary_large_image'
            and head.meta.get('og:image') == head.meta.get('twitter:image') == SITE + SOCIAL,
            'La landing doit avoir une description, un canonique et ses métadonnées de partage.')


def snapshot(site, manifest):
    guard_previous()
    previous = read_previous_manifest()
    validate()
    site.mkdir()

    def copy(path):
        dest = site / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        if path == '.nojekyll':
            dest.touch(exist_ok=False)
            actual = file_sha(dest)
        else:
            actual = fetch_digest(path, copy_to=dest)
        require(actual == previous[path], f'Le fichier actuellement servi diffère de la preuve : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(copy, previous))
    require((site / PAGE).read_bytes().split(b'</head>', 1)[1] == Path(PAGE).read_bytes().split(b'</head>', 1)[1],
            'Le contenu visible de la landing doit rester exactement identique.')
    for name in sorted(CHANGE):
        (site / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(name, site / name)
    expected = previous | {k: file_sha(Path(k)) for k in CHANGE}
    emitted = {f.relative_to(site).as_posix(): file_sha(f) for f in site.rglob('*') if f.is_file()}
    require(emitted == expected, 'Uniquement les métadonnées de /app/, leur image et le sitemap sont autorisés.')
    guard_previous()
    manifest.write_text(json.dumps(emitted, sort_keys=True, indent=2) + '\n')
    print('::notice title=Périmètre avant déploiement::Un seul ajout à la racine, sitemap.xml. Seul le head de la landing change, avec son image sociale.')


def verify(manifest):
    expected = json.loads(manifest.read_text())
    for _ in range(16):
        try:
            if fetch_digest(PAGE) == expected[PAGE] and fetch_digest('sitemap.xml') == expected['sitemap.xml']:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('La landing et le sitemap ne sont pas encore confirmés sur Pages.')

    def check(path):
        require(fetch_digest(path) == expected[path], f'Fichier public différent après publication : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(check, (path for path in expected if path != '.nojekyll')))
    main_ref()
    print(f'::notice title=Sitemap et aperçus publics vérifiés::Sitemap XML à {SITE}sitemap.xml et image JPEG accessibles ; les autres {len(expected)-len(CHANGE)-1} fichiers publics sont inchangés.')


if __name__ == '__main__':
    try:
        mode, *args = sys.argv[1:]
        {'validate': validate, 'snapshot': snapshot, 'guard': guard_previous, 'verify': verify}[mode](*map(Path, args))
    except Exception as exc:
        print(f'::error title=Publication SEO::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
