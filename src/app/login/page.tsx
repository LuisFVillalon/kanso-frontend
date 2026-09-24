'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import AuthPageCard from '@/app/components/auth/AuthPageCard';
import AuthDivider from '@/app/components/auth/AuthDivider';
import AuthInput from '@/app/components/auth/AuthInput';
import GoogleAuthButton from '@/app/components/auth/GoogleAuthButton';
import DemoTrialButton from '@/app/components/auth/DemoTrialButton';

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle, startDemo, demoSeeding } = useAuth();
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.replace('/');
  };

  const handleGoogleLogin = async () => {
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

  return (
    <AuthPageCard>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--tm-text-muted)' }}>
          Sign in to your kanso account
        </p>
      </div>

      <DemoTrialButton loading={demoSeeding} onClick={handleDemoTrial} />

      <GoogleAuthButton label="Sign in with Google" loading={googleLoading} onClick={handleGoogleLogin} />
      <AuthDivider />

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <AuthInput
          label="Email" id="email" type="email"
          autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <AuthInput
          label="Password" id="password" type="password"
          autoComplete="current-password" required
          value={password} onChange={e => setPassword(e.target.value)}
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
          Sign in
        </button>
      </form>

      <p className="text-sm text-center mt-6" style={{ color: 'var(--tm-text-muted)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium hover:underline" style={{ color: 'var(--tm-accent)' }}>
          Sign up
        </Link>
      </p>
    </AuthPageCard>
  );
}
