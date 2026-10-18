#!/usr/bin/env bash
# Construit le zip à envoyer au Chrome Web Store : dist/ytsum-<version>.zip,
# avec manifest.json à la racine. Penser à augmenter "version" dans le manifest
# avant chaque nouvel envoi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 -I - "$ROOT/extension" "$ROOT/dist" <<'PY'
import json, sys, zipfile
from pathlib import Path

src, dist = Path(sys.argv[1]), Path(sys.argv[2])
version = json.loads((src / "manifest.json").read_text())["version"]
dist.mkdir(exist_ok=True)
out = dist / f"ytsum-{version}.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob("*")):
        if f.is_file() and not f.name.startswith("."):
            z.write(f, f.relative_to(src).as_posix())
print(out)
PY
