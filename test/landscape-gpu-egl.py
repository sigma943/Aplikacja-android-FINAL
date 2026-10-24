"""Optional Linux software GLES3 pixel validation without a browser or Android.
Requires Mesa EGL and Pillow. This is NOT a hardware performance measurement.
Run from the repository root: python3 test/landscape-gpu-egl.py
"""
import ctypes as C
import json
import subprocess
from PIL import Image, ImageChops

E = C.CDLL('libEGL.so.1')
E.eglGetProcAddress.argtypes = [C.c_char_p]
E.eglGetProcAddress.restype = C.c_void_p

def function(name, result, *args):
    address = E.eglGetProcAddress(name.encode())
    assert address, name
    return C.CFUNCTYPE(result, *args)(address)

get_display = function('eglGetPlatformDisplayEXT', C.c_void_p, C.c_uint, C.c_void_p, C.POINTER(C.c_int))
display = get_display(0x31DD, None, None)  # EGL_PLATFORM_SURFACELESS_MESA
E.eglInitialize.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)]
major, minor = C.c_int(), C.c_int()
assert E.eglInitialize(display, C.byref(major), C.byref(minor)), 'EGL initialization'
E.eglBindAPI(0x30A0)  # EGL_OPENGL_ES_API
E.eglChooseConfig.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_void_p), C.c_int, C.POINTER(C.c_int)]
attributes = (C.c_int * 15)(0x3040, 0x40, 0x3033, 1, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3038, 0, 0)
config, count = C.c_void_p(), C.c_int()
assert E.eglChooseConfig(display, attributes, C.byref(config), 1, C.byref(count)) and count.value
E.eglCreateContext.argtypes = [C.c_void_p, C.c_void_p, C.c_void_p, C.POINTER(C.c_int)]
E.eglCreateContext.restype = C.c_void_p
context = E.eglCreateContext(display, config, None, (C.c_int * 3)(0x3098, 3, 0x3038))
assert context, 'GLES3 context'
W, H = 425, 925
E.eglCreatePbufferSurface.argtypes = [C.c_void_p, C.c_void_p, C.POINTER(C.c_int)]
E.eglCreatePbufferSurface.restype = C.c_void_p
surface = E.eglCreatePbufferSurface(display, config, (C.c_int * 5)(0x3057, W, 0x3056, H, 0x3038))
E.eglMakeCurrent.argtypes = [C.c_void_p] * 4
assert E.eglMakeCurrent(display, surface, surface, context)

ui, integer, f, ptr = C.c_uint, C.c_int, C.c_float, C.c_void_p
create_shader = function('glCreateShader', ui, ui)
shader_source = function('glShaderSource', None, ui, integer, C.POINTER(C.c_char_p), ptr)
compile_shader = function('glCompileShader', None, ui)
get_shader = function('glGetShaderiv', None, ui, ui, C.POINTER(integer))
get_log = function('glGetShaderInfoLog', None, ui, integer, ptr, ptr)
source = json.loads(subprocess.check_output(['node', '-e', "const x=require('./test/load-ts.cjs')('lib/landscape-water-shaders.ts');console.log(JSON.stringify({vertex:x.WATER_VERTEX,fragment:x.WATER_FRAGMENT,screen:x.SCREEN_VERTEX,light:x.LIGHT_FRAGMENT,present:x.PRESENT_FRAGMENT}));"], text=True))
shaders = []
for kind, code in [(0x8B31, source['vertex']), (0x8B30, source['fragment'])]:
    shader = create_shader(kind)
    encoded = C.c_char_p(code.encode())
    shader_source(shader, 1, C.byref(encoded), None)
    compile_shader(shader)
    status = integer()
    get_shader(shader, 0x8B81, C.byref(status))
    if not status.value:
        log = C.create_string_buffer(8192)
        get_log(shader, 8192, None, log)
        raise AssertionError(log.value.decode())
    shaders.append(shader)
program = function('glCreateProgram', ui)()
attach = function('glAttachShader', None, ui, ui)
for shader in shaders:
    attach(program, shader)
function('glLinkProgram', None, ui)(program)
status = integer()
function('glGetProgramiv', None, ui, ui, C.POINTER(integer))(program, 0x8B82, C.byref(status))
assert status.value, 'shader link'
# Compile and link the low-resolution light and ACES presentation stages too.
for fragment in [source['light'],source['present']]:
    extra=[]
    for kind,code in [(0x8B31,source['screen']),(0x8B30,fragment)]:
        sh=create_shader(kind);encoded=C.c_char_p(code.encode());shader_source(sh,1,C.byref(encoded),None);compile_shader(sh);st=integer();get_shader(sh,0x8B81,C.byref(st))
        if not st.value:
            log=C.create_string_buffer(8192);get_log(sh,8192,None,log);raise AssertionError(log.value.decode())
        extra.append(sh)
    post=function('glCreateProgram',ui)()
    for sh in extra:attach(post,sh)
    function('glLinkProgram',None,ui)(post);st=integer();function('glGetProgramiv',None,ui,ui,C.POINTER(integer))(post,0x8B82,C.byref(st));assert st.value,'postprocess link'
    for sh in extra:function('glDeleteShader',None,ui)(sh)
    function('glDeleteProgram',None,ui)(post)
