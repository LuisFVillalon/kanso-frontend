'use client';

/**
 * Settings → Google Calendar: connect a Google account, then see it, sync it,
 * disconnect it, and choose which calendars show in kanso and the tag each
 * one's events start with.
 *
 * It's a read-only import, so nothing here writes to Google. Connecting sends
 * the browser to Google's consent screen; the app shell finishes the
 * connection when it comes back (useGoogleCalendarReturn) and opens this page
 * to say how that went. Anything that
 * changes which events show or their tags tells the calendars and reports to
 * reload.
 */

import React, { useContext, useEffect, useState } from 'react';
import { AlertTriangle, CalendarSync, Loader2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import GoogleMark from '@/app/components/event/GoogleMark';
import { AppShellContext } from '@/app/context/AppShellContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { notifyEventsChanged } from '@/app/hooks/useEventsVersion';
import {
  connectGoogleCalendar,
  describeError,
  disconnectGoogleCalendar,
  fetchGoogleCalendars,
  syncGoogleCalendar,
  updateGoogleCalendar,
} from '@/app/lib/backend-api';
import type { GoogleCalendarEntry, GoogleCalendarStatus, GoogleCalendarUpdate } from '@/app/types/googleCalendar';
import type { Tag } from '@/app/types/task';
import SettingsGroup from './SettingsGroup';
import { IntegrationBanner, IntegrationNotice, type IntegrationNoticeValue } from './IntegrationParts';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const ReadOnlyNote = () => (
  <div
    className="flex gap-2 items-start rounded-lg px-3 py-2.5 text-xs"
    style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
  >
    <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--tm-text-muted)' }} />
    <p>
      kanso only reads your Google calendars. Events you make or change in kanso, and the tags you give imported
      events, stay in kanso and are never sent to Google.
    </p>
  </div>
);

const ColorDot: React.FC<{ color: string | null | undefined }> = ({ color }) => (
  <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color || 'var(--tm-pencil)' }} />
);

const CalendarRow: React.FC<{
  calendar: GoogleCalendarEntry;
  tags: Tag[];
  disabled: boolean;
  onChange: (changes: GoogleCalendarUpdate, shown: Partial<GoogleCalendarEntry>) => void;
}> = ({ calendar, tags, disabled, onChange }) => {
  const current = calendar.default_tag;
  // A tag archived since it was picked still has to show as picked.
  const options = current && !tags.some(t => t.id === current.id) ? [...tags, current] : tags;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-2 rounded-md hover:bg-[var(--tm-surface-raised)]" data-google-calendar={calendar.id}>
      <label className="flex items-center gap-2 min-w-0 flex-1 basis-40 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={calendar.selected}
          disabled={disabled}
          onChange={e => onChange({ selected: e.target.checked }, { selected: e.target.checked })}
          style={{ accentColor: 'var(--tm-accent)' }}
        />
        <ColorDot color={calendar.color} />
        <span className="min-w-0 truncate text-text-primary">{calendar.name}</span>
      </label>
      <label className="flex items-center gap-2 text-xs text-text-muted">
        Default tag
        <ColorDot color={current?.color} />
        <select
          value={current?.id ?? ''}
          disabled={disabled}
          aria-label={`Default tag for ${calendar.name}`}
          onChange={e => {
            const id = e.target.value === '' ? null : Number(e.target.value);
            onChange({ default_tag_id: id }, { default_tag: options.find(t => t.id === id) ?? null });
          }}
          className="input-field w-36 px-2 py-1 text-sm disabled:opacity-60"
        >
          <option value="">No tag</option>
          {options.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
      </label>
    </li>
  );
};

interface Props {
  /** Demo sandboxes can't connect a Google account. */
  isDemo: boolean;
  /** Null until it has loaded. */
  status: GoogleCalendarStatus | null;
  onStatusChange: (status: GoogleCalendarStatus) => void;
}

