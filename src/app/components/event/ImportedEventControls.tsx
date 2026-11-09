'use client';

import React, { useId, useState } from 'react';
import { ExternalLink, Loader2, Tags } from 'lucide-react';
import { useTagsContext } from '@/app/context/TagsContext';
import { useToast } from '@/app/context/ToastContext';
import { notifyEventsChanged } from '@/app/hooks/useEventsVersion';
import { describeError, updateGoogleEventTags } from '@/app/lib/backend-api';
import type { EventOccurrence } from '@/app/types/event';
import type { Tag } from '@/app/types/task';
import { googleEventLink, tagSignature } from '@/app/utils/importedEvents';
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
 * What can be done with an imported event: pick its own kanso tags or return
 * it to its calendar's default. Every saved change tells the calendars and
 * reports to reload. Picks stay on screen until that reload brings them back,
 * and one saves at a time so they can't land out of order.
 */
export const ImportedEventTagPicker: React.FC<{ occurrence: EventOccurrence }> = ({ occurrence: o }) => {
  const labelId = useId();
  const { tags } = useTagsContext();
  const showToast = useToast();
  const [draft, setDraft] = useState<{ baseline: string; tags: Tag[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const baseline = tagSignature(o.tags);
  const selected = draft?.baseline === baseline ? draft.tags : o.tags;

  const save = async (next: Tag[] | null) => {
    setDraft(next ? { baseline, tags: next } : null);
    setSaving(true);
    try {
      await updateGoogleEventTags(o.event_id, (next ?? []).map(t => t.id), next === null);
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
          tags={tags}
          selected={selected}
          disabled={saving}
          onToggle={tag => void save(toggleTag(selected, tag))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => void save(null)}
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
    </div>
  );
};

/** The note under an imported event's controls. */
export const ImportedEventNote: React.FC = () => (
  <p className="text-[11px] text-text-muted">Tags stay in kanso. Change the event itself in Google Calendar.</p>
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
