import React from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Styles } from '@react-pdf/renderer';
// react-pdf's Image, renamed so the alt-text lint rule for <img> doesn't take it for one.
import { Document, Font, Image as Picture, Link, Page, Polyline, Svg, Text, View, pdf } from '@react-pdf/renderer';
import type { Tag } from '@/app/types/task';

/**
 * The printable document behind a note's "Download PDF": the editor's JSON
 * drawn with @react-pdf/renderer, so the file holds real, selectable text set
 * in kanso's own fonts (embedded and subset) rather than page screenshots.
 * The browser-only steps (images, emoji, the download) are in notePdfExport.ts.
 */

type Style = Styles[string];

// ─── Page geometry (PDF points) ──────────────────────────────────────────────

/** ≈14 mm on every side of an A4 page. */
const PAGE_MARGIN = 40;
export const PDF_CONTENT_WIDTH = 595.28 - 2 * PAGE_MARGIN;
/** The content box's height, less a little room for an image's margins. */
export const PDF_CONTENT_HEIGHT = 841.89 - 2 * PAGE_MARGIN - 24;
/** One CSS pixel in points, for image widths set in the editor. */
const PX = 0.75;

/** Body text size; the editor's rem-based sizes and spacing scale from it. */
const BODY = 10.5;

// kanso's light theme, so a note exported in dark mode still prints as ink on paper.
const INK = {
  primary: '#191817',
  secondary: '#4A4640',
  muted: '#6B655C',
  pencil: '#8A847A',
  accent: '#006BCB',
  border: '#E3DCCD',
  borderStrong: '#CFC6B4',
  chip: '#F5F1E8',
};
const DEFAULT_HIGHLIGHT = '#fef08a';

// ─── Fonts ───────────────────────────────────────────────────────────────────

const SANS = 'M PLUS Rounded 1c';
const KANJI = 'M PLUS Rounded 1c Kanji';
const DISPLAY = 'Fraunces';
const MONO = 'Geist Mono';

/**
 * Static builds of the brand fonts in public/fonts/pdf (made by
 * scripts/build-pdf-fonts.py). Every family lists an italic, since
 * react-pdf can't resolve a style a family lacks.
 */
const FONT_FILES: Record<string, { file: string; fontWeight: number; fontStyle: 'normal' | 'italic' }[]> = {
  [SANS]: [
    { file: 'MPLUSRounded1c-Regular.woff', fontWeight: 400, fontStyle: 'normal' },
    { file: 'MPLUSRounded1c-Bold.woff', fontWeight: 700, fontStyle: 'normal' },
    { file: 'MPLUSRounded1c-RegularItalic.woff', fontWeight: 400, fontStyle: 'italic' },
    { file: 'MPLUSRounded1c-BoldItalic.woff', fontWeight: 700, fontStyle: 'italic' },
  ],
  // About 1.3 MB a weight, so it only loads for notes with kanji.
  [KANJI]: [
    { file: 'MPLUSRounded1c-Regular-Kanji.woff', fontWeight: 400, fontStyle: 'normal' },
    { file: 'MPLUSRounded1c-Bold-Kanji.woff', fontWeight: 700, fontStyle: 'normal' },
    { file: 'MPLUSRounded1c-Regular-Kanji.woff', fontWeight: 400, fontStyle: 'italic' },
    { file: 'MPLUSRounded1c-Bold-Kanji.woff', fontWeight: 700, fontStyle: 'italic' },
  ],
  [DISPLAY]: [
    { file: 'Fraunces-Bold.woff', fontWeight: 700, fontStyle: 'normal' },
    { file: 'Fraunces-BoldItalic.woff', fontWeight: 700, fontStyle: 'italic' },
  ],
  [MONO]: [
    { file: 'GeistMono-Regular.woff', fontWeight: 400, fontStyle: 'normal' },
    { file: 'GeistMono-Regular.woff', fontWeight: 400, fontStyle: 'italic' },
  ],
};

let fontsRegistered = false;

/** Registers the fonts once, from `base` (a URL in the browser, a directory in tests). */
export const registerNotePdfFonts = (base: string) => {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const [family, fonts] of Object.entries(FONT_FILES)) {
    Font.register({ family, fonts: fonts.map(({ file, ...face }) => ({ src: `${base}/${file}`, ...face })) });
  }
  // Break lines between words only, as the editor does.
  Font.registerHyphenationCallback(word => [word]);
};

