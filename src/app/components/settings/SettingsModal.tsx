'use client';

/**
 * Account settings: a two-pane window with a grouped side menu and one
 * short page per item. On a phone the menu is a list you tap into, and each
 * page has a back arrow.
 *
 *   Account    Profile · Sign-in and security
 *   Your days  Work day and rest · Term Tracker
 *   App        Notifications · Appearance · Canvas
 *   Sign out
 *
 * Every change saves itself (see autosave.ts): text after a pause, toggles
 * and swatches at once, one field per request. Each page shows its own
 * Saved / Couldn't save indicator, and switches that change how the app
 * behaves (rest days, check-ins, alerts) offer a short Undo.
 *
 * Notifications gathers everything about being reminded: task reminders,
 * mood check-ins (saved on the profile) and quiet hours. Where the API
 * refuses notifications it still holds the mood check-ins.
 *
 * Demo sandboxes (Supabase anonymous users) have no credentials or account to
 * manage, so they get no Sign-in and security page, and Canvas says it needs
 * a real account.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Check, AlertTriangle, ChevronLeft, ChevronRight, User, ShieldCheck, Clock,
  Hourglass, Bell, Palette, GraduationCap, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '@/app/context/ToastContext';
import { describeError } from '@/app/lib/backend-api';
import { applyThemeColor } from '@/app/lib/theme';
import { applyPageStyle } from '@/app/lib/pageStyle';
import Modal from '@/app/components/common/Modal';
import ProfileAvatar from '@/app/components/common/ProfileAvatar';
import SignOutConfirm from '@/app/components/common/SignOutConfirm';
import BigPictureSettingsSection, { type TermTrackerDraft } from '@/app/components/settings/BigPictureSettingsSection';
import MoodCheckinSettingsSection, { MOOD_GROUP, MOOD_TOGGLES } from '@/app/components/settings/MoodCheckinSettingsSection';
import NotificationPreferencesForm from '@/app/components/settings/NotificationPreferencesForm';
import SettingsGroup from '@/app/components/settings/SettingsGroup';
import CanvasIntegrationSection from '@/app/components/settings/CanvasIntegrationSection';
import ProfilePage from '@/app/components/settings/pages/ProfilePage';
import WorkDayPage, { REST_DAY_OPTIONS } from '@/app/components/settings/pages/WorkDayPage';
import AppearancePage from '@/app/components/settings/pages/AppearancePage';
import SecurityPage from '@/app/components/settings/pages/SecurityPage';
import { useFieldAutosave, useSaveTracker, type SaveStatus, type TrackSave } from '@/app/components/settings/autosave';
import { useOptionalNotifications } from '@/app/context/NotificationsContextValue';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { ArchivedTerm, CalendarSettings } from '@/app/types/calendar';
import type { MoodCheckinSettings } from '@/app/types/mood';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccountDeleted: () => void;
  /** Signs out after the confirm (clearing this device's caches and leaving the app). */
  onSignOut: () => Promise<void> | void;
  profile: ProfileFields;
  profileLoading: boolean;
  /** Saves only the given profile fields. Throws when the save fails. */
  onSaveProfileField: (patch: Partial<ProfileFields>) => Promise<void>;
  calendarSettings: CalendarSettings;
  calendarSettingsLoading: boolean;
  onSaveCalendarSettings: (changes: Partial<Omit<CalendarSettings, 'id'>>) => Promise<CalendarSettings>;
  archivedTerms: ArchivedTerm[];
  /** Archives the current term. Throws when it couldn't. */
  onArchiveTerm: () => Promise<unknown>;
  /** Deletes an archived term for good. Throws when it couldn't. */
  onDeleteArchivedTerm: (id: number) => Promise<void>;
  /** The page to show when the modal opens, e.g. 'canvas' from the Canvas panel. */
  initialSection?: SettingsSection;
}

export type SettingsPage =
  | 'profile' | 'security'
  | 'workday' | 'term'
  | 'notifications' | 'appearance' | 'canvas';

/** A page, or one of the old tab names, which still open the page that holds them. */
export type SettingsSection = SettingsPage | 'mood' | 'integrations' | 'password' | 'email' | 'delete';

const LEGACY_SECTIONS: Record<string, SettingsPage> = {
  mood: 'notifications',
  integrations: 'canvas',
  password: 'security',
  email: 'security',
  delete: 'security',
};

