"""Builds the brand fonts the notes "Download PDF" embeds (public/fonts/pdf).

The app's own fonts come from next/font as variable WOFF2 latin subsets, which
a PDF can't use. The PDF needs static instances it can subset and embed:

- Fraunces Bold and Bold Italic (SOFT 100, WONK 0, as in globals.css) for
  H1 and H2.
- M PLUS Rounded 1c Regular and Bold for everything else, split so the kanji
  (about 1.3 MB a weight) only download when a note has some. The family has
  no italic, so the italics are its upright glyphs slanted 12°, as browsers
  draw it.
- Geist Mono Regular for code.

Sources are the OFL fonts in github.com/google/fonts (ofl/fraunces,
ofl/mplusrounded1c, ofl/geistmono). Run with fonttools installed:

    python scripts/build-pdf-fonts.py <folder with those .ttf files>
"""
import math
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / 'public' / 'fonts' / 'pdf'

# CJK ideographs live in the kanji files; everything else in the core files.
KANJI = {*range(0x3400, 0x4DC0), *range(0x4E00, 0xA000), *range(0xF900, 0xFB00)}


def subset_to(font, unicodes):
    """Keeps only these characters (with their layout features) and drops hinting."""
    options = subset.Options(hinting=False, layout_features=['*'], name_IDs=['*'], notdef_outline=True)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    return font


def save(font, name):
    # WOFF, not WOFF2: fontkit can't subset WOFF2's transformed glyf table.
    font.flavor = 'woff'
    font.save(OUT / name)
    print(name, (OUT / name).stat().st_size)


def rename(font, family, style, postscript):
    names = font['name']
    for record in list(names.names):
        if record.nameID in (16, 17, 21, 22, 25):
            names.removeNames(nameID=record.nameID)
    names.setName(family, 1, 3, 1, 0x409)
    names.setName(style, 2, 3, 1, 0x409)
    names.setName(f'{family} {style}', 4, 3, 1, 0x409)
    names.setName(postscript, 6, 3, 1, 0x409)
    names.setName(postscript, 3, 3, 1, 0x409)


def slant(font, degrees=12):
    """Slants every glyph like a browser's synthetic italic."""
    skew = math.tan(math.radians(degrees))
    glyph_set = font.getGlyphSet()
    glyf = font['glyf']
    for name in font.getGlyphOrder():
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(TransformPen(pen, (1, 0, skew, 1, 0, 0)))
        glyf[name] = pen.glyph()
        glyf[name].recalcBounds(glyf)
    font['post'].italicAngle = -degrees
    font['head'].macStyle |= 0b10
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection | 0b1) & ~0b1000000


def fraunces(source, style, postscript, out):
    font = instantiateVariableFont(TTFont(SRC / source), {'wght': 700, 'SOFT': 100, 'WONK': 0, 'opsz': 24})
    rename(font, 'Fraunces', style, postscript)
    save(subset_to(font, font.getBestCmap().keys()), out)


def mplus(weight, out):
    def load():
        return TTFont(SRC / f'MPLUSRounded1c-{weight}.ttf')

    cmap = load().getBestCmap().keys()
    core = [c for c in cmap if c not in KANJI]
    save(subset_to(load(), core), f'{out}.woff')

    kanji = subset_to(load(), [c for c in cmap if c in KANJI])
    rename(kanji, 'M PLUS Rounded 1c Kanji', weight, f'RoundedMplus1c-{weight}Kanji')
    save(kanji, f'{out}-Kanji.woff')

    italic = subset_to(load(), core)
    slant(italic)
    style = 'Italic' if weight == 'Regular' else 'Bold Italic'
    rename(italic, 'M PLUS Rounded 1c', style, f'MPLUSRounded1c-{style.replace(" ", "")}')
    save(subset_to(italic, core), f'{out}Italic.woff')  # again, to compact the redrawn glyphs


OUT.mkdir(parents=True, exist_ok=True)
fraunces('Fraunces[SOFT,WONK,opsz,wght].ttf', 'Bold', 'Fraunces-Bold', 'Fraunces-Bold.woff')
fraunces('Fraunces-Italic[SOFT,WONK,opsz,wght].ttf', 'Bold Italic', 'Fraunces-BoldItalic', 'Fraunces-BoldItalic.woff')
mplus('Regular', 'MPLUSRounded1c-Regular')
mplus('Bold', 'MPLUSRounded1c-Bold')
mono = instantiateVariableFont(TTFont(SRC / 'GeistMono[wght].ttf'), {'wght': 400})
rename(mono, 'Geist Mono', 'Regular', 'GeistMono-Regular')
save(subset_to(mono, mono.getBestCmap().keys()), 'GeistMono-Regular.woff')
