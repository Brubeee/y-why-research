"""Separate page-line geometry from exact literal recognition."""
from collections import Counter
import json
from pathlib import Path
import sys
from summarize import canonical


def literal(x):
    s=canonical(x)
    return s.replace(r'\dfrac{',r'\frac{').replace(r'\tfrac{',r'\frac{')


def status(page, arm):
    # The original detector reading order is retained; no sort, merging or repair.
    crops=[c for c in page['crops'] if c['arm']==arm]
    n=len(page['truth'])
    assert all(len(c['ink'])==n and all(0<=f<=1 for f in c['ink']) for c in crops)
    links=[[i for i,f in enumerate(c['ink']) if f>=.10] for c in crops]
    rows=[]
    for i,t in enumerate(page['truth']):
        hits=[j for j,ids in enumerate(links) if i in ids]
        if not hits:
            label='missing'
        elif len(hits)>1:
            label='split-or-duplicate'
        elif len(links[hits[0]])>1:
            label='merged'
        elif crops[hits[0]]['ink'][i]<.97:
            label='clipped'
        else:
            label='complete'
        rows.append({'row':i+1, 'geometry':label, 'matching_crops':hits,
                     'exact_in_complete_crop': label=='complete' and literal(crops[hits[0]]['raw'])==literal(t)})
    geometric_order=[ids[0] for ids in links if len(ids)==1]
    geometry_exact=all(r['geometry']=='complete' for r in rows) and len(crops)==n and geometric_order==list(range(n))
    return {'rows':rows,'extra_crops':sum(not ids for ids in links),'geometry_exact':geometry_exact,
            'exact_chain':geometry_exact and all(r['exact_in_complete_crop'] for r in rows)}


def summary(pages):
    out={}
    arms=('oracle','detector','geometry') if any(c['arm']=='geometry' for p in pages for c in p['crops']) else ('oracle','detector')
    for cohort in ('clean-printed','phone-style-render'):
        sub=[p for p in pages if p['cohort']==cohort]
        assert len(sub)==4 and len({p['chain'] for p in sub})==4
        out[cohort]={}
        for arm in arms:
            results=[status(p,arm) for p in sub]
            hist=Counter(r['geometry'] for s in results for r in s['rows'])
            out[cohort][arm]=dict(page_count=len(sub),row_count=sum(hist.values()),geometry=dict(hist),
                extra_crops=sum(s['extra_crops'] for s in results),
                exact_given_complete_count=sum(r['exact_in_complete_crop'] for s in results for r in s['rows']),
                complete_ordered_pages=sum(s['geometry_exact'] for s in results),
                exact_chains=sum(s['exact_chain'] for s in results))
    return out


def self_test():
    def score(pairs):
        return status({'truth':[r'\frac{x}{6}=2','x=13'],'crops':[
            {'arm':'detector','ink':coverage,'raw':raw} for coverage,raw in pairs]},'detector')
    a,b=([1,0],r'\frac{x}{6}=2'),([0,1],'x=13')
    assert score([a,b])['exact_chain']
    assert score([a,([0,1],'x=12')])['geometry_exact'] and not score([a,([0,1],'x=12')])['exact_chain']
    assert not score([b,a])['geometry_exact']
    assert not score([a,b,([0,0],'')])['geometry_exact']
    assert [r['geometry'] for r in score([a])['rows']]==['complete','missing']
    assert score([a,([.2,0],'duplicate'),b])['rows'][0]['geometry']=='split-or-duplicate'
    assert score([([.9,0],a[1]),b])['rows'][0]['geometry']=='clipped'
    assert all(r['geometry']=='merged' for r in score([([1,1],'merged')])['rows'])
    assert literal(r'\dfrac{x}{6}=2')==literal(a[1]) and literal(r'\frac{8}{6}=2')!=literal(a[1])


if __name__=='__main__':
    self_test()
    pages=json.loads(Path(sys.argv[1]).read_text())
    print(json.dumps(summary(pages),indent=2))