function('glUseProgram', None, ui)(program)
function('glViewport', None, integer, integer, integer, integer)(0, 0, W, H)
location = function('glGetUniformLocation', integer, ui, C.c_char_p)

def uniform(name, *values):
    function('glUniform' + str(len(values)) + 'f', None, integer, *([f] * len(values)))(location(program, name.encode()), *values)

import numpy as np
images = [Image.open('public/themes/mountains/' + name).convert('RGBA') for name in ['water-mask.png', 'terrain.webp', 'water-perspective.png', 'clouds.webp']]
for index, image in zip([0, 1, 3, 4], images):
    texture = ui()
    function('glGenTextures', None, integer, C.POINTER(ui))(1, C.byref(texture))
    function('glActiveTexture', None, ui)(0x84C0 + index)
    function('glBindTexture', None, ui, ui)(0x0DE1, texture.value)
    param = function('glTexParameteri', None, ui, ui, integer)
    for key, value in [(0x2801, 0x2601), (0x2800, 0x2601), (0x2802, 0x812F), (0x2803, 0x812F)]:
        param(0x0DE1, key, value)
    data = C.create_string_buffer(image.tobytes())
    function('glTexImage2D', None, ui, integer, integer, integer, integer, integer, ui, ui, ptr)(0x0DE1, 0, 0x1908, image.width, image.height, 0, 0x1908, 0x1401, data)
    function('glUniform1i', None, integer, integer)(location(program, {0:'uMask',1:'uTerrain',3:'uPerspective',4:'uClouds'}[index].encode()), index)
atlas=np.array(Image.open('public/themes/mountains/water-uv.png').convert('RGB'));mh,mw=atlas.shape[:2];mw//=2
geometry=np.zeros((mh,mw,4),dtype=np.float32)
for channel,offset in [(0,0),(1,mw)]:
    q=atlas[:,offset:offset+mw,0].astype(np.uint16)*256+atlas[:,offset:offset+mw,1]
    geometry[:,:,channel]=(q.astype(np.float32)/65535-.5)*256
texture=ui();function('glGenTextures',None,integer,C.POINTER(ui))(1,C.byref(texture));function('glActiveTexture',None,ui)(0x84C0+2);function('glBindTexture',None,ui,ui)(0x0DE1,texture.value)
for key,value in [(0x2801,0x2600),(0x2800,0x2600),(0x2802,0x812F),(0x2803,0x812F)]:param(0x0DE1,key,value)
function('glTexImage2D',None,ui,integer,integer,integer,integer,integer,ui,ui,ptr)(0x0DE1,0,0x8814,mw,mh,0,0x1908,0x1406,geometry.ctypes.data)
function('glUniform1i',None,integer,integer)(location(program,b'uGeometry'),2)
columns,rows=96,128
vertices=np.array([(x/columns,.575+y/rows*.425) for y in range(rows+1) for x in range(columns+1)],dtype=np.float32)
indices=[]
for y in range(rows):
 for x in range(columns):
  i=y*(columns+1)+x;indices.extend([i,i+1,i+columns+1,i+1,i+columns+2,i+columns+1])
indices=np.array(indices,dtype=np.uint16)
vao=ui();function('glGenVertexArrays',None,integer,C.POINTER(ui))(1,C.byref(vao));function('glBindVertexArray',None,ui)(vao.value)
for target,data in [(0x8892,vertices),(0x8893,indices)]:
 buffer=ui();function('glGenBuffers',None,integer,C.POINTER(ui))(1,C.byref(buffer));function('glBindBuffer',None,ui,ui)(target,buffer.value);function('glBufferData',None,ui,C.c_ssize_t,ptr,ui)(target,data.nbytes,data.ctypes.data,0x88E4)
function('glEnableVertexAttribArray',None,ui)(0);function('glVertexAttribPointer',None,ui,integer,ui,C.c_ubyte,integer,ptr)(0,2,0x1406,0,0,None)
uniform('uFrameInterval',1/30);uniform('uHdr',0)
uniform('uResolution', W, H)
uniform('uFrame', W, H, 0, 0)
uniform('uSunPosition', .52, .5)
uniform('uSunAltitude', .08)
uniform('uSunColor', 1, .7, .3)
uniform('uMoonPosition', .7, .3)
uniform('uMoonAltitude', .5)
uniform('uMoonColor', .67, .81, 1)
uniform('uMoonIllumination', 1)
uniform('uMoonIntensity', 0)
uniform('uSunIntensity', .7)
uniform('uDay', .6)
uniform('uWarm', 1)

