"""Offline CC0 asset preparation. Requires Python 3 and Pillow; never runs in game.

python scripts/prepare-visual-assets.py
Sources are downloaded into the OS temporary directory, not shipped. The manifest
records SHA-256 of source downloads and all optimized runtime files.
"""
from pathlib import Path
from urllib.request import urlopen, Request
import hashlib, io, json, tempfile, zipfile
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'visual'
CACHE = Path(tempfile.gettempdir()) / 'gta-iu-cc0-assets'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
sources = []
sha = lambda data: hashlib.sha256(data).hexdigest()

def download(url, key):
    path = CACHE / key
    if not path.exists():
        request = Request(url, headers={'User-Agent': 'GTA-Islamic-University-CC0-preparation/1.0'})
        with urlopen(request, timeout=90) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    sources.append({'url': url, 'sha256': sha(data), 'bytes': len(data)})
    return data

def save_image(image, name, size, quality=79):
    path = OUT / str(size) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').resize((size, size), Image.Resampling.LANCZOS).save(path, 'WEBP', quality=quality, method=6)

for asset in ['Asphalt010', 'Concrete034', 'Bricks051', 'Grass004', 'CorrugatedSteel005']:
    archive = zipfile.ZipFile(io.BytesIO(download(f'https://ambientcg.com/get?file={asset}_1K-JPG.zip', f'{asset}.zip')))
    def image(suffix, fallback=None):
        match = next((name for name in archive.namelist() if f'_{suffix}.' in name), None)
        return Image.open(io.BytesIO(archive.read(match))).convert('RGB') if match else fallback
    color = image('Color')
    normal = image('NormalGL', Image.new('RGB', color.size, (128, 128, 255)))
    rough = image('Roughness', Image.new('RGB', color.size, (220, 220, 220))).convert('L')
    ao = image('AmbientOcclusion', Image.new('RGB', color.size, (255, 255, 255))).convert('L')
    metal = image('Metalness', Image.new('RGB', color.size, (0, 0, 0))).convert('L')
    orm = Image.merge('RGB', (ao, rough, metal))
    for size in [1024, 512]:
        for suffix, data in [('color', color), ('normal', normal), ('orm', orm)]:
            save_image(data, f'{asset}-{suffix}.webp', size, 83 if suffix == 'normal' else 79)
    print(f'Prepared {asset}', flush=True)

metadata = json.loads(download('https://api.polyhaven.com/files/painted_wooden_bench', 'bench-metadata.json'))
entry = metadata['gltf']['1k']['gltf']
gltf = json.loads(download(entry['url'], 'bench-source.gltf'))
binary_entry = next(value for name, value in entry['include'].items() if name.endswith('.bin'))
binary = download(binary_entry['url'], 'bench-source.bin')
(OUT / 'painted-wooden-bench.bin').write_bytes(binary)
gltf['buffers'][0]['uri'] = '../painted-wooden-bench.bin'
for image in gltf['images']:
    old = image['uri']
    source = entry['include'][old]
    data = Image.open(io.BytesIO(download(source['url'], Path(old).name))).convert('RGB')
    suffix = 'color' if '_diff_' in old else 'normal' if '_nor_' in old else 'orm'
    image['uri'] = f'bench-{suffix}.webp'
    image.pop('mimeType', None)
    for size in [1024, 512]:
        save_image(data, image['uri'], size, 83 if suffix == 'normal' else 79)
for size in [1024, 512]:
    (OUT / str(size) / 'painted-wooden-bench.gltf').write_text(json.dumps(gltf, separators=(',', ':')), encoding='utf8')

files = []
for path in sorted(OUT.rglob('*')):
    if path.is_file() and path.name != 'manifest.json':
        data = path.read_bytes()
        files.append({'path': path.relative_to(OUT).as_posix(), 'bytes': len(data), 'sha256': sha(data)})
manifest = {'license': 'CC0-1.0', 'sources': sources, 'files': files,
            'variants': {str(size): sum(f['bytes'] for f in files if f['path'].startswith(f'{size}/') or '/' not in f['path']) for size in [1024, 512]}}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
assert manifest['variants']['1024'] <= 12_000_000
assert manifest['variants']['512'] <= 6_000_000
print(json.dumps(manifest['variants']))
