#!/usr/bin/env python3
"""One-shot Pages overlay. Preserve every member of the last published site."""
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
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZipFile

SITE = 'https://initdv.github.io/Lectura/'
REPO = 'initDV/Lectura'
BRANCH = 'arena/d2229c4f-lectura'
MAIN = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
PREVIOUS = (8011721854, '88de35ec68c05f58b1fc2a9e1fc0ca29b8f85ed4', BRANCH)
PROOF_ID, PROOF_RUN = 14865906337, 45271549684
PROOF_DIGEST = 'dbc1b9c1ab7a2f3283d39336a98ddffcbc464b69ba07953ab2e4893a7726a08d'
POLICY = 'privacy/index.html'
MARKER = '.nojekyll'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}']))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hash_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def public_file(path, dest=None):
    url = SITE + {'index.html': '', 'app/index.html': 'app/', POLICY: 'privacy/'}.get(path, path)
    req = Request(url, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                'User-Agent': 'Lectura-privacy-publication/1'})
    for attempt in range(3):
        try:
            digest = hashlib.sha256()
            size = 0
            with urlopen(req, timeout=35) as response:
                require(response.status == 200 and response.geturl() == url, f'Unexpected response: {path}')
                if path == POLICY:
                    require(response.headers.get_content_type() == 'text/html', 'Privacy page is not served as HTML.')
                with (dest.open('wb') if dest is not None else nullcontext()) as out:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        require(size <= 128 * 1024 * 1024, f'File too large: {path}')
                        digest.update(chunk)
                        if out is not None:
                            out.write(chunk)
            return digest.hexdigest()
        except (URLError, TimeoutError) as exc:
            if attempt == 2 or isinstance(exc, HTTPError) and exc.code < 500 and exc.code != 429:
                raise
            time.sleep(2 ** attempt)


def guard():
    require(api('git/ref/heads/main')['object']['sha'] == MAIN, 'main has moved.')
    for deployment in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deployment["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require(tuple(deployment[k] for k in ('id', 'sha', 'ref')) == PREVIOUS,
                    'The public deployment has moved.')
            break
    else:
        raise RuntimeError('No successful baseline deployment found.')
    try:
        public_file(POLICY)
    except HTTPError as exc:
        require(exc.code == 404, f'Could not establish that the privacy path is new: HTTP {exc.code}')
    else:
        raise RuntimeError('Refusing to overwrite a live privacy page.')


def previous_inventory():
    path = f'actions/artifacts/{PROOF_ID}'
    meta = api(path)
    require(meta['digest'] == 'sha256:' + PROOF_DIGEST and not meta['expired']
            and meta['name'] == 'preuve-sitemap-check-sha256' and meta['workflow_run']['id'] == PROOF_RUN
            and meta['workflow_run']['head_sha'] == PREVIOUS[1], 'Invalid baseline inventory provenance.')
    zipped = subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}/zip'])
    require(len(zipped) <= 64 * 1024 and sha(zipped) == PROOF_DIGEST, 'Invalid baseline proof ZIP.')
    with ZipFile(io.BytesIO(zipped)) as z:
        name = 'sitemap-check-sha256.json'
        require(z.namelist() == [name] and z.getinfo(name).file_size <= 96 * 1024, 'Invalid baseline proof member.')
        files = json.loads(z.read(name))
    require(len(files) == 232 and files[MARKER] == sha(b'')
            and {'index.html', 'app/index.html', 'robots.txt', 'sitemap.xml', 'sw.js'} <= files.keys()
            and not any(p == 'privacy' or p.startswith('privacy/') for p in files), 'Unexpected baseline files.')
    for name, digest in files.items():
        require(re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', name)
                and not {'.', '..'} & set(name.split('/')) and re.fullmatch('[a-f0-9]{64}', digest),
                f'Invalid entry in baseline inventory: {name}')
    return files


def snapshot(site, proof):
    guard()
    expected = previous_inventory()
    policy = Path(POLICY)
    require(policy.is_file() and not policy.is_symlink() and policy.stat().st_size <= 24 * 1024,
            'Invalid privacy page source.')
    site.mkdir()

    def copy(name):
        dest = site / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if name == MARKER:
            dest.write_bytes(b'')
        else:
            require(public_file(name, dest) == expected[name], f'Public file differs from baseline: {name}')

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(copy, expected))
    dest = site / POLICY
    dest.parent.mkdir()
    dest.write_bytes(policy.read_bytes())
    expected = expected | {POLICY: hash_file(policy)}
    require({p.relative_to(site).as_posix(): hash_file(p) for p in site.rglob('*') if p.is_file()} == expected,
            'The privacy page must be the only addition.')
    proof.write_text(json.dumps(expected, sort_keys=True, indent=2) + '\n')
    guard()


def verify(proof):
    expected = json.loads(proof.read_text())
    require(expected == previous_inventory() | {POLICY: hash_file(Path(POLICY))}, 'Unexpected deployment inventory.')
    for _ in range(24):
        try:
            if public_file(POLICY) == expected[POLICY]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('The expected HTML does not yet return HTTP 200.')

    def check(name):
        require(public_file(name) == expected[name], f'Public file changed: {name}')

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(check, (name for name in expected if name not in {MARKER, POLICY})))
    require(api('git/ref/heads/main')['object']['sha'] == MAIN, 'main has moved.')
    print(f'::notice title=Confidentialité en ligne::{SITE}privacy/ HTTP 200 text/html ; SHA-256 {expected[POLICY]} ; '
          f'{len(expected)-2} autres fichiers publics intacts et .nojekyll vide dans le paquet.')


if __name__ == '__main__':
    try:
        command, *args = sys.argv[1:]
        {'guard': guard, 'snapshot': snapshot, 'verify': verify}[command](*map(Path, args))
    except Exception as exc:
        print(f'::error title=Publication confidentialité::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
