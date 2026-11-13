"""Content-versioned geographic assets, independent of observation caching."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path

@lru_cache(maxsize=1)
def manifest():
    root=Path(__file__).resolve().parent/'public/map-context'
    digest=hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if path.is_file():digest.update(str(path.relative_to(root)).encode());digest.update(hashlib.sha256(path.read_bytes()).digest())
    data=json.loads((root/'index.json').read_text())
    return {**data,'assetVersion':digest.hexdigest()[:24]}
