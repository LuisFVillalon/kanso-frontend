'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/app/lib/supabase';
import { seedDemoData } from '@/app/lib/backend-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently authenticated user, or null when logged out. */
  user: User | null;
  /** The full session object — contains the access_token (JWT) for API calls. */
  session: Session | null;
  /** True while the initial session is being restored from storage. */
  loading: boolean;
  /** True for a "Try the demo" sandbox (a Supabase anonymous user). */
  isDemo: boolean;
  /** True while a demo sandbox is signed in but still being filled with sample data. */
  demoSeeding: boolean;
  /**
   * The user whose data the app should load: null while signed out or while
   * a demo sandbox is still seeding, so nothing fetches an empty sandbox.
   */
  dataUserId: string | null;

  signUpWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  /** Signs in as a fresh, private demo sandbox and fills it with sample data. */
  startDemo: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;

  /**
   * Returns the current JWT access token (refreshed automatically by the
   * Supabase client). Pass this as the Bearer token to FastAPI.
   */
  getAccessToken: () => Promise<string | null>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the canonical base URL for OAuth redirect URIs, always with a
 * trailing slash so callers can safely append path segments.
 *
 * Resolution order:
 *  1. localhost short-circuit    — always uses window.location.origin so that
 *                                   NEXT_PUBLIC_SITE_URL (a production value)
 *                                   can never hijack local OAuth redirects.
 *  2. NEXT_PUBLIC_SITE_URL       — explicit canonical URL set in Vercel env
 *                                   vars (e.g. https://kanso-web-app.vercel.app).
 *                                   Set this once in Vercel → Settings → Environment
 *                                   Variables for the Production environment only —
 *                                   never in .env on disk.
 *  3. NEXT_PUBLIC_VERCEL_URL     — automatically injected by Vercel for every
 *                                   deployment. Does NOT include the protocol,
 *                                   so we prepend https://.
 *  4. window.location.origin     — fallback for any environment not covered above.
 */
function getURL(): string {
  // Always use the real origin on localhost regardless of any env var,
  // so a production NEXT_PUBLIC_SITE_URL set by mistake never redirects
  // a dev session to the wrong host.
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `${window.location.origin}/`;
  }

  let url: string =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    window.location.origin;

  // NEXT_PUBLIC_VERCEL_URL is protocol-less (e.g. "abc-123.vercel.app").
  if (!url.includes('http')) url = `https://${url}`;

  // Normalise to always have a trailing slash.
  if (!url.endsWith('/')) url = `${url}/`;

  return url;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoSeeding, setDemoSeeding] = useState(false);

  useEffect(() => {
    // 1. Restore session on mount (handles OAuth redirect callbacks too).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Subscribe to auth state changes (login, logout, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Supabase embeds this URL in the confirmation email.
          // Without it the dashboard's "Site URL" is used, which may point to
          // production even when running locally.
          emailRedirectTo: `${getURL()}auth/callback`,
        },
      });
      return { error };
    },
    [],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // After Google redirects back, Supabase handles the token exchange
        // and then forwards the user to this URL.
        redirectTo: `${getURL()}auth/callback`,
        queryParams: {
          // Request a refresh token so the session survives page reloads.
          // 'consent' forces the Google screen to always appear — this is
          // what produces a clean PKCE ?code= redirect instead of the
          // implicit #access_token= hash that can confuse the callback page.
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return { error };
  }, []);

  const startDemo = useCallback(async () => {
    setDemoSeeding(true);
    try {
      // Each visitor gets their own anonymous user, so demo sessions never
      // share data. The backend deletes sandboxes after a day.
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      await seedDemoData();
      return { error: null };
    } catch (err) {
      await supabase.auth.signOut();
      const message = err instanceof Error ? err.message : '';
      return { error: `Couldn't start the demo. Please try again in a moment.${message ? ` (${message})` : ''}` };
    } finally {
      setDemoSeeding(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemo: !!user?.is_anonymous,
        demoSeeding,
        dataUserId: user && !demoSeeding ? user.id : null,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        startDemo,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
