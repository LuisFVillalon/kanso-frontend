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
 *
 * Between them, what happens when the term ends: the next term can be set
 * up ahead of time (it takes over the tracker once this one has ended), and
 * a switch archives this term automatically then. A term the next one
 * replaced without being archived is offered for archiving here.
 */

import React, { useState } from 'react';
import { Archive, CalendarPlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import Modal from '@/app/components/common/Modal';
import { formatTermRange } from '@/app/lib/termPeriods';
import { ArchivedTerm, CalendarSettings, TermDates, TermRollover } from '@/app/types/calendar';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';

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
  /** The next term and auto-archive switch; null until they load, or when they couldn't. */
  rollover: TermRollover | null;
  /** False until a term is saved: the next term needs a current one to follow. */
  hasCurrentTerm: boolean;
  /** Queues (or replaces) the next term. Rejects when it couldn't. */
  onSaveNextTerm: (term: TermDates) => Promise<void>;
  /** Removes the queued next term. Rejects when it couldn't. */
  onRemoveNextTerm: () => Promise<void>;
  /** Turns archiving this term automatically when it ends on or off. Rejects when it couldn't. */
  onAutoArchiveChange: (on: boolean) => Promise<void>;
  /** Archives the ended term the next term replaced. Rejects when it couldn't. */
  onArchiveEnded: () => Promise<void>;
  /** Drops the ended term the next term replaced, without archiving it. Rejects when it couldn't. */
  onDropEnded: () => Promise<void>;
}

/** "Jan 19, 2027" */
const formatDay = (dateStr: string) =>
  parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** The day after `dateStr`, or '' when it's empty. */
const dayAfter = (dateStr: string) => {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
};

/** Why `term` can't be the next term after one ending on `currentEnd`, or null when it can. */
export function nextTermProblem(term: TermDates, currentEnd: string): string | null {
  if (!term.title.trim()) return 'Give the next term a name.';
  if (!term.start_date || !term.end_date) return 'Pick a start and an end date.';
  if (term.end_date <= term.start_date) return 'The end date must be after the start date.';
  if (currentEnd && term.start_date <= currentEnd) return `It must start after this term ends (${formatDay(currentEnd)}).`;
  return null;
}

