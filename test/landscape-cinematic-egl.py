"""Run actual water, terrain, shafts, HDR bloom and presentation shaders together.
The EGL harness exercises the depth-proxy reflection path, not the browser 3D mirror.
Run: python3 test/landscape-cinematic-egl.py
"""
import runpy
x=runpy.run_path('test/landscape-bloom-egl.py');globals().update(x)
water=target(W,H);terrain=target(W,H);light_target=target((W+3)//4,(H+3)//4)
down=[target(max(1,(W+2**(i+1)-1)//2**(i+1)),max(1,(H+2**(i+1)-1)//2**(i+1))) for i in range(5)]
up=[target(t[2],t[3]) for t in down[:-1]]
bloom_program=p;terrain_program=link(source['terrain']);light_program=link(source['light']);present_program=link(source['present'])
def u(p,name,*values):
 function('glUniform'+str(len(values))+'f',None,integer,*([f]*len(values)))(location(p,name.encode()),*values)
def configure(p,t,lit):
 use(p);viewport(0,0,t[2],t[3]);bind_framebuffer(0x8D40,t[1])
 u(p,'uResolution',t[2],t[3]);u(p,'uFrame',t[2],t[3],0,t[3]*.06);u(p,'uTime',0);u(p,'uQuality',2);u(p,'uFrameInterval',1/60);u(p,'uHdr',1)
 u(p,'uSceneEnabled',1);u(p,'uScene3D',0);u(p,'uTerrainEnabled',1);u(p,'uWaterResolution',W,H)
 u(p,'uDay',lit['sky']['day']);u(p,'uWarm',lit['sky']['twilight']);u(p,'uMoonIllumination',lit['moon']['illumination'])
 for prefix,key in [('Sun','sun'),('Moon','moon')]:
  b=lit[key];u(p,'u'+prefix+'Position',b['x'],b['y']);u(p,'u'+prefix+'Altitude',b['altitude']);u(p,'u'+prefix+'Intensity',b['intensity']);u(p,'u'+prefix+'Color',*[v**2.2 if p!=present_program else v for v in b['color']])
 for name,unit in [('uMask',0),('uTerrain',1),('uGeometry',2),('uPerspective',3),('uClouds',4),('uWater',5),('uLight',6),('uSceneDepth',7),('uTerrainNormal',8),('uLitTerrain',9),('uBloom',14)]:function('glUniform1i',None,integer,integer)(location(p,name.encode()),unit)
 function('glClearColor',None,f,f,f,f)(0,0,0,0);function('glClear',None,ui)(0x4000)
# Normal texture required by the production material stage.
normal=np.array(Image.open('public/themes/mountains/terrain-normal.png').convert('RGBA'),dtype=np.uint8)
normal_texture=ui();function('glGenTextures',None,integer,C.POINTER(ui))(1,C.byref(normal_texture));active_texture(0x84C0+8);bind_texture(0x0DE1,normal_texture.value)
for key,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:param(0x0DE1,key,value)
tex_image(0x0DE1,0,0x1908,normal.shape[1],normal.shape[0],0,0x1908,0x1401,normal.ctypes.data)
for name,iso in [('morning','2026-10-23T08:12:00+02:00'),('sunset','2026-10-25T16:15:00+01:00')]:
 lit=json.loads(subprocess.check_output(['node','-e',f"const load=require('./test/load-ts.cjs'),a=load('lib/landscape-astronomy.ts');console.log(JSON.stringify(load('lib/landscape-lighting.ts').landscapeLighting(a.astronomyAt(Date.parse('{iso}'),a.DEFAULT_LANDSCAPE_LOCATION),0)))"],text=True))
 configure(program,water,lit);function('glBindVertexArray',None,ui)(vao.value);function('glDrawElements',None,ui,integer,ui,ptr)(4,len(indices),0x1403,None);function('glBindVertexArray',None,ui)(0)
 for unit,t in [(5,water),(6,light_target),(9,terrain)]:active_texture(0x84C0+unit);bind_texture(0x0DE1,t[0])
 configure(terrain_program,terrain,lit);draw(4,0,3)
 configure(light_program,light_target,lit);draw(4,0,3)
 use(bloom_program);previous=water
 for i,t in enumerate(down):pass_bloom(previous,t,0 if i==0 else 1);previous=t
 for i in range(len(up)-1,-1,-1):pass_bloom(previous,up[i],2,down[i]);previous=up[i]
 active_texture(0x84C0+14);bind_texture(0x0DE1,previous[0])
 configure(present_program,(0,0,W,H),lit);draw(4,0,3)
 buffer=(C.c_ubyte*(W*H*4))();read(0,0,W,H,0x1908,0x1401,buffer)
 assert function('glGetError',ui)()==0,'full pipeline GL errors'
 Image.frombytes('RGBA',(W,H),bytes(buffer)).transpose(Image.Transpose.FLIP_TOP_BOTTOM).save('test/ui-previews/cinematic-pipeline-'+name+'.png')
print('PASS: actual water, material, shafts, five-level HDR bloom and presentation shaders run together without GL errors; proxy reflection path')
