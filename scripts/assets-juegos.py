#!/usr/bin/env python3
# Sprites y texturas de los temas de la escena (no se suben al repo, que es público). Genera en web/src/escena/juegos/
# (ignorado por git):
# - doom.json: del doom1.wad shareware, los cuadros que usa kits/doom.ts (reducidos al 55 % y cuantizados a la paleta de
#   DOOM, origen en los pies), pisos y muros. Uso personal.
# - cozy.json: "Cozy Space Station" de Bramble & Byte (CC-BY 4.0, ver CREDITS.md): muebles y tripulación para Claro/Oscuro.
# Sin esos archivos, cada tema usa su arte dibujado en código. Requiere Pillow. Uso: python3 scripts/assets-juegos.py
import base64, io, json, struct, sys, urllib.parse, urllib.request, zipfile
from pathlib import Path
from PIL import Image, ImageDraw

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

# ── Fichas (opción B): retratos redondos de 160 px en WebP ─────────────────────────────────────────────────────────
# Halo: avatares oficiales de MCC (Halopedia). Edgerunners: retratos de la Fandom wiki y arte de Yoshiyuki Kaneko.
# DOOM: la cara del HUD y la cabeza de cada sprite. Claro/Oscuro: "Cozy Space Portraits" (CC-BY 4.0) con sus gestos.
LADO = 160
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36'}

