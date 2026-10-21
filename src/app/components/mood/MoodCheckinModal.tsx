'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CircleCheck, Clock, Loader2, Plus, Repeat } from 'lucide-react';
import Modal from '@/app/components/common/Modal';
import MoodFacePicker from '@/app/components/mood/MoodFacePicker';
import { describeError, fetchMoodTags, saveMoodCheckin } from '@/app/lib/backend-api';
import {
  DEFAULT_MOOD_TAGS,
  ENERGY_LABELS,
  MOOD_NOTE_MAX,
  MOOD_TAG_MAX,
  MOOD_TAGS_PER_CHECKIN_MAX,
  STRESS_LABELS,
  type MoodCheckin,
} from '@/app/types/mood';
import { formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';

/** What the user already did that day, shown above the faces so they reflect rather than guess. */
export interface DaySummary {
  tasksDone: number;
  /** Null until the day's note time has loaded. */
  noteSeconds: number | null;
  habitsDone: number;
  habitsTotal: number;
}

interface Props {
  /** The local day being checked in. */
  date: Date;
  /** The day's saved check-in, when editing one. */
  existing: MoodCheckin | null;
  /** A face already tapped on the nudge. */
  initialMood?: number | null;
  summary?: DaySummary | null;
  onClose: () => void;
  /** Offers "Skip today" on a new check-in; without it that button is Cancel. */
  onSkip?: () => void;
  onSaved: (saved: MoodCheckin, previous: MoodCheckin | null) => void;
}

const sameTag = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** One row of the 1–5 energy/stress scale. Picking the chosen value again clears it. */
const ScalePicker: React.FC<{
  labels: readonly string[];
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
}> = ({ labels, value, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="mood-scale">
    {labels.map((name, i) => (
      <button
        key={name}
        type="button"
        role="radio"
        aria-checked={value === i + 1}
        onClick={() => onChange(value === i + 1 ? null : i + 1)}
        title={name}
      >
        {name}
      </button>
    ))}
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-text-secondary mb-1.5">
    <span>{children}</span>
    <span className="text-[11px] font-normal text-text-muted">optional</span>
  </label>
);

/**
 * The end-of-day check-in: a mood from five faces (the only required field),
 * then optional energy, stress, mood tags (their own list, suggested by
 * GET /get-mood-tags) and a note. Saving replaces the day's whole check-in.
 */
const MoodCheckinModal: React.FC<Props> = ({ date, existing, initialMood = null, summary, onClose, onSkip, onSaved }) => {
  const editing = existing != null;
  const [mood, setMood] = useState<number | null>(existing?.mood ?? initialMood);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_MOOD_TAGS);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMoodTags()
      .then(({ defaults, custom }) => { if (!cancelled) setSuggestions([...defaults, ...custom]); })
      .catch(() => {}); // keep the built-in list
    return () => { cancelled = true; };
  }, []);

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

  const isToday = toLocalDateStr(date) === toLocalDateStr(new Date());
  const question = isToday ? 'How was today?' : `How was ${date.toLocaleDateString('en-US', { weekday: 'long' })}?`;
  const title = editing
    ? `Edit check-in · ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
    : 'Daily check-in';

  const handleSave = async () => {
    if (mood == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveMoodCheckin({
        period_kind: 'day',
        period_start: toLocalDateStr(date),
        mood,
        energy,
        stress,
        tags,
        note: note.trim() || null,
      });
      onSaved(saved, existing);
    } catch (err) {
      setError(describeError(err, "Couldn't save your check-in. Please try again."));
      setBusy(false);
    }
  };

  // Keys 1–5 pick a face, except while typing.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (/^[1-5]$/.test(e.key)) setMood(Number(e.key));
  };

  return (
    <Modal onClose={onClose} panelClassName="modal-panel w-full max-w-md max-h-[92vh] overflow-y-auto scrollbar-custom">
      <div role="dialog" aria-modal="true" aria-labelledby="mood-checkin-title" onKeyDown={handleKeyDown}>
        <div className="px-5 py-4 border-b border-border-subtle flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 id="mood-checkin-title" className="text-lg font-semibold text-text-primary leading-tight">{title}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · about 20 seconds
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" aria-label="Close">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {summary && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary px-3 py-2 rounded-lg bg-surface-raised">
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                {summary.tasksDone} {summary.tasksDone === 1 ? 'task' : 'tasks'} done
              </span>
              {summary.noteSeconds != null && (
                <>
                  <span aria-hidden="true" className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-accent-2" aria-hidden="true" />
                    {summary.noteSeconds > 0 ? formatDurationShort(summary.noteSeconds) : '0m'} in notes
                  </span>
                </>
              )}
              {summary.habitsTotal > 0 && (
                <>
                  <span aria-hidden="true" className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                    {summary.habitsDone} of {summary.habitsTotal} habits
                  </span>
                </>
              )}
            </p>
          )}

          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">{question}</p>
            <MoodFacePicker value={mood} onChange={setMood} label={question} />
          </div>

          <div>
            <FieldLabel>Energy</FieldLabel>
            <ScalePicker labels={ENERGY_LABELS} value={energy} onChange={setEnergy} label="Energy" />
          </div>

          <div>
            <FieldLabel>Stress</FieldLabel>
            <ScalePicker labels={STRESS_LABELS} value={stress} onChange={setStress} label="Stress" />
          </div>

          <div>
            <FieldLabel>What was part of today?</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map(tag => {
                const selected = tags.some(t => sameTag(t, tag));
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && atTagLimit}
                    onClick={() => toggleTag(tag)}
                    className="chip mood-tag disabled:opacity-50"
                  >
                    {tag}
                  </button>
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
                      // Cancel just the new tag: Modal closes on a document-level Escape.
                      e.nativeEvent.stopImmediatePropagation();
                      setNewTag('');
                      setAddingTag(false);
                    }
                  }}
                  aria-label="New mood tag"
                  placeholder="New tag"
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
                  Tag
                </button>
              )}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="mood-checkin-note">Note</FieldLabel>
            <textarea
              id="mood-checkin-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={MOOD_NOTE_MAX}
              rows={2}
              placeholder="Anything worth remembering?"
              className="input-field text-sm"
            />
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={!editing && onSkip ? onSkip : onClose}
              disabled={busy}
              className="btn btn-secondary flex-1 py-2"
            >
              {!editing && onSkip ? 'Skip today' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={mood == null || busy}
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
