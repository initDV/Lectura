#!/usr/bin/env python3
"""Publication ponctuelle : reprise du site servi, seul /app/ est remplacé."""
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZipFile

REPO = 'initDV/Lectura'
BRANCH = 'arena/d2229c4f-lectura'
SITE = 'https://initdv.github.io/Lectura/'
MAIN = '39e429522cc715aeda6ce0db9d3eb5690ba1f2fd'
PREVIOUS = (8007930199, '39d67174f6127b6cadfc9d05fb2a8dda5130a775', BRANCH)
OLD_APP = '40c0cec41eec5ccff97d5acc24ff0990e97cd6f3775dffb90fa8b33f45d540c3'
PROOF = (14851108697, 45242263579, 'preuve-pages-sha256', '3eecfe55d4cfc1066b7151e5effec749518bddd18d6d5b6dc4dc0335831b5f4a')
APK_COMMIT = '3c5ca6d5a02c1475ca121958bde923f44004af97'
ZIP_PROOF = (14839954678, 45220486453, 'Lectura-Android-API31+', '07b3bfbf2675094c429716dc4facc24c5867b7140425340826d688bc1e117fda')
APK_DIGEST = 'd2121f08964d98d6d3f5b1cc784daf18e41caaf34f5b5553a34356ec808f55c0'
APK_SIZE = 71681981
ZIP_SIZE = 71330566
BODY_SHA = '9e53a50ac65bd7ae0d025f736c503b887261e9dfb7106f09e437caa7a27c72e2'
DOWNLOAD = f'https://github.com/{REPO}/releases/download/v1.0.0/'
ZIP_NAME = 'Lectura-v1.0.0-android.zip'
PAGE = 'app/index.html'
LIMIT = 128 * 1024 * 1024
LANDING = {
    PAGE, 'app/styles.css', 'app/reveal.js', 'app/assets/lectura-icon.svg', 'app/assets/lectura-robot.webp',
    'app/assets/personnage-robot.svg', 'app/assets/personnage-amina.svg', 'app/assets/personnage-cyborg.svg',
    'app/assets/space-grotesk-latin-wght-normal.woff2', 'app/assets/OFL-SpaceGrotesk.txt',
}
ORIGINAL_ASSETS = {
    'Lectura.apk': (783854847, APK_SIZE, 'sha256:' + APK_DIGEST),
    'Lectura-Android-sources.zip': (783854858, 3981049, 'sha256:eee1603a55bb40e97888600fc25b27774bf270d9d1a8588f06726c9eab9756c4'),
}


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


def release_state(*, require_zip):
    main_ref()
    tag = api('git/ref/tags/v1.0.0')['object']
    require(tag['type'] == 'commit' and tag['sha'] == APK_COMMIT, 'Tag de recette modifié.')
    release = api('releases/tags/v1.0.0')
    require(release['id'] == 455752281 and release['target_commitish'] == APK_COMMIT
            and not release['draft'] and not release['prerelease']
            and sha(release['body'].encode('utf-8')) == BODY_SHA, 'La Release de référence a changé.')
    assets = {asset['name']: asset for asset in release['assets']}
    require(set(assets) - {ZIP_NAME} == set(ORIGINAL_ASSETS), 'Liste des fichiers d’origine inattendue.')
    for name, want in ORIGINAL_ASSETS.items():
        asset = assets[name]
        require((asset['id'], asset['size'], asset['digest']) == want and asset['state'] == 'uploaded'
                and asset['browser_download_url'] == DOWNLOAD + name, f'Fichier de Release modifié : {name}.')
    if ZIP_NAME not in assets:
        require(not require_zip, 'Le ZIP n’est pas publié sur la Release.')
        return False
    zipped = assets[ZIP_NAME]
    require((zipped['size'], zipped.get('digest')) == (ZIP_SIZE, 'sha256:' + ZIP_PROOF[3])
            and zipped['state'] == 'uploaded' and zipped['browser_download_url'] == DOWNLOAD + ZIP_NAME,
            'Un fichier différent porte déjà le nom du ZIP : aucun remplacement.')
    return True


def artifact_meta(info, commit):
    artifact, run, name, digest = info
    meta = api(f'actions/artifacts/{artifact}')
    require(meta['id'] == artifact and not meta['expired'] and meta['name'] == name
            and meta['digest'] == 'sha256:' + digest and meta['workflow_run']['id'] == run
            and meta['workflow_run']['head_sha'] == commit, f'Provenance de l’archive {name} non confirmée.')
    return f'repos/{REPO}/actions/artifacts/{artifact}/zip'


def verify_zip(path):
    require(path.stat().st_size == ZIP_SIZE and file_sha(path) == ZIP_PROOF[3], 'Archive ZIP différente du ZIP d’origine.')
    with ZipFile(path) as archive:
        require(archive.namelist() == ['Lectura.apk'] and archive.getinfo('Lectura.apk').file_size == APK_SIZE,
                'Le ZIP doit contenir uniquement Lectura.apk.')
        with archive.open('Lectura.apk') as apk:
            require(hashlib.file_digest(apk, 'sha256').hexdigest() == APK_DIGEST, 'APK du ZIP différent de la Release.')


def download_public(name, target):
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '3',
                    '--retry-all-errors', '--max-time', '90', '--output', str(target), DOWNLOAD + name], check=True)