/** The fonts a note's PDF draws text with: kanso's sans first, then its kanji if the note has any. */
export const notePdfFontFaces = (kanji: boolean) =>
  [SANS, ...(kanji ? [KANJI] : [])].flatMap(family =>
    [400, 700].map(fontWeight => ({ fontFamily: family, fontWeight })));

const KANJI_TEXT = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Every bit of text a note's PDF prints. */
const allText = (node: JSONContent): string =>
  (node.text ?? '') + (node.content ?? []).map(allText).join('');

export const needsKanji = (doc: JSONContent, title: string, tags: Tag[] = []) =>
  KANJI_TEXT.test(title + tags.map(tag => tag.name).join('') + allText(doc));

// ─── Options ─────────────────────────────────────────────────────────────────

/** An image ready to embed: a PNG or JPEG data URL and its natural size in CSS px. */
export interface PdfImage { src: string; width: number; height: number }

/** A character drawn as a picture, sized in points. */
export interface PdfGlyph { src: string; width: number; height: number }

export interface NotePdfOptions {
  title: string;
  /** The editor's content (editor.getJSON()). */
  doc: JSONContent;
  tags?: Tag[];
  /** Shown under the title, e.g. "Updated October 22, 2026". */
  dateLabel?: string;
  /** Each image node's src → its embeddable copy, or null if it couldn't be loaded. */
  images?: Map<string, PdfImage | null>;
  /** Load the kanji font (see needsKanji). */
  kanji?: boolean;
  /** Whether the embedded fonts can draw a code point. Omitted: they can draw anything. */
  hasGlyph?: (codePoint: number) => boolean;
  /** Draws a character the fonts can't (emoji, other scripts) as a picture. */
  drawGlyph?: (grapheme: string, fontSize: number, color: string) => PdfGlyph | null;
}

// ─── Inline content ──────────────────────────────────────────────────────────

interface Ctx {
  options: NotePdfOptions;
  /** The font stack for this block's text. */
  family: string[];
  fontSize: number;
  color: string;
  fontWeight?: number;
  /** Inside a checked checklist item: struck through, like the editor. */
  struck?: boolean;
}

const stack = (family: string, kanji = false) =>
  [...new Set([family, SANS, ...(kanji ? [KANJI] : [])])];

// Emoji print as pictures: the fonts have none, and PDFs can't hold color glyphs.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\ufe0f|\p{Emoji_Modifier}|\p{Regional_Indicator}/u;
// Joiners and variation selectors have no glyph of their own.
const INVISIBLE = /[\s\u200b-\u200f\u2060\ufe0e\ufe0f]/u;

let segmenter: Intl.Segmenter | null = null;
const graphemes = (text: string) => {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), part => part.segment);
};

/**
 * The run's text, with each character the embedded fonts can't draw swapped
 * for a picture of it, so nothing prints as an empty box.
 */
const textWithGlyphs = (text: string, ctx: Ctx, fontSize: number, color: string): React.ReactNode[] => {
  const { hasGlyph = () => true, drawGlyph } = ctx.options;
  if (!drawGlyph) return [text];
  const out: React.ReactNode[] = [];
  let run = '';
  graphemes(text).forEach((grapheme, i) => {
    const missing = EMOJI.test(grapheme) || Array.from(grapheme).some(ch =>
      !INVISIBLE.test(ch) && !hasGlyph(ch.codePointAt(0)!));
    const glyph = missing ? drawGlyph(grapheme, fontSize, color) : null;
    if (!glyph) {
      run += grapheme;
      return;
    }
    if (run) out.push(run);
    run = '';
    out.push(<Picture key={i} src={glyph.src} style={{ width: glyph.width, height: glyph.height }} />);
  });
  if (run) out.push(run);
  return out;
};

const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(value.trim());

