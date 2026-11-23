#!/usr/bin/env python3
"""Capture the exact release in a disposable Android emulator; do not rebuild the APK."""
import hashlib
import json
from pathlib import Path
import re
import shlex
import struct
import subprocess
import sys
import time
import uuid
import wave
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

PKG = 'io.github.initdv.lectura'
APP = f'/data/user/0/{PKG}'
DUMP = '/data/local/tmp/lectura-apkpure-ui.xml'
DOCS = {
    'fr': {
        'title': 'Les couleurs du ciel',
        'text': ('Le ciel change de couleur au fil de la journée. Au matin, une lumière douce se lève à l’horizon. '
                 'Puis le bleu s’installe et les nuages glissent lentement. Le soir, regarde bien : '
                 'le rose et l’orange se mêlent avant de laisser place aux premières étoiles. '
                 'Demain, prends un instant pour observer à nouveau le ciel. Rien ne se répète tout à fait.'),
        'file': 'Le ciel.wav', 'voice': 'fr', 'settings': 'Réglages', 'characters': 'Personnages',
        'record': 'Enregistrer la vidéo', 'export': 'Télécharger', 'share': 'Partager',
        'with_audio': 'Vidéo avec son, prête à partager',
    },
    'en': {
        'title': 'Colours of the Sky',
        'text': ('The sky changes colour throughout the day. In the morning, a soft light rises on the horizon. '
                 'Then blue fills the sky and clouds drift past. Watch closely in the evening: '
                 'pink and orange come together before the first stars appear. '
                 'Tomorrow, take a moment to look up again. The same colours never appear in quite the same way.'),
        'file': 'The sky.wav', 'voice': 'en-us', 'settings': 'Settings', 'characters': 'Characters',
        'record': 'Record video', 'export': 'Download', 'share': 'Share',
        'with_audio': 'Video with sound, ready to share',
    },
}


def run(*cmd, timeout=30):
    return subprocess.check_output(cmd, timeout=timeout, stderr=subprocess.STDOUT)


def adb(*args, timeout=30):
    return run('adb', *args, timeout=timeout)


def shell(*args):
    return adb('shell', shlex.join(args)).decode().strip()


def nodes():
    adb('shell', 'uiautomator', 'dump', DUMP, timeout=16)
    tree = ET.fromstring(adb('exec-out', 'cat', DUMP))
    return [n for n in tree.iter('node') if n.get('package') == PKG]


def labels(items):
    return [text for node in items for text in (node.get('text'), node.get('content-desc')) if text]


def match(items, label, limit=1):
    return [n for n in items if label in (n.get('text'), n.get('content-desc')) and n.get('enabled') == 'true'][:limit]


def bounds(node):
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.attrib['bounds']))
    if not (0 <= x1 < x2 <= 1080 and 0 <= y1 < y2 <= 1920):
        raise RuntimeError('Node outside the phone screen: ' + str(node.attrib))
    return x1, y1, x2, y2


def wait_label(label, *, timeout=28):
    start = time.monotonic()
    details = []
    error = None
    while time.monotonic() - start < timeout:
        try:
            items = nodes()
            details = labels(items)
            if found := match(items, label):
                return found[0]
        except (ET.ParseError, subprocess.SubprocessError) as exc:
            error = exc
        time.sleep(.3)
    raise RuntimeError(f'Control {label!r} not found. Visible: {details!r}. Last dump error: {error!r}')


def tap(node):
    x1, y1, x2, y2 = bounds(node)
    shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def click(label, *, timeout=28):
    tap(wait_label(label, timeout=timeout))
    time.sleep(.25)


def back():
    shell('input', 'keyevent', 'KEYCODE_BACK')
    time.sleep(.35)


