import { describe, expect, it } from 'vitest';
import { pdfFilename } from './notePdfFilename';

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