const inline = (nodes: JSONContent[] = [], ctx: Ctx): React.ReactNode[] =>
  nodes.map((node, i) => {
    if (node.type === 'hardBreak') return '\n';
    if (node.type !== 'text') return <Text key={i}>{inline(node.content, ctx)}</Text>;

    const mark = (type: string) => node.marks?.find(m => m.type === type);
    const link = mark('link');
    const highlight = mark('highlight');
    const style: Style = {};
    let { color, fontSize } = ctx;

    if (mark('bold')) {
      style.fontWeight = 700;
      color = INK.primary;
    }
    if (mark('italic')) style.fontStyle = 'italic';
    if (mark('code')) {
      fontSize *= 0.875;
      style.fontSize = fontSize;
      style.fontFamily = stack(MONO, ctx.options.kanji);
      style.backgroundColor = INK.chip;
    }
    if (highlight) {
      style.backgroundColor = isColor(highlight.attrs?.color) ? highlight.attrs.color : DEFAULT_HIGHLIGHT;
      color = INK.primary;
    }
    if (link) color = INK.accent;
    style.color = color;

    const decoration = [
      (mark('underline') || link) && 'underline',
      (mark('strike') || ctx.struck) && 'line-through',
    ].filter(Boolean).join(' ');
    if (decoration) style.textDecoration = decoration as Style['textDecoration'];

    const children = textWithGlyphs(node.text ?? '', ctx, fontSize, color);
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
    return href
      ? <Link key={i} src={href} style={style}>{children}</Link>
      : <Text key={i} style={style}>{children}</Text>;
  });

// ─── Blocks ──────────────────────────────────────────────────────────────────

/** Space above and below each kind of block, from the editor's stylesheet. */
const HEADINGS: Record<number, { size: number; lineHeight: number; top: number; bottom: number }> = {
  1: { size: 1.75, lineHeight: 1.2, top: 1, bottom: 0.5 },
  2: { size: 1.35, lineHeight: 1.3, top: 0.875, bottom: 0.4 },
  3: { size: 1.15, lineHeight: 1.35, top: 0.75, bottom: 0.35 },
  4: { size: 1.05, lineHeight: 1.4, top: 0.65, bottom: 0.3 },
  5: { size: 0.95, lineHeight: 1.4, top: 0.55, bottom: 0.25 },
};

const spacing = (node: JSONContent): { top: number; bottom: number } => {
  switch (node.type) {
    case 'heading': {
      const { top, bottom } = HEADINGS[node.attrs?.level] ?? HEADINGS[5];
      return { top: top * BODY, bottom: bottom * BODY };
    }
    case 'table': return { top: 0.75 * BODY, bottom: 0.75 * BODY };
    case 'image': return { top: 0.75 * BODY, bottom: 0.75 * BODY };
    case 'horizontalRule': return { top: BODY, bottom: BODY };
    default: return { top: node.type === 'paragraph' ? 0 : 0.5 * BODY, bottom: 0.5 * BODY };
  }
};

const textAlign = (node: JSONContent): Style['textAlign'] => {
  const align = node.attrs?.textAlign;
  return align === 'center' || align === 'right' || align === 'justify' ? align : undefined;
};

/** The height of one line of text, for blank lines and list markers. */
const lineBox = (fontSize: number, lineHeight: number) => fontSize * lineHeight;

/**
 * Renders sibling blocks with the editor's spacing. Vertical margins between
 * blocks collapse as in CSS (the larger of the two wins), and the last block
 * in a list item or cell leaves its bottom margin to the container.
 */
const blocks = (nodes: JSONContent[] = [], ctx: Ctx, { trailing = true } = {}): React.ReactNode[] => {
  let previousBottom = 0;
  return nodes.map((node, i) => {
    const { top, bottom } = spacing(node);
    const last = i === nodes.length - 1;
    const margins: Style = {
      marginTop: i === 0 ? (top && trailing ? top : 0) : Math.max(0, top - previousBottom),
      marginBottom: last && !trailing ? 0 : bottom,
    };
    previousBottom = bottom;
    return <React.Fragment key={i}>{block(node, ctx, margins)}</React.Fragment>;
  });
};

