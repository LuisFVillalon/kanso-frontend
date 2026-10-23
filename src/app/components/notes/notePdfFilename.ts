// Kept apart from notePdfDocument.tsx so naming the file doesn't load the PDF renderer.

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
