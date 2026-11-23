#!/usr/bin/env python3
"""Ajoute un seul fichier de vérification et préserve le déploiement existant."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
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
from zipfile import ZipFile

REPO = 'initDV/Lectura'
BRANCH = 'arena/d2229c4f-lectura'
SITE = 'https://initdv.github.io/Lectura/'
MAIN = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
PREVIOUS = (8010381006, 'b2eb01e30d87d1622662610d31e260f0df79954a', BRANCH)
PROOF = (14860881411, 45261209892, 'preuve-seo-sha256', 'bba8042bc59d77a9ba1b77bbc0d872ca31067e50dd768291bd573fb189ec173a')
PAGE = 'app/index.html'
VERIFICATION = 'google121a4ae782cb28f.html'
CONTENT = b'google-site-verification: google121a4ae782cb28f.html'
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


def read_previous_manifest():
    endpoint = artifact_meta(PROOF, PREVIOUS[1])
    raw = subprocess.check_output(['gh', 'api', endpoint])
    require(len(raw) <= 64 * 1024 and sha(raw) == PROOF[3], 'Archive de preuve du site invalide.')
    with ZipFile(io.BytesIO(raw)) as proof:
        name = 'seo-sha256.json'
        require(proof.namelist() == [name] and proof.getinfo(name).file_size <= 96 * 1024, 'Inventaire de référence invalide.')
        data = json.loads(proof.read(name))
    require(len(data) == 230 and data.get('.nojekyll') == sha(b'') and VERIFICATION not in data
            and {'index.html', 'sw.js', 'sitemap.xml', PAGE} <= set(data)
            and all(safe_path(k) and re.fullmatch(r'[0-9a-f]{64}', v) for k, v in data.items()),
            'Inventaire du déploiement précédent inattendu.')
    return data


def guard_previous():
    main_ref()
    for deploy in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deploy["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((deploy['id'], deploy['sha'], deploy['ref']) == PREVIOUS, 'Le déploiement de référence a changé.')
            try:
                fetch_digest(VERIFICATION)
            except HTTPError as exc:
                require(exc.code == 404, 'Impossible de confirmer que le chemin est libre.')
            else:
                raise RuntimeError('Le chemin de vérification est déjà occupé : aucun remplacement.')
            return
    raise RuntimeError('Déploiement Pages de référence introuvable.')


def validate():
    file = Path(VERIFICATION)
    require(file.is_file() and not file.is_symlink() and file.read_bytes() == CONTENT, 'Nom ou contenu du fichier de vérification non conforme.')


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
    shutil.copyfile(VERIFICATION, site / VERIFICATION)
    expected = previous | {VERIFICATION: sha(CONTENT)}
    emitted = {f.relative_to(site).as_posix(): file_sha(f) for f in site.rglob('*') if f.is_file()}
    require(emitted == expected, 'Le fichier de vérification doit être le seul ajout.')
    guard_previous()
    manifest.write_text(json.dumps(emitted, sort_keys=True, indent=2) + '\n')
    print(f'::notice title=Inventaire avant déploiement::{VERIFICATION} seul ajout ; {len(previous)} fichiers existants préservés.')


def verify(manifest):
    expected = json.loads(manifest.read_text())
    for _ in range(16):
        try:
            if fetch_digest(VERIFICATION) == sha(CONTENT) == expected[VERIFICATION]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('Le fichier de vérification ne renvoie pas le contenu attendu sur Pages.')

    def check(path):
        require(fetch_digest(path) == expected[path], f'Fichier public différent après publication : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(check, (path for path in expected if path not in {'.nojekyll', VERIFICATION})))
    main_ref()
    print(f'::notice title=Fichier de vérification en ligne::{SITE}{VERIFICATION} répond HTTP 200 et reproduit exactement le contenu demandé. Les {len(expected)-2} autres fichiers publics sont identiques.')


if __name__ == '__main__':
    try:
        mode, *args = sys.argv[1:]
        {'validate': validate, 'snapshot': snapshot, 'guard': guard_previous, 'verify': verify}[mode](*map(Path, args))
    except Exception as exc:
        print(f'::error title=Publication de vérification::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
