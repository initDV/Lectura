#!/usr/bin/env python3
"""Publie robots.txt et conserve l’intégralité du site Pages existant."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZipFile

REPO = 'initDV/Lectura'
BRANCH = 'arena/d2229c4f-lectura'
SITE = 'https://initdv.github.io/Lectura/'
MAIN = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
PREVIOUS = (8011319514, 'd4a2a51a8a171448eed9095421855a1339d6edcd', BRANCH)
PROOF = (14863343772, 45268405010, 'preuve-verification-meta-sha256', '6e1e03b3c10d39d87ca54faf9489155c865ff25b85bfe26ccb47b9a3c34e14d5')
INDEX = 'index.html'
ROBOTS = 'robots.txt'
NOJEKYLL = '.nojekyll'
SITEMAP = 'sitemap.xml'
ROBOTS_BODY = f'Sitemap: {SITE}{SITEMAP}\n'.encode()
INDEX_SHA = 'f45426ed8d0c477210990492a777c44464ccfc8156e1765047be06c9db791d09'
SITEMAP_SHA = '928f3095c12d80c4c793552b0653927a8fbd28f3b1328e26d34c00d939f6b102'
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
    url = SITE + {INDEX: '', 'app/index.html': 'app/'}.get(path, path)
    req = Request(url, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                'User-Agent': 'Lectura-sitemap-check/1'})
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            size = 0
            with urlopen(req, timeout=35) as response:
                require(response.geturl() == url and response.status == 200, f'URL publique inattendue : {path}')
                with (copy_to.open('wb') if copy_to else nullcontext()) as f:
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
        name = 'verification-meta-sha256.json'
        require(proof.namelist() == [name] and proof.getinfo(name).file_size <= 96 * 1024, 'Inventaire de référence invalide.')
        data = json.loads(proof.read(name))
    require(len(data) == 231 and ROBOTS not in data and data.get(NOJEKYLL) == sha(b'')
            and data.get(INDEX) == INDEX_SHA and data.get(SITEMAP) == SITEMAP_SHA
            and {'sw.js', 'app/index.html', 'google121a4ae782cb28f.html'} <= set(data)
            and all(safe_path(k) and re.fullmatch(r'[0-9a-f]{64}', v) for k, v in data.items()),
            'Inventaire du déploiement précédent inattendu.')
    return data


def guard_previous():
    main_ref()
    for deploy in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deploy["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((deploy['id'], deploy['sha'], deploy['ref']) == PREVIOUS, 'Le déploiement de référence a changé.')
            require(fetch_digest(SITEMAP) == SITEMAP_SHA, 'Le sitemap public de référence a changé.')
            try:
                fetch_digest(ROBOTS)
            except HTTPError as exc:
                require(exc.code == 404, 'Impossible de confirmer que robots.txt est absent du projet.')
            else:
                raise RuntimeError('robots.txt est déjà servi par le projet : aucun remplacement.')
            return
    raise RuntimeError('Déploiement Pages de référence introuvable.')


def validate():
    for name, content in ((ROBOTS, ROBOTS_BODY), (NOJEKYLL, b'')):
        path = Path(name)
        require(path.is_file() and not path.is_symlink() and path.read_bytes() == content,
                f'Fichier local non conforme : {name}')
    namespace = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    sitemap = Path(SITEMAP).read_bytes()
    root = ET.fromstring(sitemap)
    require(sha(sitemap) == SITEMAP_SHA and root.tag == namespace + 'urlset'
            and [node.text for node in root.findall(f'{namespace}url/{namespace}loc')] == [SITE, SITE + 'app/'],
            'Le sitemap doit rester inchangé et contenir ses deux URL d’origine.')


def snapshot(site, manifest):
    guard_previous()
    previous = read_previous_manifest()
    validate()
    site.mkdir()

    def copy(path):
        dest = site / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        if path == NOJEKYLL:
            dest.write_bytes(Path(NOJEKYLL).read_bytes())
            actual = file_sha(dest)
        else:
            actual = fetch_digest(path, copy_to=dest)
        require(actual == previous[path], f'Le fichier actuellement servi diffère de la preuve : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(copy, previous))
    (site / ROBOTS).write_bytes(Path(ROBOTS).read_bytes())
    expected = previous | {ROBOTS: sha(ROBOTS_BODY)}
    emitted = {f.relative_to(site).as_posix(): file_sha(f) for f in site.rglob('*') if f.is_file()}
    require(emitted == expected, 'robots.txt doit être le seul ajout au site et .nojekyll doit rester vide.')
    guard_previous()
    manifest.write_text(json.dumps(emitted, sort_keys=True, indent=2) + '\n')
    print('::notice title=Inventaire validé::.nojekyll vide à la racine du paquet ; robots.txt seul ajout au site déjà publié.')


def verify(manifest):
    expected = json.loads(manifest.read_text())
    require(expected[ROBOTS] == sha(ROBOTS_BODY) and expected[SITEMAP] == SITEMAP_SHA,
            'Empreintes robots.txt/sitemap inattendues.')
    for _ in range(16):
        try:
            if fetch_digest(ROBOTS) == expected[ROBOTS]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('robots.txt n’est pas encore servi avec le contenu attendu.')

    def check(path):
        require(fetch_digest(path) == expected[path], f'Fichier public différent après publication : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(check, (path for path in expected if path not in {NOJEKYLL, ROBOTS})))
    main_ref()
    print(f'::notice title=Publication vérifiée::{SITE}{ROBOTS} répond HTTP 200 et contient la ligne demandée. Les {len(expected)-2} autres fichiers publics restent identiques.')


def probe():
    url = SITE + SITEMAP
    headers = subprocess.check_output(['curl', '-sS', '-I', '--max-time', '20', '--retry', '2', url], text=True)
    response = headers.strip().split('\n\n')[-1].splitlines()
    require(response and re.match(r'^HTTP/\S+ \d{3}( |$)', response[0]), 'Réponse HEAD non reconnue.')
    content_type = next((line.split(':', 1)[1].strip() for line in response[1:]
                         if line.lower().startswith('content-type:')), '(absent)')
    print(f'::notice title=curl -I du sitemap::{response[0].strip()} ; Content-Type: {content_type}')

    def get(url, user_agent=None):
        req = Request(url, headers={'User-Agent': user_agent} if user_agent else {})
        try:
            with urlopen(req, timeout=15) as res:
                return res.status, res.read(4096)
        except HTTPError as exc:
            return exc.code, b''
        except (URLError, TimeoutError):
            return 'non mesuré', b''

    root = 'https://initdv.github.io/robots.txt'
    status, body = get(root)
    detail = ''
    if status == 200:
        lines = re.findall(r'(?im)^\s*(?:user-agent|disallow|allow|sitemap):[ \t]*[^\r\n]*', body.decode('utf-8', 'replace'))
        detail = (' ; ' + ' / '.join(line.strip() for line in lines))[:400] if lines else ' ; aucune directive lue'
    print(f'::notice title=robots.txt à la racine de l’hôte::{root} : HTTP {status}{detail}')
    status, body = get(url, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
    detail = ' ; XML identique' if sha(body) == SITEMAP_SHA else ''
    print(f'::notice title=Requête avec User-Agent Googlebot simulé::HTTP {status}{detail} ; depuis le runner, pas depuis Google.')


if __name__ == '__main__':
    try:
        mode, *args = sys.argv[1:]
        {'validate': validate, 'snapshot': snapshot, 'guard': guard_previous, 'verify': verify,
         'probe': probe}[mode](*map(Path, args))
    except Exception as exc:
        print(f'::error title=Publication robots.txt::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
