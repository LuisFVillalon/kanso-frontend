'use client';

/**
 * Settings → Term Tracker: the title/date-range editing, moved here from the
 * dashboard widget itself (BigPictureCalendar.tsx) — the compact tile now
 * just displays these read-only, and the overlay's "Range: … · edit in
 * Settings" line points here. The fields are controlled: SettingsModal
 * autosaves each one (via updateCalendarSettings) after a pause in typing.
 *
 * Below them, archiving: an archived term keeps showing on the month
 * calendars after it ends, and the tracker starts fresh for the next term.
 * It's optional — a term that isn't archived shows on the calendars only
 * while it's the current term. Archived terms are listed with a delete.
 */

import React, { useState } from 'react';
import { Archive, Loader2, Trash2 } from 'lucide-react';
import Modal from '@/app/components/common/Modal';
import { formatTermRange } from '@/app/lib/termPeriods';
import { ArchivedTerm, CalendarSettings } from '@/app/types/calendar';

export type TermTrackerDraft = Omit<CalendarSettings, 'id'>;

interface Props {
  value: TermTrackerDraft;
  onChange: <K extends keyof TermTrackerDraft>(key: K, value: TermTrackerDraft[K]) => void;
  loading: boolean;
  /** False until a term is saved, or while a date is cleared. */
  canArchive: boolean;
  /** Archives the current term. Rejects when it couldn't. */
  onArchive: () => Promise<void>;
  archivedTerms: ArchivedTerm[];
  /** Deletes an archived term for good. Rejects when it couldn't. */
  onDeleteArchived: (id: number) => Promise<void>;
  /** True while the archive confirm is open, so Escape closes only it. */
  onDialogChange: (open: boolean) => void;
}

const ArchiveTermConfirm: React.FC<{ term: TermTrackerDraft; onCancel: () => void; onConfirm: () => Promise<void> }> = ({ term, onCancel, onConfirm }) => {
  const [archiving, setArchiving] = useState(false);

  const handleConfirm = async () => {
    setArchiving(true);
    try {
      await onConfirm();
      onCancel();
    } catch {
      // The caller reports the failure; stay open so it can be tried again.
      setArchiving(false);
    }
  };

  return (
    <Modal onClose={onCancel} layer="top" panelClassName="modal-panel max-w-sm w-full p-6">
      <div role="alertdialog" aria-modal="true" aria-labelledby="archive-term-title" aria-describedby="archive-term-detail" className="space-y-4">
        <div className="text-center space-y-1">
          <p id="archive-term-title" className="text-text-primary">Archive {term.title || 'this term'}?</p>
          <p id="archive-term-detail" className="text-sm text-text-muted">
            {formatTermRange(term)} stays marked on your month calendars. The Term Tracker then starts fresh for your next term.
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={archiving} autoFocus className="btn btn-secondary flex-1 py-2">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={archiving} className="btn btn-primary flex-1 py-2 disabled:cursor-wait">
            {archiving && <Loader2 className="w-4 h-4 animate-spin" />}
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ArchivedTermRow: React.FC<{ term: ArchivedTerm; onDelete: (id: number) => Promise<void> }> = ({ term, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(term.id);
    } catch {
      // The caller reports the failure; the row stays.
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 border-b border-border-subtle last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{term.title}</p>
        <p className="text-xs text-text-muted">{formatTermRange(term)}</p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Delete for good?</span>
          <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="btn btn-secondary px-2.5 py-1 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="btn text-white px-2.5 py-1 text-xs disabled:cursor-wait"
            style={{ backgroundColor: 'var(--tm-danger)' }}
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${term.title}`}
          title="Delete"
          className="btn btn-ghost p-1.5 text-text-muted hover:text-text-primary"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
};

const BigPictureSettingsSection: React.FC<Props> = ({
  value, onChange, loading, canArchive, onArchive, archivedTerms, onDeleteArchived, onDialogChange,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openConfirm = () => { setConfirmOpen(true); onDialogChange(true); };
  const closeConfirm = () => { setConfirmOpen(false); onDialogChange(false); };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label htmlFor="term-title" className="block text-xs font-medium text-text-muted mb-1">Name</label>
          <input
            id="term-title"
            type="text"
            value={value.title}
            onChange={e => onChange('title', e.target.value)}
            disabled={loading}
            className="input-field w-full text-sm disabled:opacity-60"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="term-start-date" className="block text-xs font-medium text-text-muted mb-1">Start date</label>
            <input
              id="term-start-date"
              type="date"
              value={value.start_date}
              onChange={e => onChange('start_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="term-end-date" className="block text-xs font-medium text-text-muted mb-1">End date</label>
            <input
              id="term-end-date"
              type="date"
              value={value.end_date}
              onChange={e => onChange('end_date', e.target.value)}
              disabled={loading}
              className="input-field w-full text-sm disabled:opacity-60"
            />
          </div>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>
        Shown in the Term Tracker on your dashboard, counting down to the end date, and marked on your month calendars.
      </p>

      <div className="pt-4 border-t border-border-subtle space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className="text-sm font-medium text-text-primary">Archive this term</h3>
          <button
            type="button"
            onClick={openConfirm}
            disabled={loading || !canArchive}
            className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
          >
            <Archive className="w-4 h-4" />
            Archive term
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Optional. An archived term stays marked on your month calendars after it ends, and the tracker starts fresh.
          A term you don&apos;t archive shows on the calendars only while it&apos;s your current term.
        </p>
      </div>

      {archivedTerms.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-text-primary">Archived terms</h3>
          <ul aria-label="Archived terms">
            {archivedTerms.map(term => (
              <ArchivedTermRow key={term.id} term={term} onDelete={onDeleteArchived} />
            ))}
          </ul>
        </div>
      )}

      {confirmOpen && <ArchiveTermConfirm term={value} onCancel={closeConfirm} onConfirm={onArchive} />}
    </div>
  );
};

export default BigPictureSettingsSection;
