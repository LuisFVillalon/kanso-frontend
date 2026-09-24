import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <p className="text-xs uppercase mb-2" style={{ letterSpacing: '0.1em', color: 'var(--tm-text-muted)' }}>
          404
        </p>
        <h1 className="text-xl font-bold text-text-primary mb-2">This page doesn&apos;t exist</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--tm-text-secondary)' }}>
          The link may be out of date, or the page may have moved.
        </p>
        <Link href="/" className="btn btn-primary">Back to kanso</Link>
      </div>
    </main>
  );
}
