import Link from 'next/link';
import AuthPageCard from '@/app/components/auth/AuthPageCard';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <AuthPageCard
      title={<>This page is <span className="highlight">blank</span></>}
      subtitle="The link may be out of date, or the page may have moved."
    >
      <div className="flex justify-center">
        <Link href="/" className="btn btn-primary min-h-11">Back to kanso</Link>
      </div>
    </AuthPageCard>
  );
}
