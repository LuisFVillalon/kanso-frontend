'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Tag } from '@/app/types/task';
import { formatLongDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { pdfFilename } from '@/app/components/notes/notePdfFilename';

interface UseNotePdfExportOptions {
  editor: Editor | null;
  title: string;
  /** Printed under the title. */
  tags?: Tag[];
  /** The note's last-updated ISO timestamp, printed under the title. */
  updatedDate?: string;
}

/**
 * Exports the current note to a downloaded PDF with real, selectable text in
 * kanso's fonts. Extracted out of NoteEditor.tsx — the document itself is in
 * notePdfDocument.tsx, and it and @react-pdf/renderer load only on export.
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
    try {
      const { exportNotePdf, saveBlob } = await import('@/app/components/notes/notePdfExport');
      const updated = updatedDate ? new Date(updatedDate) : null;
      const dateLabel = updated && !Number.isNaN(updated.getTime()) ? `Updated ${formatLongDate(updated)}` : undefined;

      const blob = await exportNotePdf({ title, doc: editor.getJSON(), tags, dateLabel });
      saveBlob(blob, pdfFilename(title, toLocalDateStr(new Date())));
    } catch (err) {
      console.error('[PDF export] error:', err);
      setPdfError(true);
      setTimeout(() => setPdfError(false), 3000);
    } finally {
      setPdfLoading(false);
    }
  };

  return { pdfLoading, pdfError, downloadPDF };
}
