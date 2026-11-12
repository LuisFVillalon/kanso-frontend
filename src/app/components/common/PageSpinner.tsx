import React from 'react';

interface PageSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE = { sm: 'w-8 h-8 border-2', md: 'w-10 h-10 border-4', lg: 'w-16 h-16 border-4' };

const PageSpinner: React.FC<PageSpinnerProps> = ({ size = 'md' }) => (
  <div className="tm-page-min-h flex items-center justify-center">
    <div
      className={`${SIZE[size]} border-t-transparent rounded-full animate-spin`}
      style={{ borderColor: 'var(--tm-accent)', borderTopColor: 'transparent' }}
    />
  </div>
);

export default PageSpinner;
