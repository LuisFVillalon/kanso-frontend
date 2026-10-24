import React from 'react';
import { CircleCheck } from 'lucide-react';
import type { CanvasDoneAs } from '@/app/hooks/useCanvasTaskSync';

interface CanvasSubmittedBannerProps {
  title: string;
  /** "done" for work excused or checked off in Canvas with nothing handed in; "submitted" when left out. */
  doneAs?: CanvasDoneAs;
  onComplete: () => void;
  /** Hides the banner until tomorrow. */
  onNotYet: () => void;
}

const SM = 'text-xs px-2.5 py-1';

/**
 * Shown at the bottom of a task added from Canvas once Canvas shows its
 * assignment submitted or done, when the sync doesn't complete tasks itself.
 */
const CanvasSubmittedBanner: React.FC<CanvasSubmittedBannerProps> = ({ title, doneAs = 'submitted', onComplete, onNotYet }) => (
  <div
    role="status"
    className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg px-3 py-2.5 text-[0.8125rem] text-success-text"
    style={{ backgroundColor: 'var(--tm-success-subtle)' }}
  >
    <CircleCheck className="w-4 h-4 flex-shrink-0" aria-hidden />
    <span className="flex-1 min-w-[180px]">
      Canvas shows this {doneAs}. Mark <b>{title}</b> complete?
    </span>
    <button type="button" onClick={onComplete} className={`btn btn-primary ${SM}`}>
      Mark complete
    </button>
    <button type="button" onClick={onNotYet} className={`btn btn-ghost ${SM}`}>
      Not yet
    </button>
  </div>
);

export default CanvasSubmittedBanner;
