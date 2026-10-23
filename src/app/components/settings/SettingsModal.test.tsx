// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { ArchivedTerm, CalendarSettings } from '@/app/types/calendar';
import { DEFAULT_MOOD_SETTINGS } from '@/app/types/mood';
import { monthlyAvatarOptions } from '@/app/lib/avatar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  user: null as null | { email: string; app_metadata: { provider: string } },
  isDemo: false,
}));
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));
const notifications = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock('@/app/context/NotificationsContextValue', () => ({ useOptionalNotifications: () => notifications.value }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/app/components/settings/CanvasIntegrationSection', () => ({
  default: () => <p>Canvas section</p>,
}));

const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/app/lib/supabase', () => ({ supabase: { auth: supabaseAuth } }));

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly detail: string) {
      super(detail);
    }
  }
  return {
    ApiError,
    updatePassword: vi.fn(),
    deleteAccount: vi.fn(),
    describeError: (_err: unknown, fallback: string) => fallback,
  };
});
vi.mock('@/app/lib/backend-api', () => api);

import SettingsModal, { type SettingsSection } from './SettingsModal';
import { ToastProvider } from '@/app/context/ToastContext';
import { AUTOSAVE_DEBOUNCE_MS } from './autosave';

let container: HTMLDivElement;
let root: Root;