def bajar(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def archivo_wiki(api, nombre):
    cache = DIR / 'retratos' / nombre.replace(' ', '_')
    if not cache.exists():
        q = urllib.parse.urlencode({'action': 'query', 'titles': f'File:{nombre}', 'prop': 'imageinfo', 'iiprop': 'url', 'format': 'json'})
        pag = next(iter(json.loads(bajar(f'{api}?{q}'))['query']['pages'].values()))
        cache.parent.mkdir(exist_ok=True)
        cache.write_bytes(bajar(pag['imageinfo'][0]['url']))
    return Image.open(cache).convert('RGBA')

def redondo(im, cx=.5, cy=.5, lado=1.0, fondo=(28, 30, 38, 255), nitido=False):
    w, h = im.size; L = lado * w
    c = im.crop((int(cx * w - L / 2), int(cy * h - L / 2), int(cx * w + L / 2), int(cy * h + L / 2)))
    c = c.resize((LADO, LADO), Image.NEAREST if nitido else Image.LANCZOS)
    base = Image.new('RGBA', (LADO, LADO), fondo); base.alpha_composite(c)
    m = Image.new('L', (LADO * 4, LADO * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, LADO * 4 - 1, LADO * 4 - 1), fill=255)
    base.putalpha(m.resize((LADO, LADO), Image.LANCZOS))
    b = io.BytesIO(); base.save(b, 'WEBP', quality=88)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()

HALOPEDIA, CPWIKI = 'https://www.halopedia.org/api.php', 'https://cyberpunk.fandom.com/api.php'
HALO = {  # clave: (archivo, cx, cy, lado)
    'chief': ('HTMCC_Avatar_MasterChief_1.png', .5, .24, .42), 'cortana': ('HTMCC_Avatar_Cortana_1.png', .5, .22, .40),
    'spark': ('HTMCC_Avatar_343GuiltySpark_1.png', .5, .5, .95), 'johnson': ('HTMCC_Avatar_Johnson_1.png', .47, .24, .40),
    'halsey': ('HTMCC_Avatar_Halsey.png', .5, .22, .40), 'keyes': ('HTMCC_Avatar_JacobKeyes_1.png', .5, .22, .40),
    'arbiter': ('H3-ArbiterThelVadam-ScanRender.png', .77, .14, .38),
    'f0': ('HTMCC_Avatar_OldSchoolSpartan.png', .5, .24, .45), 'f1': ('HTMCC_Avatar_Spartan_Strike.png', .5, .22, .42),
    'f2': ('HTMCC_Avatar_ODST.png', .55, .22, .36), 'f3': ('HTMCC_Avatar_Marine_1.png', .5, .22, .42), 'f4': ('HTMCC_Avatar_Marine_2.png', .48, .24, .42),
    'f5': ('HTMCC_Avatar_Buck.png', .5, .24, .45), 'f6': ('HTMCC_Avatar_Romeo.png', .5, .24, .45), 'f7': ('HTMCC_Avatar_Rookie.png', .48, .22, .42),
}
EDGE = {
    'david': ('Edge David by Yoshiyuki Kaneko.png', .5, .33, .55), 'lucy': ('Lucy Infobox CPEDGE.png', .5, .32, .8),
    'kiwi': ('Kiwi Infobox CPEDGE.jpg', .5, .3, .85), 'maine': ('Maine Infobox CPEDGE.png', .5, .3, .85),
    'rebecca': ('Rebecca Infobox CPEDGE.png', .5, .3, .85), 'falco': ('Falco Infobox CPEDGE.jpg', .5, .32, .85),
    'pilar': ('Pilar Infobox CPEDGE.png', .52, .3, .8),
    'f0': ('Dorio Infobox CPEDGE.png', .5, .4, .85), 'f1': ('Gloria Infobox CPEDGE.png', .5, .4, .6), 'f2': ('Faraday Infobox CPEDGE.png', .5, .28, .85),
    'f3': ('Jimmy Kurosaki Infobox CPEDGE.png', .5, .3, .85), 'f4': ('Tanaka Infobox CPEDGE.png', .5, .3, .85), 'f5': ('Katsuo Infobox CPEDGE.png', .5, .3, .85),
    'f6': ('Sasha Infobox CPEDGE.png', .5, .3, .85), 'f7': ('Doc Infobox CPEDGE.png', .5, .3, .85),
}
retratos = {}
for k, (f, cx, cy, l) in HALO.items():
    try: retratos[f'halo-{k}'] = redondo(archivo_wiki(HALOPEDIA, f), cx, cy, l)
    except Exception as e: print('sin', f, e)
for k, (f, cx, cy, l) in EDGE.items():
    try: retratos[f'edge-{k}'] = redondo(archivo_wiki(CPWIKI, f), cx, cy, l, fondo=(252, 238, 10, 255))
    except Exception as e: print('sin', f, e)
# DOOM: (lump, traducción, cx, cy, lado) sobre el parche original; nítido (pixel art).
ROJO_DOOM = (58, 12, 8, 255)
DOOM = {'doomguy': ('STFST01', None, .5, .5, 1.05), 'baron': ('BOSSA1', None, .5, .17, .55), 'pinky': ('SARGA1', None, .5, .4, .8),
        'imp': ('TROOA1', None, .5, .2, .62), 'espectro': ('SARGA1', None, .5, .4, .8), 'sargento': ('SPOSA1', None, .5, .2, .7),
        'rojo': ('PLAYA1', 0x20, .45, .2, .62), 'f0': ('POSSA1', None, .5, .2, .62), 'f1': ('PLAYA1', 0x60, .45, .2, .62), 'f2': ('PLAYA1', 0x40, .45, .2, .62)}
for k, (lump, trad, cx, cy, l) in DOOM.items():
    im, _, _ = parche(lump, trad)
    if k == 'espectro': im.putalpha(im.getchannel('A').point(lambda v: v * 45 // 100))
    retratos[f'doom-{k}'] = redondo(im, cx, cy, l, fondo=ROJO_DOOM, nitido=True)
# Cozy Space Portraits: cada personaje con sus gestos.
por = zip_oga('cozy-space-portraits-cc-by.zip')
for ruta in por.namelist():
    if '/portraits/4x/' in ruta and ruta.endswith('.png') and 'talk' not in ruta and 'angry' not in ruta:
        im = Image.open(io.BytesIO(por.read(ruta))).convert('RGBA')
        retratos['cozy-' + ruta.rsplit('/', 1)[1][:-4]] = redondo(im, .5, .5, 1.0, fondo=(222, 230, 236, 255))
fichas = DIR / 'fichas.json'
fichas.write_text(json.dumps({'retratos': retratos}, separators=(',', ':')))
print(f'{fichas.relative_to(RAIZ)}: {len(retratos)} retratos, {fichas.stat().st_size // 1024} kB')
