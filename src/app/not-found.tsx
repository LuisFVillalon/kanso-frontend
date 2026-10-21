import Link from 'next/link';
import AuthPageCard from '@/app/components/auth/AuthPageCard';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <AuthPageCard
      title="This page is blank"
      subtitle="The link may be out of date, or the page may have moved."
    >
      <p className="mb-6 text-center text-small text-text-muted">
        <kbd className="rounded-sm border border-border-strong bg-surface-raised px-1.5 py-0.5 font-sans">Ctrl</kbd> + <kbd className="rounded-sm border border-border-strong bg-surface-raised px-1.5 py-0.5 font-sans">Zen</kbd>
      </p>
      <div className="flex justify-center">
        <Link href="/" className="btn btn-primary min-h-11">Back to kanso</Link>
      </div>
    </AuthPageCard>
  );
}