def menu_action(label):
    # Accessibility exposes visible entries only. Scroll inside the actual sheet.
    click('Menu')
    details = []
    for _ in range(6):
        items = nodes()
        details = labels(items)
        if found := match(items, label):
            node = found[0]
            _, top, _, bottom = bounds(node)
            if bottom - top >= 50 and 100 < (top + bottom) / 2 < 1820:
                tap(node)
                time.sleep(.3)
                return
        shell('input', 'swipe', '530', '1560', '530', '750', '430')
        time.sleep(.25)
    raise RuntimeError(f'Menu option {label!r} not found. Visible: {details!r}')


def save_screen(target, required, items=None):
    if items is None:
        items = nodes()
    texts = labels(items)
    for label in required:
        if label not in texts:
            raise RuntimeError(f'{target.name}: missing {label!r}; visible: {texts!r}')
    png = adb('exec-out', 'screencap', '-p', timeout=20)
    if (len(png) < 10_000 or not png.startswith(b'\x89PNG\r\n\x1a\n') or png[12:16] != b'IHDR'
            or struct.unpack('>II', png[16:24]) != (1080, 1920)):
        raise RuntimeError(f'{target.name}: not a native 1080×1920 capture.')
    target.write_bytes(png)
    print(f'{target.name}: {len(png)} bytes; SHA-256 {hashlib.sha256(png).hexdigest()}; UI: {required}', flush=True)
    return texts


def stage_fixture(lang, data, scratch):
    # Root is only used on our empty Google APIs emulator to seed ordinary app data.
    # All screens below are reached by taps in the installed, unmodified release.
    if shell('id', '-u') != '0':
        raise RuntimeError('The disposable test emulator does not have adb root.')
    assert shell('pm', 'clear', PKG) == 'Success'
    shell('am', 'start', '-W', '-n', f'{PKG}/.MainActivity')
    shell('am', 'force-stop', PKG)
    owner = shell('stat', '-c', '%u:%g', APP)
    if not re.fullmatch(r'\d+:\d+', owner) or owner.startswith('0:'):
        raise RuntimeError('Unexpected app data directory owner.')
    identity = f'apkpure-demo-{lang}'
    # The public build uses UUID.nameUUIDFromBytes(UTF-8 project id) for local audio.
    audio_name = f'{uuid.UUID(bytes=hashlib.md5(identity.encode()).digest(), version=3)}.audio'
    audio = scratch / audio_name
    run('espeak-ng', '-v', data['voice'], '-s', '120', '-w', str(audio), data['text'])
    with wave.open(str(audio)) as stream:
        duration_ms = stream.getnframes() * 1000 // stream.getframerate()
    assert duration_ms >= 22_000, f'The sample audio is too short: {duration_ms} ms.'
    project = {
        'version': 1, 'id': identity, 'titre': data['title'], 'texte': data['text'],
        'personnageId': 'robot_lectura', 'timing': 'auto',
        'audio': {'source': 'fichier', 'nomFichier': data['file'], 'dureeMs': duration_ms, 'voix': {'moteur': 'auto', 'vitesse': 1}},
        'terminal': {'theme': 'sombre', 'police': 'JetBrains Mono', 'taille': 20, 'vitesseCps': 28},
        'reglages': {'mouvements': 'normal', 'emotions': True, 'fond': '#0d0d12'},
    }
    settings = {'langue': lang, 'tutorielVu': True, 'titreTerminal': 'Lectura', 'formatVideo': '9:16'}
    prefs = scratch / 'lectura.xml'
    prefs.write_text('<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n'
                     f'<map><string name="settings">{escape(json.dumps(settings))}</string></map>\n')
    draft = scratch / 'draft.json'
    draft.write_text(json.dumps(project, ensure_ascii=False), encoding='utf-8')
    shell('mkdir', '-p', APP + '/shared_prefs', APP + '/files/audio')
    for local, location in ((prefs, f'shared_prefs/{prefs.name}'), (draft, f'files/{draft.name}'),
                            (audio, f'files/audio/{audio_name}')):
        adb('push', str(local), f'{APP}/{location}')
    shell('chown', '-R', owner, APP + '/shared_prefs', APP + '/files')
    shell('restorecon', '-R', APP + '/shared_prefs', APP + '/files')
    shell('am', 'start', '-W', '-n', f'{PKG}/.MainActivity')


