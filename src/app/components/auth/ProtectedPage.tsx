'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import PageSpinner from '@/app/components/common/PageSpinner';

interface ProtectedPageProps {
  children: React.ReactNode;
}

const ProtectedPage: React.FC<ProtectedPageProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Navigating is a side effect, so it belongs in an effect, not in render.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <PageSpinner />;

  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
};

export default ProtectedPage;
