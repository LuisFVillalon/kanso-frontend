import React from 'react';
import { KansoLockupHorizontal } from './KansoLogo';

/** The horizontal kanso lockup (k key + wordmark) for headers and nav. */
const Logo: React.FC<{ className?: string }> = ({ className = 'h-7 w-auto' }) => (
  <KansoLockupHorizontal className={className} />
);

export default Logo;
