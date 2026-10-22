import React from 'react';
import { MOOD_LABELS } from '@/app/types/mood';

// Mouth per mood, from a frown (1) to an open smile (5).
const MOUTHS: Record<number, string> = {
  1: 'M8 16.6 Q12 12.6 16 16.6',
  2: 'M8.4 16 Q12 14.2 15.6 16',
  3: 'M8.5 15.3 H15.5',
  4: 'M8 14.2 Q12 18 16 14.2',
  5: 'M7.6 13.4 Q12 19.6 16.4 13.4 Z',
};

/** A line-drawn face for mood 1–5, in currentColor; `filled` tints it for the picked state. */
export const MoodFace: React.FC<{ mood: number; filled?: boolean; className?: string }> = ({ mood, filled = false, className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="12" cy="12" r="10" {...(filled ? { fill: 'currentColor', fillOpacity: 0.14 } : {})} />
    <circle cx="9" cy="9.6" r="0.6" fill="currentColor" />
    <circle cx="15" cy="9.6" r="0.6" fill="currentColor" />
    <path d={MOUTHS[mood]} {...(mood === 5 ? { fill: 'currentColor', fillOpacity: 0.9 } : {})} />
  </svg>
);

export const moodColor = (mood: number) => `var(--tm-mood-${mood})`;

interface Props {
  value: number | null;
  onChange: (mood: number) => void;
  /** The radiogroup's accessible name — the question being answered. */
  label: string;
  className?: string;
}

/** The five faces, Rough to Great, as a radiogroup. */
const MoodFacePicker: React.FC<Props> = ({ value, onChange, label, className = '' }) => (
  <div role="radiogroup" aria-label={label} className={`flex gap-1 ${className}`}>
    {MOOD_LABELS.map((name, i) => {
      const mood = i + 1;
      const checked = value === mood;
      return (
        <button
          key={mood}
          type="button"
          role="radio"
          aria-checked={checked}
          aria-label={name}
          onClick={() => onChange(mood)}
          className="mood-face"
          style={{ '--mood-color': moodColor(mood) } as React.CSSProperties}
        >
          <MoodFace mood={mood} filled={checked} />
          <span>{name}</span>
        </button>
      );
    })}
  </div>
);

export default MoodFacePicker;
