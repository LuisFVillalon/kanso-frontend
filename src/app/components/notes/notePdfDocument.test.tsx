// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import TiptapHighlight from '@tiptap/extension-highlight';
import TiptapTextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { Image, Link, Polyline, Text, View } from '@react-pdf/renderer';
import { ResizableImage } from './extensions/ResizableImage';
import {
  NotePdfDocument, PDF_CONTENT_HEIGHT, PDF_CONTENT_WIDTH, type NotePdfOptions, fitImage, needsKanji,
} from './notePdfDocument';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// One of everything the toolbar, slash menu and selection menu can make.
const EVERY_NODE = [
  '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5>',
  '<p>Plain <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s> <code>inline()</code> ',
  '<mark data-color="#bbf7d0" style="background-color: #bbf7d0; color: inherit">green</mark> ',
  '<a href="https://example.com">link</a> one<br>two 日本語 🧬</p>',
  '<p style="text-align: center">Centered</p>',
  '<ul><li><p>Bullet</p><ul><li><p>Nested bullet</p></li></ul></li></ul>',
  '<ol start="5"><li><p>Five</p></li><li><p>Six</p><ol><li><p>Nested one</p></li></ol></li></ol>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li>',
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Open</p></div></li></ul>',
  '<blockquote><p>Quote</p></blockquote>',
  '<pre><code>a = 1\n  b = 2\n\n\tc = 3</code></pre>',
  '<hr>',
  '<table><tbody><tr><th><p>Head</p></th></tr><tr><td><p>Cell</p></td></tr></tbody></table>',
  `<img src="${PNG}" style="width: 240px">`,
].join('');

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** The note as NoteEditor's extensions serialize it. */
const editorJson = (content: string) => {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
      ResizableImage.configure({ allowBase64: true, HTMLAttributes: { class: 'note-img' } }),
      TiptapHighlight.configure({ multicolor: true }),
      TiptapTextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
  });
  return editor.getJSON();
};

type El = React.ReactElement<{ children?: React.ReactNode; style?: Record<string, unknown>; [key: string]: unknown }>;

/** Expands function components, so the tree holds only react-pdf primitives and strings. */
const expand = (node: React.ReactNode): React.ReactNode => {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  const el = node as El;
  if (typeof el.type === 'function') return expand((el.type as (props: unknown) => React.ReactNode)(el.props));
  if ((el.type as unknown) === React.Fragment) return expand(el.props.children);
  return React.cloneElement(el, undefined, ...React.Children.toArray(el.props.children).map(expand));
};

/** Every primitive in document order. */
const walk = (node: React.ReactNode, out: El[] = []): El[] => {
  React.Children.forEach(node, child => {
    if (!React.isValidElement(child)) return;
    out.push(child as El);
    walk((child as El).props.children, out);
  });
  return out;
};

const textOf = (node: React.ReactNode): string => {
  let out = '';
  React.Children.forEach(node, child => {
    if (typeof child === 'string' || typeof child === 'number') out += child;
    else if (React.isValidElement(child)) out += textOf((child as El).props.children);
  });
  return out;
};

const render = (content: string, extra: Partial<NotePdfOptions> = {}) => {
  const doc = editorJson(content);
  const options: NotePdfOptions = {
    title: 'Note',
    doc,
    images: new Map([[PNG, { src: PNG, width: 1600, height: 500 }]]),
    ...extra,
  };
  const tree = expand(<NotePdfDocument options={options} />);
  const all = walk(tree);
  return { tree, all, text: textOf(tree) };
};

/** The innermost Text (or Link) whose own text is exactly `text`. */
const run = (all: El[], text: string) =>
  all.find(el => (el.type === Text || el.type === Link) && textOf(el.props.children) === text
    && !walk(el.props.children).some(child => child.type === Text || child.type === Link))!;

const family = (el: El) => el.props.style?.fontFamily as string[];

