// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import TiptapHighlight from '@tiptap/extension-highlight';
import TiptapTextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { ResizableImage } from './extensions/ResizableImage';
import { buildNotePdfMarkup, escapeHtml, pdfFilename, preparePdfBody } from './notePdfDocument';

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
  '<pre><code>a = 1\nb = 2\n\nc = 3</code></pre>',
  '<hr>',
  '<table><tbody><tr><th><p>Head</p></th></tr><tr><td><p>Cell</p></td></tr></tbody></table>',
  `<img src="${PNG}" style="width: 240px">`,
].join('');

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = '';
});

/** The note as NoteEditor's extensions serialize it, rendered into the PDF document. */
const renderPdf = (content: string, extra: Partial<Parameters<typeof buildNotePdfMarkup>[0]> = {}) => {
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
  const container = document.createElement('div');
  container.innerHTML = buildNotePdfMarkup({ title: 'Note', html: editor.getHTML(), ...extra });
  document.body.appendChild(container);
  const body = container.querySelector('.pdf-body')!;
  preparePdfBody(body);
  return { container, body };
};

const texts = (els: NodeListOf<Element>) => Array.from(els).map(el => el.textContent);

describe('note PDF document', () => {
  it('keeps every node and mark the editor can make, in order', () => {
    const { body } = renderPdf(EVERY_NODE);

    for (const selector of [
      'h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'em', 'u', 's', 'p > code', 'mark', 'a[href="https://example.com"]',
      'br', 'blockquote', 'pre', 'hr', 'table th', 'table td', 'img', 'ul', 'ol', 'ul[data-type="taskList"]',
    ]) {
      expect(body.querySelector(selector), selector).not.toBeNull();
    }
    expect((body.querySelector('mark') as HTMLElement).style.backgroundColor).toBe('rgb(187, 247, 208)');
    expect(body.querySelector('p[style*="text-align: center"]')).not.toBeNull();
    expect(body.querySelector('img')!.getAttribute('style')).toContain('width: 240px');
    expect(body.textContent).toContain('日本語 🧬');

    const order = ['H1', 'H5', 'Plain', 'Bullet', 'Five', 'Done', 'Quote', 'a = 1', 'Head', 'Cell'];
    const at = order.map(text => body.textContent!.indexOf(text));
    expect(at.every(i => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('numbers ordered lists from their start and nests their own counters', () => {
    const { body } = renderPdf(EVERY_NODE);
    expect(texts(body.querySelectorAll('ol .pdf-list-marker'))).toEqual(['5.', '6.', '1.']);
    expect(texts(body.querySelectorAll('ul:not([data-type]) .pdf-list-marker'))).toEqual(['•', '•']);
  });

  it('draws checklist boxes, ticked and struck through when done', () => {
    const { body } = renderPdf(EVERY_NODE);
    const items = body.querySelectorAll('ul[data-type="taskList"] > li');
    expect(items[0].classList.contains('pdf-checked')).toBe(true);
    expect(items[0].querySelector('.pdf-check.is-checked')).not.toBeNull();
    expect(items[1].classList.contains('pdf-checked')).toBe(false);
    expect(items[1].querySelector('.pdf-check:not(.is-checked)')).not.toBeNull();
    expect(body.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('splits code blocks into one block per line, keeping blank lines', () => {
    const { body } = renderPdf(EVERY_NODE);
    expect(texts(body.querySelectorAll('pre .pdf-code-line'))).toEqual(['a = 1', 'b = 2', '', 'c = 3']);
  });

  it('gives blank lines one line of height, in the body, lists and tables', () => {
    const { body } = renderPdf(
      '<p>a</p><p></p><p></p><p>b</p><ul><li><p></p></li></ul><table><tbody><tr><td><p></p></td></tr></tbody></table>');
    const empty = Array.from(body.querySelectorAll('p')).filter(p => !p.textContent);
    expect(empty).toHaveLength(4);
    const lineHeight = (p: Element) => parseFloat(getComputedStyle(p).fontSize) * 1.5;
    for (const p of empty) expect(getComputedStyle(p).minHeight).toBe(`${lineHeight(p)}px`);
    const filled = Array.from(body.querySelectorAll('p')).filter(p => p.textContent);
    for (const p of filled) expect(parseFloat(getComputedStyle(p).minHeight) || 0).toBe(0);
  });

  it('escapes the title and tags, and prints the date and tags under the title', () => {
    const { container } = renderPdf('<p>x</p>', {
      title: 'Ch. 3 <script>alert(1)</script> & more',
      tags: [{ id: 1, name: '<b>Bio</b>', color: '#7FB069' }],
      dateLabel: 'Updated October 22, 2026',
    });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('.pdf-title')!.textContent).toBe('Ch. 3 <script>alert(1)</script> & more');
    expect(container.querySelector('.pdf-meta')!.textContent).toBe('Updated October 22, 2026<b>Bio</b>');
    expect((container.querySelector('.pdf-tag-dot') as HTMLElement).style.background).toBe('rgb(127, 176, 105)');
  });

  it('leaves the date and tag line out when there is neither', () => {
    const { container } = renderPdf('<p>x</p>');
    expect(container.querySelector('.pdf-meta')).toBeNull();
    expect(container.querySelector('.pdf-title')!.textContent).toBe('Note');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('pdfFilename', () => {
  it('drops characters filesystems reject and joins words with underscores', () => {
    expect(pdfFilename('Lecture 4: Cell / respiration?', '2026-10-23')).toBe('Lecture_4_Cell_respiration_2026-10-23.pdf');
  });

  it('falls back to "Note" for an empty or unusable title', () => {
    expect(pdfFilename('', '2026-10-23')).toBe('Note_2026-10-23.pdf');
    expect(pdfFilename('???', '2026-10-23')).toBe('Note_2026-10-23.pdf');
  });

  it('keeps Unicode and emoji', () => {
    expect(pdfFilename('Biología 🧬', '2026-10-23')).toBe('Biología_🧬_2026-10-23.pdf');
  });
});
