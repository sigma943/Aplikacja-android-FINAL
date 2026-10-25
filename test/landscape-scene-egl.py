"""Optional software GLES3 proof of a solid scene, mirror and translated camera.
Run from the repository root. Requires the same Mesa/Pillow/numpy as gpu-egl.
"""
import pathlib
exec(compile(pathlib.Path('test/landscape-gpu-egl.py').read_text(),'test/landscape-gpu-egl.py','exec'))

scene=json.loads(subprocess.check_output(['node','-e',"const fs=require('fs'),{PNG}=require('pngjs'),load=require('./test/load-ts.cjs');const p=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-mask.png')),a=new Uint8Array(p.width*p.height);for(let i=0;i<a.length;i++)a[i]=p.data[i*4+3];const s=load('lib/landscape-scene-geometry.ts').buildLandscapeScene(a,p.width,p.height);console.log(JSON.stringify(Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Array.from(v)]))));"],text=True))
program=function('glCreateProgram',ui)()
for kind,code in [(0x8B31,source['sceneVertex']),(0x8B30,source['scene'])]:
 sh=create_shader(kind);encoded=C.c_char_p(code.encode());shader_source(sh,1,C.byref(encoded),None);compile_shader(sh);st=integer();get_shader(sh,0x8B81,C.byref(st));assert st.value,'scene compile';attach(program,sh)
function('glLinkProgram',None,ui)(program);st=integer();function('glGetProgramiv',None,ui,ui,C.POINTER(integer))(program,0x8B82,C.byref(st));assert st.value,'scene link';function('glUseProgram',None,ui)(program)

def newbuffer(target,values,dtype):
 data=np.array(values,dtype=dtype);b=ui();function('glGenBuffers',None,integer,C.POINTER(ui))(1,C.byref(b));function('glBindBuffer',None,ui,ui)(target,b.value);function('glBufferData',None,ui,C.c_ssize_t,ptr,ui)(target,data.nbytes,data.ctypes.data,0x88E4)

vao=ui();function('glGenVertexArrays',None,integer,C.POINTER(ui))(1,C.byref(vao));function('glBindVertexArray',None,ui)(vao.value)
newbuffer(0x8892,scene['positions'],np.float32);function('glEnableVertexAttribArray',None,ui)(0);function('glVertexAttribPointer',None,ui,integer,ui,C.c_ubyte,integer,ptr)(0,3,0x1406,0,0,None);newbuffer(0x8893,scene['indices'],np.uint32)
newbuffer(0x8892,scene['normals'],np.float32);function('glEnableVertexAttribArray',None,ui)(1);function('glVertexAttribPointer',None,ui,integer,ui,C.c_ubyte,integer,ptr)(1,3,0x1406,0,0,None)
tex=ui();function('glGenTextures',None,integer,C.POINTER(ui))(1,C.byref(tex));function('glActiveTexture',None,ui)(0x84C0+11);function('glBindTexture',None,ui,ui)(0x0DE1,tex.value)
for key,value in [(0x2801,0x2600),(0x2800,0x2600),(0x2802,0x812F),(0x2803,0x812F)]:param(0x0DE1,key,value)
heights=np.array(scene['heights'],dtype=np.float32);function('glTexImage2D',None,ui,integer,integer,integer,integer,integer,ui,ui,ptr)(0x0DE1,0,0x822E,97,129,0,0x1903,0x1406,heights.ctypes.data)
for name,unit in [('uTerrain',1),('uSceneHeight',11)]:function('glUniform1i',None,integer,integer)(location(program,name.encode()),unit)
fb=ui();function('glGenFramebuffers',None,integer,C.POINTER(ui))(1,C.byref(fb));function('glBindFramebuffer',None,ui,ui)(0x8D40,fb.value)
color=ui();function('glGenTextures',None,integer,C.POINTER(ui))(1,C.byref(color));function('glActiveTexture',None,ui)(0x84C0+12);function('glBindTexture',None,ui,ui)(0x0DE1,color.value)
function('glTexImage2D',None,ui,integer,integer,integer,integer,integer,ui,ui,ptr)(0x0DE1,0,0x8058,W,H,0,0x1908,0x1401,None);function('glFramebufferTexture2D',None,ui,ui,ui,ui,integer)(0x8D40,0x8CE0,0x0DE1,color.value,0)
depth=ui();function('glGenRenderbuffers',None,integer,C.POINTER(ui))(1,C.byref(depth));function('glBindRenderbuffer',None,ui,ui)(0x8D41,depth.value);function('glRenderbufferStorage',None,ui,ui,integer,integer)(0x8D41,0x81A6,W,H);function('glFramebufferRenderbuffer',None,ui,ui,ui,ui)(0x8D40,0x8D00,0x8D41,depth.value)
assert function('glCheckFramebufferStatus',ui,ui)(0x8D40)==0x8CD5
function('glEnable',None,ui)(0x0B71);function('glDepthFunc',None,ui)(0x0203)
uniform('uResolution',W,H);uniform('uFrame',W,H,0,0);uniform('uScene3D',1);uniform('uDay',.93);uniform('uWarm',.8);uniform('uQuality',2);uniform('uSunPosition',.5657,.3853);uniform('uSunAltitude',.1563);uniform('uSunIntensity',.93);uniform('uSunColor',1,.717**2.2,.412**2.2);uniform('uMirror',0)
def mesh(camera=(0,0,0),mirror=0,debug=0):
 uniform('uCameraOffset',*camera);uniform('uMirror',mirror);uniform('uDebug',debug)
 function('glClearColor',None,f,f,f,f)(0,0,0,0);function('glClear',None,ui)(0x4000|0x0100);function('glDrawElements',None,ui,integer,ui,ptr)(4,len(scene['indices']),0x1405,None)
 pixels=(C.c_ubyte*(W*H*4))();read(0,0,W,H,0x1908,0x1401,pixels);assert function('glGetError',ui)()==0
 return Image.frombytes('RGBA',(W,H),bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
out=pathlib.Path('test/ui-previews');out.mkdir(exist_ok=True)
front=mesh();front.save(out/'landscape-scene-front.png')
mirror=mesh(mirror=1);mirror.save(out/'landscape-scene-mirror.png')
oblique=mesh(camera=(12,8,-12),debug=1);oblique.save(out/'landscape-scene-oblique.png')
assert front.getchannel('A').getbbox() and mirror.getchannel('A').getbbox()
assert mirror.getchannel('A').crop((0,0,W,int(H*calibration['horizon']))).getextrema()==(0,0),'reflected geometry stays below the water-plane horizon'
assert np.count_nonzero(np.any(np.asarray(front)!=np.asarray(oblique),axis=2))>1000,'translated camera produces real parallax'
print('PASS: solid indexed geometry, depth buffer, mirrored geometry and oblique camera; software GLES3, not Android performance.')
