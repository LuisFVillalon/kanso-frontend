import type { Tag } from '@/app/types/task';

/**
 * The printable document behind a note's "Download PDF": the markup and
 * print stylesheet html2pdf.js renders, plus the DOM fix-ups html2canvas
 * needs to draw it faithfully. Kept free of React so it can be tested alone.
 */

/** CSS px width of the A4 page's content box html2pdf renders into (210mm − 2×14mm). */
export const PDF_CONTENT_WIDTH_PX = 687;
/** CSS px height of that content box (297mm − 2×14mm), less a little slack. */
export const PDF_CONTENT_HEIGHT_PX = 1000;

// html2canvas measures font baselines in the live page with this 1×1 image.
// Tailwind's preflight makes every <img> display:block, which breaks that
// measurement and draws all text several px below its boxes (highlights,
// strike lines and the title divider land on the wrong line).
const HTML2CANVAS_BASELINE_PROBE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// No emoji fonts here: they carry space and digit glyphs, which would replace
// the text font's; the browser's own fallback already finds emoji.
const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** "Lecture 4: Cell respiration" → "Lecture_4_Cell_respiration_2026-10-23.pdf". */
export const pdfFilename = (title: string, today: string): string => {
  const safeTitle = (title || 'Note')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80);
  return `${safeTitle || 'Note'}_${today}.pdf`;
};

interface NotePdfMarkupOptions {
  title: string;
  /** The editor's HTML (editor.getHTML()). */
  html: string;
  tags?: Tag[];
  /** Shown under the title, e.g. "Updated October 22, 2026". */
  dateLabel?: string;
}