read = function('glReadPixels', None, integer, integer, integer, integer, ui, ui, ptr)
def render(time=0, quality=2):
    uniform('uTime', time)
    uniform('uQuality', quality)
    function('glClearColor',None,f,f,f,f)(0,0,0,0);function('glClear',None,ui)(0x4000)
    function('glDrawElements', None, ui, integer, ui, ptr)(4, len(indices),0x1403,None)
    buffer = (C.c_ubyte * (W * H * 4))()
    read(0, 0, W, H, 0x1908, 0x1401, buffer)
    assert function('glGetError', ui)() == 0, 'GLES error'
    return Image.frombytes('RGBA', (W, H), bytes(buffer)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)

first, later = render(), render(4)
difference = ImageChops.difference(first, later)
changed = sum(sum(pixel[:3]) > 2 for pixel in difference.getdata())
assert changed > 500, ('wave motion', changed)
assert first.getchannel('A').crop((0, 0, W, int(H * .55))).getextrema() == (0, 0), 'no sky lighting'
mask = images[0].resize((W, H), Image.Resampling.BILINEAR).getchannel('A')
escaped = sum(a == 0 and pixel[3] > 20 for a, pixel in zip(mask.getdata(), first.getdata()))
assert escaped == 0, ('mask containment', escaped)
uniform('uSunPosition', .75, .5)
assert ImageChops.difference(first, render()).convert('RGB').getbbox(), 'solar path moves'
uniform('uSunIntensity', 0)
uniform('uDay', 0)
uniform('uWarm', 0)
uniform('uMoonIntensity', .32)
full = render()
uniform('uMoonIllumination', 0)
new = render()
assert ImageChops.difference(full, new).convert('RGB').getbbox(), 'new moon suppresses glints'
uniform('uMoonIllumination', 1)
uniform('uMoonAltitude', -.01)
below = render()
assert ImageChops.difference(new, below).convert('RGB').getbbox() is None, 'moon below horizon adds no light'
for quality in [0, 1, 2]:
    render(4, quality)
# Actual shared astronomy/lighting state at six solar/lunar conditions.
scenarios = json.loads(subprocess.check_output(['node', '-e', "const load=require('./test/load-ts.cjs'),a=load('lib/landscape-astronomy.ts'),l=load('lib/landscape-lighting.ts');const rows=[['morning','2026-10-23T08:00:00+02:00'],['noon','2026-10-23T12:00:00+02:00'],['sunset','2026-10-23T17:10:00+02:00'],['twilight','2026-10-23T18:00:00+02:00'],['moonlit','2026-10-26T23:00:00+01:00']];let dark;for(let h=0;h<720;h++){const s=a.astronomyAt(Date.parse('2026-10-01T00:00:00Z')+h*3600000,a.DEFAULT_LANDSCAPE_LOCATION);if(s.sun.altitude<-.3&&s.moon.altitude<0){dark=s;break;}}const states=rows.map(([name,iso])=>({name,light:l.landscapeLighting(a.astronomyAt(Date.parse(iso),a.DEFAULT_LANDSCAPE_LOCATION),0)}));states.push({name:'moonless',light:l.landscapeLighting(dark,0)});console.log(JSON.stringify(states));"], text=True))
for scenario in scenarios:
    light = scenario['light']
    uniform('uDay', light['sky']['day'])
    uniform('uWarm', light['sky']['twilight'])
    for name, body in [('Sun', light['sun']), ('Moon', light['moon'])]:
        uniform('u' + name + 'Position', body['x'], body['y'])
        uniform('u' + name + 'Altitude', body['altitude'])
        uniform('u' + name + 'Intensity', body['intensity'])
        uniform('u' + name + 'Color', *body['color'])
    uniform('uMoonIllumination', light['moon']['illumination'])
    result = render()
    assert result.getchannel('A').getextrema()[1] > 128, scenario['name']
    if scenario['name'] == 'moonless':
        assert light['sun']['intensity'] == light['moon']['intensity'] == 0
    if scenario['name'] == 'moonlit':
        assert light['moon']['intensity'] > 0
        bright = sum(pixel[3] > 180 and pixel[2] > 100 for pixel in result.getdata())
        assert bright>100, ('actual GGX lunar reflection',bright)
print('PASS: six shared-lighting scenarios:', ', '.join(row['name'] for row in scenarios))
print('PASS: real GLES3 shader compile/link; moving water:', changed, 'pixels; exact water mask; solar motion; new/below-horizon moon; all quality branches. Software Mesa, not Android.')
