import React from 'react';
import Logo from '@/app/components/common/Logo';

interface AuthPageCardProps {
  /** Display headline; wrap one word in <span className="highlight"> for the marigold pill. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shell for the signed-out pages, styled after kanso-landing: a hairline top bar
 * with the logo, then a white card bound by the notebook coil.
 */
const AuthPageCard: React.FC<AuthPageCardProps> = ({ title, subtitle, children }) => (
  <div className="min-h-screen flex flex-col">
    <header
      className="sticky top-0 z-40 border-b border-border backdrop-blur shadow-nav"
      style={{ backgroundColor: 'color-mix(in srgb, var(--tm-bg) 92%, transparent)' }}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center px-4 sm:px-6 lg:px-10">
        <Logo />
      </div>
    </header>

    <main id="main" className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[420px]">
        <div className="card relative overflow-hidden px-6 pt-14 pb-8 sm:px-9">
          <div aria-hidden className="coil absolute inset-x-0 top-0" />
          {title && (
            <div className="mb-8 text-center">
              <h1 className="text-[32px] leading-[1.15] font-medium tracking-[-0.03em] text-text-primary">
                {title}
              </h1>
              {subtitle && <p className="mt-3 text-base leading-6 text-text-secondary">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
        <p className="mt-6 text-center text-[13px] leading-5 text-text-muted">kanso · clarity on the go</p>
      </div>
    </main>
  </div>
);

export default AuthPageCard;
