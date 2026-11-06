"""Real GLES3 HDR bloom pixels: normalized energy, spread, colour, alpha masking.
Runs the existing water/astronomy pixel regression first. No Android FPS claims.
"""
import runpy
from pathlib import Path
x = runpy.run_path('test/landscape-gpu-egl.py')
globals().update(x)

def link(fragment):
    p = function('glCreateProgram', ui)()
    for kind, code in [(0x8B31, source['screen']), (0x8B30, fragment)]:
        shader = create_shader(kind); encoded = C.c_char_p(code.encode())
        shader_source(shader, 1, C.byref(encoded), None); compile_shader(shader)
        status = integer(); get_shader(shader, 0x8B81, C.byref(status))
        assert status.value, 'bloom shader compilation'
        attach(p, shader); function('glDeleteShader', None, ui)(shader)
    function('glLinkProgram', None, ui)(p)
    status = integer(); function('glGetProgramiv', None, ui, ui, C.POINTER(integer))(p, 0x8B82, C.byref(status))
    assert status.value, 'bloom shader link'
    return p

bind_texture = function('glBindTexture', None, ui, ui)
active_texture = function('glActiveTexture', None, ui)
bind_framebuffer = function('glBindFramebuffer', None, ui, ui)
tex_image = function('glTexImage2D', None, ui, integer, integer, integer, integer, integer, ui, ui, ptr)
viewport = function('glViewport', None, integer, integer, integer, integer)
use = function('glUseProgram', None, ui)
draw = function('glDrawArrays', None, ui, integer, integer)

def target(w, h, data=None):
    texture, fbo = ui(), ui()
    function('glGenTextures', None, integer, C.POINTER(ui))(1, C.byref(texture))
    active_texture(0x84C0+12); bind_texture(0x0DE1, texture.value)
    for key, value in [(0x2801, 0x2601), (0x2800, 0x2601), (0x2802, 0x812F), (0x2803, 0x812F)]:
        param(0x0DE1, key, value)
    tex_image(0x0DE1, 0, 0x881A, w, h, 0, 0x1908, 0x1406, None if data is None else data.ctypes.data)
    function('glGenFramebuffers', None, integer, C.POINTER(ui))(1, C.byref(fbo))
    bind_framebuffer(0x8D40, fbo.value)
    function('glFramebufferTexture2D', None, ui, ui, ui, ui, integer)(0x8D40, 0x8CE0, 0x0DE1, texture.value, 0)
    assert function('glCheckFramebufferStatus', ui, ui)(0x8D40) == 0x8CD5
    return (texture.value, fbo.value, w, h)

p = link(source['bloom']); use(p)
function('glBindVertexArray', None, ui)(0)
for name, unit in [('uBloomSource', 12), ('uBloomDetail', 13)]:
    function('glUniform1i', None, integer, integer)(location(p, name.encode()), unit)

def set_uniform(name, *values):
    function('glUniform'+str(len(values))+'f', None, integer, *([f]*len(values)))(location(p, name.encode()), *values)

def pass_bloom(src, dest, stage, detail=None):
    active_texture(0x84C0+12); bind_texture(0x0DE1, src[0])
    active_texture(0x84C0+13); bind_texture(0x0DE1, (detail or src)[0])
    bind_framebuffer(0x8D40, dest[1]); viewport(0, 0, dest[2], dest[3])
    set_uniform('uResolution', dest[2], dest[3]); set_uniform('uSourceResolution', src[2], src[3])
    set_uniform('uBloomStage', stage); set_uniform('uHdr', 1)
    draw(4, 0, 3)
    assert function('glGetError', ui)() == 0, 'bloom pass has no feedback/GL errors'

def pixels(t):
    result = np.zeros((t[3], t[2], 4), dtype=np.float32)
    bind_framebuffer(0x8D40, t[1]); read(0, 0, t[2], t[3], 0x1908, 0x1406, result.ctypes.data)
    assert np.isfinite(result).all(), 'finite HDR samples'
    return result

size = 256
image = np.zeros((size, size, 4), dtype=np.float32)
image[120:136,120:136] = [20, 8, 2, 1]
src = target(size,size,image)
down = [target(size//2**(i+1),size//2**(i+1)) for i in range(5)]
up = [target(t[2],t[3]) for t in down[:-1]]
previous = src
for i,t in enumerate(down):
    pass_bloom(previous,t,0 if i==0 else 1); previous=t
for i in range(len(up)-1,-1,-1):
    pass_bloom(previous,up[i],2,down[i]); previous=up[i]
result=pixels(previous)
assert result[:,:,0].max()>1, 'highlight energy stays HDR until presentation'
assert result[64,85,0]>.001, 'wide halo extends beyond the narrow highlight'
assert (result[:,:,0]>result[:,:,1]).any() and (result[:,:,1]>result[:,:,2]).any(), 'golden highlight retains colour'
Path('test/ui-previews').mkdir(parents=True,exist_ok=True)
preview=np.clip(result[:,:,:3]/(1+result[:,:,:3]),0,1)**(1/2.2)
Image.fromarray((preview*255).astype(np.uint8)).resize((512,512)).save('test/ui-previews/cinematic-bloom-kernel.png')
# Transparent RGB is never a light source (shorelines and clear framebuffer).
image[:,:,3]=0
active_texture(0x84C0+12);bind_texture(0x0DE1,src[0]);tex_image(0x0DE1,0,0x881A,size,size,0,0x1908,0x1406,image.ctypes.data)
pass_bloom(src,down[0],0)
assert pixels(down[0])[:,:,:3].max()==0, 'transparent pixels cannot bloom'
# A uniform bright field is not amplified by adding pyramid levels.
image[:]=[4,2,1,1]
active_texture(0x84C0+12);bind_texture(0x0DE1,src[0]);tex_image(0x0DE1,0,0x881A,size,size,0,0x1908,0x1406,image.ctypes.data)
previous=src
for i,t in enumerate(down):
    pass_bloom(previous,t,0 if i==0 else 1);previous=t
base=pixels(down[0])[0,0,:3]
for i in range(len(up)-1,-1,-1):
    pass_bloom(previous,up[i],2,down[i]);previous=up[i]
assert np.allclose(pixels(previous)[0,0,:3],base,rtol=.005), 'pyramid preserves constant-field energy'
print('PASS: five-level HDR bloom, wide halo, warm colour, no transparent glow, normalized energy, no GL errors')