const profile: ProfileFields = {
  name: 'Maya',
  avatar: null,
  themeAccent: '#006BCB',
  pageStyle: 'graph',
  dayStartTime: '08:30',
  shutoffTime: '18:00',
  restDays: [0],
  dayWindows: {},
  layoutOrder: null,
  layoutSizes: null,
  appMode: null,
  dailyBriefCollapsed: null,
  dashboardView: null,
  notesViewMode: null,
  homePanels: null,
  moodCheckins: DEFAULT_MOOD_SETTINGS,
};
const calendarSettings: CalendarSettings = { id: 1, title: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18' };

const onClose = vi.fn();
const onAccountDeleted = vi.fn();
const onSignOut = vi.fn();
const onSaveProfileField = vi.fn<(patch: Partial<ProfileFields>) => Promise<void>>();
const onSaveCalendarSettings = vi.fn(async (changes: Partial<Omit<CalendarSettings, 'id'>>) => ({ ...calendarSettings, ...changes }));
const springTerm: ArchivedTerm = { id: 7, title: 'Spring 2026', start_date: '2026-01-20', end_date: '2026-05-15', archived_at: '2026-05-20T00:00:00Z' };
const onArchiveTerm = vi.fn<() => Promise<void>>();
const onDeleteArchivedTerm = vi.fn<(id: number) => Promise<void>>();

/** Commits each successful save to the props, as TaskManager's hooks do. */
function Harness({ initialSection, initialProfile }: { initialSection?: SettingsSection; initialProfile: ProfileFields }) {
  const [saved, setSaved] = useState(initialProfile);
  const [term, setTerm] = useState(calendarSettings);
  const [archived, setArchived] = useState([springTerm]);
  return (
    <SettingsModal
      isOpen
      onClose={onClose}
      onAccountDeleted={onAccountDeleted}
      onSignOut={onSignOut}
      profile={saved}
      profileLoading={false}
      onSaveProfileField={async patch => {
        await onSaveProfileField(patch);
        setSaved(prev => ({ ...prev, ...patch }));
      }}
      calendarSettings={term}
      calendarSettingsLoading={false}
      onSaveCalendarSettings={async changes => {
        const next = await onSaveCalendarSettings(changes);
        setTerm(next);
        return next;
      }}
      archivedTerms={archived}
      onArchiveTerm={async () => {
        await onArchiveTerm();
        setArchived(prev => [...prev, { ...term, archived_at: '2026-12-19T00:00:00Z' }]);
        setTerm({ id: 0, title: 'Term Tracker', start_date: '2026-10-01', end_date: '2026-12-31' });
      }}
      onDeleteArchivedTerm={async id => {
        await onDeleteArchivedTerm(id);
        setArchived(prev => prev.filter(t => t.id !== id));
      }}
      initialSection={initialSection}
    />
  );
}

const render = (initialSection?: SettingsSection, overrides: Partial<ProfileFields> = {}) => {
  act(() => root.render(<ToastProvider><Harness initialSection={initialSection} initialProfile={{ ...profile, ...overrides }} /></ToastProvider>));
};

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('button')];
const button = (text: string) => buttons().find(b => b.textContent?.trim() === text)!;
const navItem = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('nav button[data-settings-page]')].find(b => b.textContent?.trim() === label);
/** The Change buttons on the security page: [email, password]. */
const changeButtons = () => buttons().filter(b => b.textContent?.trim() === 'Change');
const heading = () => document.getElementById('settings-page-title')!.textContent;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const typeInto = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = async (el: HTMLElement) => {
  await act(async () => { el.click(); });
};
const pause = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
};
const submit = async (el: HTMLElement) => {
  await act(async () => { el.closest('form')!.requestSubmit(); });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  onSaveProfileField.mockResolvedValue(undefined);
  auth.user = { email: 'maya@example.com', app_metadata: { provider: 'email' } };
  auth.isDemo = false;
  notifications.value = null;
  window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('SettingsModal navigation', () => {
  it('groups the pages in a side menu and switches between them', async () => {
    render();
    const groups = [...document.querySelectorAll('nav ul')].map(ul => ul.getAttribute('aria-labelledby'));
    expect(groups).toEqual(['settings-group-Account', 'settings-group-Your days', 'settings-group-App']);
    expect(heading()).toBe('Profile');
    expect(navItem('Profile')!.getAttribute('aria-current')).toBe('page');

    await click(navItem('Work day and rest')!);
    expect(heading()).toBe('Work day and rest');
    expect(navItem('Work day and rest')!.getAttribute('aria-current')).toBe('page');
    expect(navItem('Profile')!.hasAttribute('aria-current')).toBe(false);
    expect(field('settings-day-start').value).toBe('08:30');
  });

  it('opens the page asked for, including the old tab names', () => {
    render('integrations');
    expect(heading()).toBe('Canvas');
    expect(document.body.textContent).toContain('Canvas section');
  });

  it('opens the old Mood check-ins page as Notifications, which now holds the check-ins', () => {
    render('mood');
    expect(heading()).toBe('Notifications');
    expect(navItem('Mood check-ins')).toBeUndefined();
    expect(document.querySelector('[role="switch"][aria-labelledby="mood-setting-weekly"]')).toBeTruthy();
  });

  it('drills into a page from the menu list on a phone, with a back arrow', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    render();
    const nav = document.querySelector('nav')!;
    const page = document.querySelector('section[aria-labelledby="settings-page-title"]')!;
    expect(nav.className).not.toMatch(/(^| )hidden( |$)/);
    expect(page.className).toMatch(/(^| )hidden( |$)/);

    await click(navItem('Term Tracker')!);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(nav.className).toMatch(/(^| )hidden( |$)/);
    expect(page.className).not.toMatch(/(^| )hidden( |$)/);
    expect(heading()).toBe('Term Tracker');

    await click(document.querySelector<HTMLButtonElement>('[aria-label="Back to settings"]')!);
    expect(nav.className).not.toMatch(/(^| )hidden( |$)/);
    expect(page.className).toMatch(/(^| )hidden( |$)/);
  });

  it('signs out from the bottom of the menu after the confirm', async () => {
    render();
    await click(button('Sign out'));
    expect(document.body.textContent).toContain('Are you sure you want to sign out?');
    const confirm = buttons().filter(b => b.textContent?.trim() === 'Sign out').at(-1)!;
    await click(confirm);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('closes on Escape, saving a name still waiting for its pause', async () => {
    render();
    act(() => typeInto(field('settings-name'), 'Maya C'));
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onSaveProfileField).toHaveBeenCalledWith({ name: 'Maya C' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('SettingsModal autosave', () => {
  it('saves only the changed field: text after a pause, a swatch at once', async () => {
    render();
    act(() => typeInto(field('settings-name'), 'Maya Chen'));
    expect(onSaveProfileField).not.toHaveBeenCalled();
    await pause();
    expect(onSaveProfileField).toHaveBeenCalledOnce();
    expect(onSaveProfileField).toHaveBeenCalledWith({ name: 'Maya Chen' });

    const [first] = monthlyAvatarOptions();
    await click(document.querySelector<HTMLButtonElement>(`[aria-label="${first.label}"]`)!);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ avatar: first.key });
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Saved');
  });

  it('keeps newer typing when an earlier save finishes', async () => {
    let finish!: () => void;
    onSaveProfileField.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    render();
    act(() => typeInto(field('settings-name'), 'Ma'));
    await pause();
    act(() => typeInto(field('settings-name'), 'Mabel'));
    await act(async () => { finish(); });
    expect(field('settings-name').value).toBe('Mabel');
    await pause();
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ name: 'Mabel' });
  });

  it('keeps the last choice when a switch is flipped on then off before the first save lands', async () => {
    const finishes: (() => void)[] = [];
    onSaveProfileField.mockImplementation(() => new Promise<void>(resolve => { finishes.push(resolve); }));
    render('mood');
    const weekly = () => document.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="mood-setting-weekly"]')!;
    const flipped = { ...DEFAULT_MOOD_SETTINGS, weekly: !DEFAULT_MOOD_SETTINGS.weekly };
    await click(weekly());
    await click(weekly());
    expect(onSaveProfileField).toHaveBeenCalledOnce();
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ moodCheckins: flipped });
    await act(async () => { finishes[0](); });
    expect(onSaveProfileField).toHaveBeenCalledTimes(2);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ moodCheckins: DEFAULT_MOOD_SETTINGS });
    await act(async () => { finishes[1](); });
    expect(weekly().getAttribute('aria-checked')).toBe(String(DEFAULT_MOOD_SETTINGS.weekly));
  });

  it("says when a save failed and retries it", async () => {
    onSaveProfileField.mockRejectedValueOnce(new Error('offline'));
    render();
    const [first] = monthlyAvatarOptions();
    await click(document.querySelector<HTMLButtonElement>(`[aria-label="${first.label}"]`)!);
    expect(document.body.textContent).toContain("Couldn't save");
    await click(button('Retry'));
    expect(onSaveProfileField).toHaveBeenCalledTimes(2);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ avatar: first.key });
    expect(document.body.textContent).not.toContain("Couldn't save");
  });

  it('saves Term Tracker changes through the calendar settings, one field at a time', async () => {
    render('term');
    act(() => typeInto(field('term-title'), 'Spring 2027'));
    await pause();
    expect(onSaveCalendarSettings).toHaveBeenCalledWith({ title: 'Spring 2027' });
    act(() => typeInto(field('term-end-date'), ''));
    await pause();
    expect(onSaveCalendarSettings).toHaveBeenCalledOnce();
  });

  it('archives the term after a confirm that says it stays on the calendars', async () => {
    render('term');
    await click(button('Archive term'));
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Archive Fall 2026?');
    expect(dialog.textContent).toContain('Aug 24 – Dec 18, 2026 stays marked on your month calendars');
    await click(button('Archive'));
    expect(onArchiveTerm).toHaveBeenCalledOnce();
    expect(onSaveCalendarSettings).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(field('term-title').value).toBe('Term Tracker');
    // Nothing saved yet for the next term, so there is nothing to archive.
    expect(button('Archive term').disabled).toBe(true);
    const list = document.querySelector('ul[aria-label="Archived terms"]')!;
    expect(list.textContent).toContain('Spring 2026');
    expect(list.textContent).toContain('Fall 2026');
  });

  it('saves an edit still waiting for its pause before archiving, so the term on screen is archived', async () => {
    render('term');
    act(() => typeInto(field('term-title'), 'Fall 2026 (CS)'));
    await click(button('Archive term'));
    await click(button('Archive'));
    expect(onSaveCalendarSettings).toHaveBeenCalledWith({ title: 'Fall 2026 (CS)' });
    expect(onArchiveTerm).toHaveBeenCalledOnce();
    expect(onSaveCalendarSettings.mock.invocationCallOrder[0]).toBeLessThan(onArchiveTerm.mock.invocationCallOrder[0]);
    // The debounced save was taken over, not sent again after the archive.
    await pause();
    expect(onSaveCalendarSettings).toHaveBeenCalledOnce();
  });

  it('keeps the archive confirm open and says so when archiving fails', async () => {
    onArchiveTerm.mockRejectedValueOnce(new Error('offline'));
    render('term');
    await click(button('Archive term'));
    await click(button('Archive'));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Couldn't archive the term. Try again.");
  });

  it('deletes an archived term after a second click', async () => {
    render('term');
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Delete Spring 2026"]')!);
    expect(onDeleteArchivedTerm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Delete for good?');
    await click(button('Delete'));
    expect(onDeleteArchivedTerm).toHaveBeenCalledWith(7);
    expect(document.querySelector('ul[aria-label="Archived terms"]')).toBeNull();
  });

  it('offers Undo for a rest day, which saves the days back', async () => {
    render('workday');
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Saturday"]')!);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ restDays: [0, 6] });
    expect(document.body.textContent).toContain('Saturday is now a rest day.');
    await click(button('Undo'));
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ restDays: [0] });
    expect(document.querySelector('[aria-label="Saturday"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  describe('different hours on some days', () => {
    const differentHours = () => document.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="settings-day-windows-label"]')!;
    const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

    it('lists each work day with the default hours, saving a day only once it changes', async () => {
      render('workday');
      expect(differentHours().getAttribute('aria-checked')).toBe('false');
      expect(input('Monday starts')).toBeNull();
      await click(differentHours());
      expect(differentHours().getAttribute('aria-checked')).toBe('true');
      // Sunday is a rest day, so it has no row.
      expect(input('Sunday starts')).toBeNull();
      expect(input('Monday starts').value).toBe('08:30');
      expect(input('Monday: call it a day').value).toBe('18:00');
      expect(onSaveProfileField).not.toHaveBeenCalled();

      await act(async () => typeInto(input('Monday: call it a day'), '14:00'));
      await pause();
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: { '1': { start: '08:30', end: '14:00' } } });
      expect(input('Tuesday: call it a day').value).toBe('18:00');
    });

    it('saves a window that runs past midnight', async () => {
      render('workday');
      await click(differentHours());
      await act(async () => typeInto(input('Friday: call it a day'), '02:00'));
      await pause();
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: { '5': { start: '08:30', end: '02:00' } } });
      expect(input('Friday: call it a day').getAttribute('aria-invalid')).toBeNull();
    });

    it("doesn't save a window missing a time", async () => {
      render('workday');
      await click(differentHours());
      await act(async () => typeInto(input('Friday: call it a day'), ''));
      await pause();
      expect(onSaveProfileField).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('Pick both times.');
      expect(input('Friday: call it a day').getAttribute('aria-invalid')).toBe('true');
    });

    it('lists the default hours without an error when they run past midnight', async () => {
      render('workday', { dayStartTime: '20:00', shutoffTime: '02:00' });
      await click(differentHours());
      expect(input('Monday starts').value).toBe('20:00');
      expect(input('Monday: call it a day').value).toBe('02:00');
      expect(input('Monday: call it a day').getAttribute('aria-invalid')).toBeNull();
      await act(async () => typeInto(input('Monday starts'), '19:00'));
      await pause();
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: { '1': { start: '19:00', end: '02:00' } } });
    });

    it("stays off when only a rest day has its own hours, and turning it on and off clears them", async () => {
      render('workday', { dayWindows: { '0': { start: '10:00', end: '16:00' } } });
      expect(differentHours().getAttribute('aria-checked')).toBe('false');
      await click(differentHours());
      expect(onSaveProfileField).not.toHaveBeenCalled();
      await click(differentHours());
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: {} });
    });

    it('puts a day back on the default hours, with Undo', async () => {
      render('workday');
      await click(differentHours());
      await act(async () => typeInto(input('Monday starts'), '10:00'));
      await pause();
      await click(document.querySelector<HTMLButtonElement>('[aria-label="Monday: same as default"]')!);
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: {} });
      expect(input('Monday starts').value).toBe('08:30');
      expect(document.body.textContent).toContain('Monday uses the default hours again.');
      await click(button('Undo'));
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: { '1': { start: '10:00', end: '18:00' } } });
      expect(input('Monday starts').value).toBe('10:00');
    });

    it('turning it off gives every day the default hours again', async () => {
      render('workday');
      await click(differentHours());
      await act(async () => typeInto(input('Monday starts'), '10:00'));
      await pause();
      await click(differentHours());
      expect(onSaveProfileField).toHaveBeenLastCalledWith({ dayWindows: {} });
      expect(input('Monday starts')).toBeNull();
      await click(button('Undo'));
      expect(differentHours().getAttribute('aria-checked')).toBe('true');
      expect(input('Monday starts').value).toBe('10:00');
    });
  });

  it('offers Undo for a mood check-in switch', async () => {
    render('mood');
    const monthly = document.querySelector<HTMLButtonElement>('[role="switch"][aria-labelledby="mood-setting-monthly"]')!;
    await click(monthly);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ moodCheckins: { ...DEFAULT_MOOD_SETTINGS, monthly: !DEFAULT_MOOD_SETTINGS.monthly } });
    expect(document.body.textContent).toContain('Monthly check-in turned on.');
    await click(button('Undo'));
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ moodCheckins: DEFAULT_MOOD_SETTINGS });
  });
});