/** The print stylesheet plus the title, tag/date line and note body. */
export const buildNotePdfMarkup = ({ title, html, tags = [], dateLabel }: NotePdfMarkupOptions): string => {
  const meta = [
    dateLabel ? `<span class="pdf-date">${escapeHtml(dateLabel)}</span>` : '',
    ...tags.map(tag =>
      `<span class="pdf-tag"><span class="pdf-tag-dot" style="background:${escapeHtml(tag.color)}"></span>${escapeHtml(tag.name)}</span>`),
  ].filter(Boolean).join('');

  return `
    <style>
      img[src="${HTML2CANVAS_BASELINE_PROBE}"] { display: inline; }

      /* ── Foundation ──────────────────────────────────────────────────── */
      /* html2pdf places page breaks by measuring this markup in the live
         page, where the app's Tailwind preflight applies, but html2canvas
         draws a clone with those stylesheets stripped. Resetting everything
         here makes both layouts identical, so breaks land between lines.  */
      .pdf-root, .pdf-root *, .pdf-root *::before, .pdf-root *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border: 0 solid;
      }
      .pdf-root, .pdf-body { display: block; }
      .pdf-root {
        font-family: ${FONT_STACK};
        font-size: 13px;
        line-height: 1.5;
        padding: 0;
        color: #1f2937;
        background: #ffffff;
      }

      /* ── Document title, date and tags ───────────────────────────────── */
      .pdf-title {
        font-size: 28px;
        font-weight: 800;
        color: #111827;
        margin: 0 0 6px;
        line-height: 1.25;
        letter-spacing: -0.3px;
        overflow-wrap: anywhere;
      }
      .pdf-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 14px;
        margin: 0 0 10px;
        font-size: 11px;
        color: #6b7280;
      }
      .pdf-tag { display: inline-flex; align-items: center; gap: 5px; }
      .pdf-tag-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .pdf-divider { border: none; border-top: 2px solid #e5e7eb; margin: 0 0 20px; }

      /* ── Headings: the editor's H1–H5 scale, shrunk for print ────────── */
      .pdf-body h1, .pdf-body h2, .pdf-body h3, .pdf-body h4, .pdf-body h5 {
        color: #111827;
        line-height: 1.3;
        break-after: avoid; page-break-after: avoid;
        break-inside: avoid; page-break-inside: avoid;
      }
      .pdf-body h1 { font-size: 22px; font-weight: 700; margin: 22px 0 10px; }
      .pdf-body h2 { font-size: 17px; font-weight: 700; margin: 18px 0 8px; }
      .pdf-body h3 { font-size: 15px; font-weight: 700; margin: 14px 0 6px; }
      .pdf-body h4 { font-size: 14px; font-weight: 600; margin: 12px 0 5px; }
      .pdf-body h5 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; }

      /* ── Body text ───────────────────────────────────────────────────── */
      .pdf-body { position: relative; }
      .pdf-body p {
        font-size: 13px;
        color: #374151;
        line-height: 1.5;
        margin: 0 0 10px;
        break-inside: avoid; page-break-inside: avoid;
        orphans: 3; widows: 3;
      }
      .pdf-body p:empty { min-height: 1.5em; }
      .pdf-body strong { font-weight: 700; color: #111827; }
      .pdf-body em     { font-style: italic; }
      .pdf-body u      { text-decoration: underline; }
      .pdf-body s      { text-decoration: line-through; }

      /* ── Lists — flexbox injected via DOM post-processing ────────────── */
      /* Native list markers are removed; explicit .pdf-list-marker spans   */
      /* are inserted by preparePdfBody() so html2canvas can render them.   */
      .pdf-body ul,
      .pdf-body ol {
        list-style: none;
        padding: 0;
        margin: 0 0 12px;
        color: #374151;
      }
      .pdf-body li {
        display: flex;
        align-items: baseline;
        margin-bottom: 5px;
        break-inside: avoid; page-break-inside: avoid;
      }
      /* Fixed-width marker column — number/bullet never overlaps text */
      .pdf-list-marker {
        flex-shrink: 0;
        min-width: 22px;
        padding-right: 6px;
        box-sizing: border-box;
        color: #6b7280;
        font-size: 13px;
        font-weight: 600;
        text-align: right;
      }
      /* Text column wraps independently; nested lists indent naturally */
      .pdf-list-text { flex: 1; min-width: 0; }
      .pdf-list-text p { margin: 0; }
      .pdf-list-text ul,
      .pdf-list-text ol { margin: 4px 0 4px 8px; }
      /* Checklist boxes and ticks are drawn with borders, which html2canvas renders reliably */
      .pdf-body li.pdf-task { align-items: flex-start; }
      .pdf-check {
        position: relative;
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-top: 4px;
        border: 1.5px solid #9ca3af;
        border-radius: 3px;
        box-sizing: border-box;
      }
      .pdf-check.is-checked { background: #374151; border-color: #374151; }
      .pdf-check.is-checked::after {
        content: '';
        position: absolute;
        left: 3px;
        top: 0.5px;
        width: 3px;
        height: 6px;
        border: solid #ffffff;
        border-width: 0 1.5px 1.5px 0;
        transform: rotate(45deg);
      }
      li.pdf-checked > .pdf-list-text { color: #6b7280; }
      /* html2canvas won't draw a parent's text-decoration on child text. */
      li.pdf-checked > .pdf-list-text p { color: #6b7280; text-decoration: line-through; }

      /* ── Highlights keep their own color (inline style) and dark ink ─── */
      .pdf-body mark {
        background: #fef08a;
        color: #171717 !important;
        border-radius: 2px;
        padding: 0 2px;
        -webkit-box-decoration-break: clone;
        box-decoration-break: clone;
      }

      /* ── Inline code ─────────────────────────────────────────────────── */
      .pdf-body code {
        font-family: ${MONO_STACK};
        font-size: 0.875em;
        color: #1f2937;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        padding: 0 0.3em;
        border-radius: 3px;
      }

      /* ── Tables ──────────────────────────────────────────────────────── */
      .pdf-body .tableWrapper { margin: 10px 0; }
      .pdf-body table {
        border-collapse: collapse;
        table-layout: fixed;
        width: 100% !important;
        min-width: 0 !important;
        margin: 10px 0;
      }
      .pdf-body table td,
      .pdf-body table th {
        border: 1px solid #d1d5db;
        padding: 5px 8px;
        font-size: 12px;
        color: #374151;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      .pdf-body table th {
        font-weight: 700;
        color: #111827;
        background: #f3f4f6;
        text-align: left;
      }
      .pdf-body table p { margin: 0; font-size: 12px; }
      .pdf-body tr { break-inside: avoid; page-break-inside: avoid; }

      /* ── Links, code blocks, dividers ────────────────────────────────── */
      .pdf-body a { color: #1d4ed8; text-decoration: underline; }
      .pdf-body pre {
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 8px 10px;
        margin: 8px 0;
        white-space: pre-wrap;
      }
      .pdf-body pre code {
        display: block;
        font-size: 11px;
        color: #1f2937;
        background: none;
        border: 0;
        padding: 0;
        line-height: 1.5;
      }
      /* One block per code line, so page breaks fall between lines */
      .pdf-code-line { display: block; min-height: 1.5em; break-inside: avoid; }
      .pdf-body hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }

      /* ── Blockquote ──────────────────────────────────────────────────── */
      .pdf-body blockquote {
        border-left: 3px solid #d1d5db;
        padding: 2px 0 2px 12px;
        margin: 10px 0;
      }
      .pdf-body blockquote p { color: #6b7280; }

      /* ── Images: sized to the page by preparePdfBody() ───────────────── */
      .pdf-body img {
        display: block;
        max-width: 100%;
        height: auto;
        border-radius: 6px;
        margin: 8px 0;
      }
    </style>
    <div class="pdf-root">
      <h1 class="pdf-title">${escapeHtml(title || 'Untitled Note')}</h1>
      ${meta ? `<div class="pdf-meta">${meta}</div>` : ''}
      <hr class="pdf-divider" />
      <div class="pdf-body">${html}</div>
    </div>
  `;
};

