"""Exercise the actual presentation shader on the registered photographic layer.
Software GLES3 pixel proof, not an Android performance measurement.
"""
import pathlib
exec(compile(pathlib.Path('test/landscape-gpu-egl.py').read_text(),'test/landscape-gpu-egl.py','exec'))
program=function('glCreateProgram',ui)()
for kind,code in [(0x8B31,source['screen']),(0x8B30,source['present'])]:
 sh=create_shader(kind);encoded=C.c_char_p(code.encode());shader_source(sh,1,C.byref(encoded),None);compile_shader(sh);st=integer();get_shader(sh,0x8B81,C.byref(st));assert st.value,'wind compile';attach(program,sh)
function('glLinkProgram',None,ui)(program);st=integer();function('glGetProgramiv',None,ui,ui,C.POINTER(integer))(program,0x8B82,C.byref(st));assert st.value,'wind link';function('glUseProgram',None,ui)(program)
for unit,name,image in [(9,'uLitTerrain',images[1].transpose(Image.Transpose.FLIP_TOP_BOTTOM)),(5,'uWater',Image.new('RGBA',(1,1))),(6,'uLight',Image.new('RGBA',(1,1)))]:
 tex=ui();function('glGenTextures',None,integer,C.POINTER(ui))(1,C.byref(tex));function('glActiveTexture',None,ui)(0x84C0+unit);function('glBindTexture',None,ui,ui)(0x0DE1,tex.value)
 for key,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:param(0x0DE1,key,value)
 data=C.create_string_buffer(image.tobytes());function('glTexImage2D',None,ui,integer,integer,integer,integer,integer,ui,ui,ptr)(0x0DE1,0,0x1908,image.width,image.height,0,0x1908,0x1401,data)
 function('glUniform1i',None,integer,integer)(location(program,name.encode()),unit)
for name,unit in [('uMask',0),('uTerrain',1)]:function('glUniform1i',None,integer,integer)(location(program,name.encode()),unit)
uniform('uResolution',W,H);uniform('uFrame',W,H,0,0);uniform('uTerrainEnabled',1)
function('glBindVertexArray',None,ui)(0)
def foliage(seconds):
 uniform('uTime',seconds);function('glDrawArrays',None,ui,integer,integer)(4,0,3)
 pixels=(C.c_ubyte*(W*H*4))();read(0,0,W,H,0x1908,0x1401,pixels);assert function('glGetError',ui)()==0
 return Image.frombytes('RGBA',(W,H),bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
a,b=foliage(0),foliage(2.1);aa,bb=np.asarray(a),np.asarray(b)
delta=np.max(np.abs(aa[:,:,:3].astype(int)-bb[:,:,:3].astype(int)),axis=2)
assert np.count_nonzero(delta>2)>1000,'foreground visibly moves'
# These landmarks lie INSIDE the old broad wind envelope. Previously the test
# checked only the centre of the landscape and missed these moving rocks/pines.
landmarks={'near-bank rocks':(100,680,130,694),'lower conifers':(150,840,175,872),
           'right conifers':(380,800,393,811),'left forest':(45,492,75,517)}
for name,(x0,y0,x1,y1) in landmarks.items():
 assert np.max(delta[y0:y1,x0:x1])==0,(name,'must remain pixel-identical')
print('PASS: stationary rocks, lower/right conifers and left forest')
assert np.max(delta[:int(H*.405)])==0,'sky and mountain peaks remain fixed'
assert np.max(delta[int(H*.48):int(H*.78),int(W*.32):int(W*.84)])==0,'distant forest and river banks remain fixed'
assert np.count_nonzero(np.abs(aa[:,:,3].astype(int)-bb[:,:,3].astype(int))>30)>100,'leaf silhouettes must move, not just their colour'
assert np.count_nonzero(delta>12)>5000,'motion is visible at phone resolution'
assert np.array_equal(np.asarray(foliage(2.1)),bb),'frozen animation time is stable'
assert np.max(np.abs(np.asarray(foliage(2.101))[:,:,:3].astype(int)-bb[:,:,:3].astype(int)))<10,'continuous motion without jumps'
# Track an actual near-leaf silhouette at phone resolution across a gust.
# A pixel-count test alone accepted the imperceptible interior-only effect.
edges=[]
for t in [0,1.5,3,4.5]:
 row=np.asarray(foliage(t))[int(H*.8),:int(W*.42),3]
 edges.append(int(np.where(row>128)[0][-1]))
assert max(edges)-min(edges)>=4,('leaf contour must travel at least four phone pixels',edges)
print('PASS: foreground leaf contour positions at 425px width:',edges)
out=pathlib.Path('test/ui-previews');out.mkdir(exist_ok=True)
a.save(out/'landscape-wind-start.png');b.save(out/'landscape-wind-gust.png')
frames=[foliage(t/12).convert('RGB') for t in range(72)]
frames[0].save(out/'landscape-wind.gif',save_all=True,append_images=frames[1:],duration=83,loop=0)
print('PASS: foreground wind changes',np.count_nonzero(delta>2),'pixels; stable peaks/banks, moving leaf silhouettes and reduced-motion freeze; continuous time.')