interface NavItem {
  page: SettingsPage;
  label: string;
  icon: LucideIcon;
  lede: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Account',
    items: [
      { page: 'profile', label: 'Profile', icon: User, lede: 'How kanso greets you.' },
      { page: 'security', label: 'Sign-in and security', icon: ShieldCheck, lede: 'Email, password and leaving.' },
    ],
  },
  {
    label: 'Your days',
    items: [
      { page: 'workday', label: 'Work day and rest', icon: Clock, lede: 'When your day runs and which days are off.' },
      { page: 'term', label: 'Term Tracker', icon: Hourglass, lede: 'The countdown on your dashboard, and your terms on the calendar.' },
    ],
  },
  {
    label: 'App',
    items: [
      { page: 'notifications', label: 'Notifications', icon: Bell, lede: 'Task reminders, mood check-ins and when to keep quiet.' },
      { page: 'appearance', label: 'Appearance', icon: Palette, lede: 'Theme, accent color and page ruling.' },
      { page: 'canvas', label: 'Canvas', icon: GraduationCap, lede: 'Your classes and due dates from Canvas.' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// Providers that use a federated identity — they have no local password.
const OAUTH_PROVIDERS = new Set(['google', 'github', 'facebook', 'twitter', 'apple']);

/** Matches Tailwind's `sm` breakpoint, where the menu and the page sit side by side. */
const PHONE_QUERY = '(max-width: 639px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches;

const SaveIndicator: React.FC<{ status?: SaveStatus; onRetry: () => void }> = ({ status, onRetry }) => (
  <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium min-h-6">
    {status === 'saving' && (
      <span className="flex items-center gap-1.5 text-text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
      </span>
    )}
    {status === 'saved' && (
      <span
        className="flex items-center gap-1 px-2 py-0.5 rounded-full"
        style={{ backgroundColor: 'var(--tm-success-subtle)', color: 'var(--tm-success-text)' }}
      >
        <Check className="w-3.5 h-3.5" /> Saved
      </span>
    )}
    {status === 'error' && (
      <span className="flex items-center gap-1.5" style={{ color: 'var(--tm-danger)' }}>
        <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t save
        <button type="button" onClick={onRetry} className="underline font-semibold hover:no-underline">
          Retry
        </button>
      </span>
    )}
  </div>
);

export default function SettingsModal({
  isOpen,
  onClose,
  onAccountDeleted,
  onSignOut,
  profile,
  profileLoading,
  onSaveProfileField,
  calendarSettings,
  calendarSettingsLoading,
  onSaveCalendarSettings,
  archivedTerms,
  onArchiveTerm,
  onDeleteArchivedTerm,
  initialSection,
}: Props) {
  const { user, isDemo } = useAuth();
  const showToast = useToast();
  const notifications = useOptionalNotifications();
  // Hidden where the API refuses notifications, as the bell is.
  const showNotifications = !!notifications && notifications.status !== 'unavailable';

  // ── Provider detection ───────────────────────────────────────────────────
  // app_metadata is set by Supabase server-side and cannot be spoofed by users.
  const provider: string = (user?.app_metadata?.provider as string) ?? 'email';
  const isOAuth = OAUTH_PROVIDERS.has(provider);
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1); // "Google"

  const available = useCallback((page: SettingsPage) => {
    if (page === 'security') return !isDemo;
    return true;
  }, [isDemo]);
  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(item => available(item.page)) }))
    .filter(g => g.items.length > 0);

  // ── Navigation ───────────────────────────────────────────────────────────
  const [page, setPage] = useState<SettingsPage>('profile');
  // Phone only: the menu list, or one page drilled into from it.
  const [phoneView, setPhoneView] = useState<'menu' | 'page'>('menu');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const currentPage = available(page) ? page : 'profile';
  const currentItem = ALL_ITEMS.find(item => item.page === currentPage)!;

  const openPage = (next: SettingsPage) => {
    setPage(next);
    setPhoneView('page');
    // On a phone the menu disappears, so move focus to the page it opened.
    if (isPhone()) requestAnimationFrame(() => headingRef.current?.focus());
  };

  const backToMenu = () => {
    setPhoneView('menu');
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(`[data-settings-page="${currentPage}"]`)?.focus());
  };

  // ── Autosave ─────────────────────────────────────────────────────────────
  const { statuses, track, retry } = useSaveTracker<SettingsPage>();
  const trackers = useMemo(() => {
    const bound = {} as Record<SettingsPage, TrackSave>;
    for (const { page: p } of ALL_ITEMS) bound[p] = (key, run) => track(p, key, run);
    return bound;
  }, [track]);

  const profileAutosave = useFieldAutosave<ProfileFields>(profile, onSaveProfileField);
  const termAutosave = useFieldAutosave<TermTrackerDraft>(calendarSettings, onSaveCalendarSettings);
  const draft = profileAutosave.value;
  const { set: setProfileField, get: getProfileField, reset: resetProfileEdits, flush: flushProfileEdits } = profileAutosave;
  const { reset: resetTermEdits, flush: flushTermEdits } = termAutosave;

  // ── Undo ─────────────────────────────────────────────────────────────────
  const dismissUndo = useRef<(() => void) | null>(null);
  const offerUndo = useCallback((message: string, undo: () => void) => {
    dismissUndo.current?.();
    dismissUndo.current = showToast(message, 'info', { label: 'Undo', onClick: undo });
  }, [showToast]);

  // The Term Tracker page's archive confirm; reset on open below.
  const [termDialogOpen, setTermDialogOpen] = useState(false);

  // This component stays mounted while closed (renders null below rather
  // than being conditionally rendered by its parent), so each open starts
  // from the requested page and the committed values.
  /* eslint-disable react-hooks/set-state-in-effect -- resetting navigation and drafts each time the modal opens */
  useEffect(() => {
    if (!isOpen) return;
    const requested = initialSection ? (LEGACY_SECTIONS[initialSection] ?? initialSection as SettingsPage) : null;
    setPage(requested ?? 'profile');
    setPhoneView(requested ? 'page' : 'menu');
    resetProfileEdits();
    resetTermEdits();
    setTermDialogOpen(false);
  }, [isOpen, initialSection, resetProfileEdits, resetTermEdits]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A previewed accent or ruling whose save failed goes back to the saved
  // one when the modal closes.
  useEffect(() => {
    if (isOpen) return;
    applyThemeColor(profile.themeAccent);
    applyPageStyle(profile.pageStyle);
  }, [isOpen, profile]);

  const needsPreferences = showNotifications && !notifications.preferences && !notifications.preferencesError;
  const loadNotificationPreferences = notifications?.loadPreferences;
  // The provider loads them after its first successful poll; opening the
  // page before that (or after that poll failed) asks directly.
  useEffect(() => {
    if (isOpen && currentPage === 'notifications' && needsPreferences) void loadNotificationPreferences?.();
  }, [isOpen, currentPage, needsPreferences, loadNotificationPreferences]);

  // ── Dialogs ──────────────────────────────────────────────────────────────
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false);

  const handleClose = () => {
    // Anything still waiting for a pause in typing saves now, not never.
    flushProfileEdits();
    flushTermEdits();
    dismissUndo.current?.();
    onClose();
  };

  if (!isOpen) return null;

  // ── Field handlers ───────────────────────────────────────────────────────
  const on = trackers;
  const toggleRestDay = (day: number, offer = true) => {
    const before = getProfileField('restDays');
    const resting = !before.includes(day);
    const next = resting ? [...before, day].sort() : before.filter(d => d !== day);
    setProfileField(on.workday, 'restDays', next);
    if (!offer) return;
    const label = REST_DAY_OPTIONS.find(o => o.day === day)!.label;
    offerUndo(`${label} is ${resting ? 'now' : 'no longer'} a rest day.`, () => toggleRestDay(day, false));
  };

  const changeMood = (next: MoodCheckinSettings) => {
    const before = getProfileField('moodCheckins');
    setProfileField(on.notifications, 'moodCheckins', next);
    const toggled = MOOD_TOGGLES.find(t => before[t.key] !== next[t.key]);
    if (!toggled) return;
    offerUndo(`${toggled.label} turned ${next[toggled.key] ? 'on' : 'off'}.`, () => {
      setProfileField(on.notifications, 'moodCheckins', { ...getProfileField('moodCheckins'), [toggled.key]: before[toggled.key] });
    });
  };

  const changeTermField = <K extends keyof TermTrackerDraft>(key: K, value: TermTrackerDraft[K]) => {
    // A cleared date can't be saved; keep it on screen until it's filled in.
    termAutosave.set(on.term, key, value, { debounce: true, skipSave: key !== 'title' && !value });
  };

  const termDraft = termAutosave.value;
  const archiveCurrentTerm = async () => {
    // Edits still waiting for their pause save first, so the term archived is the one on screen.
    const unsaved = (Object.keys(termDraft) as (keyof TermTrackerDraft)[])
      .filter(key => termDraft[key] !== calendarSettings[key]);
    resetTermEdits();
    try {
      if (unsaved.length > 0) {
        await onSaveCalendarSettings(Object.fromEntries(unsaved.map(key => [key, termDraft[key]])));
      }
      await onArchiveTerm();
    } catch (err) {
      showToast(describeError(err, "Couldn't archive the term. Try again."), 'error');
      throw err;
    }
    showToast(`${termDraft.title || 'Term'} archived. It stays on your month calendars.`, 'success');
  };
  const deleteArchivedTerm = async (id: number) => {
    try {
      await onDeleteArchivedTerm(id);
    } catch (err) {
      showToast(describeError(err, "Couldn't delete the archived term. Try again."), 'error');
      throw err;
    }
  };

  const pageBody = (() => {
    switch (currentPage) {
      case 'profile':
        return (
          <ProfilePage
            name={draft.name}
            avatar={draft.avatar}
            onNameChange={name => setProfileField(on.profile, 'name', name, { debounce: true })}
            onAvatarChange={avatar => setProfileField(on.profile, 'avatar', avatar)}
            loading={profileLoading}
            isDemo={isDemo}
          />
        );
      case 'security':
        return (
          <SecurityPage
            email={user?.email ?? null}
            oauthProvider={isOAuth ? provider : null}
            providerLabel={providerLabel}
            onAccountDeleted={onAccountDeleted}
            onDialogChange={setSecurityDialogOpen}
          />
        );
      case 'workday':
        return (
          <WorkDayPage
            dayStartTime={draft.dayStartTime}
            shutoffTime={draft.shutoffTime}
            restDays={draft.restDays}
            onDayStartChange={time => setProfileField(on.workday, 'dayStartTime', time, { debounce: true, skipSave: !time })}
            onShutoffChange={time => setProfileField(on.workday, 'shutoffTime', time, { debounce: true, skipSave: !time })}
            onToggleRestDay={day => toggleRestDay(day)}
            loading={profileLoading}
          />
        );
      case 'term':
        return (
          <BigPictureSettingsSection
            value={termDraft}
            onChange={changeTermField}
            loading={calendarSettingsLoading}
            canArchive={calendarSettings.id !== 0 && !!termDraft.start_date && !!termDraft.end_date}
            onArchive={archiveCurrentTerm}
            archivedTerms={archivedTerms}
            onDeleteArchived={deleteArchivedTerm}
            onDialogChange={setTermDialogOpen}
          />
        );
      case 'notifications': {
        const moodCheckins = (
          <MoodCheckinSettingsSection
            value={draft.moodCheckins}
            onChange={changeMood}
            loading={profileLoading}
          />
        );
        if (showNotifications && notifications.preferences) {
          return (
            <NotificationPreferencesForm
              preferences={notifications.preferences}
              onSave={notifications.savePreferences}
              track={on.notifications}
              onUndoableChange={offerUndo}
              moodCheckins={moodCheckins}
            />
          );
        }
        // Until the alert settings load (or where there are none), the mood check-ins stand alone.
        return (
          <div className="space-y-8">
            {showNotifications && (notifications.preferencesError ? (
              <div className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
                <p>Couldn&apos;t load your notification settings.</p>
                <button
                  type="button"
                  onClick={() => void notifications.loadPreferences()}
                  className="mt-1 font-medium hover:underline"
                  style={{ color: 'var(--tm-accent)' }}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="flex justify-center py-6" style={{ color: 'var(--tm-text-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading notification settings" />
              </div>
            ))}
            <SettingsGroup {...MOOD_GROUP}>{moodCheckins}</SettingsGroup>
          </div>
        );
      }
      case 'appearance':
        return (
          <AppearancePage
            themeAccent={draft.themeAccent}
            pageStyle={draft.pageStyle}
            onAccentChange={hex => { applyThemeColor(hex); setProfileField(on.appearance, 'themeAccent', hex); }}
            onPageStyleChange={key => { applyPageStyle(key); setProfileField(on.appearance, 'pageStyle', key); }}
            onSchemeChange={() => void on.appearance('scheme', async () => {})}
          />
        );
      case 'canvas':
        return <CanvasIntegrationSection isDemo={isDemo} />;
    }
  })();

  const closeButton = (
    <button
      type="button"
      onClick={handleClose}
      aria-label="Close settings"
      className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors"
    >
      <X className="w-5 h-5" />
    </button>
  );

  return (
    <Modal
      onClose={handleClose}
      closeOnEscape={!signOutOpen && !securityDialogOpen && !termDialogOpen}
      panelClassName="modal-panel w-full max-w-4xl h-[min(42rem,calc(100dvh-2rem))] flex overflow-hidden"
    >
      <div role="dialog" aria-modal="true" aria-label="Settings" className="flex flex-1 min-w-0 min-h-0">
        {/* ── Menu: the side column on desktop, the whole window on a phone ── */}
        <nav
          ref={navRef}
          aria-label="Settings sections"
          className={`${phoneView === 'page' ? 'hidden' : 'flex'} sm:flex flex-col w-full sm:w-60 shrink-0 min-h-0 overflow-y-auto scrollbar-custom border-r`}
          style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-bg)' }}
        >
          <div className="flex items-center gap-2 px-4 pt-4 pb-1 sm:hidden">
            <h2 className="text-xl text-text-primary flex-1">Settings</h2>
            {closeButton}
          </div>

          <div className="flex items-center gap-2.5 px-4 sm:px-3 pt-3 sm:pt-4 pb-2 min-w-0">
            <ProfileAvatar avatar={draft.avatar} name={draft.name} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{draft.name.trim() || 'You'}</p>
              <p className="text-xs text-text-muted truncate">
                {isDemo ? 'Demo sandbox' : user?.email}
              </p>
              {isOAuth && (
                <span
                  className="inline-block mt-0.5 px-1.5 py-px rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
                >
                  {providerLabel}
                </span>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-2 pb-3 flex-1">
            {groups.map(group => (
              <div key={group.label}>
                <p
                  id={`settings-group-${group.label}`}
                  className="px-1 sm:px-2 pt-4 sm:pt-3 pb-1.5 sm:pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted"
                >
                  {group.label}
                </p>
                <ul
                  aria-labelledby={`settings-group-${group.label}`}
                  className="rounded-xl sm:rounded-none overflow-hidden border sm:border-0 divide-y sm:divide-y-0 bg-surface-raised sm:bg-transparent sm:space-y-0.5"
                  style={{ borderColor: 'var(--tm-border)' }}
                >
                  {group.items.map(({ page: p, label, icon: Icon }) => {
                    const active = p === currentPage;
                    return (
                      <li key={p} style={{ borderColor: 'var(--tm-border-subtle)' }}>
                        <button
                          type="button"
                          data-settings-page={p}
                          onClick={() => openPage(p)}
                          aria-current={active ? 'page' : undefined}
                          className={`w-full flex items-center gap-2.5 px-3 py-3 sm:py-2 sm:rounded-lg text-left text-sm transition-colors ${
                            active
                              ? 'sm:bg-surface-raised text-text-primary sm:font-semibold sm:shadow-[inset_3px_0_0_var(--tm-accent)]'
                              : 'text-text-secondary hover:text-text-primary sm:hover:bg-surface'
                          }`}
                        >
                          <Icon aria-hidden className="w-4 h-4 shrink-0" style={{ color: 'var(--tm-pencil)' }} />
                          <span className="flex-1 truncate">{label}</span>
                          <ChevronRight aria-hidden className="w-4 h-4 shrink-0 text-text-muted sm:hidden" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="px-4 sm:px-2 pb-4 pt-2">
            <button
              type="button"
              onClick={() => setSignOutOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-3 sm:py-2 rounded-xl sm:rounded-lg border sm:border-0 bg-surface-raised sm:bg-transparent text-left text-sm text-text-secondary hover:text-text-primary sm:hover:bg-surface transition-colors"
              style={{ borderColor: 'var(--tm-border)' }}
            >
              <LogOut aria-hidden className="w-4 h-4 shrink-0" style={{ color: 'var(--tm-pencil)' }} />
              Sign out
            </button>
          </div>
        </nav>

        {/* ── Page ── */}
        <section
          aria-labelledby="settings-page-title"
          className={`${phoneView === 'menu' ? 'hidden' : 'flex'} sm:flex flex-col flex-1 min-w-0 min-h-0`}
        >
          <div
            className="flex items-center gap-2 px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-1 border-b sm:border-0 shrink-0"
            style={{ borderColor: 'var(--tm-border)' }}
          >
            <button
              type="button"
              onClick={backToMenu}
              aria-label="Back to settings"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors sm:hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2
              id="settings-page-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-lg sm:text-2xl text-text-primary truncate outline-none"
            >
              {currentItem.label}
            </h2>
            <div className="flex-1 flex justify-end sm:justify-start sm:pl-1">
              <SaveIndicator status={statuses[currentPage]} onRetry={() => retry(currentPage)} />
            </div>
            {closeButton}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-custom px-4 sm:px-6 pt-3 sm:pt-1 pb-6">
            <p className="text-sm mb-5" style={{ color: 'var(--tm-text-muted)' }}>{currentItem.lede}</p>
            {pageBody}
          </div>
        </section>
      </div>

      {signOutOpen && (
        <SignOutConfirm onCancel={() => setSignOutOpen(false)} onConfirm={onSignOut} />
      )}
    </Modal>
  );
}
