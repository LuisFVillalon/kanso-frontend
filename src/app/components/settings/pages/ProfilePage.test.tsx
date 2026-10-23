// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_OPTIONS, monthlyAvatarOptions } from '@/app/lib/avatar';
import ProfilePage from './ProfilePage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; root = null; });

function render(avatar: string | null) {
  const container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  act(() => root!.render(
    <ProfilePage name="Maya" avatar={avatar} onNameChange={() => {}} onAvatarChange={() => {}} loading={false} isDemo={false} />,
  ));
  return [...document.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
}

describe('ProfilePage avatars', () => {
  it("shows your initial plus this month's 6 icons and the monthly hint", () => {
    const buttons = render(null);
    expect(buttons.map(b => b.getAttribute('aria-label')))
      .toEqual(['Your initial', ...monthlyAvatarOptions().map(o => o.label)]);
    expect(document.body.textContent).toContain('New icons every month.');
  });

  it('keeps a rotated-out current avatar as an extra selected tile', () => {
    const monthly = new Set(monthlyAvatarOptions().map(o => o.key));
    const old = AVATAR_OPTIONS.find(o => !monthly.has(o.key))!;
    const buttons = render(old.key);
    expect(buttons).toHaveLength(8);
    const tile = buttons.find(b => b.getAttribute('aria-label') === old.label)!;
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(tile.title).toBe(`${old.label} (current)`);
  });
});
