'use client';

import React, { useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Pause, Play, Square } from 'lucide-react';
import { KansoKIcon } from '@/app/components/common/KansoLogo';
import { mmss } from '@/app/components/stats/FocusTimerCard';
import { useFocusTimer } from '@/app/hooks/useFocusTimer';
import type { Task } from '@/app/types/task';
import { requestFocusWidget } from '@/app/utils/focusWidgetRequest';
import { getHomeMode, onHomeModeChange } from '@/app/utils/homeMode';

/**
 * The running Focus session, across the top of every signed-in page: time
 * left, the task it's on, Pause or Resume, and Stop. It reads the same timer
 * as the Home Focus tile, so moving between pages neither stops nor restarts
 * it, and while it's on screen it also records a session that runs out away
 * from Home. Clicking the time opens the Focus tile on Home, unless Home is in
 * kanso focus or Doodle mode, which hide the tile; then the time is a plain
 * label. Hidden unless a session is running or paused.
 */
const FocusHeaderBar: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const timer = useFocusTimer();
  const router = useRouter();
  const pathname = usePathname();
  const homeMode = useSyncExternalStore(onHomeModeChange, getHomeMode, () => 'normal');
  if (timer.phase !== 'running' && timer.phase !== 'paused') return null;

  const running = timer.phase === 'running';
  const title = timer.taskId == null ? null : tasks.find(t => t.id === timer.taskId)?.title ?? null;
  const left = mmss(timer.remainingMs);
  const summary = `Focus: ${left} left${running ? '' : ', paused'}${title ? ` on ${title}` : ''}`;
  const status = (
    <>
      <span className="focus-bar-dot" data-paused={running ? undefined : 'true'} aria-hidden />
      <KansoKIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-accent)' }} />
      <span className="tabular-nums font-semibold text-text-primary flex-shrink-0">{left}</span>
      {!running && <span className="text-xs font-semibold text-text-muted flex-shrink-0">Paused</span>}
      {title && (
        <>
          <span aria-hidden className="text-text-muted flex-shrink-0">·</span>
          <span className="min-w-0 truncate text-text-secondary">{title}</span>
        </>
      )}
    </>
  );
  const open = () => {
    requestFocusWidget();
    if (pathname !== '/') router.push('/');
  };

  return (
    <div className="focus-bar" role="region" aria-label="Focus session">
      <div className="focus-bar-inner">
        {homeMode === 'normal' ? (
          <button
            type="button"
            onClick={open}
            className="focus-bar-open"
            aria-label={`${summary}. Open the Focus timer`}
            title="Open the Focus timer"
          >
            {status}
          </button>
        ) : (
          <div className="focus-bar-open">
            {status}
          </div>
        )}
        <button
          type="button"
          onClick={running ? timer.pause : timer.resume}
          className="focus-bar-btn"
          aria-label={running ? 'Pause focus session' : 'Resume focus session'}
          title={running ? 'Pause' : 'Resume'}
        >
          {running ? <Pause className="w-3.5 h-3.5" aria-hidden /> : <Play className="w-3.5 h-3.5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={timer.stop}
          className="focus-bar-btn"
          aria-label="Stop focus session"
          title="Stop"
        >
          <Square className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
};

export default FocusHeaderBar;
