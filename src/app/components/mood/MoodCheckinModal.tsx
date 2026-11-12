'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarRange, Check, CircleCheck, Clock, Loader2, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react';
import Modal, { type ModalLayer } from '@/app/components/common/Modal';
import MoodFacePicker from '@/app/components/mood/MoodFacePicker';
import { deleteMoodTag, describeError, fetchMoodTags, renameMoodTag, saveMoodCheckin } from '@/app/lib/backend-api';
import {
  DEFAULT_MOOD_TAGS,
  ENERGY_LABELS,
  MOOD_HIGHLIGHT_MAX,
  MOOD_NOTE_MAX,
  MOOD_TAG_MAX,
  MOOD_TAGS_PER_CHECKIN_MAX,
  MOOD_WORD_MAX,
  PROGRESS_LABELS,
  STRESS_LABELS,
  WORKLOAD_LABELS,
  moodLabel,
  type MoodCheckin,
  type MoodCheckinSave,
  type MoodPeriodKind,
} from '@/app/types/mood';
import { periodContaining } from '@/app/utils/calendarReport';
import { formatDateRange, formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import { announceMoodCheckin } from '@/app/utils/moodCheckinSync';

/** What the user already did that day, shown above the faces so they reflect rather than guess. */
export interface DaySummary {
  tasksDone: number;
  /** Null until the day's note time has loaded. */
  noteSeconds: number | null;
  habitsDone: number;
  habitsTotal: number;
}

/** What the days of a week or month added up to, shown above the faces of its check-in. */
export interface PeriodSummary {
  /** Mean mood of the days with a daily check-in, null when none has one. */
  average: number | null;
  logged: number;
  days: number;
  /** Null when not known. */
  tasksDone: number | null;
}

interface Props {
  /** A day's check-in (the default), or a week's or month's. */
  kind?: MoodPeriodKind;
  /** The local day being checked in, or any day of the week or month. */
  date: Date;
  /** The period's saved check-in, when editing one. */
  existing: MoodCheckin | null;
  /** A day check-in's context strip. */
  summary?: DaySummary | null;
  /** A week or month check-in's context strip, and its suggested mood. */
  periodSummary?: PeriodSummary | null;
  onClose: () => void;
  onSaved: (saved: MoodCheckin, previous: MoodCheckin | null) => void;
  /** Its z-index tier: above the modal it was opened from, if any. */
  layer?: ModalLayer;
}

const sameTag = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** `list` with `from` renamed to `to` (or dropped, for null), keeping one of each moment. */
const replaceTag = (list: string[], from: string, to: string | null): string[] =>
  list
    .flatMap(t => (sameTag(t, from) ? (to == null ? [] : [to]) : [t]))
    .filter((t, i, all) => all.findIndex(o => sameTag(o, t)) === i);

/**
 * One row of a scale: energy, stress or progress from 1, workload from 0
 * (`first`). Picking the chosen value again clears it.
 */
const ScalePicker: React.FC<{
  labels: readonly string[];
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  first?: number;
}> = ({ labels, value, onChange, label, first = 1 }) => (
  <div role="radiogroup" aria-label={label} className="mood-scale">
    {labels.map((name, i) => (
      <button
        key={name}
        type="button"
        role="radio"
        aria-checked={value === i + first}
        onClick={() => onChange(value === i + first ? null : i + first)}
        title={name}
      >
        {name}
      </button>
    ))}
  </div>
);

const Dot = () => <span aria-hidden="true" className="opacity-40">·</span>;

const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-text-secondary mb-1.5">
    <span>{children}</span>
    <span className="text-[11px] font-normal text-text-muted">optional</span>
  </label>
);

/**
 * A mood check-in: a mood from five faces (the only required field), then
 * optional fields by kind —
 * - day: energy, stress, moments (mood tags in the API: their own list, suggested by
 *   GET /get-mood-tags) and a note;
 * - week: workload felt, the best part of the week and moments;
 * - month: progress on what matters, the month in one word and a note.
 * A week or month opens with how its days went and a suggested mood, which
 * is never picked for the user. Saving replaces the period's whole check-in,
 * keyed by its first day: the Monday of the week, the 1st of the month.
 */
