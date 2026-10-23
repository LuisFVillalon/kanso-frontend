import type { JSONContent } from '@tiptap/core';
import { Font } from '@react-pdf/renderer';
import type { Tag } from '@/app/types/task';
import {
  type PdfGlyph, type PdfImage,
  needsKanji, notePdfFontFaces, registerNotePdfFonts, renderNotePdf, retryFailedNotePdfFonts,
} from './notePdfDocument';

/**
 * The browser half of the notes "Download PDF": loads the fonts and images,
 * draws what the fonts can't (emoji, other scripts) as pictures, and lays out
 * the PDF. Loaded on demand with @react-pdf/renderer, so neither weighs on
 * the editor until someone exports.
 */

/** Where public/fonts/pdf is served. */
const FONT_BASE = '/fonts/pdf';

/** Re-encoded images are capped here: about 2× the printed width. */
const MAX_IMAGE_SIDE = 2048;

const imageSources = (node: JSONContent, out = new Set<string>()) => {
  if (node.type === 'image' && typeof node.attrs?.src === 'string') out.add(node.attrs.src);
  node.content?.forEach(child => imageSources(child, out));
  return out;
};

/**
 * Loads an image and returns a copy react-pdf can embed. PNG and JPEG data
 * URLs go in as they are; anything else (WebP, GIF, SVG, a remote URL) is
 * redrawn as PNG. Null when it can't be loaded or read.
 */
const loadImage = (src: string): Promise<PdfImage | null> =>
  new Promise(resolve => {
    const img = new window.Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      if (!width || !height) return resolve(null);
      if (/^data:image\/(png|jpe?g);base64,/i.test(src)) return resolve({ src, width, height });
      try {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ src: canvas.toDataURL('image/png'), width, height });
      } catch {
        resolve(null); // a cross-origin image the host won't share
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const loadImages = async (doc: JSONContent) => {
  const images = new Map<string, PdfImage | null>();
  await Promise.all(Array.from(imageSources(doc), async src => images.set(src, await loadImage(src))));
  return images;
};

/** Pixels per point the drawn glyphs are rendered at. */
const GLYPH_SCALE = 4;
const GLYPH_FONTS =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

const glyphCache = new Map<string, PdfGlyph | null>();

/**
 * Draws one character with the browser's own fonts, sitting on the
 * baseline like text. Used for emoji and scripts kanso's fonts don't cover.
 */
const drawGlyph = (grapheme: string, fontSize: number, color: string): PdfGlyph | null => {
  const key = `${grapheme}|${fontSize}|${color}`;
  if (glyphCache.has(key)) return glyphCache.get(key)!;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  let glyph: PdfGlyph | null = null;
  if (context) {
    const px = fontSize * GLYPH_SCALE;
    const font = `${px}px ${GLYPH_FONTS}`;
    context.font = font;
    const metrics = context.measureText(grapheme);
    const ascent = Math.ceil(Math.max(metrics.actualBoundingBoxAscent, px * 0.5));
    const descent = Math.ceil(Math.max(metrics.actualBoundingBoxDescent, 0));
    const width = Math.ceil(metrics.width);
    if (width > 0) {
      canvas.width = width;
      canvas.height = ascent + descent;
      context.font = font;
      context.fillStyle = color;
      context.textBaseline = 'alphabetic';
      context.fillText(grapheme, 0, ascent);
      glyph = { src: canvas.toDataURL('image/png'), width: width / GLYPH_SCALE, height: canvas.height / GLYPH_SCALE };
    }
  }
  glyphCache.set(key, glyph);
  return glyph;
};

interface ExportNotePdfOptions {
  title: string;
  doc: JSONContent;
  tags?: Tag[];
  dateLabel?: string;
}

/** Builds the note's PDF. */
export const exportNotePdf = async ({ title, doc, tags, dateLabel }: ExportNotePdfOptions): Promise<Blob> => {
  registerNotePdfFonts(new URL(FONT_BASE, window.location.origin).href);
  const kanji = needsKanji(doc, title, tags);
  const faces = notePdfFontFaces(kanji);
  try {
    const [images] = await Promise.all([loadImages(doc), ...faces.map(face => Font.load(face))]);
    const fonts = faces.map(face => Font.getFont(face)?.data).filter(Boolean);
    const hasGlyph = (codePoint: number) =>
      fonts.some(font => font && 'hasGlyphForCodePoint' in font && font.hasGlyphForCodePoint(codePoint));

    return await renderNotePdf({ title, doc, tags, dateLabel, images, kanji, hasGlyph, drawGlyph });
  } catch (err) {
    retryFailedNotePdfFonts();
    throw err;
  }
};

/** Saves a file through a temporary link, with no print dialog. */
export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
