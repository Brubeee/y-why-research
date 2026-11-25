"""Inventory reference-only eligibility; no OCR and no sample-level export."""
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile

from mathwriting_probe import ARCHIVE_SHA, SPLITS, read_ink


def inventory(archive):
    if sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA:
        raise ValueError('Unexpected MathWriting excerpt')
    entries = []
    ids = set()
    with tarfile.open(archive, 'r:gz') as tar:
        for m in tar:
            p = PurePosixPath(m.name)
            if not (m.isfile() and len(p.parts) == 3 and p.parent.name in SPLITS and p.suffix == '.inkml'):
                continue
            if not 0 < m.size <= 256 * 1024:
                raise ValueError('Unexpected member size')
            ann, _ = read_ink(tar.extractfile(m).read())
            split = p.parent.name
            if (ann.get('inkCreationMethod') != 'human' or ann.get('splitTagOriginal') != split
                    or ann.get('sampleId') != p.stem or p.stem in ids):
                raise ValueError('Unexpected split, provenance or duplicate ID')
            ids.add(p.stem)
            entries.append((split, ann['normalizedLabel']))
    if Counter(s for s, _ in entries) != {s: 100 for s in SPLITS}:
        raise ValueError('Unexpected sample counts')
    # Return rejection codes only. The source labels alone set inclusion.
    runner = '''
import { affineReference } from './affine_scope.mjs';
import { readFileSync } from 'node:fs';
console.log(JSON.stringify(JSON.parse(readFileSync(0, 'utf8')).map(label =>
  affineReference(label).reason ?? 'eligible')));
'''
    response = subprocess.run(['node','--input-type=module','-e',runner],
                              cwd=Path(__file__).resolve().parent,
                              input=json.dumps([r[1] for r in entries]), capture_output=True,
                              text=True, check=True, timeout=30)
    counts = {s: Counter() for s in SPLITS}
    for (split, _), reason in zip(entries, json.loads(response.stdout), strict=True):
        counts[split][reason] += 1
    fields = ('eligible','not-one-equality','layout-outside-scope','checker-unsupported','no-variable')
    return {'archive_sha256': ARCHIVE_SHA, 'ocr_runs': 0, 'splits': {
        s: {'scanned': sum(c.values()), **{k: c[k] for k in fields}} for s, c in counts.items()
    }}


if __name__ == '__main__':
    print(json.dumps(inventory(Path(sys.argv[1])), indent=2))
