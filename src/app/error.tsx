'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/** Route-level error boundary: shown instead of a blank screen if a page crashes while rendering. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-4" style={{ color: 'var(--tm-danger)' }} />
        <h1 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--tm-text-secondary)' }}>
          This page hit an unexpected error. Your data is saved on the server, so trying again is safe.
        </p>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-outline">Go to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
