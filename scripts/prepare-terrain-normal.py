"""World-space material normals for the registered camera/depth surface.
Depth is a controlled 2.5D reconstruction. Small albedo-derived bump detail is
an artistic material approximation, not recovered photogrammetric geometry.
"""
import pathlib,json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
root=pathlib.Path(__file__).resolve().parents[1]
folder=root/'public/themes/mountains'
c=json.loads((root/'lib/landscape-water-calibration.json').read_text())
depth=np.asarray(Image.open(folder/'scene-depth.png')).astype(float)
h,w=depth.shape[:2]
radius=(depth[:,:,0]*256+depth[:,:,1])/65535*c['worldExtent']
az=((np.arange(w)+.5)/w-.5)*np.deg2rad(c['azimuthSpanDegrees'])
el=(c['horizon']-(np.arange(h)+.5)/h)/c['altitudeSpan']*np.pi/2
el=np.clip(el,-1.45,1.45)
world=np.stack([radius*np.sin(az)[None,:],c['cameraHeight']+radius*np.tan(el)[:,None],radius*np.cos(az)[None,:]],axis=-1)
normalize=lambda v:v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-8)
du=np.gradient(world,axis=1);dv=np.gradient(world,axis=0)
normal=normalize(np.cross(dv,du))
view=normalize(np.array([0,c['cameraHeight'],0])-world)
normal=np.where((np.sum(normal*view,axis=-1)<0)[:,:,None],-normal,normal)
art=np.asarray(Image.open(folder/'terrain.webp').convert('RGBA').resize((w,h),Image.Resampling.LANCZOS)).astype(float)/255
lum=np.sum(art[:,:,:3]*np.array([.2126,.7152,.0722]),axis=-1)
gy,gx=np.gradient(gaussian_filter(np.log(lum+.08),1.1))
normal=normalize(normal-normalize(du)*np.clip(gx,-.25,.25)[:,:,None]*.65-normalize(dv)*np.clip(gy,-.25,.25)[:,:,None]*.65)
encoded=np.zeros((h,w,4),dtype=np.uint8);encoded[:,:,:3]=np.rint(np.clip(normal*.5+.5,0,1)*255);encoded[:,:,3]=255
Image.fromarray(encoded).save(folder/'terrain-normal.png',optimize=True)
print('Terrain normal bytes:',(folder/'terrain-normal.png').stat().st_size)