const paragraph = (node: JSONContent, ctx: Ctx, margins: Style, extra: Style = {}, keepWithNext = 0) => {
  const lineHeight = (extra.lineHeight as number | undefined) ?? 1.7;
  const fontSize = (extra.fontSize as number | undefined) ?? ctx.fontSize;
  const style: Style = {
    fontFamily: ctx.family,
    fontSize,
    fontWeight: ctx.fontWeight,
    lineHeight,
    color: ctx.color,
    textAlign: textAlign(node),
    ...margins,
    ...extra,
  };
  if (!node.content?.length) {
    // A blank line keeps one line of height, as in the editor.
    return <View style={{ ...margins, height: lineBox(fontSize, lineHeight) }} />;
  }
  return (
    <Text style={style} orphans={2} widows={2} minPresenceAhead={keepWithNext}>
      {inline(node.content, { ...ctx, fontSize })}
    </Text>
  );
};

/** A heading moves to the next page unless this much of what follows fits under it. */
const KEEP_WITH_HEADING = 3 * lineBox(BODY, 1.7);

const heading = (node: JSONContent, ctx: Ctx, margins: Style) => {
  const level = Number(node.attrs?.level) || 1;
  const { size, lineHeight } = HEADINGS[level] ?? HEADINGS[5];
  const display = level <= 2;
  const headingCtx: Ctx = {
    ...ctx,
    family: display ? stack(DISPLAY, ctx.options.kanji) : ctx.family,
    color: INK.primary,
  };
  return paragraph(node, headingCtx, margins, {
    fontSize: size * BODY,
    lineHeight,
    fontWeight: 700,
    fontFamily: headingCtx.family,
    color: INK.primary,
  }, KEEP_WITH_HEADING);
};

/** The marker column's width: the editor's 1.5rem list indent. */
const MARKER_WIDTH = 1.5 * BODY;
const ITEM_GAP = 0.5 * BODY;

/** A disc, at every depth, as the editor draws them. */
const bullet = (color: string) => <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />;

const checkbox = (checked: boolean) => {
  const size = 0.95 * BODY;
  return checked ? (
    <View style={{ width: size, height: size, borderRadius: 2.5, backgroundColor: INK.accent }}>
      <Svg width={size} height={size} viewBox="0 0 10 10">
        <Polyline points="2.6,5.2 4.3,6.9 7.5,3.4" stroke="#FFFFFF" strokeWidth={1.3} fill="none" />
      </Svg>
    </View>
  ) : (
    <View style={{ width: size, height: size, borderRadius: 2.5, borderWidth: 1, borderColor: INK.pencil }} />
  );
};

/**
 * Blocks with less text than this move to the next page whole when they
 * don't fit, keeping a list marker beside its text or a table row together.
 * Longer ones (rare) split between lines instead, so they're never cut.
 */
const KEEP_TOGETHER_CHARS = 1500;
const short = (node: JSONContent | undefined) => !node || allText(node).length < KEEP_TOGETHER_CHARS;

const list = (node: JSONContent, ctx: Ctx, margins: Style) => {
  const ordered = node.type === 'orderedList';
  const task = node.type === 'taskList';
  const start = Number(node.attrs?.start ?? 1);
  const firstNumber = Number.isFinite(start) ? start : 1;
  const items = (node.content ?? []).filter(item => item.type === 'listItem' || item.type === 'taskItem');
  const line = lineBox(ctx.fontSize, 1.7);
  const markerWidth = task ? 0.95 * BODY + ITEM_GAP : MARKER_WIDTH;

  return (
    <View style={{ ...margins, paddingLeft: task ? 0.125 * BODY : 0 }}>
      {items.map((item, i) => {
        const checked = task && item.attrs?.checked === true;
        const itemCtx: Ctx = checked ? { ...ctx, struck: true, color: INK.muted } : ctx;
        let marker: React.ReactNode;
        if (task) {
          marker = (
            <View style={{ width: markerWidth, height: line, justifyContent: 'center' }}>
              {checkbox(checked)}
            </View>
          );
        } else if (ordered) {
          marker = (
            <Text style={{ width: markerWidth, paddingRight: 4, textAlign: 'right', fontFamily: ctx.family, fontSize: ctx.fontSize, lineHeight: 1.7, color: ctx.color }}>
              {`${firstNumber + i}.`}
            </Text>
          );
        } else {
          marker = (
            <View style={{ width: markerWidth, paddingRight: 6, height: line, alignItems: 'flex-end', justifyContent: 'center' }}>
              {bullet(ctx.color)}
            </View>
          );
        }
        // The marker shares a row with the item's first block only; the rest
        // (a nested list, more paragraphs) flows on beneath it.
        const [first, ...rest] = blocks(item.content, itemCtx, { trailing: false });
        return (
          <View key={i} style={{ marginBottom: i === items.length - 1 ? 0 : task ? 0.25 * BODY : ITEM_GAP }}>
            <View wrap={!short(item.content?.[0])} style={{ flexDirection: 'row' }}>
              {marker}
              <View style={{ flex: 1 }}>{first}</View>
            </View>
            {rest.length > 0 && <View style={{ paddingLeft: markerWidth }}>{rest}</View>}
          </View>
        );
      })}
    </View>
  );
};

