#!/usr/bin/env python3
# Sprites y texturas de los temas de la escena (no se suben al repo, que es público). Genera en web/src/escena/juegos/
# (ignorado por git):
# - doom.json: del doom1.wad shareware, los cuadros que usa kits/doom.ts (reducidos al 55 % y cuantizados a la paleta de
#   DOOM, origen en los pies), pisos y muros. Uso personal.
# - cozy.json: "Cozy Space Station" de Bramble & Byte (CC-BY 4.0, ver CREDITS.md): muebles y tripulación para Claro/Oscuro.
# Sin esos archivos, cada tema usa su arte dibujado en código. Requiere Pillow. Uso: python3 scripts/assets-juegos.py
import base64, io, json, struct, sys, urllib.request, zipfile
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DIR = RAIZ / 'web/src/escena/juegos'
WAD_URL = 'https://github.com/Akbar30Bill/DOOM_wads/raw/master/doom1.wad'
ESCALA = 0.55
ESCALA_DE = {'BOSS': 0.45}  # el Barón mide 73 px: a 0,55 no cabe en la celda

# Cuadros por monstruo: caminar (A-D), atacar (E-F), dolor (G), espalda (A5, C5) y el último de la muerte (yace).
MONSTRUOS = {'PLAY': 'N0', 'POSS': 'L0', 'SPOS': 'L0', 'TROO': 'M0', 'SARG': 'N0', 'BOSS': 'O0'}
DECORADO = ['BAR1A0', 'BAR1B0', 'COLUA0', 'ELECA0', 'TREDA0', 'TREDB0', 'TREDC0', 'TREDD0', 'CANDA0', 'CBRAA0', 'POL5A0', 'MEDIA0', 'STIMA0', 'SOULA0', 'SOULB0', 'SOULC0', 'SOULD0', 'BON1A0', 'ARM1A0', 'ARM1B0']
PISOS = ['FLOOR4_8', 'FLOOR5_1', 'FLOOR5_2', 'FLOOR7_2', 'FLAT14', 'FLAT5_4', 'FLAT20', 'CEIL5_1', 'TLITE6_4', 'CONS1_1', 'NUKAGE1', 'NUKAGE2', 'NUKAGE3', 'DEM1_5', 'FLOOR0_1', 'STEP1', 'FLAT1']
MUROS = ['STARTAN3', 'STARG3', 'COMPUTE2', 'COMPSTA1', 'TEKWALL1', 'BROWN1', 'DOOR3', 'SUPPORT2', 'LITE3', 'SW1STARG', 'EXITSIGN', 'GRAY1', 'BROWNHUG']
# Colores de multijugador: el verde (0x70-0x7f) pasa a otra rampa, como hace el juego.
TRADUCCION = {'gris': 0x60, 'cafe': 0x40, 'rojo': 0x20}

def leer_wad():
    DIR.mkdir(parents=True, exist_ok=True)
    wad = DIR / 'doom1.wad'
    if not wad.exists():
        print('bajando', WAD_URL)
        urllib.request.urlretrieve(WAD_URL, wad)
    d = wad.read_bytes()
    if d[:4] != b'IWAD': sys.exit('doom1.wad inválido')
    return d

d = leer_wad()
n, off = struct.unpack('<ii', d[4:12])
LUMPS = [(d[off + 16 * i + 8:off + 16 * i + 16].rstrip(b'\0').decode('ascii').upper(), *struct.unpack('<ii', d[off + 16 * i:off + 16 * i + 8])) for i in range(n)]
LUMP = {}
for nombre, pos, tam in LUMPS: LUMP.setdefault(nombre, (pos, tam))
p0 = LUMP['PLAYPAL'][0]
PAL = [tuple(d[p0 + i * 3:p0 + i * 3 + 3]) for i in range(256)]
PAL_IMG = Image.new('P', (1, 1)); PAL_IMG.putpalette(list(d[p0:p0 + 768]))

def parche(nombre, trad=None):
    p = LUMP[nombre][0]
    w, h, lo, to = struct.unpack('<hhhh', d[p:p + 8])
    im = Image.new('RGBA', (w, h))
    px = im.load()
    for x in range(w):
        c = p + struct.unpack('<i', d[p + 8 + 4 * x:p + 12 + 4 * x])[0]
        while d[c] != 255:
            y0, ln = d[c], d[c + 1]
            for k in range(ln):
                i = d[c + 3 + k]
                if trad is not None and 0x70 <= i <= 0x7f: i = trad + (i - 0x70)
                px[x, y0 + k] = PAL[i] + (255,)
            c += ln + 4
    return im, lo, to

