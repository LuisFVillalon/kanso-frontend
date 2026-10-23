import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

/** A tinted note inside a task form: a warning, an error, or plain information. */
const Callout: React.FC<{ tone: 'warning' | 'danger' | 'info'; role?: string; children: React.ReactNode }> = ({
  tone, role, children,
}) => {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      role={role}
      className="flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug text-text-primary"
      style={{ backgroundColor: `var(--tm-${tone === 'info' ? 'accent' : tone}-subtle)` }}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: `var(--tm-${tone === 'info' ? 'accent' : tone})` }} />
      <div>{children}</div>
    </div>
  );
};

export default Callout;