const TAB_SIZE = 8;

/** Expands tabs to the next tab stop, as the editor's <pre> does. */
const expandTabs = (line: string) => {
  let out = '';
  for (const ch of line) out += ch === '\t' ? ' '.repeat(TAB_SIZE - (out.length % TAB_SIZE)) : ch;
  return out;
};

const codeBlock = (node: JSONContent, ctx: Ctx, margins: Style) => {
  const code = allText(node).replace(/\n$/, '');
  const fontSize = 0.875 * BODY;
  return (
    <View style={{
      ...margins,
      backgroundColor: INK.chip,
      borderWidth: 0.75,
      borderColor: INK.border,
      borderRadius: 6,
      paddingVertical: 0.625 * BODY,
      paddingHorizontal: 0.75 * BODY,
    }}>
      {/* One Text per line, so a page break always falls between lines. */}
      {code.split('\n').map((line, i) => (
        <Text key={i} style={{ fontFamily: stack(MONO, ctx.options.kanji), fontSize, lineHeight: 1.6, color: INK.primary }}>
          {/* Leading spaces are kept as no-break spaces, which the layout never trims. */}
          {textWithGlyphs(expandTabs(line).replace(/^ +/, s => '\u00a0'.repeat(s.length)) || ' ', ctx, fontSize, INK.primary)}
        </Text>
      ))}
    </View>
  );
};

const blockquote = (node: JSONContent, ctx: Ctx, margins: Style) => (
  <View style={{
    ...margins,
    borderLeftWidth: 2.25,
    borderLeftColor: INK.borderStrong,
    paddingLeft: 0.875 * BODY,
    paddingVertical: 0.125 * BODY,
  }}>
    {blocks(node.content, { ...ctx, color: INK.muted }, { trailing: false })}
  </View>
);