def publish_zip(work):
    exists = release_state(require_zip=False)
    work.mkdir()
    archive = work / ZIP_NAME
    endpoint = artifact_meta(ZIP_PROOF, APK_COMMIT)
    with archive.open('wb') as f:
        subprocess.run(['gh', 'api', endpoint], stdout=f, check=True)
    verify_zip(archive)
    if not exists:
        require(not release_state(require_zip=False), 'Un ZIP concurrent vient d’être publié : arrêt.')
        subprocess.run(['gh', 'release', 'upload', 'v1.0.0', str(archive), '--repo', REPO], check=True)
    release_state(require_zip=True)
    public = work / 'public.zip'
    download_public(ZIP_NAME, public)
    verify_zip(public)
    standalone = work / 'public.apk'
    download_public('Lectura.apk', standalone)
    require(standalone.stat().st_size == APK_SIZE and file_sha(standalone) == APK_DIGEST,
            'Le téléchargement direct ne correspond plus au fichier d’origine.')
    print('::notice title=Téléchargements publics vérifiés::Le ZIP d’origine contient exactement le même Lectura.apk signé que la Release. Les octets des deux téléchargements sont vérifiés.')


def safe_path(path):
    return re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', path) and not {'.', '..'} & set(path.split('/'))


def read_previous_manifest():
    endpoint = artifact_meta(PROOF, PREVIOUS[1])
    raw = subprocess.check_output(['gh', 'api', endpoint])
    require(len(raw) <= 64 * 1024 and sha(raw) == PROOF[3], 'Preuve du site de référence invalide.')
    with ZipFile(io.BytesIO(raw)) as zipfile:
        require(zipfile.namelist() == ['pages-sha256.json'] and zipfile.getinfo('pages-sha256.json').file_size <= 96 * 1024,
                'Inventaire de référence invalide.')
        data = json.loads(zipfile.read('pages-sha256.json'))
    require(len(data) == 219 and data.get('.nojekyll') == sha(b'') and data.get(PAGE) == OLD_APP
            and {k for k in data if k.startswith('app/')} == {PAGE}
            and {'index.html', 'sw.js', 'manifest.webmanifest'} <= set(data)
            and all(safe_path(k) and re.fullmatch(r'[0-9a-f]{64}', d) for k, d in data.items()),
            'Inventaire du déploiement précédent inattendu.')
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
    release_state(require_zip=True)
    for deploy in api('deployments?environment=github-pages&per_page=20'):
        statuses = api(f'deployments/{deploy["id"]}/statuses?per_page=1')
        if statuses and statuses[0]['state'] == 'success':
            require((deploy['id'], deploy['sha'], deploy['ref']) == PREVIOUS, 'Le déploiement de référence a changé.')
            require(fetch_digest(PAGE) == OLD_APP, 'Le contenu servi sur /app/ a changé de façon concurrente.')
            return
    raise RuntimeError('Déploiement Pages de référence introuvable.')


def landing_files():
    app = Path('app')
    files = list(app.rglob('*'))
    require(app.is_dir() and not app.is_symlink() and all(not f.is_symlink() and (f.is_file() or f.is_dir()) for f in files),
            'Le dossier app contient un lien ou un fichier non autorisé.')
    require({f.as_posix() for f in files if f.is_file()} == LANDING, 'L’inventaire de la landing n’est pas celui attendu.')
    html = Path(PAGE).read_text()
    require(all(DOWNLOAD + n in html for n in ('Lectura.apk', ZIP_NAME)) and SITE in html,
            'Liens de téléchargement et d’accueil inattendus.')


def snapshot(site, manifest):
    guard_previous()
    previous = read_previous_manifest()
    landing_files()
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
    for name in sorted(LANDING):
        dest = site / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(name, dest)
    expected = {k: v for k, v in previous.items() if not k.startswith('app/')}
    expected.update({path: file_sha(Path(path)) for path in LANDING})
    emitted = {f.relative_to(site).as_posix(): file_sha(f) for f in site.rglob('*') if f.is_file()}
    require(emitted == expected, 'Plus que le dossier /app/ serait modifié : aucun déploiement.')
    guard_previous()
    manifest.write_text(json.dumps(emitted, sort_keys=True, indent=2) + '\n')
    print(f'::notice title=Contrôle avant publication::{len(previous) - 1} fichiers hors /app/ préservés. Seuls les fichiers de la landing sont remplacés.')


def verify(manifest):
    expected = json.loads(manifest.read_text())
    for _ in range(16):
        try:
            if fetch_digest(PAGE) == expected[PAGE]:
                break
        except (URLError, TimeoutError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('La nouvelle landing n’est pas encore confirmée sur Pages.')

    def check(path):
        require(fetch_digest(path) == expected[path], f'Fichier public différent après publication : {path}')

    with ThreadPoolExecutor(max_workers=8) as workers:
        list(workers.map(check, [path for path in expected if path != '.nojekyll']))
    release_state(require_zip=True)
    print(f'::notice title=Landing et PWA vérifiées::La landing est en ligne sur {SITE}app/ ; ses {len(LANDING)} fichiers et les {len(expected) - len(LANDING) - 1} fichiers publics préexistants correspondent octet pour octet.')


if __name__ == '__main__':
    try:
        mode, *args = sys.argv[1:]
        {'validate': landing_files, 'archive': publish_zip, 'snapshot': snapshot,
         'guard': guard_previous, 'verify': verify}[mode](*map(Path, args))
    except Exception as exc:
        print(f'::error title=Publication de la landing::{str(exc).splitlines()[0]}', file=sys.stderr)
        raise
