'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageSpinner from '@/app/components/common/PageSpinner';

/**
 * Where Google's consent screen comes back to. Settings is a window over the
 * app rather than a page, so this moves on to Home. The app shell has already
 * taken the result out of the address by now (useGoogleCalendarReturn, in a
 * layout effect, which runs before this one) and opens Settings → Google
 * Calendar once the connection is finished.
 */
export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return <PageSpinner />;
}
