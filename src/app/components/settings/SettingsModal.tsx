'use client';

/**
 * Account Settings modal — provider-aware.
 *
 * How provider detection works
 * ────────────────────────────
 * Supabase embeds app_metadata.provider in the JWT and in the User object.
 * We read user.app_metadata?.provider to distinguish:
 *
 *   "email"  → local email/password account  → all controls enabled
 *   "google" → Google OAuth account          → password tab disabled,
 *               email tab shows a note about OAuth identity
 *
 * This matches the backend guard on POST /update-password, which also reads
 * provider from the JWT payload and returns 403 for OAuth accounts.
 *
 * Demo sandboxes (Supabase anonymous users) have no credentials or account to
 * manage, so they only get the Profile tab.
 */

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { X, Loader2, Eye, EyeOff, AlertTriangle, ExternalLink, ShieldCheck, User, Check, Palette, CircleUserRound, Info } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { useAuth } from '@/app/context/AuthContext';
import { updatePassword, deleteAccount } from '@/app/lib/backend-api';
import { validatePassword, MIN_LENGTH } from '@/app/lib/passwordValidation';
import PasswordStrengthMeter from '@/app/components/auth/PasswordStrengthMeter';
import { applyThemeColor } from '@/app/lib/theme';
import { PAGE_STYLES, applyPageStyle } from '@/app/lib/pageStyle';
import { AVATAR_OPTIONS } from '@/app/lib/avatar';
import ThemeAccentPicker from '@/app/components/settings/ThemeAccentPicker';
import BigPictureSettingsSection, { type TermTrackerDraft } from '@/app/components/settings/BigPictureSettingsSection';
import Modal from '@/app/components/common/Modal';
import type { ProfileFields } from '@/app/hooks/useProfile';
import type { CalendarSettings } from '@/app/types/calendar';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccountDeleted: () => void;
  profile: ProfileFields;
  profileLoading: boolean;
  onSaveProfile: (next: ProfileFields) => Promise<{ ok: boolean; error?: string }>;
  calendarSettings: CalendarSettings;
  calendarSettingsLoading: boolean;
  onSaveCalendarSettings: (changes: Partial<Omit<CalendarSettings, 'id'>>) => Promise<CalendarSettings>;
}

type Section = 'profile' | 'password' | 'email' | 'delete';

// Providers that use a federated identity — they have no local password.
const OAUTH_PROVIDERS = new Set(['google', 'github', 'facebook', 'twitter', 'apple']);