describe('SettingsModal notifications page', () => {
  const preferences = {
    types: { due_today: true, task_reminder: true, final_warning: true, overdue: true, habit_reminder: true, mood_reminder: true, mood_missed: true },
    quiet_hours_start: null,
    quiet_hours_end: null,
    default_reminder_minutes: 120,
    mood_reminder_minutes: 60,
  };
  const savePreferences = vi.fn(async (changes: object) => ({ ...preferences, ...changes }));
  const loadPreferences = vi.fn(async () => {});
  const groupTitles = () => [...document.querySelectorAll('section[aria-labelledby="settings-page-title"] h3')].map(h => h.textContent);

  it('groups reminders, mood check-ins and quiet hours on one page, with no other alerts or mood nudge settings', async () => {
    notifications.value = { status: 'ready', preferences, preferencesError: null, savePreferences, loadPreferences };
    render('notifications');
    expect(groupTitles()).toEqual(['Reminders', 'Mood check-ins', 'Quiet hours']);
    const mood = document.querySelector('section[aria-labelledby="notif-group-mood"]')!;
    // Daily check-ins follow the mood check-in reminder switch; only weekly and monthly have their own.
    expect(mood.querySelector('[aria-labelledby="mood-setting-daily"]')).toBeNull();
    expect([...mood.querySelectorAll('[aria-labelledby^="mood-setting-"]')].map(s => s.getAttribute('aria-labelledby')))
      .toEqual(['mood-setting-weekly', 'mood-setting-monthly']);
    expect(mood.querySelector('[aria-labelledby="notif-type-mood_reminder"]')).toBeTruthy();
    expect(mood.textContent).toContain("Log your mood each day; reminds you before you call it a day if it isn't logged yet.");
    expect(mood.querySelector('select[aria-labelledby="mood-reminder-lead-label"]')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Dashboard nudge|Show mood in reports|Morning summary/);

    // Mood check-ins still save on the profile, and report on this page's indicator.
    await click(mood.querySelector<HTMLButtonElement>('[aria-labelledby="mood-setting-weekly"]')!);
    expect(onSaveProfileField).toHaveBeenLastCalledWith({ moodCheckins: { ...DEFAULT_MOOD_SETTINGS, weekly: !DEFAULT_MOOD_SETTINGS.weekly } });
    expect(savePreferences).not.toHaveBeenCalled();
    expect(document.querySelector('section[aria-labelledby="settings-page-title"] [role="status"]')?.textContent).toContain('Saved');
  });

  it('shows the mood check-ins while the alert settings load', () => {
    notifications.value = { status: 'loading', preferences: null, preferencesError: null, savePreferences, loadPreferences };
    render('notifications');
    expect(document.querySelector('[aria-label="Loading notification settings"]')).toBeTruthy();
    expect(groupTitles()).toEqual(['Mood check-ins']);
    expect(loadPreferences).toHaveBeenCalled();
  });

  it('keeps the page, with only the mood check-ins, where notifications are unavailable', () => {
    notifications.value = { status: 'unavailable', preferences: null, preferencesError: null, savePreferences, loadPreferences };
    render();
    expect(navItem('Notifications')).toBeTruthy();
    render('notifications');
    expect(groupTitles()).toEqual(['Mood check-ins']);
    expect(document.querySelector('[aria-label="Loading notification settings"]')).toBeNull();
  });
});

