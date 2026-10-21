'use client';

/**
 * Settings → Sign-in and security — provider-aware.
 *
 * How provider detection works
 * ────────────────────────────
 * Supabase embeds app_metadata.provider in the JWT and in the User object.
 * SettingsModal reads user.app_metadata?.provider to distinguish:
 *
 *   "email"  → local email/password account → email and password changes,
 *               each checking the current password first
 *   "google" → Google OAuth account → a note in place of the password
 *               form, and the email change only sets the contact email
 *
 * This matches the backend guard on POST /update-password, which also reads
 * provider from the JWT payload and returns 403 for OAuth accounts.
 *
 * Passwords typed here are only held in the inputs until they're sent, and
 * every password field is cleared after each attempt.
 */

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, ExternalLink, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';
import { ApiError, deleteAccount, updatePassword } from '@/app/lib/backend-api';
import { validatePassword, MIN_LENGTH } from '@/app/lib/passwordValidation';
import PasswordStrengthMeter from '@/app/components/auth/PasswordStrengthMeter';
import DeleteAccountDialog from '@/app/components/settings/pages/DeleteAccountDialog';

/** Where each OAuth provider lets people manage their own sign-in security. */
const PROVIDER_SECURITY_URLS: Record<string, string> = {
  google: 'https://myaccount.google.com/security',
  github: 'https://github.com/settings/security',
  facebook: 'https://accountscenter.facebook.com/password_and_security',
  twitter: 'https://x.com/settings/security',
  apple: 'https://account.apple.com/account/manage',
};

/** The server's reason when it sent a readable one (e.g. a wrong current password), else `fallback`. */
function serverMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && [400, 401, 403, 422].includes(err.status) && !/^[[{]/.test(err.detail)) {
    return err.detail;
  }
  return fallback;
}

interface Props {
  email: string | null;
  /** The OAuth provider key ("google"), or null for email/password accounts. */
  oauthProvider: string | null;
  providerLabel: string;
  onAccountDeleted: () => void;
  /** True while the delete confirm is open, so Escape closes only it. */
  onDialogChange: (open: boolean) => void;
}

const rowClass = 'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-4 border-b';

