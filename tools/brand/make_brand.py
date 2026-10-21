#!/usr/bin/env python3
"""FUTAlife brand generator. Writes the SVG logos into public/brand/ (PNG icons are rasterised by render_brand.js).
Run:  python3 tools/brand/make_brand.py && node tools/brand/render_brand.js
Colours are at the top. The wordmark letters are converted to outlines (fontTools) so the SVG looks the same on every device.
Needs: pip install fonttools   (+ DejaVu Serif fonts, or change FONT_*)."""
import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'brand'); os.makedirs(OUT, exist_ok=True)
EM1, EM2, EM3 = '#25704f', '#12392a', '#091d14'     # emerald (light -> dark)
G1, G2, G3 = '#fbeaa8', '#d9ac35', '#8f6a12'        # gold (light -> mid -> deep)
CREAM = '#fbf8f1'
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'; FONT_BI = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf'

def defs(uid=''):
    return f'''<defs>
<linearGradient id="bg{uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{EM1}"/><stop offset=".55" stop-color="{EM2}"/><stop offset="1" stop-color="{EM3}"/></linearGradient>
<radialGradient id="gl{uid}" cx=".3" cy=".18" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="gd{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{G1}"/><stop offset=".5" stop-color="{G2}"/><stop offset="1" stop-color="{G3}"/></linearGradient>
</defs>'''

def laurel(R=152, n=7):
    """two gold laurel branches: a thin stem hugging the ring, a pair of leaves at every station, meeting at the bottom"""
    out = []
    for side in (1, -1):
        t0, t1 = 12, 112
        pts = [(256 + side * R * math.sin(math.radians(t)), 256 + R * math.cos(math.radians(t))) for t in (t0 + (t1 - t0) * i / 24 for i in range(25))]
        out.append('<path d="M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + '" fill="none" stroke="url(#gd{u})" stroke-width="3.2" stroke-linecap="round"/>')
        for i in range(n):
            t = 20 + i * (86 / (n - 1)); a = math.radians(t); k = 1 - i * 0.055
            tang = (-t if side == 1 else t)                     # long axis along the ring, pointing up the side
            for off, tilt in ((-1, -38), (1, 38)):             # one leaf inside the stem, one outside
                r = R + off * 12 * k; x = 256 + side * r * math.sin(a); y = 256 + r * math.cos(a)
                rot = tang + tilt * off * (1 if side == 1 else -1) * -1
                out.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{22*k:.1f}" ry="{8*k:.1f}" transform="rotate({rot:.1f} {x:.1f} {y:.1f})"/>')
    return '<g fill="url(#gd{u})">' + ''.join(out) + '</g>'

def monogram(dx=0, dy=0, s=1.0):
    """classic slab-serif F from rectangles. One userSpaceOnUse gradient so the gold flows across the whole letter."""
    R = [(212, 168, 34, 162), (212, 168, 114, 30), (306, 168, 20, 54), (246, 238, 50, 26), (282, 228, 16, 46), (188, 312, 82, 18), (194, 168, 18, 10)]
    shape = ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5"/>' for x, y, w, h in R)
    return (f'<g transform="translate({256+dx} {256+dy}) scale({s}) translate(-257 -249)"><linearGradient id="gf{{u}}" gradientUnits="userSpaceOnUse" x1="0" y1="168" x2="0" y2="330"><stop offset="0" stop-color="{G1}"/><stop offset=".45" stop-color="{G2}"/><stop offset="1" stop-color="{G3}"/></linearGradient>'
            f'<g fill="#000" opacity=".4" transform="translate(3 5)">{shape}</g><g fill="url(#gf{{u}})">{shape}</g></g>')

def icon(full_bleed=False, simple=False, safe=1.0, uid=''):
    rx = 0 if full_bleed else 112
    body = []
    if simple:   # favicon: no laurel, bigger F, thicker ring (readable at 16 px)
        body.append('<circle cx="256" cy="256" r="212" fill="none" stroke="url(#gd{u})" stroke-width="16"/>')
        body.append(monogram(0, 0, 1.38))
    else:
        body.append('<circle cx="256" cy="256" r="202" fill="none" stroke="url(#gd{u})" stroke-width="7"/><circle cx="256" cy="256" r="188" fill="none" stroke="url(#gd{u})" stroke-width="2" opacity=".55"/>')
        body.append(laurel(152, 7)); body.append(monogram(0, -22, 1.0))
        body.append('<circle cx="256" cy="418" r="6" fill="url(#gd{u})"/>')
    inner = ''.join(body)
    g = f'<g transform="translate(256 256) scale({safe}) translate(-256 -256)">{inner}</g>' if safe != 1 else inner
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="FUTAlife">{defs(uid)}<rect width="512" height="512" rx="{rx}" fill="url(#bg{uid})"/><rect width="512" height="512" rx="{rx}" fill="url(#gl{uid})"/>{g}</svg>'
    return svg.replace('{u}', uid)

def text_path(font, text, size, tracking=0):
    f = TTFont(font); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; sc = size / upm; x = 0; d = []
    for ch in text:
        g = gs[cmap[ord(ch)]]; pen = SVGPathPen(gs); tp = TransformPen(pen, (sc, 0, 0, -sc, x, 0)); g.draw(tp); d.append(pen.getCommands()); x += g.width * sc + tracking
    return ' '.join(d), x - tracking

def wordmark(dark_bg=True):
    a, wa = text_path(FONT_B, 'FUTA', 96, 7); b, wb = text_path(FONT_BI, 'life', 96, 1)
    fut = CREAM if dark_bg else EM2; x0 = 184; W = x0 + wa + 10 + wb + 24
    ic = icon(False, False, 1.0, 'i').replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="FUTAlife">', '<svg x="12" y="14" width="172" height="172" viewBox="0 0 512 512">')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} 200" role="img" aria-label="FUTAlife">{defs("w")}{ic}'
            f'<path d="{a}" transform="translate({x0} 124)" fill="{fut}"/><path d="{b}" transform="translate({x0+wa+10:.1f} 124)" fill="url(#gdw)"/>'
            f'<rect x="{x0}" y="146" width="{wa+10+wb:.1f}" height="3" rx="1.5" fill="url(#gdw)" opacity=".85"/></svg>')

def write(name, s):
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(s); print('wrote', name, len(s), 'bytes')

write('logo.svg', icon(False, False, 1.0, 'a'))
write('favicon.svg', icon(False, True, 1.0, 'f'))
write('icon-fullbleed.svg', icon(True, False, 1.0, 'b'))          # square, no rounded corners (iOS rounds it itself)
write('icon-maskable.svg', icon(True, False, 0.78, 'm'))          # content inside the 80 % safe zone (Android adaptive icons)
write('icon-fullbleed-simple.svg', icon(True, True, 1.0, 's'))   # small sizes
write('wordmark-on-dark.svg', wordmark(True))
write('wordmark-on-light.svg', wordmark(False))
