"""Controlled 2.5D depth proxy, NOT recovered 3D geometry.

Opaque art above the camera horizon is placed on a 110-unit distant shell.
Below it, banks/canopies sit on a 0.96-unit raised plane. Camera calibration
and terrain alpha register the proxy to the exact production illustration.
RG packs radial depth at 16 bits; B is occluder coverage; A is opaque.
"""
import json
import pathlib
import numpy as np
from PIL import Image

root=pathlib.Path(__file__).resolve().parents[1]
c=json.loads((root/'lib/landscape-water-calibration.json').read_text())
folder=root/'public/themes/mountains'
w,h=c['mapWidth'],c['mapHeight']
alpha=np.asarray(Image.open(folder/'terrain.webp').getchannel('A').resize((w,h),Image.Resampling.LANCZOS))
elevation=(c['horizon']-(np.arange(h)+.5)/h)/c['altitudeSpan']*np.pi/2
depression=np.maximum(.001,-elevation)
ground=(c['cameraHeight']-.96)/np.tan(depression)
# Positive smooth minimum: a hard shell/plane minimum creates a full-width
# normal discontinuity that becomes visible under material lighting.
radial=(110.**-6+ground**-6)**(-1/6)
q=np.rint(np.clip(radial/c['worldExtent'],0,1)*65535).astype(np.uint16)
depth=np.zeros((h,w,4),dtype=np.uint8)
depth[:,:,0]=(q>>8)[:,None];depth[:,:,1]=(q&255)[:,None]
depth[:,:,2]=np.where(alpha>16,alpha,0);depth[:,:,3]=255
Image.fromarray(depth).save(folder/'scene-depth.png',optimize=True)
print('Scene-depth proxy bytes:',(folder/'scene-depth.png').stat().st_size)