// Day-of-week indices follow JS Date#getDay() (0 = Sunday … 6 = Saturday),
// matching the isWeekend/isWeekday convention used in BigPictureCalendar.
const REST_DAY_OPTIONS: { day: number; label: string }[] = [
  { day: 0, label: 'Sun' },
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];
export default function SettingsModal({
  isOpen,
  onClose,
  onAccountDeleted,
  profile,
  profileLoading,
  onSaveProfile,
  calendarSettings,
  calendarSettingsLoading,
  onSaveCalendarSettings,
}: Props) {
  const { user, isDemo } = useAuth();

  // ── Provider detection ───────────────────────────────────────────────────
  // app_metadata is set by Supabase server-side and cannot be spoofed by users.
  const provider: string = (user?.app_metadata?.provider as string) ?? 'email';
  const isOAuth = OAUTH_PROVIDERS.has(provider);
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1); // "Google"

  // Start on 'profile' tab by default.
  const [section, setSection] = useState<Section>('profile');

  // ── Profile ──────────────────────────────────────────────────────────────
  // Draft copies of the shared profile (see hooks/useProfile.ts) — edited
  // freely here, only committed (backend + localStorage) via onSaveProfile
  // when the user clicks Save. Resynced from `profile` below whenever the
  // modal (re)opens, so closing without saving never leaves a stale draft.
  const [profileName, setProfileName] = useState(profile.name);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(profile.avatar);
  const [dayStartTime, setDayStartTime] = useState(profile.dayStartTime);
  const [callItADay, setCallItADay] = useState(profile.shutoffTime);
  const [restDays, setRestDays] = useState<number[]>(profile.restDays);
  const [themeColor, setThemeColor] = useState(profile.themeAccent);
  const [pageStyle, setPageStyle] = useState(profile.pageStyle);
  const toggleRestDay = (day: number) => {
    setRestDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()));
  };
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ── Term Tracker (Big Picture Calendar) ─────────────────────────────────
  // Lives in its own backend table (calendar_settings), not on `profile`, so
  // it's a separate prop (see hooks/useCalendarSettings.ts) — but the draft is
  // only persisted (onSaveCalendarSettings) from handleSaveProfile below,
  // alongside the rest of this tab's Save Profile click. Resynced from
  // `calendarSettings` below whenever the modal (re)opens, same as `profile`.
  const [termTracker, setTermTracker] = useState<TermTrackerDraft>(calendarSettings);
  const updateTermTrackerField = <K extends keyof TermTrackerDraft>(key: K, value: TermTrackerDraft[K]) => {
    setTermTracker(prev => ({ ...prev, [key]: value }));
  };

  // This component stays mounted while closed (renders null below rather
  // than being conditionally rendered by its parent), so there's no natural
  // remount to reset the draft on each open the way there would be if it
  // unmounted — an explicit resync on `isOpen` becoming true is the only way
  // to discard whatever was left over from the last time it was open.
  /* eslint-disable react-hooks/set-state-in-effect -- resetting the draft from the committed profile on open, not synchronizing derived state on every profile change */
  useEffect(() => {
    if (!isOpen) return;
    setProfileName(profile.name);
    setProfileAvatar(profile.avatar);
    setDayStartTime(profile.dayStartTime);
    setCallItADay(profile.shutoffTime);
    setRestDays(profile.restDays);
    setThemeColor(profile.themeAccent);
    setPageStyle(profile.pageStyle);
    setTermTracker(calendarSettings);
  }, [isOpen, profile, calendarSettings]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Closing the modal without saving reverts any previewed-but-unsaved
  // color/page-ruling changes back to whatever's actually persisted.
  useEffect(() => {
    if (isOpen) return;
    applyThemeColor(profile.themeAccent);
    applyPageStyle(profile.pageStyle);
  }, [isOpen, profile]);

  // Picking a swatch previews it live on the whole app immediately, but only
  // persists (localStorage) when the user clicks Save Profile.
  const handlePickThemeColor = (hex: string) => {
    setThemeColor(hex);
    applyThemeColor(hex);
  };

  const handlePickPageStyle = (key: string) => {
    setPageStyle(key);
    applyPageStyle(key);
  };

  // Small inline preview of each ruling, scaled down to fit a swatch button.
  const pagePreviewStyle = (key: string): React.CSSProperties => {
    const ink = 'color-mix(in srgb, var(--tm-text-primary) 22%, transparent)';
    switch (key) {
      case 'dot':
        return { backgroundImage: `radial-gradient(${ink} 1px, transparent 1.4px)`, backgroundSize: '8px 8px' };
      case 'college':
        return { backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: '100% 7px' };
      case 'wide':
        return { backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: '100% 11px' };
      case 'isometric':
        return {
          backgroundImage: `radial-gradient(${ink} 1px, transparent 1.4px), radial-gradient(${ink} 1px, transparent 1.4px)`,
          backgroundSize: '9px 9px',
          backgroundPosition: '0 0, 4.5px 4.5px',
        };
      case 'blank':
        return {};
      case 'graph':
      default:
        return {
          backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
        };
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaving(true);

    const result = await onSaveProfile({
      name: profileName,
      avatar: profileAvatar,
      themeAccent: themeColor,
      pageStyle,
      dayStartTime,
      shutoffTime: callItADay,
      restDays,
      layoutOrder: profile.layoutOrder,
      layoutSizes: profile.layoutSizes,
      appMode: profile.appMode,
      dailyBriefCollapsed: profile.dailyBriefCollapsed,
      dashboardView: profile.dashboardView,
      notesViewMode: profile.notesViewMode,
    });

    let termTrackerError: string | null = null;
    try {
      setTermTracker(await onSaveCalendarSettings(termTracker));
    } catch (err) {
      termTrackerError = err instanceof Error ? err.message : 'Failed to save term tracker settings.';
    }

    setProfileSaving(false);
    if (result.ok && !termTrackerError) {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } else {
      setProfileError(result.error ?? termTrackerError ?? 'Failed to save profile.');
    }
  };

  // ── Change Password ──────────────────────────────────────────────────────
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw]                   = useState(false);
  const [pwStatus, setPwStatus]               = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [pwError, setPwError]                 = useState<string | null>(null);

  // Real-time strength check — passes the user's email so email-based passwords are caught.
  const pwCheck = useMemo(
    () => (newPassword ? validatePassword(newPassword, user?.email ?? undefined) : null),
    [newPassword, user?.email],
  );

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!pwCheck?.ok) {
      setPwError(pwCheck?.errors[0] ?? `Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
    setPwStatus('saving');
    try {
      // Routes through the backend, which enforces the OAuth guard + length server-side.
      await updatePassword(newPassword);
      setPwStatus('done');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwStatus('error');
      setPwError(err instanceof Error ? err.message : 'Password update failed.');
    }
  };

  // ── Change Email ─────────────────────────────────────────────────────────
  const [newEmail, setNewEmail]       = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [emailError, setEmailError]   = useState<string | null>(null);

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (!newEmail.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    setEmailStatus('saving');
    // supabase.auth.updateUser changes the contact/notification email in Supabase.
    // For OAuth users, this does NOT change their Google identity or login method —
    // they still sign in with Google. Their OAuth link is keyed to their Google UID,
    // not their email, so app data is safe even if this email changes.
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) { setEmailStatus('error'); setEmailError(error.message); return; }
    setEmailStatus('done');
    setNewEmail('');
  };

  // ── Delete Account ───────────────────────────────────────────────────────
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteStatus, setDeleteStatus]           = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError]             = useState<string | null>(null);
  const DELETE_PHRASE = 'delete my account';

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleteStatus('deleting');
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      onAccountDeleted();
    } catch (err) {
      setDeleteStatus('error');
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed.');
    }
  };

  if (!isOpen) return null;

  const tabStyle = (s: Section): React.CSSProperties => {
    if (section !== s) return {};
    if (s === 'delete') return { backgroundColor: 'var(--tm-danger)' };
    return { backgroundColor: 'var(--tm-accent)' };
  };

  const tabClass = (s: Section) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
      section === s
        ? s === 'delete' ? 'text-white' : 'text-[var(--tm-accent-text)]'
        : s === 'password' && isOAuth
          ? 'opacity-40 cursor-not-allowed text-[var(--tm-text-muted)]'
          : 'text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)]'
    }`;

  return (
    <Modal
      onClose={onClose}
      panelClassName="modal-panel w-full max-w-lg flex flex-col max-h-[90vh] relative bg-[var(--tm-surface)] border border-[var(--tm-border)]"
    >
        {/* ── Profile save/error toast — floats above everything, doesn't shift layout ── */}
        {section === 'profile' && (profileSaved || profileError) && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white pointer-events-none"
            style={{
              backgroundColor: profileError ? 'var(--tm-danger)' : 'var(--tm-success)',
              boxShadow: 'var(--tm-shadow-lg)',
            }}
          >
            {profileError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
            <span>{profileError ?? 'Profile saved.'}</span>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4 border-b shrink-0"
          style={{ borderColor: 'var(--tm-border)' }}
        >
          <div>
            <h2 className="text-lg font-bold text-text-primary">Account Settings</h2>
            {user?.email && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--tm-text-muted)' }}>
                {user.email}, aka {profileName}
                {isOAuth && (
                  <span
                    className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
                  >
                    {providerLabel}
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
        <div
          className="flex gap-1 px-6 py-3 border-b overflow-x-auto scrollbar-custom shrink-0"
          style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface-raised)' }}
        >
          <button
            onClick={() => setSection('profile')}
            className={tabClass('profile')}
            style={tabStyle('profile')}
          >
            Profile
          </button>
          {!isDemo && <>
            <button
              onClick={() => !isOAuth && setSection('password')}
              className={tabClass('password')}
              style={tabStyle('password')}
              title={isOAuth ? `Password management is handled by ${providerLabel}` : undefined}
            >
              Password
            </button>
            <button
              onClick={() => setSection('email')}
              className={tabClass('email')}
              style={tabStyle('email')}
            >
              Email
            </button>
            <button
              onClick={() => setSection('delete')}
              className={tabClass('delete')}
              style={tabStyle('delete')}
            >
              Delete Account
            </button>
          </>}
        </div>

        {isDemo && (
          <div
            className="flex items-start gap-2 px-6 py-3 border-b text-sm shrink-0"
            style={{ borderColor: 'var(--tm-border)', color: 'var(--tm-text-secondary)' }}
          >
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-accent)' }} />
            <p>
              You&apos;re in a private demo sandbox, which is deleted after a day.{' '}
              <Link href="/signup" className="font-medium hover:underline" style={{ color: 'var(--tm-accent)' }}>
                Create an account
              </Link>{' '}
              to keep your own data.
            </p>
          </div>
        )}

        <div className="px-6 py-5 overflow-y-auto flex-1 scrollbar-custom">

          {/* ── Profile Tab ──────────────────────────────────────────────── */}
          {section === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--tm-text-secondary)' }}>
                <User className="w-4 h-4" />
                <p className="text-sm">Customize how kanso knows you.</p>
                {profileLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Your Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  disabled={profileLoading}
                  placeholder="User name"
                  className="input-field w-full text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--tm-text-secondary)' }}>
                  <CircleUserRound className="w-4 h-4" />
                  <p className="text-sm">Choose an avatar icon.</p>
                </div>
                <div className="grid grid-cols-6 gap-3">
                  <button
                    type="button"
                    onClick={() => setProfileAvatar(null)}
                    title="None"
                    aria-label="No avatar icon — use initial"
                    aria-pressed={!profileAvatar}
                    className="aspect-square w-full flex items-center justify-center rounded-full transition-transform hover:scale-105"
                    style={{
                      backgroundColor: 'var(--tm-accent-subtle)',
                      color: 'var(--tm-accent-hover)',
                      border: !profileAvatar ? '2px solid var(--tm-text-primary)' : '1px solid var(--tm-border)',
                    }}
                  >
                    <span className="text-sm font-bold">{(profileName.trim()[0] ?? '?').toUpperCase()}</span>
                  </button>
                  {AVATAR_OPTIONS.map(({ key, label, icon: Icon }) => {
                    const selected = profileAvatar === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setProfileAvatar(key)}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected}
                        className="aspect-square w-full flex items-center justify-center rounded-full transition-transform hover:scale-105"
                        style={{
                          backgroundColor: 'var(--tm-accent-subtle)',
                          color: 'var(--tm-accent-hover)',
                          border: selected ? '2px solid var(--tm-text-primary)' : '1px solid var(--tm-border)',
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Daily work window</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Starts</label>
                    <input
                      type="time"
                      value={dayStartTime}
                      onChange={e => setDayStartTime(e.target.value)}
                      disabled={profileLoading}
                      className="input-field w-full text-sm disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Ends</label>
                    <input
                      type="time"
                      value={callItADay}
                      onChange={e => setCallItADay(e.target.value)}
                      disabled={profileLoading}
                      className="input-field w-full text-sm disabled:opacity-60"
                    />
                  </div>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--tm-text-muted)' }}>
                  Used to calculate your working window and timer.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Rest days</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {REST_DAY_OPTIONS.map(({ day, label }) => {
                    const selected = restDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleRestDay(day)}
                        disabled={profileLoading}
                        aria-pressed={selected}
                        aria-label={label}
                        title={label}
                        className="py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                        style={{
                          backgroundColor: selected ? 'var(--tm-accent)' : 'var(--tm-surface-raised)',
                          color: selected ? '#fff' : 'var(--tm-text-secondary)',
                          border: selected ? '1px solid var(--tm-accent)' : '1px solid var(--tm-border)',
                        }}
                      >
                        {label[0]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--tm-text-muted)' }}>
                  On rest days, the daily work window timer won&apos;t run.
                </p>
              </div>

              <BigPictureSettingsSection
                value={termTracker}
                onChange={updateTermTrackerField}
                loading={calendarSettingsLoading}
              />

              {/* ── Appearance ───────────────────────────────────────────── */}
              <div className="pt-5 mt-5 border-t space-y-5" style={{ borderColor: 'var(--tm-border)' }}>
                <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--tm-text-secondary)' }}>
                  <Palette className="w-4 h-4" />
                  <p className="text-sm">
                    Give the app an accent color — surfaces and ink stay the same, just the highlight changes.
                  </p>
                </div>

                <ThemeAccentPicker value={themeColor} onChange={handlePickThemeColor} />

                <p className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>
                  Preview updates instantly — click Save Profile to keep it on this device.
                </p>

                <div className="pt-1 border-t" style={{ borderColor: 'var(--tm-border)' }}>
                  <p className="text-sm mt-4 mb-3" style={{ color: 'var(--tm-text-secondary)' }}>
                    Pick a page ruling for the background.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {PAGE_STYLES.map(p => {
                      const selected = pageStyle === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => handlePickPageStyle(p.key)}
                          title={p.description}
                          aria-label={p.label}
                          aria-pressed={selected}
                          className="flex flex-col items-stretch transition-transform hover:scale-105"
                        >
                          <div
                            className="h-12 w-full flex items-start justify-end p-1 rounded-md"
                            style={{
                              backgroundColor: 'var(--tm-bg)',
                              border: selected ? '2px solid var(--tm-text-primary)' : '1px solid var(--tm-border)',
                              ...pagePreviewStyle(p.key),
                            }}
                          >
                            {selected && (
                              <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--tm-accent)' }} />
                            )}
                          </div>
                          <span
                            className="text-xs mt-1 font-medium"
                            style={{ color: selected ? 'var(--tm-text-primary)' : 'var(--tm-text-secondary)' }}
                          >
                            {p.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={profileSaving}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-[var(--tm-accent-text)] disabled:opacity-60"
                style={{ backgroundColor: 'var(--tm-accent)' }}
              >
                {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Profile
              </button>
            </form>
          )}

          {/* ── Password Tab ─────────────────────────────────────────────── */}
          {section === 'password' && (
            isOAuth ? (
              /* OAuth users: password is managed externally */
              <div className="space-y-4">
                <div
                  className="flex gap-3 p-4 rounded-lg"
                  style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
                >
                  <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tm-accent)' }} />
                  <div>
                    <p className="text-sm font-semibold text-text-primary mb-1">
                      Signed in with {providerLabel}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
                      Your account uses {providerLabel} for authentication. You don&apos;t have a
                      separate kanso password — {providerLabel} handles your security.
                    </p>
                  </div>
                </div>
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-primary)', border: '1px solid var(--tm-border)' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  Manage security at myaccount.google.com
                </a>
              </div>
            ) : (
              /* Email users: standard password form */
              <form onSubmit={handleChangePassword} className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
                  Use at least {MIN_LENGTH} characters. A long passphrase of random words is
                  easier to remember and harder to crack.
                </p>

                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder={`Min. ${MIN_LENGTH} characters — try a passphrase`}
                      required
                      className="input-field w-full pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthMeter password={newPassword} check={pwCheck} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Confirm New Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="input-field w-full text-sm"
                  />
                </div>

                {pwError && <p className="text-sm" style={{ color: 'var(--tm-danger)' }}>{pwError}</p>}
                {pwStatus === 'done' && (
                  <p className="text-sm" style={{ color: 'var(--tm-success)' }}>Password updated successfully.</p>
                )}

                <button
                  type="submit"
                  disabled={pwStatus === 'saving' || !pwCheck?.ok}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-[var(--tm-accent-text)] disabled:opacity-60"
                  style={{ backgroundColor: 'var(--tm-accent)' }}
                >
                  {pwStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update Password
                </button>
              </form>
            )
          )}

          {/* ── Email Tab ────────────────────────────────────────────────── */}
          {section === 'email' && (
            <form onSubmit={handleChangeEmail} className="space-y-4">
              {isOAuth ? (
                /* OAuth users: explain what changing email actually does */
                <div
                  className="flex gap-3 p-3 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)' }}
                >
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--tm-accent)' }} />
                  <p style={{ color: 'var(--tm-text-secondary)' }}>
                    This changes your <strong>contact/notification email</strong> in kanso.
                    Your <strong>{providerLabel} login is not affected</strong> — you&apos;ll still sign
                    in with {providerLabel}, and all your data stays linked to your account.
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
                  Supabase will send a confirmation link to your new address. Your email won&apos;t
                  change until you click it.
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  {isOAuth ? 'New Contact Email' : 'New Email Address'}
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="input-field w-full text-sm"
                />
              </div>

              {emailError && <p className="text-sm" style={{ color: 'var(--tm-danger)' }}>{emailError}</p>}
              {emailStatus === 'done' && (
                <p className="text-sm" style={{ color: 'var(--tm-success)' }}>
                  {isOAuth
                    ? 'Contact email updated.'
                    : 'Confirmation sent — check your new inbox to complete the change.'}
                </p>
              )}

              <button
                type="submit"
                disabled={emailStatus === 'saving'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-[var(--tm-accent-text)] disabled:opacity-60"
                style={{ backgroundColor: 'var(--tm-accent)' }}
              >
                {emailStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                {isOAuth ? 'Update Contact Email' : 'Send Confirmation'}
              </button>
            </form>
          )}

          {/* ── Delete Account Tab ───────────────────────────────────────── */}
          {section === 'delete' && (
            <div className="space-y-4">
              <div
                className="flex gap-3 p-3 rounded-lg"
                style={{ backgroundColor: 'var(--tm-danger-subtle, #fef2f2)', border: '1px solid var(--tm-danger)' }}
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--tm-danger)' }} />
                <p className="text-sm" style={{ color: 'var(--tm-danger)' }}>
                  <strong>This is permanent.</strong> All your tasks, notes, tags, and calendar
                  settings will be deleted and cannot be recovered.
                  {isOAuth && ` Your ${providerLabel} account itself is not affected.`}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Type <strong className="text-text-primary">{DELETE_PHRASE}</strong> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={DELETE_PHRASE}
                  className="input-field w-full text-sm"
                />
              </div>

              {deleteError && <p className="text-sm" style={{ color: 'var(--tm-danger)' }}>{deleteError}</p>}

              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== DELETE_PHRASE || deleteStatus === 'deleting'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--tm-danger)' }}
              >
                {deleteStatus === 'deleting' && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete My Account
              </button>
            </div>
          )}

        </div>
    </Modal>
  );
}
