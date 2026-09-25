import React from 'react';
import Logo from '@/app/components/common/Logo';
import ThemeToggle from '@/app/components/common/ThemeToggle';
import AuthShowcase from '@/app/components/auth/AuthShowcase';

/** The kanso-landing marketing site; falls back to this app's own signed-out home. */
const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? '/';

interface AuthLayoutProps {
  /** Display headline; wrap one word in <span className="highlight"> for the marigold pill. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Split-screen shell for sign-in and sign-up: the form sits straight on the
 * paper canvas on the left; from lg up, a flat sky-wash panel on the right
 * previews the app. Single column on smaller screens.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <div className="min-h-screen grid lg:grid-cols-2">
    <div className="flex min-h-screen flex-col px-5 sm:px-10">
      <header className="flex h-16 items-center justify-between">
        <a href={LANDING_URL} aria-label="kanso home" className="rounded-md">
          <Logo />
        </a>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[400px] animate-fade-in">
          <h1 className="text-[34px] leading-[1.15] font-medium tracking-[-0.03em] text-text-primary sm:text-[40px]">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-base leading-6 text-text-secondary">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <footer className="py-6 text-[13px] leading-5 text-text-muted">kanso · clarity on the go</footer>
    </div>

    <AuthShowcase />
  </div>
);

export default AuthLayout;
