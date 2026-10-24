'use client';

import React, { useId, useState } from 'react';
import Modal from '@/app/components/common/Modal';
import type { EditScope } from '@/app/types/event';

/** What the dialog confirms. */
export type EventAction = 'edit' | 'archive' | 'delete';

const TITLE: Record<EventAction, { repeating: string; single: string; verb: string }> = {
  edit: { repeating: 'Save repeating event', single: 'Save event', verb: 'Save' },
  archive: { repeating: 'Archive repeating event', single: 'Archive event', verb: 'Archive' },
  delete: { repeating: 'Delete repeating event', single: 'Delete event', verb: 'Delete' },
};

const NOTE: Partial<Record<EventAction, string>> = {
  archive: 'The ones that already happened stay on the calendars, hatched. The ones still to come leave the calendars and wait in Archive → Events.',
  delete: 'Deleted events go to Recently deleted for 30 days. Archive keeps them on the calendars instead.',
};

interface EventScopeDialogProps {
  action: EventAction;
  title: string;
  /** "Fri, Oct 23", the occurrence the dialog was opened from. */
  dateLabel: string;
  /** A repeating event offers the three scopes; a one-off one just confirms. */
  repeating: boolean;
  /** The scopes that can be picked; every one unless given. */
  allowed?: EditScope[];
  /** Why some scope can't be picked, shown under the choices. */
  hint?: string;
  onConfirm: (scope: EditScope) => void;
  onClose: () => void;
}

/**
 * Asks which occurrences of a repeating event a save, archive or delete
 * applies to: this one, this and the following ones, or all of them, like
 * Google Calendar. A one-off event only confirms a delete.
 */
const EventScopeDialog: React.FC<EventScopeDialogProps> = ({
  action, title, dateLabel, repeating, allowed = ['this', 'following', 'all'], hint, onConfirm, onClose,
}) => {
  const headingId = useId();
  const preferred: EditScope = action === 'archive' ? 'following' : 'this';
  const [scope, setScope] = useState<EditScope>(allowed.includes(preferred) ? preferred : allowed[0] ?? 'all');
  const { repeating: repeatingTitle, single, verb } = TITLE[action];
  const options: { value: EditScope; label: string }[] = [
    { value: 'this', label: `This event (${dateLabel})` },
    { value: 'following', label: 'This and following events' },
    { value: 'all', label: 'All events' },
  ];

  return (
    <Modal onClose={onClose} layer="top" panelClassName="modal-panel max-w-sm w-full p-5">
      <div role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 id={headingId} className="text-lg text-text-primary">{repeating ? repeatingTitle : single}</h2>
        {repeating ? (
          <fieldset className="mt-3 flex flex-col gap-2">
            <legend className="sr-only">Which {title} events</legend>
            {options.map(o => {
              const disabled = !allowed.includes(o.value);
              return (
                <label key={o.value} className={`flex items-center gap-2 text-sm ${disabled ? 'text-text-muted' : 'text-text-primary'}`}>
                  <input
                    type="radio"
                    name="event-scope"
                    value={o.value}
                    checked={scope === o.value}
                    disabled={disabled}
                    onChange={() => setScope(o.value)}
                  />
                  {o.label}
                </label>
              );
            })}
            {hint && <p className="text-xs text-text-muted">{hint}</p>}
          </fieldset>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            {verb} <b className="text-text-primary">{title}</b> on {dateLabel}?
          </p>
        )}
        {NOTE[action] && <p className="mt-3 text-xs text-text-muted">{NOTE[action]}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary px-4 py-2">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(repeating ? scope : 'all')}
            className="btn btn-primary px-4 py-2"
            style={action === 'delete' ? { backgroundColor: 'var(--tm-danger)', borderColor: 'var(--tm-danger)', color: '#fff' } : undefined}
          >
            {verb}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default EventScopeDialog;
