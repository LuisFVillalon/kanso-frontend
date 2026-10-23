'use client';

import React, { useEffect, useRef } from 'react';

export interface NoteStats {
  words: number;
  characters: number;
  /** Seconds spent in the note, past visits plus this one. */
  timeSpentSeconds: number;
  savedAt: Date | null;
}

/** Average silent-reading speed used for "Reading time". */
const WORDS_PER_MINUTE = 200;

/** "Under a minute", "8 min", "1 h 12 min". */
export function formatTimeSpent(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const readingMinutes = (words: number) => (words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)));

interface NoteDetailsProps {
  stats: NoteStats;
  onClose: () => void;
}

/**
 * Words, characters, reading time, time spent in the note and when it last
 * saved. Opens under the toolbar's right-hand items, from the word count or
 * the More menu; closes on Escape or a click elsewhere.
 */
const NoteDetails: React.FC<NoteDetailsProps> = ({ stats, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (panelRef.current?.contains(target) || target.closest?.('[data-note-details-trigger]')) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const minutes = readingMinutes(stats.words);
  const rows: [string, string][] = [
    ['Words', stats.words.toLocaleString()],
    ['Characters', stats.characters.toLocaleString()],
    ['Reading time', minutes === 0 ? '—' : `${minutes} min`],
    ['Time in this note', formatTimeSpent(stats.timeSpentSeconds)],
    ['Last saved', stats.savedAt ? stats.savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'],
  ];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Note details"
      tabIndex={-1}
      className="absolute top-full right-0 mt-1.5 z-50 w-60 rounded-lg px-3.5 py-3 outline-none"
      style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow-md)' }}
    >
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt style={{ color: 'var(--tm-text-muted)' }}>{label}</dt>
            <dd className="font-medium" style={{ color: 'var(--tm-text-primary)' }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default NoteDetails;
