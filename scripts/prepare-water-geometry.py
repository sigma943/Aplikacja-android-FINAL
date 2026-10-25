"""Controlled plane reconstruction, tied to the existing panorama and exact mask.
Pillow/numpy/scipy are generation-only; no new runtime dependencies.
The UV atlas has two opaque RGB halves: signed X24 and Z24 in RGB.
Perspective atlas: R relative observer distance, G bank fade, B shore AO.
No light axis, random coordinates, or inferred 3D mountains are baked into maps.
"""
import json, math, pathlib, hashlib
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
root=pathlib.Path(__file__).resolve().parents[1]
c=json.loads((root/'lib/landscape-water-calibration.json').read_text())
out=root/'public/themes/mountains';w,h=c['mapWidth'],c['mapHeight']
x=(np.arange(w)+.5)/w;y=(np.arange(h)+.5)/h
az=(x-.5)*math.radians(c['azimuthSpanDegrees'])
depression=np.maximum(.012,(y-c['horizon'])*math.pi/2/c['altitudeSpan'])
radius=np.minimum(c['worldExtent'],c['cameraHeight']/np.tan(depression))
world_x=radius[:,None]*np.sin(az)[None,:]
world_z=radius[:,None]*np.cos(az)[None,:]
atlas=np.zeros((h,w*2,3),dtype=np.uint8)
for offset,world in [(0,world_x),(w,world_z)]:
 q=np.rint(np.clip(world/c['worldExtent']*.5+.5,0,1)*16777215).astype(np.uint32)
 atlas[:,offset:offset+w,0]=(q>>16).astype(np.uint8)
 atlas[:,offset:offset+w,1]=((q>>8)&255).astype(np.uint8)
 atlas[:,offset:offset+w,2]=(q&255).astype(np.uint8)
Image.fromarray(atlas).save(out/'water-uv.png',optimize=True)
mask=np.array(Image.open(out/'water-mask.png').getchannel('A').resize((w,h),Image.Resampling.LANCZOS))
distance=distance_transform_edt(mask>100)
p=np.zeros((h,w,3),dtype=np.uint8)
p[:,:,0]=np.rint(np.clip(np.log1p(radius)/math.log1p(c['worldExtent']),0,1)*255)[:,None]
p[:,:,1]=np.rint(np.clip(distance/4,0,1)*255)
p[:,:,2]=np.rint((.50+.50*np.clip(distance/9,0,1))*255)
Image.fromarray(p).save(out/'water-perspective.png',optimize=True)
manifest={'calibration':c,'maskSha256':hashlib.sha256((out/'water-mask.png').read_bytes()).hexdigest(),'uvBytes':(out/'water-uv.png').stat().st_size,'perspectiveBytes':(out/'water-perspective.png').stat().st_size}
(out/'water-geometry.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
