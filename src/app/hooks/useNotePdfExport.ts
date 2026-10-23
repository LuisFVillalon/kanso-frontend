'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';

interface UseNotePdfExportOptions {
  editor: Editor | null;
  title: string;
}

/**
 * Renders the current note into an off-screen styled container and exports
 * it to a downloaded PDF via html2pdf.js. Extracted out of NoteEditor.tsx —
 * this print stylesheet + the list-marker DOM post-processing below is a
 * large, self-contained pipeline unrelated to the rest of the editor's
 * concerns (title/content/tag autosave, the AI resources panel, etc).
 *
 * Callers are responsible for their own "note is empty" check before calling
 * downloadPDF() — this hook only renders whatever the editor currently holds.
 */
export function useNotePdfExport({ editor, title }: UseNotePdfExportOptions) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const downloadPDF = async () => {
    if (!editor) return;

    setPdfLoading(true);

    await new Promise<void>(resolve => setTimeout(resolve, 50));

    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute;top:0;left:-9999px;width:794px;background:#ffffff;color:#1f2937;pointer-events:none;';
    document.body.appendChild(container);

    try {
      const { default: html2pdf } = await import('html2pdf.js');

      type PdfOptions = Parameters<InstanceType<(typeof html2pdf)['Worker']>['set']>[0] & {
        pagebreak?: {
          mode?:   ('avoid-all' | 'css' | 'legacy') | ('avoid-all' | 'css' | 'legacy')[];
          before?: string | string[];
          after?:  string | string[];
          avoid?:  string | string[];
        };
      };

      const today = new Date().toISOString().split('T')[0];
      const safeTitle = (title || 'Note')
        .replace(/[<>:"/\\|?*]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 80);
      const filename = `${safeTitle}_${today}.pdf`;

      container.innerHTML = `
        <style>
          /* ── Foundation ──────────────────────────────────────────────────── */
          .pdf-root, .pdf-body { display: block; }
          .pdf-root {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 13px;
            padding: 0;
            color: #1f2937;
            background: #ffffff;
          }

          /* ── Document title ──────────────────────────────────────────────── */
          .pdf-title {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 28px;
            font-weight: 800;
            color: #111827;
            margin: 0 0 6px;
            line-height: 1.2;
            letter-spacing: -0.3px;
          }
          .pdf-divider { border: none; border-top: 2px solid #e5e7eb; margin: 0 0 20px; }

          /* ── Headings ────────────────────────────────────────────────────── */
          /* H1 = major section (Part 1 / Part 2 etc.) — left-accent block */
          .pdf-body h1 {
            font-size: 17px;
            font-weight: 700;
            color: #111827;
            margin: 24px 0 10px;
            line-height: 1.3;
            break-after: avoid; page-break-after: avoid;
            break-inside: avoid; page-break-inside: avoid;
          }
          /* H2 = subsection — lighter weight, no accent block */
          .pdf-body h2 {
            font-size: 14px;
            font-weight: 700;
            color: #374151;
            margin: 18px 0 6px;
            line-height: 1.3;
            break-after: avoid; page-break-after: avoid;
            break-inside: avoid; page-break-inside: avoid;
          }
          /* H3–H5 = nested subsections — progressively lighter weight */
          .pdf-body h3 {
            font-size: 13px;
            font-weight: 700;
            color: #4b5563;
            margin: 14px 0 5px;
            line-height: 1.3;
            break-after: avoid; page-break-after: avoid;
            break-inside: avoid; page-break-inside: avoid;
          }
          .pdf-body h4 {
            font-size: 12px;
            font-weight: 600;
            color: #4b5563;
            margin: 12px 0 4px;
            line-height: 1.3;
            break-after: avoid; page-break-after: avoid;
            break-inside: avoid; page-break-inside: avoid;
          }
          .pdf-body h5 {
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            margin: 10px 0 4px;
            line-height: 1.3;
            break-after: avoid; page-break-after: avoid;
            break-inside: avoid; page-break-inside: avoid;
          }

          /* ── Body text ───────────────────────────────────────────────────── */
          /* line-height: 1.5 is the stable baseline for html2canvas inline
             rendering — values above ~1.6 split leading unevenly and cause
             inline background boxes to float above their text glyphs.        */
          .pdf-body {
            position: relative; /* containing block for static inline children */
          }
          .pdf-body p {
            font-size: 13px;
            color: #374151;
            line-height: 1.5;
            margin: 0 0 10px;
            break-inside: avoid; page-break-inside: avoid;
            orphans: 3; widows: 3;
          }
          .pdf-body strong { font-weight: 700; color: #111827; }
          .pdf-body em     { font-style: italic; color: #4b5563; }

          /* ── Lists — flexbox injected via DOM post-processing ────────────── */
          /* Native list markers are removed; explicit .pdf-list-marker spans   */
          /* are inserted by the JS below so html2canvas can render them.       */
          .pdf-body ul,
          .pdf-body ol {
            list-style: none;
            padding: 0;
            margin: 0 0 12px;
            break-inside: avoid; page-break-inside: avoid;
          }
          .pdf-body li {
            display: flex;
            align-items: baseline;
            margin-bottom: 5px;
            break-inside: avoid; page-break-inside: avoid;
            orphans: 3; widows: 3;
          }
          /* Fixed-width marker column — number/bullet never overlaps text */
          .pdf-list-marker {
            flex-shrink: 0;
            width: 22px;
            padding-right: 6px;
            box-sizing: border-box;
            color: #6b7280;
            font-size: 13px;
            font-weight: 600;
            line-height: 1.75;
            text-align: right;
          }
          /* Text column wraps independently; nested lists indent naturally */
          .pdf-list-text {
            flex: 1;
            min-width: 0;
          }
          .pdf-list-text p { margin: 0; }
          /* Checklist boxes: drawn with borders, which html2canvas renders reliably */
          .pdf-check {
            display: inline-block;
            width: 11px;
            height: 11px;
            margin-top: 4px;
            border: 1.5px solid #9ca3af;
            border-radius: 3px;
            box-sizing: border-box;
            color: #ffffff;
            font-size: 9px;
            font-weight: 700;
            line-height: 8px;
            text-align: center;
          }
          .pdf-check.is-checked { background: #374151; border-color: #374151; }
          li.pdf-checked > .pdf-list-text { color: #6b7280; text-decoration: line-through; }
          /* Nested list indent */
          .pdf-list-text ul,
          .pdf-list-text ol { margin: 4px 0 4px 8px; }

          /* ── Highlights ──────────────────────────────────────────────────── */
          .pdf-body mark {
            display: inline;
            background: #fef3c7;
            color: #92400e;
            border-radius: 2px;
            /* em-based padding scales with the 13px font size:
               0.2em ≈ 2.6px top/bottom, 0.4em ≈ 5.2px left/right            */
            padding: 0.2em 0.4em;
            /* line-height: 1 collapses the inline box to exactly the cap-height
               of the glyph. html2canvas then draws the background rectangle
               flush with the text instead of inheriting the parent's 1.5
               line-height and splitting the extra leading above the characters. */
            line-height: 1;
            /* box-decoration-break: clone applies padding + border-radius to
               every wrapped fragment, not just the start and end of the mark. */
            -webkit-box-decoration-break: clone;
            box-decoration-break: clone;
            /* position: static (browser default) keeps the mark in normal flow;
               the parent's position: relative acts as the containing block.   */
            position: static;
          }

          /* ── Source / inline code ────────────────────────────────────────── */
          /* Subtle grey monospace so references don't compete with body text */
          .pdf-body code,
          .pdf-body sup {
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            color: #9ca3af;
            background: #f3f4f6;
            padding: 1px 3px;
            border-radius: 2px;
            vertical-align: super;
            line-height: 1;
          }

          /* ── Tables ──────────────────────────────────────────────────────── */
          .pdf-body .tableWrapper { margin: 10px 0; }
          .pdf-body table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
            break-inside: avoid; page-break-inside: avoid;
          }
          .pdf-body table td,
          .pdf-body table th {
            border: 1px solid #d1d5db;
            padding: 5px 8px;
            font-size: 12px;
            color: #374151;
            vertical-align: top;
          }
          .pdf-body table th {
            font-weight: 700;
            color: #111827;
            background: #f3f4f6;
            text-align: left;
          }

          /* ── Links, code blocks, dividers ────────────────────────────────── */
          .pdf-body a { color: #1d4ed8; text-decoration: underline; }
          .pdf-body s { text-decoration: line-through; }
          .pdf-body pre {
            background: #f3f4f6;
            border-radius: 4px;
            padding: 8px 10px;
            margin: 8px 0;
            white-space: pre-wrap;
            break-inside: avoid; page-break-inside: avoid;
          }
          .pdf-body pre code {
            font-size: 11px;
            color: #374151;
            background: none;
            padding: 0;
            vertical-align: baseline;
            line-height: 1.5;
          }
          .pdf-body hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }

          /* ── Blockquote ──────────────────────────────────────────────────── */
          .pdf-body blockquote {
            border-left: 3px solid #d1d5db;
            padding: 4px 12px;
            color: #6b7280;
            margin: 10px 0;
            font-style: italic;
            break-inside: avoid; page-break-inside: avoid;
          }

          /* ── Images ──────────────────────────────────────────────────────── */
          .pdf-body img {
            max-width: 100%;
            height: auto;
            border-radius: 6px;
            margin: 8px 0;
            display: block;
          }
        </style>
        <div class="pdf-root">
          <h1 class="pdf-title">${title || 'Untitled Note'}</h1>
          <hr class="pdf-divider" />
          <div class="pdf-body">${editor.getHTML()}</div>
        </div>
      `;

      // ── List post-processing ─────────────────────────────────────────────
      // html2canvas cannot reliably render CSS counter() values in ::before
      // pseudo-elements, so we inject explicit marker <span>s into each <li>
      // and let flexbox handle the fixed-column / text-wrap layout.
      //
      // Lists are processed innermost-first (reverse document order) so that
      // nested <ul>/<ol> are already transformed before their parent <li>
      // moves them into a .pdf-list-text wrapper.
      const pdfBody = container.querySelector('.pdf-body');
      if (pdfBody) {
        const allLists = Array.from(pdfBody.querySelectorAll('ul, ol')).reverse();
        allLists.forEach(list => {
          const isOrdered = list.tagName === 'OL';
          const isChecklist = list.getAttribute('data-type') === 'taskList';
          let counter = 0;
          Array.from(list.children).forEach(child => {
            if (child.tagName !== 'LI') return;
            counter++;

            const marker = document.createElement('span');
            marker.className = 'pdf-list-marker';
            if (isChecklist) {
              // Swap the editor's <label><input type=checkbox> for a drawn box.
              const checked = child.getAttribute('data-checked') === 'true';
              child.querySelector(':scope > label')?.remove();
              const box = document.createElement('span');
              box.className = checked ? 'pdf-check is-checked' : 'pdf-check';
              box.textContent = checked ? '✓' : '';
              marker.appendChild(box);
              if (checked) child.classList.add('pdf-checked');
            } else {
              marker.textContent = isOrdered ? `${counter}.` : '•';
            }

            const textWrap = document.createElement('span');
            textWrap.className = 'pdf-list-text';
            // Drain all existing children into the text wrapper first,
            // then append marker + wrapper to keep DOM order intact.
            while (child.firstChild) textWrap.appendChild(child.firstChild);
            child.appendChild(marker);
            child.appendChild(textWrap);
          });
        });
      }

      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      const pdfRoot = container.querySelector('.pdf-root') as HTMLElement | null;
      if (!pdfRoot) throw new Error('[PDF export] .pdf-root element not found');

      const pdfOptions: PdfOptions = {
        margin: [14, 14, 14, 14],
        filename,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 794,
          onclone: (clonedDoc: Document) => {
            clonedDoc
              .querySelectorAll('head > link[rel="stylesheet"], head > style')
              .forEach(node => node.parentNode?.removeChild(node));
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      };

      try {
        await html2pdf().set(pdfOptions).from(pdfRoot).save();
      } catch (err) {
        console.error('[PDF export] html2pdf error:', err);
        setPdfError(true);
        setTimeout(() => setPdfError(false), 3000);
      }
    } finally {
      document.body.removeChild(container);
      setPdfLoading(false);
    }
  };

  return { pdfLoading, pdfError, downloadPDF };
}
