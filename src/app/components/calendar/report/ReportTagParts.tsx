'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useShortWindow } from './ReportMoodRelationChart';

// Pieces the Tags & moments card's charts share.

export const Swatch: React.FC<{ style: React.CSSProperties; label: React.ReactNode }> = ({ style, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
    <span className="w-3 h-2.5 shrink-0 rounded-sm" style={style} aria-hidden="true" />
    {label}
  </span>
);

/** Stripes in `color` for a bar with too few days to tell. */
export const hatchFill = (color: string): string => `repeating-linear-gradient(45deg, ${color} 0 1.5px, var(--tm-surface) 1.5px 4px)`;

export const HATCH_SWATCH: React.CSSProperties = {
  background: 'repeating-linear-gradient(45deg, var(--tm-pencil) 0 2px, var(--tm-surface) 2px 4px)',
  border: '1px solid var(--tm-pencil)',
};

export const Notice: React.FC<{ children: React.ReactNode; action?: { label: string; onClick: () => void } }> = ({ children, action }) => (
  <div className="rounded-lg p-3 flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface-raised">
    <p className="text-xs sm:text-sm text-text-secondary flex-1 min-w-48">{children}</p>
    {action && (
      <button type="button" onClick={action.onClick} className="btn btn-secondary py-1 px-3 text-xs">
        {action.label}
      </button>
    )}
  </div>
);

/** A footnote that's folded on a narrow card or a short window, so the chart keeps the room. */
export const Footnote: React.FC<{ wide: boolean; children: React.ReactNode }> = ({ wide, children }) => {
  const short = useShortWindow();
  return wide && !short ? (
    <p className="text-[11px] text-text-muted mt-auto">{children}</p>
  ) : (
    <details className="group mt-auto text-[11px] text-text-muted">
      <summary className="inline-flex items-center gap-1 font-medium text-accent cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        About these numbers
      </summary>
      <p className="mt-1.5 pl-4 leading-relaxed">{children}</p>
    </details>
  );
};