describe('SettingsModal sign-in and security', () => {
  const strongPassword = 'plinth quasar mossy tundra';

  it('sends the current password with a password change and shows the server refusing it', async () => {
    api.updatePassword.mockRejectedValueOnce(new api.ApiError(400, 'Your current password is incorrect.'));
    render('security');
    await click(changeButtons()[1]);
    act(() => typeInto(field('settings-current-password'), 'old secret'));
    act(() => typeInto(field('settings-new-password'), strongPassword));
    act(() => typeInto(field('settings-confirm-password'), strongPassword));
    await submit(field('settings-new-password'));
    expect(api.updatePassword).toHaveBeenCalledWith(strongPassword, 'old secret');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Your current password is incorrect.');
    expect(field('settings-current-password').value).toBe('');
  });

  it('re-checks the current password before an email change', async () => {
    supabaseAuth.signInWithPassword.mockResolvedValueOnce({ error: null });
    supabaseAuth.updateUser.mockResolvedValueOnce({ error: null });
    render('security');
    await click(changeButtons()[0]);
    act(() => typeInto(field('settings-new-email'), 'maya@new.example'));
    act(() => typeInto(field('settings-email-current-password'), 'old secret'));
    await submit(field('settings-new-email'));
    expect(supabaseAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'maya@example.com', password: 'old secret' });
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ email: 'maya@new.example' });
    expect(document.body.textContent).toContain('Confirmation sent');
  });

  it('blocks the email change when the current password is wrong', async () => {
    supabaseAuth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    render('security');
    await click(changeButtons()[0]);
    act(() => typeInto(field('settings-new-email'), 'maya@new.example'));
    act(() => typeInto(field('settings-email-current-password'), 'wrong'));
    await submit(field('settings-new-email'));
    expect(supabaseAuth.updateUser).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("That password isn't right.");
    expect(field('settings-email-current-password').value).toBe('');
  });

  it('shows Google users a note and help link instead of a password form', async () => {
    auth.user = { email: 'maya@gmail.com', app_metadata: { provider: 'google' } };
    supabaseAuth.updateUser.mockResolvedValueOnce({ error: null });
    render('security');
    expect(document.body.textContent).toContain('Signed in with Google');
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://myaccount.google.com/security"]')).toBeTruthy();
    expect(field('settings-current-password')).toBeNull();

    await click(button('Change'));
    expect(field('settings-email-current-password')).toBeNull();
    act(() => typeInto(field('settings-new-email'), 'maya@new.example'));
    await submit(field('settings-new-email'));
    expect(supabaseAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ email: 'maya@new.example' });
  });

  it('deletes the account only after the typed phrase, with Cancel focused first', async () => {
    api.deleteAccount.mockResolvedValueOnce(undefined);
    render('security');
    await click(button('Delete account…'));
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Every task, note, tag and habit');
    expect(document.activeElement?.textContent).toBe('Cancel');
    const confirm = button('Delete my account');
    expect(confirm.disabled).toBe(true);

    // Escape closes only the confirm, not Settings.
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await click(button('Delete account…'));
    act(() => typeInto(field('delete-account-phrase'), 'delete my account'));
    expect(button('Delete my account').disabled).toBe(false);
    await click(button('Delete my account'));
    expect(api.deleteAccount).toHaveBeenCalledOnce();
    expect(supabaseAuth.signOut).toHaveBeenCalledOnce();
    expect(onAccountDeleted).toHaveBeenCalledOnce();
  });

  it('has no sign-in and security page in the demo', () => {
    auth.user = null;
    auth.isDemo = true;
    render('security');
    expect(navItem('Sign-in and security')).toBeUndefined();
    expect(heading()).toBe('Profile');
    expect(document.body.textContent).toContain('private demo sandbox');
  });
});
