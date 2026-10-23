'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Tag } from '@/app/types/task';
import { formatLongDate, toLocalDateStr } from '@/app/utils/dateUtils';
import {
  PDF_CONTENT_WIDTH_PX, buildNotePdfMarkup, fitPdfImages, pdfFilename, preparePdfBody,
} from '@/app/components/notes/notePdfDocument';

interface UseNotePdfExportOptions {
  editor: Editor | null;
  title: string;
  /** Printed under the title. */
  tags?: Tag[];
  /** The note's last-updated ISO timestamp, printed under the title. */
  updatedDate?: string;
}

/**
 * Renders the current note into an off-screen styled container and exports
 * it to a downloaded PDF via html2pdf.js. Extracted out of NoteEditor.tsx —
 * this print pipeline (markup and fix-ups in notePdfDocument.ts) is a
 * self-contained concern unrelated to the rest of the editor's
 * concerns (title/content/tag autosave, the AI resources panel, etc).
 *
 * Callers are responsible for their own "note is empty" check before calling
 * downloadPDF() — this hook only renders whatever the editor currently holds.
 */
export function useNotePdfExport({ editor, title, tags, updatedDate }: UseNotePdfExportOptions) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const downloadPDF = async () => {
    if (!editor) return;

    setPdfLoading(true);

    await new Promise<void>(resolve => setTimeout(resolve, 50));

    const container = document.createElement('div');
    container.style.cssText =
      `position:absolute;top:0;left:-9999px;width:${PDF_CONTENT_WIDTH_PX}px;background:#ffffff;color:#1f2937;pointer-events:none;`;
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

      const filename = pdfFilename(title, toLocalDateStr(new Date()));
      const updated = updatedDate ? new Date(updatedDate) : null;
      const dateLabel = updated && !Number.isNaN(updated.getTime()) ? `Updated ${formatLongDate(updated)}` : undefined;

      container.innerHTML = buildNotePdfMarkup({ title, html: editor.getHTML(), tags, dateLabel });
      const pdfBody = container.querySelector('.pdf-body');
      if (pdfBody) {
        preparePdfBody(pdfBody);
        await fitPdfImages(pdfBody);
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
