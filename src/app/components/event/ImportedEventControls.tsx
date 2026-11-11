'use client';

import React, { useId, useState } from 'react';
import { ExternalLink, Loader2, Tags } from 'lucide-react';
import { useHoldPopover } from '@/app/components/common/AnchoredPopover';
import { useTagsContext } from '@/app/context/TagsContext';
import { useToast } from '@/app/context/ToastContext';
import { occurrenceDayLabel } from '@/app/hooks/useEventActions';
import { notifyEventsChanged } from '@/app/hooks/useEventsVersion';
import { describeError, updateGoogleEventTags } from '@/app/lib/backend-api';
import type { EditScope, EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';
import { googleEventLink, IMPORTED_EDIT_NOTE, repeatsOccurrence, tagSignature } from '@/app/utils/importedEvents';
import EventScopeDialog from './EventScopeDialog';
import EventTagPicker, { toggleTag } from './EventTagPicker';

/** A link to the event in Google Calendar, when Google gave one. */
export const OpenInGoogleLink: React.FC<{ occurrence: EventOccurrence }> = ({ occurrence }) => {
  const href = googleEventLink(occurrence);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
      style={{ color: 'var(--tm-accent)' }}
    >
      Open in Google Calendar <ExternalLink className="w-3 h-3" aria-hidden />
    </a>
  );
};

/**
 * An imported event's own kanso tags: pick them or return it to its
 * calendar's default. An instance of a repeating Google event first asks which
 * instances the change is for (this one, this and following, or all), as
 * kanso's repeating events do; a one-off one saves straight away. Every saved
 * change tells the calendars and reports to reload. Picks stay on screen until
 * that reload brings them back, and one saves at a time so they can't land out
 * of order.
 */
export const ImportedEventTagPicker: React.FC<{ occurrence: EventOccurrence }> = ({ occurrence: o }) => {
  const labelId = useId();
  const { tags } = useTagsContext();
  const showToast = useToast();
  const [draft, setDraft] = useState<{ baseline: string; tags: Tag[] } | null>(null);
  const [saving, setSaving] = useState(false);
  // The change waiting on "which events?": new tags, or null for the calendar default.
  const [asking, setAsking] = useState<{ next: Tag[] | null } | null>(null);
  // Keep the event card open while its question is.
  useHoldPopover(asking !== null);

  const baseline = tagSignature(o.tags);
  const selected = draft?.baseline === baseline ? draft.tags : o.tags;
  // A tag archived since it was given still has to show, so it can come off.
  const options = [...tags, ...selected.filter(s => !tags.some(t => t.id === s.id))];

  const change = (next: Tag[] | null) => {
    if (repeatsOccurrence(o)) setAsking({ next });
    else void save(next);
  };

  const save = async (next: Tag[] | null, scope?: EditScope) => {
    setDraft(next ? { baseline, tags: next } : null);
    setSaving(true);
    try {
      const ids = (next ?? []).map(t => t.id);
      // A one-off event's tags have no scope to send.
      await (scope ? updateGoogleEventTags(o.event_id, ids, next === null, scope) : updateGoogleEventTags(o.event_id, ids, next === null));
      notifyEventsChanged();
    } catch (err) {
      console.error('[ImportedEventTagPicker]', err);
      setDraft(null);
      showToast(describeError(err, "Couldn't save the tags. Please try again."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span id={labelId} className="block text-xs font-medium text-text-muted">Tags</span>
      <div className="max-h-28 overflow-y-auto scrollbar-custom">
        <EventTagPicker
          aria-labelledby={labelId}
          tags={options}
          selected={selected}
          disabled={saving}
          onToggle={tag => change(toggleTag(selected, tag))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => change(null)}
          disabled={saving}
          className="text-xs font-medium hover:underline disabled:opacity-60"
          style={{ color: 'var(--tm-accent)' }}
        >
          Use calendar default
        </button>
        {saving && (
          <span role="status" className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Saving…
          </span>
        )}
      </div>
      {asking && (
        <EventScopeDialog
          action="edit"
          title={o.title}
          dateLabel={occurrenceDayLabel(o)}
          repeating
          onConfirm={scope => { const { next } = asking; setAsking(null); void save(next, scope); }}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
};

/** The note under an imported event's controls. */
export const ImportedEventNote: React.FC = () => (
  <p className="text-[11px] text-text-muted">{IMPORTED_EDIT_NOTE}</p>
);

/** The day report's fold-out for an imported event: "Tags", which opens its picker, beside its link to Google. */
export const ImportedEventDisclosure: React.FC<{ occurrence: EventOccurrence }> = ({ occurrence }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: 'var(--tm-accent)' }}
        >
          <Tags className="w-3 h-3" aria-hidden /> {open ? 'Hide tags' : 'Change tags'}
        </button>
        <OpenInGoogleLink occurrence={occurrence} />
      </div>
      {open && (
        <>
          <ImportedEventTagPicker occurrence={occurrence} />
          <ImportedEventNote />
        </>
      )}
    </div>
  );
};