const table = (node: JSONContent, ctx: Ctx, margins: Style) => {
  const rows = (node.content ?? []).filter(row => row.type === 'tableRow');
  const span = (cell: JSONContent) => Math.max(1, Number(cell.attrs?.colspan) || 1);
  const columns = Math.max(1, ...rows.map(row => (row.content ?? []).reduce((sum, cell) => sum + span(cell), 0)));
  // Columns keep the widths they were dragged to in the editor, scaled to the page.
  const widths: number[] = Array(columns).fill(0);
  (rows[0]?.content ?? []).reduce((col, cell) => {
    const set: unknown = cell.attrs?.colwidth;
    (Array.isArray(set) ? set : []).forEach((w, j) => { if (Number(w) > 0) widths[col + j] = Number(w); });
    return col + span(cell);
  }, 0);
  const known = widths.filter(Boolean);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const total = widths.reduce((sum, w) => sum + (w || fallback), 0);
  const share = (col: number, count: number) =>
    widths.slice(col, col + count).reduce((sum, w) => sum + (w || fallback), 0) / total;

  return (
    <View style={{ ...margins, borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: INK.border }}>
      {rows.map((row, r) => {
        let col = 0;
        return (
          <View key={r} wrap={!short(row)} style={{ flexDirection: 'row' }}>
            {(row.content ?? []).map((cell, c) => {
              const header = cell.type === 'tableHeader';
              const width = share(col, span(cell)) * PDF_CONTENT_WIDTH - 0.75 / columns;
              col += span(cell);
              return (
                <View key={c} style={{
                  width,
                  borderRightWidth: 0.75,
                  borderBottomWidth: 0.75,
                  borderColor: INK.border,
                  paddingVertical: 0.4 * BODY,
                  paddingHorizontal: 0.6 * BODY,
                  backgroundColor: header ? INK.chip : undefined,
                }}>
                  {blocks(cell.content, header ? { ...ctx, color: INK.primary, fontWeight: 700 } : ctx, { trailing: false })}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

/**
 * Fits an image to the page: no wider than the content box (or the width it
 * was resized to in the editor) and no taller than a page, so it is never
 * sliced across two.
 */
export const fitImage = (image: PdfImage, chosenWidth?: number | null) => {
  const width = Math.min(
    (Number(chosenWidth) || image.width) * PX,
    PDF_CONTENT_WIDTH,
    (PDF_CONTENT_HEIGHT * image.width) / image.height,
  );
  return { width, height: (width * image.height) / image.width };
};

const image = (node: JSONContent, ctx: Ctx, margins: Style) => {
  const src: string = node.attrs?.src ?? '';
  const loaded = ctx.options.images?.get(src);
  if (!loaded) {
    // An image that can't be fetched (a dead link, a blocked host) prints as its caption.
    const label = node.attrs?.alt ? `[Image: ${node.attrs.alt}]` : '[Image]';
    return <Text style={{ ...margins, fontFamily: ctx.family, fontSize: ctx.fontSize, color: INK.muted, fontStyle: 'italic' }}>{label}</Text>;
  }
  const { width, height } = fitImage(loaded, node.attrs?.width);
  return <Picture src={loaded.src} style={{ ...margins, width, height, borderRadius: 6 }} />;
};

function block(node: JSONContent, ctx: Ctx, margins: Style): React.ReactNode {
  switch (node.type) {
    case 'paragraph': return paragraph(node, ctx, margins);
    case 'heading': return heading(node, ctx, margins);
    case 'bulletList':
    case 'orderedList':
    case 'taskList': return list(node, ctx, margins);
    case 'codeBlock': return codeBlock(node, ctx, margins);
    case 'blockquote': return blockquote(node, ctx, margins);
    case 'table': return table(node, ctx, margins);
    case 'image': return image(node, ctx, margins);
    case 'horizontalRule':
      return <View style={{ ...margins, borderTopWidth: 0.75, borderTopColor: INK.border }} />;
    default:
      // Anything else still prints its text rather than vanishing.
      return node.content?.some(child => child.type === 'text' || child.type === 'hardBreak')
        ? paragraph(node, ctx, margins)
        : <View style={margins}>{blocks(node.content, ctx, { trailing: false })}</View>;
  }
}

// ─── Document ────────────────────────────────────────────────────────────────

export const NotePdfDocument = ({ options }: { options: NotePdfOptions }) => {
  const { title, doc, tags = [], dateLabel, kanji = false } = options;
  const ctx: Ctx = { options, family: stack(SANS, kanji), fontSize: BODY, color: INK.secondary };
  const shownTitle = title.trim() || 'Untitled Note';
  const meta = { fontFamily: ctx.family, fontSize: 0.8 * BODY, color: INK.muted };

  return (
    <Document title={shownTitle} creator="Kanso" producer="Kanso">
      <Page size="A4" style={{ padding: PAGE_MARGIN, backgroundColor: '#FFFFFF', fontFamily: ctx.family, fontSize: BODY, color: INK.secondary }}>
        <Text style={{ fontFamily: ctx.family, fontWeight: 700, fontSize: 22, lineHeight: 1.25, color: INK.primary, marginBottom: 6 }}>
          {textWithGlyphs(shownTitle, ctx, 22, INK.primary)}
        </Text>
        {(dateLabel || tags.length > 0) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginBottom: 8 }}>
            {dateLabel && <Text style={meta}>{dateLabel}</Text>}
            {tags.map(tag => (
              <View key={tag.id} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isColor(tag.color) ? tag.color : INK.pencil }} />
                <Text style={meta}>{textWithGlyphs(tag.name, ctx, meta.fontSize, INK.muted)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ borderTopWidth: 1.5, borderTopColor: INK.border, marginBottom: 14 }} />
        {blocks(doc.content, ctx)}
      </Page>
    </Document>
  );
};

/** Lays out and encodes the PDF (fonts must be registered first). */
export const renderNotePdf = (options: NotePdfOptions): Promise<Blob> =>
  pdf(<NotePdfDocument options={options} />).toBlob();
