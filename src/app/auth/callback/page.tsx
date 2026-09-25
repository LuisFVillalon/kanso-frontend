'use client';

/**
 * OAuth + email-confirmation callback — /auth/callback
 *
 * Supabase redirects here after:
 *   1. Google OAuth completes
 *   2. The user clicks their email-confirmation link
 *
 * Once the Supabase client has established the session from the callback
 * URL, redirect to the dashboard.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import Logo from '@/app/components/common/Logo';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Safety net: if the session exchange hangs, redirect after 15s.
    const fallback = setTimeout(() => router.replace('/'), 15000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        clearTimeout(fallback);
        router.replace('/');
      } else {
        // Session not ready yet — wait for the Supabase client to process the
        // callback URL fragment/code and fire onAuthStateChange.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
            if (session) {
              clearTimeout(fallback);
              subscription.unsubscribe();
              router.replace('/');
            }
          },
        );
      }
    });

    return () => clearTimeout(fallback);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <Logo />
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--tm-accent)', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-text-secondary">Signing you in…</p>
      </div>
    </div>
  );
}
