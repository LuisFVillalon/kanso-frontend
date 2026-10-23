'use client';

import React from 'react';
import { findAvatarOption } from '@/app/lib/avatar';

interface ProfileAvatarProps {
  avatar?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

/** Circular profile avatar — a chosen icon, or the name's initial as a fallback. */
export default function ProfileAvatar({ avatar, name, size = 32, className = '' }: ProfileAvatarProps) {
  const option = findAvatarOption(avatar);
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--tm-accent-subtle)',
        color: 'var(--tm-accent-hover)',
      }}
      aria-hidden="true"
    >
      {option
        ? <option.icon style={{ width: size * 0.55, height: size * 0.55 }} />
        : <span className="font-bold" style={{ fontSize: size * 0.42 }}>{initial}</span>}
    </span>
  );
}
