"""Research: same generated row ink and background; vary only oracle crop margin."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

from PIL import Image

from page_prepare import bounds, payload, paint_row, BASELINES
from page_score import literal

CASES = {
    'distribution-neg': ('−5(t−3)=25','−5t−15=25','t=−8'),
    'distribution-pos': ('3(2r−5)=9','6r−15=9','r=4'),
    'decimal': ('0.4q−1.2=2','0.4q=3.2','q=8'),
    'both-sides': ('8p−3=3p+17','5p=20','p=4'),
    'balanced-division': ('−12w=36','w=−3','3w=−9'),
    'short-sign': ('u+4=2','u=−2','3u=−6'),
    'fraction-neg': ((('m−1','4'),'=−2'),'m−1=−8','m=−7'),
    'fraction-pos': ((('2k','7'),'+1=3'),(('2k','7'),'=2'),'k=7'),
}
MARGINS = (6,12,24)


def label(parts):
    if isinstance(parts,str):
        return parts
    return ''.join(r'\frac{'+x[0]+'}{'+x[1]+'}' if isinstance(x,tuple) else x for x in parts)


def freeze(folder):
    folder.mkdir(mode=0o700)
    pages=[]
    for key,rows in CASES.items():
        masks=[paint_row((parts,) if isinstance(parts,str) else parts,y,True)
               for parts,y in zip(rows,BASELINES,strict=True)]
        encoded=payload(masks,True)
        im=Image.open(BytesIO(encoded)).convert('L')
        crops=[]
        for i,(parts,mask) in enumerate(zip(rows,masks,strict=True)):
            for px in MARGINS:
                box=bounds(mask.getbbox(),im.size,px)
                assert all(other.crop(box).getbbox() is None for j,other in enumerate(masks) if i!=j)
                name=f'{key}-{i+1}-pad{px}.png'
                im.crop(box).save(folder/name)
                crops.append(dict(name=name,crop_sha256=sha256((folder/name).read_bytes()).hexdigest(),
                                  margin=px,row=i+1,target=label(parts),box=box))
        pages.append(dict(key=key,source_sha256=sha256(encoded).hexdigest(),crops=crops))
    (folder/'manifest.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2)+'\n')


def score(manifest, result):
    frozen=json.loads(manifest.read_bytes())
    observed=json.loads(result.read_bytes())
    total={'exact_rows':{str(x):0 for x in MARGINS},'exact_chains':{str(x):0 for x in MARGINS},
           'rows':0,'chains':0,'all_three_agree':0,'all_three_agree_exact':0,
           'all_three_agree_wrong':0,'margin_disagreement':0,
           'disagreement_with_exact_12':0,'any_margin_exact':0,'all_three_agree_chains':0,
           'all_three_agree_exact_chains':0}
    for f,r in zip(frozen,observed,strict=True):
        assert {k:v for k,v in f.items() if k!='crops'}=={k:v for k,v in r.items() if k!='crops'}
        if len(f['crops']) != 9 or len(r['crops']) != 9:
            raise ValueError('Expected nine ordered entries per page')
        counts={p:0 for p in MARGINS}
        agreements=correct_agreements=0
        for i in range(0,len(f['crops']),3):
            want=f['crops'][i:i+3]
            got=r['crops'][i:i+3]
            assert len(want)==len(got)==3
            assert tuple(c['margin'] for c in want)==MARGINS
            for a,b in zip(want,got,strict=True):
                assert a=={k:v for k,v in b.items() if k!='raw'}
                if literal(a['target'])==literal(b['raw']):
                    counts[a['margin']]+=1
            raws=[literal(c['raw']) for c in got]
            target=literal(want[0]['target'])
            agree=len(set(raws))==1 and bool(raws[0])
            exact12=raws[1]==target
            total['rows']+=1
            total['any_margin_exact']+=target in raws
            total['all_three_agree']+=agree
            total['all_three_agree_exact']+=agree and exact12
            total['all_three_agree_wrong']+=agree and not exact12
            total['margin_disagreement']+=len(set(raws))>1
            total['disagreement_with_exact_12']+=len(set(raws))>1 and exact12
            agreements+=agree
            correct_agreements+=agree and exact12
        total['chains']+=1
        total['all_three_agree_chains']+=agreements==3
        total['all_three_agree_exact_chains']+=correct_agreements==3
        for px,n in counts.items():
            total['exact_rows'][str(px)]+=n
            total['exact_chains'][str(px)]+=n==3
    assert total['rows']==24 and total['chains']==8
    return {'manifest_sha256':sha256(manifest.read_bytes()).hexdigest(),
            'raw_sha256':sha256(result.read_bytes()).hexdigest(),
            'scope':'Eight new generated phone-style printed pages; clean row geometry, no human ink',
            **total}


if __name__=='__main__':
    if sys.argv[1]=='freeze':
        freeze(Path(sys.argv[2]))
    else:
        print(json.dumps(score(Path(sys.argv[2]),Path(sys.argv[3])),indent=2))