const GoogleCalendarSection: React.FC<Props> = ({ isDemo, status, onStatusChange }) => {
  const { tags } = useTagsContext();
  const shell = useContext(AppShellContext);
  const returnNotice = shell?.googleCalendarNotice ?? null;
  const [pageNotice, setPageNotice] = useState<IntegrationNoticeValue | null>(null);
  const notice = returnNotice ?? pageNotice;
  const setNotice = (next: IntegrationNoticeValue | null) => {
    setPageNotice(next);
    shell?.clearGoogleCalendarNotice();
  };
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | 'calendar' | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarEntry[] | null>(null);
  const [calendarsFailed, setCalendarsFailed] = useState(false);
  const [calendarsVersion, setCalendarsVersion] = useState(0);

  const listCalendars = !isDemo && !!status?.connected;
  useEffect(() => {
    if (!listCalendars) return;
    let cancelled = false;
    fetchGoogleCalendars().then(
      list => { if (!cancelled) { setCalendars(list); setCalendarsFailed(false); } },
      () => { if (!cancelled) setCalendarsFailed(true); },
    );
    return () => { cancelled = true; };
  }, [listCalendars, calendarsVersion]);

  const handleConnect = async () => {
    setBusy('connect');
    setNotice(null);
    try {
      const { authorization_url: url } = await connectGoogleCalendar();
      // Stays busy: the page is leaving for Google.
      window.location.assign(url);
    } catch (err) {
      setNotice({ tone: 'error', text: describeError(err, "Couldn't start connecting Google Calendar. Please try again.") });
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy('sync');
    setNotice(null);
    try {
      const next = await syncGoogleCalendar();
      onStatusChange(next);
      notifyEventsChanged();
      setCalendarsVersion(v => v + 1);
      if (!next.last_error) setNotice({ tone: 'success', text: 'Synced with Google Calendar just now.' });
    } catch (err) {
      setNotice({ tone: 'error', text: describeError(err, "Couldn't sync Google Calendar. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!status) return;
    setBusy('disconnect');
    setNotice(null);
    try {
      await disconnectGoogleCalendar();
      onStatusChange({ ...status, connected: false, email: null, last_synced_at: null, last_error: null });
      setCalendars(null);
      setCalendarsFailed(false);
      setConfirmingDisconnect(false);
      notifyEventsChanged();
      setNotice({ tone: 'success', text: 'Google Calendar disconnected. Its events were removed from kanso.' });
    } catch (err) {
      setNotice({ tone: 'error', text: describeError(err, "Couldn't disconnect Google Calendar. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const handleCalendarChange = async (calendar: GoogleCalendarEntry, changes: GoogleCalendarUpdate, shown: Partial<GoogleCalendarEntry>) => {
    const previous = calendars;
    setCalendars(list => list?.map(c => (c.id === calendar.id ? { ...c, ...shown } : c)) ?? list);
    setBusy('calendar');
    setNotice(null);
    try {
      await updateGoogleCalendar(calendar.id, changes);
      notifyEventsChanged();
    } catch (err) {
      setCalendars(previous);
      setNotice({ tone: 'error', text: describeError(err, "Couldn't save that. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const intro = (
    <div className="flex items-center gap-2" style={{ color: 'var(--tm-text-secondary)' }}>
      <CalendarSync className="w-4 h-4 shrink-0" />
      <p className="text-sm">See your Google events on your kanso calendars, counted in your free time and reports.</p>
    </div>
  );

  if (isDemo) {
    return (
      <div className="space-y-4">
        {intro}
        <IntegrationBanner tone="warning" icon={AlertTriangle}>
          <p className="font-semibold">Google Calendar isn&apos;t available in the demo.</p>
          <p className="text-text-secondary">Connecting a Google account needs your own kanso account. Create one to connect it.</p>
        </IntegrationBanner>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex justify-center py-6" style={{ color: 'var(--tm-text-muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading Google Calendar" />
      </div>
    );
  }

  if (!status.configured) return null;

  const noticeEl = notice && <IntegrationNotice notice={notice} />;

  if (!status.connected) {
    return (
      <div className="space-y-4">
        {intro}
        {noticeEl}
        <div>
          <button type="button" onClick={() => void handleConnect()} disabled={busy !== null} className="btn btn-primary text-sm py-2 disabled:opacity-60">
            {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark className="w-3.5 h-3.5" />}
            {busy === 'connect' ? 'Opening Google…' : 'Connect Google Calendar'}
          </button>
        </div>
        <ReadOnlyNote />
      </div>
    );
  }

  const dot = status.last_error ? 'var(--tm-warning)' : 'var(--tm-success)';

  return (
    <div className="space-y-4">
      {noticeEl}
      {status.last_error && (
        <IntegrationBanner tone="warning" icon={AlertTriangle}>
          <p>
            <strong className="font-semibold">kanso couldn&apos;t reach Google the last time it synced.</strong>{' '}
            The events you already have are still here. Press Sync now to try again, and if it keeps happening,
            disconnect and connect again.
          </p>
        </IntegrationBanner>
      )}

      <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface)' }}>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${dot} 20%, transparent)` }}
          />
          <p className="text-sm font-semibold text-text-primary" data-testid="google-calendar-status">Connected · read-only</p>
          <GoogleMark className="w-3.5 h-3.5 ml-auto text-text-muted" />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 mt-3 text-sm">
          <dt className="text-text-muted">Account</dt>
          <dd className="min-w-0 break-words text-text-primary">{status.email ?? 'Google account'}</dd>
          <dt className="text-text-muted">Last sync</dt>
          <dd className="text-text-primary">{status.last_synced_at ? formatDateTime(status.last_synced_at) : 'Not yet'}</dd>
        </dl>
      </div>

      {confirmingDisconnect ? (
        <div
          className="rounded-xl border p-3.5 space-y-3"
          style={{ borderColor: 'color-mix(in srgb, var(--tm-danger) 35%, transparent)', backgroundColor: 'var(--tm-danger-subtle)' }}
        >
          <div>
            <p className="text-sm font-semibold text-text-primary">Disconnect Google Calendar?</p>
            <p className="text-sm text-text-secondary mt-1">
              kanso stops reading your calendars and deletes its imported events, along with any tags you gave them.
              Nothing goes to Recently deleted, and nothing changes in Google Calendar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={busy !== null}
              className="btn text-sm py-2 text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {busy === 'disconnect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
              Disconnect
            </button>
            <button type="button" onClick={() => setConfirmingDisconnect(false)} disabled={busy === 'disconnect'} className="btn btn-outline text-sm py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void handleSync()} disabled={busy !== null} className="btn btn-secondary text-sm py-2 disabled:opacity-60">
            {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            onClick={() => { setNotice(null); setConfirmingDisconnect(true); }}
            className="btn text-sm py-2 ml-auto hover:bg-[var(--tm-danger-subtle)]"
            style={{ color: 'var(--tm-danger)' }}
          >
            <Unplug className="w-4 h-4" /> Disconnect
          </button>
        </div>
      )}

      <SettingsGroup
        id="google-calendars-heading"
        title="Calendars"
        description="Pick the calendars to show. A default tag colors a calendar's events and counts them under that tag; any single event can have its own."
      >
        {calendarsFailed && !calendars ? (
          <div className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
            <p role="alert">Couldn&apos;t load your calendars.</p>
            <button
              type="button"
              onClick={() => { setCalendarsFailed(false); setCalendarsVersion(v => v + 1); }}
              className="mt-1 font-medium hover:underline"
              style={{ color: 'var(--tm-accent)' }}
            >
              Try again
            </button>
          </div>
        ) : !calendars ? (
          <div className="flex justify-center py-3" style={{ color: 'var(--tm-text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading your calendars" />
          </div>
        ) : calendars.length === 0 ? (
          <p className="text-sm text-text-secondary">Google didn&apos;t list any calendars for this account yet.</p>
        ) : (
          <ul className="grid gap-0.5">
            {calendars.map(calendar => (
              <CalendarRow
                key={calendar.id}
                calendar={calendar}
                tags={tags}
                disabled={busy !== null}
                onChange={(changes, shown) => void handleCalendarChange(calendar, changes, shown)}
              />
            ))}
          </ul>
        )}
      </SettingsGroup>

      <ReadOnlyNote />
    </div>
  );
};

export default GoogleCalendarSection;
