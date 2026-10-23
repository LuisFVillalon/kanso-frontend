// @vitest-environment node
import React from 'react';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { renderToBuffer } from '@react-pdf/renderer';
import { NotePdfDocument, type NotePdfOptions, registerNotePdfFonts } from './notePdfDocument';

// The real fonts from public/fonts/pdf, laid out and encoded as in the browser.
registerNotePdfFonts(fileURLToPath(new URL('../../../../public/fonts/pdf', import.meta.url)));

const text = (value: string, marks: string[] = []): JSONContent =>
  ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

const renderPdf = async (content: JSONContent[], extra: Partial<NotePdfOptions> = {}) => {
  const options: NotePdfOptions = { title: 'Cell biology', doc: { type: 'doc', content }, ...extra };
  return (await renderToBuffer(<NotePdfDocument options={options} />)).toString('latin1');
};

const pages = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) ?? []).length;

// Real layout and font subsetting: a few seconds each when the suite runs in parallel.
describe('note PDF file', { timeout: 30_000 }, () => {
  it("embeds kanso's fonts and keeps text as text, not pictures", async () => {
    const pdf = await renderPdf([
      { type: 'heading', attrs: { level: 1 }, content: [text('Mitochondria')] },
      para(text('Body '), text('italic', ['italic']), text(' bold', ['bold']), text(' code()', ['code']), text(' 日本語')),
    ], { kanji: true });

    for (const font of ['Fraunces-Bold', 'RoundedMplus1c-Regular', 'RoundedMplus1c-Bold', 'MPLUSRounded1c-Italic', 'GeistMono-Regular']) {
      expect(pdf).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(pdf).toContain('/FontFile2'); // embedded, subset TrueType
    expect(pdf).toContain('/ToUnicode'); // maps glyphs back to text, so it can be selected and searched
    expect(pdf).not.toContain('/Subtype /Image');
    expect(pdf.length).toBeLessThan(100_000);
  });

  it('embeds images as pictures', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pdf = await renderPdf([{ type: 'image', attrs: { src: png } }], {
      images: new Map([[png, { src: png, width: 1, height: 1 }]]),
    });
    expect(pdf).toContain('/Subtype /Image');
  });

  it('splits a paragraph longer than a page between lines instead of cutting it', async () => {
    const pdf = await renderPdf([para(text('The mitochondrion makes ATP. '.repeat(600)))]);
    expect(pages(pdf)).toBeGreaterThan(1);
  });

  it('splits a list item longer than a page too', async () => {
    const pdf = await renderPdf([{
      type: 'bulletList',
      content: [{ type: 'listItem', content: [para(text('The mitochondrion makes ATP. '.repeat(600)))] }],
    }]);
    expect(pages(pdf)).toBeGreaterThan(1);
  });
});
