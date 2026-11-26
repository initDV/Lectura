#!/usr/bin/env python3
"""Copier le site Pages déjà en ligne, puis remplacer seulement la page de téléchargement."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
import zipfile

REPO = 'initDV/Lectura'
SITE = 'https://initdv.github.io/Lectura/'
RELEASES = f'https://github.com/{REPO}/releases/'
TAG = 'v1.1.3'
OLD_TAG = 'v1.1.2'
PAGE = 'app/index.html'
BASE_DEPLOYMENT = 8092626596
BASE_RUN = 45872307580
BASE_SHA = '56ad09ca8305c4e0cd44e34d8930d20e1cfb8b97'
ARTIFACT = 15142494527
ARCHIVE_DIGEST = 'sha256:3d202bd0270ce086b11fdd14fd5d5713a5756f0836c7f2cec4678dd9c93ac7bf'
# Contrôler aussi que le navigateur garde le même service worker, script et cadrage PWA.
PUBLIC_CHECKS = (PAGE, 'index.html', 'sw.js', 'manifest.webmanifest', 'src/version.js',
                 'src/ui/scene.js', 'src/ui/styles/scene.css', 'models/index.json',
                 'app/styles.css', 'app/reveal.js', 'privacy/index.html')


def require(ok, message):
    if not ok:
        raise SystemExit(message)


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}']))


def snapshot_guard():
    for entry in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{entry["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((entry['id'], entry['sha']) == (BASE_DEPLOYMENT, BASE_SHA),
                    'Le site public a changé depuis le snapshot ; ne pas écraser le nouveau déploiement.')
            return
    raise SystemExit('Déploiement Pages de référence introuvable.')


def assets(tag):
    return {f'{RELEASES}download/{tag}/Lectura.apk',
            f'{RELEASES}download/{tag}/Lectura-{tag}-android.zip'}


def release_guard():
    release = api(f'releases/tags/{TAG}')
    require(release['tag_name'] == TAG and not release['draft'] and not release['prerelease'],
            'La version Android n’est pas publique.')
    actual = {a['browser_download_url'] for a in release['assets']
              if a['state'] == 'uploaded' and a['size'] > 0 and re.fullmatch(r'sha256:[a-f0-9]{64}', a.get('digest') or '')}
    require(assets(TAG) <= actual, 'L’APK ou le ZIP public est absent.')


class Links(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.release_links = set()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        link = dict(attrs).get('href') or ''
        if tag == 'a' and link.startswith(RELEASES):
            self.release_links.add(link)


def check_page(html, tag):
    require(Links(html).release_links == assets(tag) | {f'{RELEASES}tag/{tag}'},
            f'Liens de téléchargement incohérents dans /app/ ({tag}).')


def sha256(path):
    with path.open('rb') as fd:
        return hashlib.file_digest(fd, 'sha256').hexdigest()


def inventory(site):
    return {p.relative_to(site).as_posix(): sha256(p) for p in site.rglob('*') if p.is_file()}


def fetch_hash(path):
    route = {'index.html': '', PAGE: 'app/', 'privacy/index.html': 'privacy/'}.get(path, path)
    req = Request(SITE + route + f'?verifier={TAG}', headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
    with urlopen(req, timeout=20) as response:
        require(response.status == 200 and response.geturl() == req.full_url, f'URL publique inattendue : {path}')
        return hashlib.sha256(response.read(2 * 1024 * 1024)).hexdigest()


def restore(archive, site):
    site.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        require(z.namelist() == ['artifact.tar'] and z.getinfo('artifact.tar').file_size < 1024**3,
                'Archive Pages inattendue.')
        with z.open('artifact.tar') as compressed, tarfile.open(fileobj=compressed, mode='r|*') as tar:
            for item in tar:
                name = PurePosixPath(item.name)
                require(not name.is_absolute() and '..' not in name.parts and (item.isdir() or item.isfile()),
                        f'Entrée d’archive Pages invalide : {item.name}')
                target = site / name
                if item.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with tar.extractfile(item) as src, target.open('xb') as dst:
                        shutil.copyfileobj(src, dst)


def prepare(site, proof, archive, page):
    snapshot_guard()
    release_guard()
    run = api(f'actions/runs/{BASE_RUN}')
    require(run['conclusion'] == 'success' and run['path'] == '.github/workflows/deploy.yml' and run['head_sha'] == BASE_SHA,
            'Provenance du snapshot Pages invalide.')
    artifact = api(f'actions/artifacts/{ARTIFACT}')
    require(artifact['name'] == 'github-pages' and not artifact['expired'] and artifact['digest'] == ARCHIVE_DIGEST
            and artifact['workflow_run']['id'] == BASE_RUN and artifact['workflow_run']['head_sha'] == BASE_SHA,
            'Artefact de la version publique de référence invalide.')
    with archive.open('wb') as out:
        subprocess.run(['gh', 'api', f'repos/{REPO}/actions/artifacts/{ARTIFACT}/zip'], stdout=out, check=True)
    require(archive.stat().st_size == artifact['size_in_bytes'] and f'sha256:{sha256(archive)}' == ARCHIVE_DIGEST,
            'L’archive récupérée ne correspond pas au déploiement public.')
    restore(archive, site)
    before = inventory(site)
    require(set(PUBLIC_CHECKS) <= before.keys(), 'Des fichiers du site public manquent dans le snapshot.')
    for path in PUBLIC_CHECKS:
        require(fetch_hash(path) == before[path], f'Le fichier en ligne ne correspond pas au snapshot : {path}')
    check_page((site / PAGE).read_text(), OLD_TAG)
    check_page(page.read_text(), TAG)
    shutil.copyfile(page, site / PAGE)
    after = inventory(site)
    require(before.keys() == after.keys() and [p for p in before if before[p] != after[p]] == [PAGE],
            'Seul app/index.html doit être modifié.')
    proof.write_text(json.dumps({'unchanged': len(before) - 1, 'files': {p: after[p] for p in PUBLIC_CHECKS}}, indent=2))
    snapshot_guard()
    print(f'{len(before) - 1} fichiers conservés ; seul {PAGE} a changé.')


def verify(proof):
    info = json.loads(proof.read_text())
    expected = info['files']
    for _ in range(12):
        try:
            if fetch_hash(PAGE) == expected[PAGE]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise SystemExit('La nouvelle page n’a pas été confirmée sur Pages.')
    for path, digest in expected.items():
        require(fetch_hash(path) == digest, f'Contenu servi inattendu : {path}')
    release_guard()
    print(f'::notice title=Téléchargement v1.1.3 en ligne::Bouton APK vérifié sur /app/ ; {info["unchanged"]} fichiers repris sans modification, dont la PWA.')


if __name__ == '__main__':
    command = sys.argv[1]
    if command == 'prepare':
        prepare(*map(Path, sys.argv[2:]))
    elif command == 'guard':
        snapshot_guard()
        release_guard()
    elif command == 'verify':
        verify(Path(sys.argv[2]))
    else:
        raise SystemExit('Utiliser prepare, guard ou verify.')
