"""Create a reproducible source/build ZIP without dependencies or scratch files."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
target = root.parent / 'gta-islamic-university-phase3.zip'
skip = {'node_modules', '.git', 'work', '__pycache__'}
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in skip for part in relative.parts):
            continue
        archive.write(path, Path(root.name) / relative)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    for required in ['package-lock.json', 'public/data/map.osm', 'dist/index.html', 'docs/index.html', 'VALIDATION-PHASE3.md']:
        assert f'{root.name}/{required}' in archive.namelist()
print(f'{target} ({target.stat().st_size:,} bytes)')
