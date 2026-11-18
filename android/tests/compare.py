"""Metrics and unmodified images; a nonzero difference is not a pass of exact parity."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import os
import json

reports = Path(os.environ['LECTURA_REPORT'])
pairs = {}
for key in ['scene', 'menu', 'tuto']:
    a, b = [reports / (tag + '-' + key + '.png') for tag in ['web', 'android']]
    if not (a.exists() and b.exists()):
        continue
    w, n = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if w.size != n.size:
        pairs[key] = {'web': w.size, 'android': n.size}
        continue
    diff = ImageChops.difference(w, n)
    raw = list(diff.get_flattened_data() if hasattr(diff, 'get_flattened_data') else diff.getdata())
    exact = sum(x == (0, 0, 0) for x in raw) / len(raw)
    metrics = dict(exact=round(100*exact, 2), mae=round(sum(ImageStat.Stat(diff).mean)/3, 2),
                   web_background=w.getpixel((0, 0)), android_background=n.getpixel((0, 0)))
    if key == 'scene':
        areas = {'decor': (12,10,151,484), 'terminal': (151,10,378,484),
                 'commandes': (12,492,378,642), 'texte': (12,642,378,706), 'actions': (12,712,378,760)}
        metrics['areas_mae'] = {k:round(sum(ImageStat.Stat(diff.crop(v)).mean)/3, 2) for k,v in areas.items()}
    pairs[key] = metrics
    canvas = Image.new('RGB', (w.width*3, w.height));canvas.paste(w,(0,0));canvas.paste(n,(w.width,0));canvas.paste(diff,(2*w.width,0));canvas.save(reports / ('compare-' + key + '.png'))
web_boxes, native_boxes = reports/'web-menu-boxes.json', reports/'device'/'android-menu-boxes.json'
if web_boxes.exists() and native_boxes.exists() and 'menu' in pairs:
    web, native = [json.loads(path.read_text()) for path in (web_boxes, native_boxes)]
    pairs['menu']['delta_y'] = {k:round(native[k][1]-v[1], 2) for k, v in web.items() if k in native and len(native[k])==4}
(reports / 'comparaison.json').write_text(json.dumps(pairs, indent=2))
print('::notice file=docs/ANDROID_PARITE.md,title=Comparaison visuelle Pages / Android::' + json.dumps(pairs))

missing = [k for k in ('scene', 'menu', 'tuto') if 'mae' not in pairs.get(k, {})]
if missing:
    raise SystemExit('Paires de captures manquantes ou dimensions différentes : ' + ', '.join(missing))