const SecurityPage: React.FC<Props> = ({ email, oauthProvider, providerLabel, onAccountDeleted, onDialogChange }) => {
  const isOAuth = oauthProvider !== null;

  // ── Email ─────────────────────────────────────────────────────────────────
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPasswordError, setEmailPasswordError] = useState<string | null>(null);

  const toggleEmailForm = () => {
    setEmailOpen(open => !open);
    setNewEmail('');
    setEmailPassword('');
    setEmailError(null);
    setEmailPasswordError(null);
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailPasswordError(null);
    if (!newEmail.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    const password = emailPassword;
    setEmailPassword('');
    setEmailStatus('saving');
    if (!isOAuth) {
      if (!email) { setEmailStatus('idle'); setEmailError("Couldn't read your current email. Reload and try again."); return; }
      // Re-check the current password before letting the address change, so
      // someone at an unlocked laptop can't take the account over.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setEmailStatus('idle');
        setEmailPasswordError(error.code === 'invalid_credentials' ? "That password isn't right." : error.message);
        return;
      }
    }
    // supabase.auth.updateUser changes the contact/notification email in Supabase.
    // For OAuth users, this does NOT change their provider identity or login method —
    // they still sign in with the provider. Their OAuth link is keyed to the
    // provider's UID, not their email, so app data is safe even if this email changes.
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) { setEmailStatus('idle'); setEmailError(error.message); return; }
    setEmailStatus('done');
    setEmailOpen(false);
    setNewEmail('');
  };

  // ── Password ──────────────────────────────────────────────────────────────
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwStatus, setPwStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [pwError, setPwError] = useState<string | null>(null);

  // Real-time strength check — passes the user's email so email-based passwords are caught.
  const pwCheck = useMemo(
    () => (newPassword ? validatePassword(newPassword, email ?? undefined) : null),
    [newPassword, email],
  );

  const togglePasswordForm = () => {
    setPasswordOpen(open => !open);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwError(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!currentPassword) { setPwError('Enter your current password.'); return; }
    if (!pwCheck?.ok) {
      setPwError(pwCheck?.errors[0] ?? `Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
    const current = currentPassword;
    setCurrentPassword('');
    setPwStatus('saving');
    try {
      // Routes through the backend, which checks the current password and
      // enforces the OAuth guard + policy server-side.
      await updatePassword(newPassword, current);
      setPwStatus('done');
      setPasswordOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwStatus('idle');
      setPwError(serverMessage(err, "Couldn't update your password. Please try again."));
    }
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const openDelete = () => { setDeleteOpen(true); onDialogChange(true); };
  const closeDelete = () => { setDeleteOpen(false); onDialogChange(false); };
  const handleDeleteAccount = async () => {
    await deleteAccount();
    await supabase.auth.signOut();
    onAccountDeleted();
  };

  const helpUrl = oauthProvider ? PROVIDER_SECURITY_URLS[oauthProvider] : undefined;

  return (
    <div>
      {/* ── Email ── */}
      <div className={rowClass} style={{ borderColor: 'var(--tm-border-subtle)' }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{isOAuth ? 'Contact email' : 'Email'}</p>
          <p className="text-xs text-text-muted break-all">{email}</p>
          {isOAuth && (
            <p className="text-xs text-text-muted">Used for notices only. You still sign in with {providerLabel}.</p>
          )}
        </div>
        <button type="button" onClick={toggleEmailForm} aria-expanded={emailOpen} className="btn btn-outline text-xs py-1.5 px-3">
          {emailOpen ? 'Cancel' : 'Change'}
        </button>
        {emailStatus === 'done' && !emailOpen && (
          <p role="status" className="basis-full text-sm" style={{ color: 'var(--tm-success-text)' }}>
            {isOAuth ? 'Contact email updated.' : 'Confirmation sent. Open the link in your new inbox to finish the change.'}
          </p>
        )}
        {emailOpen && (
          <form onSubmit={handleChangeEmail} className="basis-full space-y-3 pt-1">
            <div>
              <label htmlFor="settings-new-email" className="block text-xs font-medium text-text-muted mb-1">
                {isOAuth ? 'New contact email' : 'New email'}
              </label>
              <input
                id="settings-new-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="input-field w-full text-sm"
              />
            </div>
            {!isOAuth && (
              <div>
                <label htmlFor="settings-email-current-password" className="block text-xs font-medium text-text-muted mb-1">
                  Current password
                </label>
                <input
                  id="settings-email-current-password"
                  type="password"
                  value={emailPassword}
                  onChange={e => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  aria-invalid={!!emailPasswordError}
                  aria-describedby={emailPasswordError ? 'settings-email-current-password-error' : undefined}
                  className="input-field w-full text-sm"
                />
                {emailPasswordError && (
                  <p id="settings-email-current-password-error" role="alert" className="text-xs mt-1" style={{ color: 'var(--tm-danger)' }}>
                    {emailPasswordError}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>
              {isOAuth
                ? `This changes where kanso sends notices. Your ${providerLabel} sign-in doesn't change, and your data stays linked to your account.`
                : 'We send a link to the new address. Nothing changes until you open it.'}
            </p>
            {emailError && <p role="alert" className="text-sm" style={{ color: 'var(--tm-danger)' }}>{emailError}</p>}
            <button type="submit" disabled={emailStatus === 'saving'} className="btn btn-primary text-sm py-2 disabled:opacity-60">
              {emailStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {isOAuth ? 'Update contact email' : 'Send confirmation link'}
            </button>
          </form>
        )}
      </div>

      {/* ── Password ── */}
      {isOAuth ? (
        <div className={rowClass} style={{ borderColor: 'var(--tm-border-subtle)' }}>
          <div className="flex gap-3 min-w-0 flex-1">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-accent)' }} />
            <div>
              <p className="text-sm font-medium text-text-primary">Signed in with {providerLabel}</p>
              <p className="text-xs text-text-muted">
                There&apos;s no separate kanso password. {providerLabel} keeps your sign-in secure.
              </p>
            </div>
          </div>
          {helpUrl && (
            <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline text-xs py-1.5 px-3">
              <ExternalLink className="w-3.5 h-3.5" />
              {providerLabel} security
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      ) : (
        <div className={rowClass} style={{ borderColor: 'var(--tm-border-subtle)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">Password</p>
            <p className="text-xs text-text-muted">Use at least {MIN_LENGTH} characters. A passphrase of random words works well.</p>
          </div>
          <button type="button" onClick={togglePasswordForm} aria-expanded={passwordOpen} className="btn btn-outline text-xs py-1.5 px-3">
            {passwordOpen ? 'Cancel' : 'Change'}
          </button>
          {pwStatus === 'done' && !passwordOpen && (
            <p role="status" className="basis-full text-sm" style={{ color: 'var(--tm-success-text)' }}>Password updated.</p>
          )}
          {passwordOpen && (
            <form onSubmit={handleChangePassword} className="basis-full space-y-3 pt-1">
              <div>
                <label htmlFor="settings-current-password" className="block text-xs font-medium text-text-muted mb-1">
                  Current password
                </label>
                <input
                  id="settings-current-password"
                  type={showPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="input-field w-full text-sm"
                />
              </div>
              <div>
                <label htmlFor="settings-new-password" className="block text-xs font-medium text-text-muted mb-1">New password</label>
                <div className="relative">
                  <input
                    id="settings-new-password"
                    type={showPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={`At least ${MIN_LENGTH} characters, a passphrase works well`}
                    autoComplete="new-password"
                    required
                    className="input-field w-full pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
                    aria-pressed={showPw}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={newPassword} check={pwCheck} />
              </div>
              <div>
                <label htmlFor="settings-confirm-password" className="block text-xs font-medium text-text-muted mb-1">
                  Repeat new password
                </label>
                <input
                  id="settings-confirm-password"
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="input-field w-full text-sm"
                />
              </div>
              {pwError && <p role="alert" className="text-sm" style={{ color: 'var(--tm-danger)' }}>{pwError}</p>}
              <button
                type="submit"
                disabled={pwStatus === 'saving' || !pwCheck?.ok}
                className="btn btn-primary text-sm py-2 disabled:opacity-60"
              >
                {pwStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
                Update password
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Danger zone ── */}
      <section
        aria-labelledby="settings-danger-title"
        className="mt-8 p-4 rounded-lg"
        style={{ border: '1px dashed var(--tm-danger)', backgroundColor: 'color-mix(in srgb, var(--tm-danger-subtle) 40%, transparent)' }}
      >
        <h3 id="settings-danger-title" className="text-sm font-semibold" style={{ color: 'var(--tm-danger)' }}>Delete account</h3>
        <p className="text-xs mt-1 mb-3" style={{ color: 'var(--tm-text-secondary)' }}>
          Permanently deletes your tasks, notes, habits, check-ins and settings.
          {isOAuth && ` Your ${providerLabel} account is not affected.`}
        </p>
        <button
          type="button"
          onClick={openDelete}
          className="btn text-xs py-1.5 px-3"
          style={{ color: 'var(--tm-danger)', border: '1px solid var(--tm-danger)', backgroundColor: 'transparent' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete account…
        </button>
      </section>

      {deleteOpen && (
        <DeleteAccountDialog
          email={email}
          providerLabel={isOAuth ? providerLabel : null}
          onCancel={closeDelete}
          onConfirm={handleDeleteAccount}
        />
      )}
    </div>
  );
};

export default SecurityPage;
