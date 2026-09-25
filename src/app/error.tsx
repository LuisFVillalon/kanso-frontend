'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import AuthPageCard from '@/app/components/auth/AuthPageCard';

/** Route-level error boundary: shown instead of a blank screen if a page crashes while rendering. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthPageCard
      title="Something went wrong"
      subtitle="This page hit an unexpected error. Your data is saved on the server, so trying again is safe."
    >
      <div className="flex flex-wrap gap-3 justify-center">
        <button type="button" onClick={reset} className="btn btn-primary min-h-11">Try again</button>
        <Link href="/" className="btn btn-secondary min-h-11">Go to dashboard</Link>
      </div>
    </AuthPageCard>
  );
}