describe('note PDF document', () => {
  it('keeps every node and mark the editor can make, in order, as text', () => {
    const { all, text } = render(EVERY_NODE);

    expect(run(all, 'bold').props.style).toMatchObject({ fontWeight: 700 });
    expect(run(all, 'italic').props.style).toMatchObject({ fontStyle: 'italic' });
    expect(run(all, 'under').props.style).toMatchObject({ textDecoration: 'underline' });
    expect(run(all, 'strike').props.style).toMatchObject({ textDecoration: 'line-through' });
    expect(run(all, 'inline()').props.style).toMatchObject({ fontFamily: ['Geist Mono', 'M PLUS Rounded 1c'] });
    expect(run(all, 'green').props.style).toMatchObject({ backgroundColor: '#bbf7d0' });
    const link = run(all, 'link');
    expect(link.type).toBe(Link);
    expect(link.props.src).toBe('https://example.com');
    expect(text).toContain('one\ntwo 日本語 🧬');
    expect(all.find(el => el.type === Text && textOf(el.props.children) === 'Centered')!.props.style)
      .toMatchObject({ textAlign: 'center' });
    expect(all.filter(el => el.type === Image)).toHaveLength(1);

    const order = ['H1', 'H5', 'Plain', 'Bullet', 'Five', 'Done', 'Quote', 'a = 1', 'Head', 'Cell'];
    const at = order.map(word => text.indexOf(word));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("sets text in kanso's fonts: Fraunces for H1 and H2, M PLUS Rounded for the title and the rest", () => {
    const { all } = render('<h1>One</h1><h2>Two</h2><h3>Three</h3><p>Body</p>');
    const block = (text: string) => all.find(el => el.type === Text && textOf(el.props.children) === text)!;
    expect(family(block('Note'))).toEqual(['M PLUS Rounded 1c']);
    expect(family(block('One'))[0]).toBe('Fraunces');
    expect(family(block('Two'))[0]).toBe('Fraunces');
    expect(family(block('Three'))).toEqual(['M PLUS Rounded 1c']);
    expect(family(block('Body'))).toEqual(['M PLUS Rounded 1c']);
  });

  it('keeps headings on the same page as what follows them', () => {
    const { all } = render('<h2>Two</h2><p>Body</p>');
    const block = (text: string) => all.find(el => el.type === Text && textOf(el.props.children) === text)!;
    expect(block('Two').props.minPresenceAhead).toBeGreaterThan(40);
    expect(block('Body').props.minPresenceAhead).toBe(0);
  });

  it('keeps a list marker on the same page as its text', () => {
    const long = 'word '.repeat(400);
    const { all } = render(`<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Short</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>${long}</p></li></ul></li></ul>`);
    const rows = all.filter(el => el.type === View && el.props.style?.flexDirection === 'row' && 'wrap' in el.props);
    // The short item's box and text move as one; the nested list flows on below them.
    expect(textOf(rows[0])).toBe('Short');
    expect(rows[0].props.wrap).toBe(false);
    // An item longer than a page may split between lines rather than be cut.
    expect(textOf(rows[1]).trim()).toBe(long.trim());
    expect(rows[1].props.wrap).toBe(true);
  });

  it('lets a list item or table row with little text but many lines split', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join('<br>');
    const paragraphs = Array.from({ length: 50 }, (_, i) => `<li><p>Point ${i}</p></li>`).join('');
    const { all } = render(`<ul><li><p>${lines}</p></li><li><p>Short</p></li></ul>`
      + `<table><tbody><tr><td><ul>${paragraphs}</ul></td><td><p>Side</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>`);
    const rows = all.filter(el => el.type === View && el.props.style?.flexDirection === 'row' && 'wrap' in el.props);
    const row = (text: string) => rows.find(el => textOf(el).startsWith(text))!;
    expect(row('Line 0').props.wrap).toBe(true);
    expect(row('Short').props.wrap).toBe(false);
    expect(row('Point 0Point 1').props.wrap).toBe(true);
    expect(row('AB').props.wrap).toBe(false);
  });

  it('adds the kanji font only for notes with kanji', () => {
    expect(needsKanji(editorJson('<p>Plain café</p>'), 'Title')).toBe(false);
    expect(needsKanji(editorJson('<p>ひらがな</p>'), 'Title')).toBe(false);
    expect(needsKanji(editorJson('<p>日本語</p>'), 'Title')).toBe(true);
    expect(needsKanji(editorJson('<p>x</p>'), '中文')).toBe(true);
    expect(needsKanji(editorJson('<p>x</p>'), 'x', [{ id: 1, name: '生物', color: '#000000' }])).toBe(true);
    expect(needsKanji(editorJson('<img src="https://example.com/a.png" alt="細胞">'), 'x')).toBe(true);
  });

  it('numbers ordered lists from their start and nests their own counters', () => {
    const { all } = render(EVERY_NODE);
    const numbers = all.filter(el => el.type === Text && /^\d+\.$/.test(textOf(el.props.children)));
    expect(numbers.map(el => textOf(el.props.children))).toEqual(['5.', '6.', '1.']);
  });

  it('draws checklist boxes, ticked and struck through when done', () => {
    const { all } = render(EVERY_NODE);
    expect(all.filter(el => el.type === Polyline)).toHaveLength(1);
    expect(run(all, 'Done').props.style).toMatchObject({ textDecoration: 'line-through', color: '#6B655C' });
    expect(run(all, 'Open').props.style?.textDecoration).toBeUndefined();
  });

  it('prints code blocks one line per Text, keeping indents and blank lines', () => {
    const { all } = render(EVERY_NODE);
    const code = all.filter(el => el.type === Text && family(el)?.[0] === 'Geist Mono' && el.props.style?.lineHeight === 1.6);
    expect(code.map(el => textOf(el.props.children))).toEqual(['a = 1', '\u00a0\u00a0b = 2', ' ', '\u00a0'.repeat(8) + 'c = 3']);
  });

  it('gives blank lines one line of height', () => {
    const { all } = render('<p>a</p><p></p><p>b</p>');
    const blank = all.filter(el => el.type === View && typeof el.props.style?.height === 'number' && !el.props.children);
    expect(blank).toHaveLength(1);
    expect(blank[0].props.style?.height).toBeCloseTo(10.5 * 1.7);
  });

  it('prints the title as text, with the date and tags under it', () => {
    const { all, text } = render('<p>x</p>', {
      title: 'Ch. 3 <script>alert(1)</script> & more',
      tags: [{ id: 1, name: '<b>Bio</b>', color: '#7FB069' }],
      dateLabel: 'Updated October 22, 2026',
    });
    expect(text.startsWith('Ch. 3 <script>alert(1)</script> & moreUpdated October 22, 2026<b>Bio</b>x')).toBe(true);
    expect(all.some(el => el.type === View && el.props.style?.backgroundColor === '#7FB069')).toBe(true);
  });

  it('leaves the date and tag line out when there is neither', () => {
    const { text } = render('<p>x</p>', { title: '  ' });
    expect(text).toBe('Untitled Notex');
  });

  it('prints an image that could not be loaded as its caption', () => {
    const { all, text } = render('<img src="https://example.com/a.png" alt="Diagram">', { images: new Map() });
    expect(all.some(el => el.type === Image)).toBe(false);
    expect(text).toContain('[Image: Diagram]');
  });

  it('draws emoji in an unloaded image\'s caption as pictures', () => {
    const drawn: string[] = [];
    const { text } = render('<img src="https://example.com/a.png" alt="Cell 🧬">', {
      images: new Map(),
      drawGlyph: grapheme => {
        drawn.push(grapheme);
        return { src: PNG, width: 10, height: 10 };
      },
    });
    expect(drawn).toEqual(['🧬']);
    expect(text).toContain('[Image: Cell ]');
  });

  it('draws characters the fonts lack, and emoji, as pictures', () => {
    const drawn: string[] = [];
    const { all, text } = render('<p>A 🧬 한 b</p>', {
      hasGlyph: codePoint => codePoint < 0x3000,
      drawGlyph: grapheme => {
        drawn.push(grapheme);
        return { src: PNG, width: 10, height: 10 };
      },
    });
    expect(drawn).toEqual(['🧬', '한']);
    expect(text).toContain('A   b');
    expect(all.filter(el => el.type === Image)).toHaveLength(2);
  });
});

describe('fitImage', () => {
  it('keeps the width an image was resized to in the editor', () => {
    expect(fitImage({ src: PNG, width: 1600, height: 500 }, 240)).toEqual({ width: 180, height: 56.25 });
  });

  it('shrinks a wide image to the page width', () => {
    const { width, height } = fitImage({ src: PNG, width: 1600, height: 500 });
    expect(width).toBeCloseTo(PDF_CONTENT_WIDTH);
    expect(height).toBeCloseTo(PDF_CONTENT_WIDTH * 500 / 1600);
  });

  it('shrinks a tall image to one page, keeping its shape', () => {
    const { width, height } = fitImage({ src: PNG, width: 500, height: 1800 });
    expect(height).toBeCloseTo(PDF_CONTENT_HEIGHT);
    expect(width / height).toBeCloseTo(500 / 1800);
  });
});
