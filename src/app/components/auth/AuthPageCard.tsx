import React from 'react';

interface AuthPageCardProps {
  children: React.ReactNode;
}

const AuthPageCard: React.FC<AuthPageCardProps> = ({ children }) => (
  <div className="min-h-screen flex flex-col">
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p
          className="text-center text-xs uppercase mb-6"
          style={{ letterSpacing: '0.1em', color: 'var(--tm-accent-hover)' }}
        >
          kanso · Clarity on the go
        </p>
        <div className="w-full card p-8">
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default AuthPageCard;
