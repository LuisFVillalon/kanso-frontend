// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrashItem } from '@/app/types/trash';

const api = vi.hoisted(() => ({
  fetchTrash: vi.fn(),
  purgeFromTrash: vi.fn(),
}));
const restoreFromTrash = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
vi.mock('@/app/hooks/useRestoreFromTrash', () => ({ useRestoreFromTrash: () => restoreFromTrash }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import TrashView from './TrashView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const item = (kind: TrashItem['kind'], id: number, title: string, deletedDaysAgo: number, parent_task_id: number | null = null): TrashItem => {
  const deleted = new Date(Date.now() - deletedDaysAgo * DAY);
  return {
    kind, id, title, parent_task_id,
    deleted_at: deleted.toISOString(),
    purge_at: new Date(deleted.getTime() + 30 * DAY).toISOString(),
  };
};

// Newest first, as the backend returns them. The subtask was deleted along
// with its parent, so they share a deleted_at.
const plan = item('task', 12, 'Plan trip', 2);
const trash: TrashItem[] = [
  item('note', 21, 'Recipe ideas', 0.1),
  plan,
  { ...item('task', 13, 'Book flights', 2, 12), deleted_at: plan.deleted_at, purge_at: plan.purge_at },
  item('tag', 3, 'Old', 28),
  item('habit', 7, 'Stretch', 10),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

async function renderView(items: TrashItem[]) {
  api.fetchTrash.mockResolvedValue(items);
  await act(async () => { root.render(<TrashView />); });
}

const titles = () => [...document.querySelectorAll('li h3')].map(h => h.textContent);
const button = (label: string) => {
  const found = [...document.querySelectorAll('button')].find(
    b => b.getAttribute('aria-label') === label || b.textContent?.trim().startsWith(label),
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
};
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

describe('TrashView', () => {
  it('lists every deleted item newest first, with the days left before each is deleted forever', async () => {
    await renderView(trash);
    expect(titles()).toEqual(['Recipe ideas', 'Plan trip', 'Book flights', 'Old', 'Stretch']);
    expect(document.body.textContent).toContain('stay here for 30 days');
    expect(document.body.textContent).toContain('2 days left');
    expect(document.body.textContent).toContain('28 days left');
    expect(document.body.textContent).toContain('Subtask of Plan trip');
  });

  it('filters by kind on the client', async () => {
    await renderView(trash);
    await click(button('Tasks'));
    expect(titles()).toEqual(['Plan trip', 'Book flights']);
    await click(button('Habits'));
    expect(titles()).toEqual(['Stretch']);
    expect(api.fetchTrash).toHaveBeenCalledTimes(1);
  });

  it('restores a task with the subtasks deleted along with it', async () => {
    restoreFromTrash.mockResolvedValue(false);
    await renderView(trash);
    await click(button('Restore Plan trip'));
    expect(restoreFromTrash).toHaveBeenCalledWith('task', 12, new Set([12, 13]));
    expect(titles()).toEqual(['Recipe ideas', 'Old', 'Stretch']);
    expect(showToast).toHaveBeenCalledWith('Task restored.', 'success');
  });

  it('says when an item went back to the archive', async () => {
    restoreFromTrash.mockResolvedValue(true);
    await renderView(trash);
    await click(button('Restore Recipe ideas'));
    expect(showToast).toHaveBeenCalledWith('Note restored to the Archive.', 'success');
  });

  it('puts the item back in the list if the restore fails', async () => {
    restoreFromTrash.mockRejectedValue(new Error('boom'));
    await renderView(trash);
    await click(button('Restore Stretch'));
    expect(titles()).toContain('Stretch');
    expect(showToast).toHaveBeenCalledWith("Couldn't restore the habit. Please try again.");
  });

  it('deletes forever only after confirmation', async () => {
    api.purgeFromTrash.mockResolvedValue(undefined);
    await renderView(trash);
    await click(button('Delete Old forever'));
    expect(api.purgeFromTrash).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("This can't be undone.");

    await click(button('Cancel'));
    expect(titles()).toContain('Old');

    await click(button('Delete Old forever'));
    const confirm = [...document.querySelectorAll('button')].find(b => b.textContent === 'Delete forever' && !b.getAttribute('aria-label'))!;
    await click(confirm);
    expect(api.purgeFromTrash).toHaveBeenCalledWith('tag', 3);
    expect(titles()).not.toContain('Old');
  });

  it('shows an empty state with the 30-day explanation', async () => {
    await renderView([]);
    expect(document.body.textContent).toContain('Nothing recently deleted');
    expect(document.body.textContent).toContain('waits here for 30 days');
  });
});
