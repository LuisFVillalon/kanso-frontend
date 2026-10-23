'use client';

/** Settings → Profile: the name kanso greets you by and the avatar icon. */

import React from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { findAvatarOption, monthlyAvatarOptions } from '@/app/lib/avatar';

interface Props {
  name: string;
  avatar: string | null;
  onNameChange: (name: string) => void;
  onAvatarChange: (avatar: string | null) => void;
  loading: boolean;
  isDemo: boolean;
}

const avatarStyle = (selected: boolean): React.CSSProperties => ({
  backgroundColor: 'var(--tm-accent-subtle)',
  color: 'var(--tm-accent-hover)',
  border: selected ? '2px solid var(--tm-text-primary)' : '1px solid var(--tm-border)',
});

const ProfilePage: React.FC<Props> = ({ name, avatar, onNameChange, onAvatarChange, loading, isDemo }) => {
  const monthly = monthlyAvatarOptions();
  // A saved avatar that rotated out of this month's set stays visible as its own tile.
  const current = findAvatarOption(avatar);
  const past = current && !monthly.some(o => o.key === current.key) ? current : null;

  return (
    <div className="space-y-5">
      {isDemo && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: 'var(--tm-surface-raised)', border: '1px solid var(--tm-border)', color: 'var(--tm-text-secondary)' }}
        >
          <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-accent)' }} />
          <p>
            You&apos;re in a private demo sandbox, which is deleted after a day.{' '}
            <Link href="/signup" className="font-medium hover:underline" style={{ color: 'var(--tm-accent)' }}>
              Create an account
            </Link>{' '}
            to keep your own data.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="settings-name" className="block text-xs font-medium text-text-muted mb-1">Name</label>
        <input
          id="settings-name"
          type="text"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          disabled={loading}
          placeholder="What should kanso call you?"
          autoComplete="nickname"
          className="input-field w-full max-w-md text-sm disabled:opacity-60"
        />
      </div>

      <div>
        <p id="settings-avatar-label" className="block text-xs font-medium text-text-muted mb-2">Avatar</p>
        <div role="group" aria-labelledby="settings-avatar-label">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1.5">This month</p>
          <div className="grid grid-cols-7 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => onAvatarChange(null)}
              title="Your initial"
              aria-label="Your initial"
              aria-pressed={!avatar}
              className="aspect-square w-full flex items-center justify-center rounded-full transition-transform hover:scale-105"
              style={avatarStyle(!avatar)}
            >
              <span className="text-sm font-bold">{(name.trim()[0] ?? '?').toUpperCase()}</span>
            </button>
            {monthly.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onAvatarChange(key)}
                title={label}
                aria-label={label}
                aria-pressed={avatar === key}
                className="aspect-square w-full flex items-center justify-center rounded-full transition-transform hover:scale-105"
                style={avatarStyle(avatar === key)}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
          </div>
          {past && (
            <>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mt-3 mb-1.5">From a past month</p>
              <div className="flex items-center gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => onAvatarChange(past.key)}
                  title={`${past.label} (current, from a past month)`}
                  aria-label={past.label}
                  aria-describedby="settings-avatar-past-note"
                  aria-pressed={avatar === past.key}
                  className="aspect-square w-[calc((100%-4.5rem)/7)] shrink-0 flex items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={avatarStyle(avatar === past.key)}
                >
                  <past.icon className="w-5 h-5" />
                </button>
                <p id="settings-avatar-past-note" className="text-xs text-text-muted">
                  Pick another and this one goes away.
                </p>
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-text-muted mt-2">New icons every month.</p>
      </div>
    </div>
  );
};

export default ProfilePage;