const NextTermForm: React.FC<{
  initial: TermDates;
  currentEnd: string;
  onCancel: () => void;
  onSave: (term: TermDates) => Promise<void>;
}> = ({ initial, currentEnd, onCancel, onSave }) => {
  const [term, setTerm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const problem = nextTermProblem(term, currentEnd);
  const change = (key: keyof TermDates) => (e: React.ChangeEvent<HTMLInputElement>) => setTerm(t => ({ ...t, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problem) return;
    setSaving(true);
    try {
      await onSave({ ...term, title: term.title.trim() });
    } catch {
      // The caller reports the failure; keep the form so it can be tried again.
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Next term" className="space-y-3 pl-4 border-l-2 border-border-subtle">
      <div>
        <label htmlFor="next-term-title" className="block text-xs font-medium text-text-muted mb-1">Name</label>
        <input
          id="next-term-title"
          type="text"
          value={term.title}
          onChange={change('title')}
          placeholder="Spring 2027"
          maxLength={500}
          autoFocus
          className="input-field w-full text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="next-term-start-date" className="block text-xs font-medium text-text-muted mb-1">Start date</label>
          <input id="next-term-start-date" type="date" value={term.start_date} onChange={change('start_date')} className="input-field w-full text-sm" />
        </div>
        <div>
          <label htmlFor="next-term-end-date" className="block text-xs font-medium text-text-muted mb-1">End date</label>
          <input id="next-term-end-date" type="date" value={term.end_date} onChange={change('end_date')} className="input-field w-full text-sm" />
        </div>
      </div>
      {tried && problem && <p role="alert" className="text-xs" style={{ color: 'var(--tm-danger)' }}>{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary px-3 py-1.5 text-sm disabled:cursor-wait">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save next term'}
        </button>
      </div>
    </form>
  );
};

const NextTermSection: React.FC<{
  next: TermDates | null;
  available: boolean;
  hasCurrentTerm: boolean;
  currentEnd: string;
  onSave: (term: TermDates) => Promise<void>;
  onRemove: () => Promise<void>;
}> = ({ next, available, hasCurrentTerm, currentEnd, onSave, onRemove }) => {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleSave = async (term: TermDates) => {
    await onSave(term);
    setEditing(false);
  };
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
    } catch {
      // The caller reports the failure; the queued term stays.
    }
    setRemoving(false);
    setConfirmingRemove(false);
  };

  let body: React.ReactNode;
  if (!hasCurrentTerm) {
    body = <p className="text-xs text-text-muted">Save this term first, then set up the one after it.</p>;
  } else if (editing) {
    body = (
      <NextTermForm
        initial={next ?? { title: '', start_date: dayAfter(currentEnd), end_date: '' }}
        currentEnd={currentEnd}
        onCancel={() => setEditing(false)}
        onSave={handleSave}
      />
    );
  } else if (next) {
    body = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-subtle px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary truncate">{next.title}</p>
          <p className="text-xs text-text-muted">Starts {formatDay(next.start_date)} · ends {formatDay(next.end_date)}</p>
        </div>
        {confirmingRemove ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Remove it?</span>
            <button type="button" onClick={() => setConfirmingRemove(false)} disabled={removing} className="btn btn-secondary px-2.5 py-1 text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="btn text-white px-2.5 py-1 text-xs disabled:cursor-wait"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {removing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${next.title}`}
              title="Edit"
              className="btn btn-ghost p-1.5 text-text-muted hover:text-text-primary"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              aria-label={`Remove ${next.title}`}
              title="Remove"
              className="btn btn-ghost p-1.5 text-text-muted hover:text-text-primary"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={!available}
        className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
      >
        <CalendarPlus className="w-4 h-4" />
        Set up next term
      </button>
    );
  }

  return (
    <div className="pt-4 border-t border-border-subtle space-y-2">
      <h3 className="text-sm font-medium text-text-primary">Next term</h3>
      <p className="text-xs text-text-muted">
        Set it up ahead of time and it takes over the Term Tracker as soon as this term ends.
      </p>
      {body}
    </div>
  );
};

const EndedTermNotice: React.FC<{ term: TermDates; onArchive: () => Promise<void>; onDrop: () => Promise<void> }> = ({ term, onArchive, onDrop }) => {
  const [busy, setBusy] = useState<'archive' | 'drop' | null>(null);
  const run = (which: 'archive' | 'drop', action: () => Promise<void>) => async () => {
    setBusy(which);
    try {
      await action();
    } catch {
      // The caller reports the failure; the notice stays.
      setBusy(null);
    }
  };

  return (
    <div role="status" className="rounded-lg border border-border-subtle px-3 py-2.5 space-y-2">
      <div>
        <p className="text-sm text-text-primary">{term.title} has ended</p>
        <p className="text-xs text-text-muted">
          {formatTermRange(term)}. Archive it to keep it marked on your month calendars, or let it go.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={run('drop', onDrop)} disabled={busy !== null} className="btn btn-secondary px-3 py-1.5 text-sm">
          {busy === 'drop' && <Loader2 className="w-4 h-4 animate-spin" />}
          Don&apos;t keep it
        </button>
        <button type="button" onClick={run('archive', onArchive)} disabled={busy !== null} className="btn btn-primary px-3 py-1.5 text-sm">
          {busy === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
          Archive it
        </button>
      </div>
    </div>
  );
};

const AutoArchiveSwitch: React.FC<{ on: boolean; disabled: boolean; onChange: (on: boolean) => Promise<void> }> = ({ on, disabled, onChange }) => {
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    setSaving(true);
    try {
      await onChange(!on);
    } catch {
      // The caller reports the failure; the switch stays as it was.
    }
    setSaving(false);
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id="term-auto-archive-label" className="text-sm font-medium text-text-primary">Archive this term automatically when it ends</p>
        <p className="text-xs text-text-muted">Archived terms still show on your month calendars.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="term-auto-archive-label"
        onClick={toggle}
        disabled={disabled || saving}
        className="relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-40"
        style={{ backgroundColor: on ? 'var(--tm-accent)' : 'var(--tm-border)' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(1rem)' : 'none', boxShadow: 'var(--tm-shadow-sm)' }}
        />
      </button>
    </div>
  );
};

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
  rollover, hasCurrentTerm, onSaveNextTerm, onRemoveNextTerm, onAutoArchiveChange, onArchiveEnded, onDropEnded,
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

      {rollover?.ended_term && (
        <EndedTermNotice term={rollover.ended_term} onArchive={onArchiveEnded} onDrop={onDropEnded} />
      )}

      <NextTermSection
        next={rollover?.next_term ?? null}
        available={!loading && rollover !== null}
        hasCurrentTerm={hasCurrentTerm}
        currentEnd={value.end_date}
        onSave={onSaveNextTerm}
        onRemove={onRemoveNextTerm}
      />

      <div className="pt-4 border-t border-border-subtle space-y-4">
        <AutoArchiveSwitch
          on={rollover?.auto_archive ?? false}
          disabled={loading || rollover === null}
          onChange={onAutoArchiveChange}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 className="text-sm font-medium text-text-primary">Archive this term now</h3>
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
