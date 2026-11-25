"""Research-only raster line proposal. It has no OCR/text dependency."""
from rule_mask import striped_proposals
import numpy as np
from scipy import ndimage as ndi


def spans(flags):
    changes=np.flatnonzero(np.diff(np.r_[False,flags,False]))
    return list(zip(changes[::2],changes[1::2],strict=True))


def proposals(photo, *, suppress_ruling=False):
    gray=np.asarray(photo.convert('L'),dtype=np.float32)
    unit=max(1, min(gray.shape)/365)
    # Local contrast permits a slowly changing background without whitening the input.
    background=ndi.maximum_filter(gray,size=2*int(13*unit)+1)
    mask=background-gray>45
    if suppress_ruling:
        mask=striped_proposals(mask, unit)
    labels,n=ndi.label(mask,structure=np.ones((3,3),dtype=int))
    # Strip explicitly long, nearly flat rules and isolated specks, not individual short minuses.
    for j,s in enumerate(ndi.find_objects(labels),1):
        cols=s[1].stop-s[1].start
        height=s[0].stop-s[0].start
        if (cols>.45*gray.shape[1] and height<5*unit) or np.count_nonzero(labels[s]==j)<4:
            mask[s] &= labels[s]!=j
    ys=spans(np.any(mask,axis=1))
    if not ys:
        return []
    components=[(s[1].start,s[0].start,s[1].stop,s[0].stop)
                for s in ndi.find_objects(ndi.label(mask,structure=np.ones((3,3),dtype=int))[0])]
    def meets(a,b,frac=.58):
        return max(0,min(a[2],b[2])-max(a[0],b[0]))>=frac*(a[2]-a[0])
    # A short bar only links fragments with actual ink centered over and under it.
    # Another thin parallel stroke close by is more likely an equals mark.
    ranges=[]
    for bar in components:
        l,t,r,b=bar
        w,h=r-l,b-t
        if not 13*unit<=w<=76*unit or h>6*unit or w<4*h:
            continue
        if any(c!=bar and (c[3]-c[1])<=4*unit and meets(c,bar,.8) and meets(bar,c,.8)
               and 0<=max(c[1]-b,t-c[3])<=7*unit for c in components):
            continue
        def support(above):
            return [c for c in components if c!=bar and meets(c,bar) and c[3]-c[1]>=9*unit
                    and 2*unit <= ((t-c[3]) if above else (c[1]-b)) <= 10*unit]
        up,down=support(True),support(False)
        if up and down:
            # Link closest supporting glyph only; its connected projection band may contain peers.
            ranges.append((max(up,key=lambda c:c[3])[1],min(down,key=lambda c:c[1])[3]))
    grouped=[]
    for t,b in ys:
        if grouped and (t-grouped[-1][1]<=2*unit or any(a<t and z>grouped[-1][1] for a,z in ranges)):
            grouped[-1]=(grouped[-1][0],b)
        else:
            grouped.append((t,b))
    out=[]
    for i,(t,b) in enumerate(grouped):
        xs=np.flatnonzero(np.any(mask[t:b],axis=0))
        if not len(xs):
            continue
        l,r=int(xs[0]),int(xs[-1])+1
        box=(l,int(t),r,int(b))
        # Clip padding at midpoints, never remove ink from the proposed box.
        pad=round(12*unit)
        above=(grouped[i-1][1]+t)//2 if i else 0
        below=(grouped[i+1][0]+b)//2 if i+1<len(grouped) else gray.shape[0]
        padded=(max(0,l-pad),int(max(above,t-pad)),min(gray.shape[1],r+pad),int(min(below,b+pad)))
        out.append((box,padded))
    return out