const MoodCheckinModal: React.FC<Props> = ({
  kind = 'day',
  date,
  existing,
  summary,
  periodSummary,
  onClose,
  onSaved,
  layer,
}) => {
  const editing = existing != null;
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [workload, setWorkload] = useState<number | null>(existing?.workload ?? null);
  const [highlight, setHighlight] = useState(existing?.highlight ?? '');
  const [progress, setProgress] = useState<number | null>(existing?.progress ?? null);
  const [word, setWord] = useState(existing?.word ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_MOOD_TAGS);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Renaming or deleting a moment changes every check-in carrying it, the open one included.
  const [baseline, setBaseline] = useState<MoodCheckin | null>(existing);
  const [editingMoment, setEditingMoment] = useState<string | null>(null);
  const [momentName, setMomentName] = useState('');
  const [deletingMoment, setDeletingMoment] = useState<string | null>(null);
  const [momentBusy, setMomentBusy] = useState(false);
  const [momentError, setMomentError] = useState<string | null>(null);
  // Touch screens have no hover, so they show every moment's Edit and Delete behind this toggle.
  const [managingMoments, setManagingMoments] = useState(false);

  const showsTags = kind !== 'month';
  useEffect(() => {
    if (!showsTags) return;
    let cancelled = false;
    fetchMoodTags()
      .then(({ defaults, custom }) => { if (!cancelled) setSuggestions([...defaults, ...custom]); })
      .catch(() => {}); // keep the built-in list
    return () => { cancelled = true; };
  }, [showsTags]);

  // Tags on the check-in that aren't suggested (e.g. a custom tag since renamed) still show.
  const tagOptions = [...suggestions, ...tags.filter(t => !suggestions.some(s => sameTag(s, t)))];
  const atTagLimit = tags.length >= MOOD_TAGS_PER_CHECKIN_MAX;

  const toggleTag = (tag: string) => {
    setTags(prev => (prev.some(t => sameTag(t, tag))
      ? prev.filter(t => !sameTag(t, tag))
      : prev.length < MOOD_TAGS_PER_CHECKIN_MAX ? [...prev, tag] : prev));
  };

  const commitNewTag = () => {
    const name = newTag.trim();
    if (name && !tags.some(t => sameTag(t, name)) && !atTagLimit) {
      setTags(prev => [...prev, name]);
      if (!suggestions.some(s => sameTag(s, name))) setSuggestions(prev => [...prev, name]);
    }
    setNewTag('');
    setAddingTag(false);
  };

  /** After a moment is renamed or deleted on the server, the picker, this form and the open check-in follow. */
  const applyMomentChange = (from: string, to: string | null) => {
    setSuggestions(prev => replaceTag(prev, from, to));
    setTags(prev => replaceTag(prev, from, to));
    if (baseline?.tags.some(t => sameTag(t, from))) {
      const row = { ...baseline, tags: replaceTag(baseline.tags, from, to) };
      setBaseline(row);
      announceMoodCheckin({ kind: row.period_kind, start: row.period_start, row });
    }
  };

  const startEditingMoment = (tag: string) => {
    setDeletingMoment(null);
    setMomentError(null);
    setEditingMoment(tag);
    setMomentName(tag);
  };

  const cancelMomentEdit = () => {
    setEditingMoment(null);
    setMomentError(null);
  };

  const cancelMomentDelete = () => {
    setDeletingMoment(null);
    setMomentError(null);
  };

  const saveMomentEdit = async () => {
    const from = editingMoment;
    const to = momentName.trim();
    if (from == null || !to || momentBusy) return;
    if (to === from) { cancelMomentEdit(); return; }
    setMomentBusy(true);
    setMomentError(null);
    try {
      await renameMoodTag(from, to);
      applyMomentChange(from, to);
      setEditingMoment(null);
    } catch (err) {
      setMomentError(describeError(err, "Couldn't rename that moment. Please try again."));
    } finally {
      setMomentBusy(false);
    }
  };

  const confirmMomentDelete = async () => {
    const tag = deletingMoment;
    if (tag == null || momentBusy) return;
    setMomentBusy(true);
    setMomentError(null);
    try {
      await deleteMoodTag(tag);
      applyMomentChange(tag, null);
      setDeletingMoment(null);
    } catch (err) {
      setMomentError(describeError(err, "Couldn't delete that moment. Please try again."));
    } finally {
      setMomentBusy(false);
    }
  };

  const period = kind === 'day' ? null : periodContaining(kind, date);
  const monthName = date.toLocaleDateString('en-US', { month: 'long' });
  const isToday = toLocalDateStr(date) === toLocalDateStr(new Date());
  const question = kind === 'week'
    ? 'How was your week overall?'
    : kind === 'month'
      ? `How was ${monthName}?`
      : isToday ? 'How was today?' : `How was ${date.toLocaleDateString('en-US', { weekday: 'long' })}?`;
  const name = kind === 'week' ? 'weekly check-in' : kind === 'month' ? 'monthly check-in' : 'check-in';
  const title = kind !== 'day'
    ? (editing ? `Edit ${name}` : `${name[0].toUpperCase()}${name.slice(1)}`)
    : editing
      ? `Edit check-in · ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
      : 'Daily check-in';
  const subtitle = period && kind === 'week'
    ? `Week of ${formatDateRange(period.start, period.end)}`
    : kind === 'month'
      ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const suggested = periodSummary?.average != null ? Math.round(periodSummary.average) : null;

  const handleSave = async () => {
    if (mood == null || busy || momentBusy) return;
    setBusy(true);
    setError(null);
    // Saving replaces the whole check-in, so a field this form doesn't show keeps its saved value.
    const body: MoodCheckinSave = kind === 'week'
      ? { period_kind: 'week', period_start: toLocalDateStr(period!.start), mood, workload, highlight: highlight.trim() || null, tags, note: baseline?.note ?? null }
      : kind === 'month'
        ? { period_kind: 'month', period_start: toLocalDateStr(period!.start), mood, progress, word: word.trim() || null, note: note.trim() || null, tags: baseline?.tags ?? [] }
        : { period_kind: 'day', period_start: toLocalDateStr(date), mood, energy, stress, tags, note: note.trim() || null };
    try {
      const saved = await saveMoodCheckin(body);
      onSaved(saved, baseline);
    } catch (err) {
      setError(describeError(err, "Couldn't save your check-in. Please try again."));
      setBusy(false);
    }
  };

  // Keys 1–5 pick a face, except while typing.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (/^[1-5]$/.test(e.key)) setMood(Number(e.key));
  };

  return (
    <Modal onClose={onClose} layer={layer} panelClassName="modal-panel w-full max-w-md max-h-[92vh] overflow-y-auto scrollbar-custom">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-checkin-title"
        onKeyDown={handleKeyDown}
        className="outline-none"
      >
        <div className="px-5 py-4 border-b border-border-subtle flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 id="mood-checkin-title" className="text-lg font-semibold text-text-primary leading-tight">{title}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {subtitle} · about {kind === 'day' ? 20 : 15} seconds
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" aria-label="Close">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {kind === 'day' && summary && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary px-3 py-2 rounded-lg bg-surface-raised">
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                {summary.tasksDone} {summary.tasksDone === 1 ? 'task' : 'tasks'} done
              </span>
              {summary.noteSeconds != null && (
                <>
                  <Dot />
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-accent-2" aria-hidden="true" />
                    {summary.noteSeconds > 0 ? formatDurationShort(summary.noteSeconds) : '0m'} in notes
                  </span>
                </>
              )}
              {summary.habitsTotal > 0 && (
                <>
                  <Dot />
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                    {summary.habitsDone} of {summary.habitsTotal} habits
                  </span>
                </>
              )}
            </p>
          )}

          {kind !== 'day' && periodSummary && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary px-3 py-2 rounded-lg bg-surface-raised">
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                {periodSummary.average != null ? (
                  <span>
                    {kind === 'week' ? 'Your days' : monthName} averaged{' '}
                    <b className="font-semibold text-text-primary">{moodLabel(Math.round(periodSummary.average))} ({periodSummary.average.toFixed(1)})</b>
                  </span>
                ) : (
                  'No daily check-ins yet'
                )}
              </span>
              <Dot />
              <span>{periodSummary.logged} of {periodSummary.days} {periodSummary.days === 1 ? 'day' : 'days'} logged</span>
              {periodSummary.tasksDone != null && (
                <>
                  <Dot />
                  <span>{periodSummary.tasksDone} {periodSummary.tasksDone === 1 ? 'task' : 'tasks'}</span>
                </>
              )}
            </p>
          )}

          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">{question}</p>
            <MoodFacePicker value={mood} onChange={setMood} label={question} />
            {suggested != null && mood == null && (
              <p className="text-[11px] text-text-muted mt-1.5">
                Suggested from your days:{' '}
                <button type="button" onClick={() => setMood(suggested)} className="font-semibold text-accent hover:underline">
                  {moodLabel(suggested)}
                </button>
              </p>
            )}
          </div>

          {kind === 'day' && (
            <>
              <div>
                <FieldLabel>Energy</FieldLabel>
                <ScalePicker labels={ENERGY_LABELS} value={energy} onChange={setEnergy} label="Energy" />
              </div>

              <div>
                <FieldLabel>Stress</FieldLabel>
                <ScalePicker labels={STRESS_LABELS} value={stress} onChange={setStress} label="Stress" />
              </div>
            </>
          )}

          {kind === 'week' && (
            <>
              <div>
                <FieldLabel>Workload felt</FieldLabel>
                <ScalePicker labels={WORKLOAD_LABELS} value={workload} onChange={setWorkload} label="Workload felt" first={0} />
              </div>

              <div>
                <FieldLabel htmlFor="mood-checkin-highlight">Best part of the week</FieldLabel>
                <input
                  id="mood-checkin-highlight"
                  value={highlight}
                  onChange={e => setHighlight(e.target.value)}
                  maxLength={MOOD_HIGHLIGHT_MAX}
                  placeholder="e.g. Finished the project proposal"
                  className="input-field text-sm"
                />
              </div>
            </>
          )}

          {kind === 'month' && (
            <>
              <div>
                <FieldLabel>Progress on what matters to you</FieldLabel>
                <ScalePicker labels={PROGRESS_LABELS} value={progress} onChange={setProgress} label="Progress on what matters to you" />
              </div>

              <div>
                <FieldLabel htmlFor="mood-checkin-word">{monthName} in one word</FieldLabel>
                <input
                  id="mood-checkin-word"
                  value={word}
                  onChange={e => setWord(e.target.value)}
                  maxLength={MOOD_WORD_MAX}
                  placeholder="e.g. Momentum"
                  className="input-field text-sm"
                />
              </div>
            </>
          )}

          {showsTags && (
            <div>
              <FieldLabel>{kind === 'day' ? 'What was part of today?' : 'What was part of this week?'}</FieldLabel>
              <p className="text-[11px] text-text-muted -mt-1 mb-1.5">Pick your moments</p>
              <div role="group" aria-label="Moments" className={`mood-moments flex flex-wrap ${managingMoments ? 'is-managing gap-x-3.5 gap-y-3 pt-1' : 'gap-1.5'}`}>
                {tagOptions.map(tag => {
                  const selected = tags.some(t => sameTag(t, tag));
                  if (editingMoment != null && sameTag(editingMoment, tag)) {
                    return (
                      <span key={tag} className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={momentName}
                          maxLength={MOOD_TAG_MAX}
                          disabled={momentBusy}
                          onChange={e => setMomentName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); saveMomentEdit(); }
                            if (e.key === 'Escape') {
                              // Cancel just the rename: Modal closes on a document-level Escape.
                              e.nativeEvent.stopImmediatePropagation();
                              cancelMomentEdit();
                            }
                          }}
                          aria-label={`Rename moment ${tag}`}
                          className="input-field text-xs py-1 px-3 w-32 rounded-full"
                        />
                        <button
                          type="button"
                          onClick={saveMomentEdit}
                          disabled={!momentName.trim() || momentBusy}
                          aria-label="Save moment"
                          title="Save"
                          className="btn btn-ghost p-1 text-accent disabled:opacity-50"
                        >
                          {momentBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={cancelMomentEdit}
                          disabled={momentBusy}
                          aria-label="Cancel renaming"
                          title="Cancel"
                          className="btn btn-ghost p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  }
                  return (
                    <span key={tag} className="mood-moment relative inline-flex">
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && atTagLimit}
                        onClick={() => toggleTag(tag)}
                        className="chip mood-tag disabled:opacity-50"
                      >
                        {tag}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditingMoment(tag)}
                        disabled={momentBusy}
                        aria-label={`Edit moment ${tag}`}
                        title="Edit moment"
                        className="mood-moment-action -left-1.5 text-[var(--tm-accent-text)]"
                        style={{ backgroundColor: 'var(--tm-accent)' }}
                      >
                        <Pencil className="w-2.5 h-2.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { cancelMomentEdit(); setDeletingMoment(tag); }}
                        disabled={momentBusy}
                        aria-label={`Delete moment ${tag}`}
                        title="Delete moment"
                        className="mood-moment-action -right-1.5 text-white"
                        style={{ backgroundColor: 'var(--tm-danger)' }}
                      >
                        <Trash2 className="w-2.5 h-2.5" aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
                {addingTag ? (
                  <input
                    autoFocus
                    value={newTag}
                    maxLength={MOOD_TAG_MAX}
                    onChange={e => setNewTag(e.target.value)}
                    onBlur={commitNewTag}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitNewTag(); }
                      if (e.key === 'Escape') {
                        // Cancel just the new moment: Modal closes on a document-level Escape.
                        e.nativeEvent.stopImmediatePropagation();
                        setNewTag('');
                        setAddingTag(false);
                      }
                    }}
                    aria-label="New moment"
                    placeholder="New moment"
                    className="input-field text-xs py-1 px-3 w-32 rounded-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTag(true)}
                    disabled={atTagLimit}
                    className="chip mood-tag border-dashed disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    Moment
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setManagingMoments(on => !on)}
                  className="mood-moments-manage chip mood-tag"
                >
                  {managingMoments ? 'Done' : 'Edit moments'}
                </button>
              </div>
              {deletingMoment != null && (
                <div
                  role="alertdialog"
                  aria-labelledby="mood-moment-delete-text"
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      // Cancel just the delete: Modal closes on a document-level Escape.
                      e.nativeEvent.stopImmediatePropagation();
                      cancelMomentDelete();
                    }
                  }}
                  className="mt-2 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-xs"
                >
                  <p id="mood-moment-delete-text" className="text-text-secondary">
                    Delete <b className="font-semibold text-text-primary">{deletingMoment}</b>? It comes off all your past check-ins and out of this list.
                  </p>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      autoFocus
                      onClick={cancelMomentDelete}
                      disabled={momentBusy}
                      className="btn btn-secondary text-xs px-2.5 py-1"
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      onClick={confirmMomentDelete}
                      disabled={momentBusy}
                      className="btn text-xs px-2.5 py-1 text-white flex items-center gap-1.5"
                      style={{ backgroundColor: 'var(--tm-danger)' }}
                    >
                      {momentBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                      {momentBusy ? 'Deleting…' : 'Delete moment'}
                    </button>
                  </div>
                </div>
              )}
              {momentError && <p role="alert" className="text-xs text-danger mt-1.5">{momentError}</p>}
            </div>
          )}

          {kind !== 'week' && (
            <div>
              <FieldLabel htmlFor="mood-checkin-note">Note</FieldLabel>
              <textarea
                id="mood-checkin-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={MOOD_NOTE_MAX}
                rows={2}
                placeholder={kind === 'month' ? 'What do you want to remember about this month?' : 'Anything worth remembering?'}
                className="input-field text-sm"
              />
            </div>
          )}

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={mood == null || busy || momentBusy}
              className="btn btn-primary flex-1 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save check-in'}
            </button>
          </div>
          <p className="text-[11px] text-text-muted text-center -mt-1">
            Only the mood is required.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default MoodCheckinModal;
