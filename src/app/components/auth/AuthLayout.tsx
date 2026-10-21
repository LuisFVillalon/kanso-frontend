import React from 'react';
import { KansoLockupStacked } from '@/app/components/common/KansoLogo';
import ThemeToggle from '@/app/components/common/ThemeToggle';
import AuthShowcase from '@/app/components/auth/AuthShowcase';

/** The kanso-landing marketing site; falls back to the production landing deploy. */
const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://kanso-landing.vercel.app';

interface AuthLayoutProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Split-screen shell for sign-in and sign-up: the stacked kanso lockup and
 * the form sit straight on the paper canvas on the left; from lg up, a panel
 * on the right previews the app. Single column on smaller screens.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <div className="min-h-screen grid lg:grid-cols-2">
    <div className="flex min-h-screen flex-col px-5 sm:px-10">
      <header className="flex h-16 items-center justify-end">
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <a href={LANDING_URL} aria-label="kanso home" className="mb-8 inline-block rounded-md">
            <KansoLockupStacked className="h-24 w-auto" title="" />
          </a>
          <h1 className="text-[34px] leading-[42px] text-text-primary sm:text-h1">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-base leading-6 text-text-secondary">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <footer className="py-6 font-display text-[15px] italic leading-5 text-text-muted">Keep it kanso.</footer>
    </div>

    <AuthShowcase />
  </div>
);

export default AuthLayout;
