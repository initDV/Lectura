"""API 31 on a real Android emulator: fixed app viewport, controls and screenshots."""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as XML
from pathlib import Path

pkg = 'io.github.initdv.lectura'
out = Path(os.environ['LECTURA_REPORT'])
out.mkdir(parents=True, exist_ok=True)


def adb(*args):
    return subprocess.check_output(['adb', *map(str, args)])


def shell(*args):
    return adb('shell', *args).decode('utf-8', 'replace')


def ui():
    shell('uiautomator', 'dump', '/sdcard/lectura-ui.xml')
    data = shell('cat', '/sdcard/lectura-ui.xml')
    (out / 'android-last-ui.xml').write_text(data)
    return list(XML.fromstring(data).iter('node'))


def tap(label):
    for n in ui():
        if n.get('text') == label or n.get('content-desc') == label:
            x, y, r, b = map(int, re.findall(r'\d+', n.get('bounds')))
            shell('input', 'tap', (x + r)//2, (y+b)//2)
            time.sleep(.25)
            return
    raise AssertionError('Contrôle absent : ' + label)


def screen(name):
    (out / ('android-' + name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))


def main():
    adb('install', '-r', sys.argv[1])
    shell('wm', 'size', '390x828')
    shell('wm', 'density', '160')
    shell('settings', 'put', 'global', 'window_animation_scale', '0')
    shell('settings', 'put', 'global', 'transition_animation_scale', '0')
    shell('settings', 'put', 'global', 'animator_duration_scale', '0')
    shell('input', 'keyevent', 'KEYCODE_WAKEUP')
    shell('wm', 'dismiss-keyguard')
    shell('pm', 'clear', pkg)
    adb('logcat', '-c')
    shell('am', 'start', '-W', '-n', pkg + '/.MainActivity')
    time.sleep(2)
    screen('tuto')
    tap('Passer')
    # Fullscreen via the PWA's F shortcut, to compare a pure application surface.
    # For a 390x780 full viewport, no OEM bar has to be pixel-matched or cropped.
    shell('wm', 'size', '390x780')
    shell('input', 'keyevent', 'KEYCODE_F')
    time.sleep(1)
    screen('scene')
    tap('Menu')
    screen('menu')
    tap('Aperçu sans son')
    # Empty text: an explicit warning, not a crash or silent fallback.
    tap('Texte à lire')
    shell('input', 'text', ('Bonjour%sLectura.%sCeci%sest%sun%sessai%snatif.%s' * 9).rstrip('%s'))
    shell('input', 'keyevent', 'KEYCODE_BACK')
    tap('Menu')
    tap('Aperçu sans son')
    time.sleep(1)
    screen('lecture')
    tap('Pause')
    tap('Reprendre')
    tap('Arrêter')
    tap('Accélérer')
    assert any(n.get('text') == '1.25x' for n in ui()), 'La vitesse ne change pas'
    tap('Masquer le texte du terminal')
    tap('Afficher le texte du terminal')
    print('::notice file=docs/ANDROID_PARITE.md,title=Android API 31::Installation, tutoriel, scène, aperçu, pause/reprise, arrêt, vitesse et œil exécutés.')


try:
    main()
except Exception as e:
    screen('erreur')
    log = adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'Lectura:E').decode('utf-8', 'replace').strip()
    (out / 'android-errors.txt').write_text(log)
    print('::error file=docs/ANDROID_PARITE.md,title=Test Android::' + (str(e)+' | '+log[-1000:]).replace('%','%25').replace('\n','%0A').replace('\r','%0D'))
    raise