def reducir(im, s):
    t = (max(1, round(im.width * s)), max(1, round(im.height * s)))
    r = im.resize(t, Image.LANCZOS)
    a = r.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    q = r.convert('RGB').quantize(palette=PAL_IMG, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(a)
    return q

def sprite(nombre, trad=None):
    im, lo, to = parche(nombre, trad)
    e = ESCALA_DE.get(nombre[:4], ESCALA)
    q = reducir(im, e)
    colores, filas, px = [], [], q.load()
    for y in range(q.height):
        fila = ''
        for x in range(q.width):
            r, g, b, a = px[x, y]
            if not a: fila += '..'; continue
            k = '#%02x%02x%02x' % (r, g, b)
            if k not in colores: colores.append(k)
            fila += '%02x' % colores.index(k)
        filas.append(fila)
    return {'w': q.width, 'h': q.height, 'ox': round(lo * e), 'oy': round(to * e), 'p': colores, 'f': filas}

def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

def plano(nombre):
    p = LUMP[nombre][0]
    im = Image.new('RGB', (64, 64)); im.putdata([PAL[b] for b in d[p:p + 4096]])
    return png(im.resize((32, 32), Image.LANCZOS).quantize(palette=PAL_IMG, dither=Image.Dither.NONE).convert('RGB'))

def textura(nombre):
    pn = LUMP['PNAMES'][0]
    nombres = [d[pn + 4 + 8 * i:pn + 12 + 8 * i].rstrip(b'\0').decode().upper() for i in range(struct.unpack('<i', d[pn:pn + 4])[0])]
    t = LUMP['TEXTURE1'][0]
    for i in range(struct.unpack('<i', d[t:t + 4])[0]):
        o = t + struct.unpack('<i', d[t + 4 + 4 * i:t + 8 + 4 * i])[0]
        if d[o:o + 8].rstrip(b'\0').decode().upper() != nombre: continue
        w, h, np_ = struct.unpack('<hh', d[o + 12:o + 16]) + struct.unpack('<h', d[o + 20:o + 22])
        im = Image.new('RGBA', (w, h), (0, 0, 0, 255))
        for k in range(np_):
            x, y, ip = struct.unpack('<hhh', d[o + 22 + 10 * k:o + 28 + 10 * k])
            pa, _, _ = parche(nombres[ip])
            im.paste(pa, (x, y), pa)
        s = im.resize((round(w * ESCALA), round(h * ESCALA)), Image.LANCZOS).convert('RGB')
        return {'src': png(s.quantize(palette=PAL_IMG, dither=Image.Dither.NONE).convert('RGB')), 'w': s.width, 'h': s.height}
    return None

def existe(nombre): return nombre in LUMP

sprites = {}
for m, muerte in MONSTRUOS.items():
    cuadros = [f'{m}{c}1' for c in 'ABCDEFG'] + [f'{m}A5', f'{m}C5', f'{m}{muerte}']
    for c in cuadros:
        if existe(c): sprites[c] = sprite(c)
    if m == 'PLAY':
        for color, base in TRADUCCION.items():
            for c in cuadros:
                if existe(c): sprites[f'{c}_{color}'] = sprite(c, base)
for c in DECORADO:
    if existe(c): sprites[c] = sprite(c)

datos = {'escala': ESCALA, 'sprites': sprites,
         'pisos': {k: plano(k) for k in PISOS if existe(k)},
         'muros': {k: v for k in MUROS if (v := textura(k))}}
salida = DIR / 'doom.json'
salida.write_text(json.dumps(datos, separators=(',', ':')))
print(f'{salida.relative_to(RAIZ)}: {len(sprites)} sprites, {len(datos["pisos"])} pisos, {len(datos["muros"])} muros, {salida.stat().st_size // 1024} kB')

# ── Cozy Space Station (CC-BY 4.0): PNG a 2x, que la escena dibuja a su tamaño 1x (nítido al escalar) ──
OGA = 'https://opengameart.org/sites/default/files/'
def zip_oga(nombre):
    z = DIR / nombre
    if not z.exists():
        print('bajando', OGA + nombre)
        req = urllib.request.Request(OGA + nombre, headers={'User-Agent': 'Mozilla/5.0'})
        z.write_bytes(urllib.request.urlopen(req).read())
    return zipfile.ZipFile(z)

def png_zip(zf, ruta):
    im = Image.open(io.BytesIO(zf.read(ruta))).convert('RGBA')
    return png(im), im.width, im.height

est = zip_oga('cozy-space-station-cc-by.zip')
muebles = {}
for ruta in est.namelist():
    if '/png/2x/' in ruta and ruta.endswith('.png') and '/crew-' not in ruta:
        src, w, h = png_zip(est, ruta)
        muebles[ruta.rsplit('/', 1)[1][:-4]] = {'src': src, 'w': w // 2, 'h': h // 2}
tri = zip_oga('walking-crew-cc-by.zip')
tripulacion = {}
for ruta in tri.namelist():
    if '/sheets/2x/' in ruta and ruta.endswith('.png'):
        src, w, h = png_zip(tri, ruta)
        # 4 columnas × 5 filas (abajo, arriba, quieto, izquierda, derecha); pies en (50 %, 60 %) de cada cuadro.
        tripulacion[ruta.rsplit('/', 1)[1][:-4]] = {'src': src, 'fw': w // 8, 'fh': h // 10}
cozy = DIR / 'cozy.json'
cozy.write_text(json.dumps({'muebles': muebles, 'tripulacion': tripulacion}, separators=(',', ':')))
print(f'{cozy.relative_to(RAIZ)}: {len(muebles)} muebles, {len(tripulacion)} tripulantes, {cozy.stat().st_size // 1024} kB')
