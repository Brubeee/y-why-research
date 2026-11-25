"""Strict presentation-only comparison of raw recognition on oracle crops."""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

NORM = re.compile(r'(?<!\d)\s+|\s+(?!\d)')
MODES = ('tesseract','stock','aspect_pad')


def canonical(raw):
    s=raw.strip().replace('−','-')
    if s.startswith(r'\[') and s.endswith(r'\]'):
        s=s[2:-2]
    # Remove display-size modifiers only when followed by a literal bracket.
    s=re.sub(r'\\(?:left|right)(?=[()])','',s)
    return NORM.sub('',s)


def summary(rows):
    chains=defaultdict(list)
    for r in rows:
        chains[(r['cohort'],r['chain'])].append(r)
    assert len(rows)==36 and len(chains)==12
    assert all([r['index'] for r in rs]==[1,2,3] for rs in chains.values())
    return {
        cohort: {mode: {
            'exact_rows':sum(canonical(r['raw'][mode])==canonical(r['truth'])
                             for (cohort2,_),rs in chains.items() if cohort2==cohort for r in rs),
            'total_rows':18,
            'all_rows_exact_with_oracle_crops':sum(all(canonical(r['raw'][mode])==canonical(r['truth']) for r in rs)
                                                    for (cohort2,_),rs in chains.items() if cohort2==cohort),
            'paired_chains':6,
        } for mode in MODES}
        for cohort in ('clean-printed','phone-style-render')
    }


if __name__=='__main__':
    assert canonical(r'\[\left(-2n\right)=8\]')=='(-2n)=8'
    assert canonical('n=4')!=canonical('n=-4')
    assert canonical('a=1 3')!=canonical('a=13')
    assert canonical('9/5=2/5')!=canonical('q/5=2/5')
    file=Path(sys.argv[1])
    rows=json.loads(file.read_text())
    print(json.dumps({'raw_report_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                      'summary':summary(rows)},indent=2))