def capture(lang, out, scratch):
    data = DOCS[lang]
    stage_fixture(lang, data, scratch)
    pics = out / 'captures' / lang.upper()
    pics.mkdir(parents=True)
    click('Lancer' if lang == 'fr' else 'Start')
    # Use the same accessibility snapshot that identifies active playback and an advancing terminal.
    # Never wait for a second dump or a fixed delay between that assertion and screencap.
    deadline = time.monotonic() + 18
    while time.monotonic() < deadline:
        items = nodes()
        shown = next((n.get('text', '') for n in items if n.get('content-desc') == 'terminal'), '')
        if match(items, 'Pause') and data['text'].startswith(shown) and 62 <= len(shown) <= len(data['text']) - 75:
            save_screen(pics / '01-scene.png', ['Pause', shown, data['text'], 'Menu'], items)
            break
        time.sleep(.35)
    else:
        raise RuntimeError('Could not capture live playback with the terminal partially rendered.')
    click('Menu')
    save_screen(pics / '02-menu.png', ['Menu', 'PROJET' if lang == 'fr' else 'PROJECT', data['title']])
    back()
    menu_action(data['record'])
    # Let the public app's recorder stop naturally at the end of this clip.
    wait_label(data['share'], timeout=80)
    time.sleep(1)
    save_screen(pics / '05-export.png', [data['export'], data['share'], 'MP4', data['with_audio']])
    # The heading and button have the same label; pick the actual top export action.
    items = nodes()
    choices = match(items, data['export'], limit=20)
    button = next((node for node in choices if node.get('clickable') == 'true'), None)
    if button is None:
        raise RuntimeError('The MP4 download action is not available.')
    tap(button)
    movie = re.sub('[^a-z0-9]+', '-', data['title'].lower()).strip('-') + '.mp4'
    movie_path = f'/sdcard/Movies/Lectura/{movie}'
    for _ in range(20):
        if shell('sh', '-c', f'test -s {shlex.quote(movie_path)} && echo oui || true') == 'oui':
            break
        time.sleep(.7)
    else:
        raise RuntimeError('The test video was not saved to Movies/Lectura.')
    local_movie = scratch / movie
    adb('pull', movie_path, str(local_movie))
    media = json.loads(run('ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height',
                           '-of', 'json', str(local_movie)))
    tracks = {stream['codec_type']: stream for stream in media['streams']}
    assert tracks['audio']['codec_name'] == 'aac'
    assert (tracks['video']['width'], tracks['video']['height']) == (720, 1280)
    (out / f'export-{lang.upper()}.json').write_text(json.dumps(media, indent=2) + '\n')
    # Dismiss the temporary completion message before opening clean settings.
    time.sleep(5)
    menu_action(data['settings'])
    save_screen(pics / '03-reglages.png', [data['settings'], 'Français' if lang == 'fr' else 'English'])
    back()
    menu_action(data['characters'])
    save_screen(pics / '04-personnages.png', [data['characters'], 'Robot Lectura'])


if __name__ == '__main__':
    output, tmp = map(Path, sys.argv[1:])
    tmp.mkdir()
    for language in ('fr', 'en'):
        print(f'Capturing Android {language.upper()} from the Play-independent signed release.', flush=True)
        try:
            capture(language, output, tmp)
        except Exception as exc:
            try:
                (tmp / 'ecran-echec.png').write_bytes(adb('exec-out', 'screencap', '-p'))
                (tmp / 'interface-echec.txt').write_text('\n'.join(labels(nodes())))
            except Exception:
                pass
            detail = str(exc).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')[:1500]
            done = ', '.join(p.name for p in sorted((output / 'captures' / language.upper()).glob('*.png'))) or 'none'
            print(f'::error title=Capture {language.upper()}::{detail} | Captures: {done}', flush=True)
            raise RuntimeError(f'Capture {language}: {exc}') from exc
