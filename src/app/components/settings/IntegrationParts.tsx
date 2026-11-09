'use client';

import React from 'react';
import { Check } from 'lucide-react';

/** The outcome line an integration's settings page shows after an action. */
export type IntegrationNoticeValue = { tone: 'success' | 'error'; text: string };

export const IntegrationBanner: React.FC<{ tone: 'warning' | 'danger'; icon: React.ElementType; children: React.ReactNode }> = ({
  tone,
  icon: Icon,
  children,
}) => (
  <div
    className="flex gap-2 items-start rounded-lg px-3 py-2.5 text-sm"
    style={{ backgroundColor: `var(--tm-${tone}-subtle)`, color: 'var(--tm-text-primary)' }}
  >
    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: `var(--tm-${tone})` }} />
    <div>{children}</div>
  </div>
);

export const IntegrationNotice: React.FC<{ notice: IntegrationNoticeValue }> = ({ notice }) => (
  <p
    role={notice.tone === 'error' ? 'alert' : 'status'}
    className="flex items-start gap-1.5 text-sm rounded-md px-3 py-2"
    style={notice.tone === 'error'
      ? { backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }
      : { backgroundColor: 'var(--tm-success-subtle)', color: 'var(--tm-text-primary)' }}
  >
    {notice.tone === 'success' && <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-success)' }} />}
    <span>{notice.text}</span>
  </p>
);
