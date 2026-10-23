'use client';

import React from 'react';
import { CloudAlert, CloudCheck, Loader2 } from 'lucide-react';
import type { NoteSaveStatus as Status } from '@/app/hooks/useNoteAutosave';
import { RING_STYLE } from './EditorToolbar';

interface NoteSaveStatusProps {
  status: Status;
  savedAt: Date | null;
  onRetry: () => void;
}

const timeLabel = (date: Date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Where the Save button used to be: notes save on their own, so this says
 * whether the latest change is saved. A failed save turns amber ("Not saved")
 * and becomes the retry button. Ctrl+S still saves right away.
 */
const NoteSaveStatus: React.FC<NoteSaveStatusProps> = ({ status, savedAt, onRetry }) => (
  <div role="status" aria-live="polite" className="shrink-0">
    {status === 'error' ? (
      <button
        type="button"
        onClick={onRetry}
        title="Your last change didn't save. Click to try again."
        aria-label="Not saved. Try saving again"
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-1 transition-opacity hover:opacity-85"
        style={{ ...RING_STYLE, backgroundColor: 'var(--tm-upcoming-subtle)', color: 'var(--tm-upcoming-text)' }}
      >
        <CloudAlert className="w-3.5 h-3.5" aria-hidden="true" />
        Not saved
      </button>
    ) : (
      <span
        className="flex items-center gap-1.5 h-7 px-2 text-xs font-medium whitespace-nowrap"
        style={{ color: 'var(--tm-text-muted)' }}
        title={status === 'saving' ? 'Saving your changes' : savedAt ? `All changes saved at ${timeLabel(savedAt)}` : 'All changes saved'}
      >
        {status === 'saving'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          : <CloudCheck className="w-3.5 h-3.5" aria-hidden="true" />}
        {status === 'saving' ? 'Saving' : 'Saved'}
      </span>
    )}
  </div>
);

export default NoteSaveStatus;