/**
 * Rewrites lists into explicit marker + text columns (html2canvas can't draw
 * CSS counters or checkbox inputs) and splits code blocks into one block per
 * line so html2pdf's page breaks never cut a line in half.
 */
export const preparePdfBody = (body: Element) => {
  const doc = body.ownerDocument;

  // Innermost lists first (reverse document order), so nested lists are
  // already transformed before their parent <li> moves them into its text column.
  Array.from(body.querySelectorAll('ul, ol')).reverse().forEach(list => {
    const isOrdered = list.tagName === 'OL';
    const isChecklist = list.getAttribute('data-type') === 'taskList';
    let counter = isOrdered ? Number(list.getAttribute('start') ?? 1) - 1 : 0;
    if (!Number.isFinite(counter)) counter = 0;

    Array.from(list.children).forEach(child => {
      if (child.tagName !== 'LI') return;
      counter++;

      const marker = doc.createElement('span');
      marker.className = 'pdf-list-marker';
      if (isChecklist) {
        // Swap the editor's <label><input type=checkbox> for a drawn box.
        const checked = child.getAttribute('data-checked') === 'true';
        child.querySelector(':scope > label')?.remove();
        const box = doc.createElement('span');
        box.className = checked ? 'pdf-check is-checked' : 'pdf-check';
        marker.appendChild(box);
        child.classList.add('pdf-task');
        if (checked) child.classList.add('pdf-checked');
      } else {
        marker.textContent = isOrdered ? `${counter}.` : '•';
      }

      const textWrap = doc.createElement('span');
      textWrap.className = 'pdf-list-text';
      while (child.firstChild) textWrap.appendChild(child.firstChild);
      child.appendChild(marker);
      child.appendChild(textWrap);
    });
  });

  body.querySelectorAll('pre > code').forEach(code => {
    const lines = (code.textContent ?? '').replace(/\n$/, '').split('\n');
    code.textContent = '';
    lines.forEach(line => {
      const span = doc.createElement('span');
      span.className = 'pdf-code-line';
      span.textContent = line;
      code.appendChild(span);
    });
  });
};

/**
 * Scales each image to fit one page: no wider than the content box (or its
 * resized width in the editor) and no taller than a page, keeping its aspect
 * ratio. A taller image would otherwise be sliced across pages.
 */
export const fitPdfImages = async (body: Element) => {
  const images = Array.from(body.querySelectorAll('img'));
  await Promise.all(images.map(img => img.decode().catch(() => undefined)));
  images.forEach(img => {
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return;
    const chosen = parseInt(img.style.width, 10) || Number(img.getAttribute('width')) || w;
    const width = Math.min(chosen, PDF_CONTENT_WIDTH_PX, (PDF_CONTENT_HEIGHT_PX * w) / h);
    img.style.width = `${Math.floor(width)}px`;
    img.style.height = 'auto';
  });
};
