'use client';

import React from 'react';

interface Props {
  /** The heading's id, which labels the group. */
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

/** A headed group of settings within one page, e.g. Notifications → Quiet hours. */
const SettingsGroup: React.FC<Props> = ({ id, title, description, children }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div>
      <h3 id={id} className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && <p className="text-xs text-text-muted">{description}</p>}
    </div>
    {children}
  </section>
);

export default SettingsGroup;
