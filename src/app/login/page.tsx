'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import AuthLayout from '@/app/components/auth/AuthLayout';
import AuthErrorMessage from '@/app/components/auth/AuthErrorMessage';
import AuthDivider from '@/app/components/auth/AuthDivider';
import AuthInput from '@/app/components/auth/AuthInput';
import GoogleAuthButton from '@/app/components/auth/GoogleAuthButton';

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle, } = useAuth();
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

  return (
    <AuthLayout
      title={<>Welcome <span className="highlight">back</span></>}
      subtitle="Sign in to pick up where you left off."
    >
      <GoogleAuthButton label="Continue with Google" loading={googleLoading} onClick={handleGoogleLogin} />
      <AuthDivider />

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <AuthInput
          label="Email" id="email" type="email"
          autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <AuthInput
          label="Password" id="password" type="password" revealable
          autoComplete="current-password" required
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Your password"
        />

        {error && <AuthErrorMessage message={error} />}

        <button
          type="submit" disabled={loading}
          className="btn btn-primary w-full min-h-11 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-center mt-5 text-text-secondary">
        New to kanso?{' '}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
