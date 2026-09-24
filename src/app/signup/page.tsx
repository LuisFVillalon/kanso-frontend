'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { validatePassword, MIN_LENGTH } from '@/app/lib/passwordValidation';
import PasswordStrengthMeter from '@/app/components/auth/PasswordStrengthMeter';
import AuthPageCard from '@/app/components/auth/AuthPageCard';
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
      <AuthPageCard>
        <div className="text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--tm-success)' }} />
          <h2 className="text-xl font-bold text-text-primary mb-2">Check your email</h2>
          <p className="text-sm" style={{ color: 'var(--tm-text-muted)' }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then{' '}
            <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--tm-accent)' }}>
              sign in
            </Link>.
          </p>
        </div>
      </AuthPageCard>
    );
  }

  return (
    <AuthPageCard>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Create an account</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--tm-text-muted)' }}>
          Start managing your tasks with kanso
        </p>
      </div>

      <DemoTrialButton loading={demoSeeding} onClick={handleDemoTrial} />

      <GoogleAuthButton label="Sign up with Google" loading={googleLoading} onClick={handleGoogleSignup} />
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
            label="Password" id="password" type="password"
            autoComplete="new-password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder={`Min. ${MIN_LENGTH} characters — try a passphrase`}
          />
          <PasswordStrengthMeter password={password} check={pwCheck} />
        </div>

        <AuthInput
          label="Confirm password" id="confirm" type="password"
          autoComplete="new-password" required
          value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="••••••••"
        />

        {error && (
          <p className="text-sm rounded-md px-3 py-2" style={{ color: 'var(--tm-danger)', backgroundColor: 'var(--tm-danger-subtle)' }}>
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading}
          className="btn btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Create account
        </button>
      </form>

      <p className="text-sm text-center mt-6" style={{ color: 'var(--tm-text-muted)' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--tm-accent)' }}>
          Sign in
        </Link>
      </p>
    </AuthPageCard>
  );
}
