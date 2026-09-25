'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { validatePassword, MIN_LENGTH } from '@/app/lib/passwordValidation';
import PasswordStrengthMeter from '@/app/components/auth/PasswordStrengthMeter';
import AuthLayout from '@/app/components/auth/AuthLayout';
import AuthErrorMessage from '@/app/components/auth/AuthErrorMessage';
import AuthDivider from '@/app/components/auth/AuthDivider';
import AuthInput from '@/app/components/auth/AuthInput';
import GoogleAuthButton from '@/app/components/auth/GoogleAuthButton';
import DemoTrialButton from '@/app/components/auth/DemoTrialButton';

export default function SignupPage() {
  const { signUpWithEmail, signInWithGoogle, getAccessToken, startDemo, demoSeeding } = useAuth();
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const pwCheck = useMemo(
    () => (password ? validatePassword(password, email) : null),
    [password, email],
  );

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!pwCheck?.ok) { setError(pwCheck?.errors[0] ?? `Password must be at least ${MIN_LENGTH} characters.`); return; }

    setLoading(true);
    const { error } = await signUpWithEmail(email, password);
    setLoading(false);
    if (error) { setError(error.message); return; }

    const token = await getAccessToken();
    if (token) router.replace('/');
    else setConfirmed(true);
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) { setGoogleLoading(false); setError(error.message); }
  };

  const handleDemoTrial = async () => {
    setError(null);
    const { error } = await startDemo();
    if (error) { setError(error); return; }
    router.replace('/');
  };

  if (confirmed) {
    return (
      <AuthLayout
        title={<>Check your <span className="highlight">email</span></>}
        subtitle={<>We sent a confirmation link to <strong className="font-semibold text-text-primary">{email}</strong>.</>}
      >
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
          <MailCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p className="text-sm leading-6 text-text-secondary">
            Open the link to activate your account, then come back and sign in.
            It can take a minute to arrive, so check your spam folder too.
          </p>
        </div>
        <Link href="/login" className="btn btn-primary w-full min-h-11 mt-6">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={<>Create your <span className="highlight">account</span></>}
      subtitle="Tasks, notes and habits in one calm place."
    >
      <GoogleAuthButton label="Continue with Google" loading={googleLoading} onClick={handleGoogleSignup} />
      <AuthDivider />

      <form onSubmit={handleEmailSignup} className="space-y-4">
        <AuthInput
          label="Email" id="email" type="email"
          autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <div>
          <AuthInput
            label="Password" id="password" type="password" revealable
            autoComplete="new-password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters`}
          />
          <PasswordStrengthMeter password={password} check={pwCheck} />
        </div>

        <AuthInput
          label="Confirm password" id="confirm" type="password" revealable
          autoComplete="new-password" required
          value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="Type it again"
        />

        {error && <AuthErrorMessage message={error} />}

        <button
          type="submit" disabled={loading}
          className="btn btn-primary w-full min-h-11 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-center mt-5 text-text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>

      <DemoTrialButton loading={demoSeeding} onClick={handleDemoTrial} />
    </AuthLayout>
  );
}
