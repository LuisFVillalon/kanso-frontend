import React from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';

/**
 * Which question a parent card is asking: `open` after trying to complete it
 * while linked tasks are still open, `alldone` after its last open linked
 * task was finished.
 */
export type LinkedBannerKind = 'open' | 'alldone';

interface LinkedTaskBannerProps {
  kind: LinkedBannerKind;
  title: string;
  /** Linked tasks still open, for the `open` banner. */
  openCount: number;
  onCompleteAll: () => void;
  onCompleteOne: () => void;
  onDismiss: () => void;
}

const SM = 'text-xs px-2.5 py-1';

/** The completion question shown at the bottom of a parent card. */
const LinkedTaskBanner: React.FC<LinkedTaskBannerProps> = ({
  kind,
  title,
  openCount,
  onCompleteAll,
  onCompleteOne,
  onDismiss,
}) => {
  const ok = kind === 'alldone';
  return (
    <div
      role="status"
      className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg px-3 py-2.5 text-[0.8125rem] text-text-primary"
      style={{ backgroundColor: ok ? 'var(--tm-success-subtle)' : 'var(--tm-warning-subtle)' }}
    >
      {ok
        ? <CircleCheck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-success)' }} aria-hidden />
        : <TriangleAlert className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm-warning)' }} aria-hidden />}
      {ok ? (
        <>
          <span className="flex-1 min-w-[180px]">
            All linked tasks are done. Mark <b>{title}</b> complete?
          </span>
          <button type="button" onClick={onCompleteOne} className={`btn btn-primary ${SM}`}>
            Mark complete
          </button>
          <button type="button" onClick={onDismiss} className={`btn btn-ghost ${SM}`}>
            Not yet
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 min-w-[180px]">
            {openCount} linked task{openCount === 1 ? ' is' : 's are'} still open.
          </span>
          <button type="button" onClick={onCompleteAll} className={`btn btn-primary ${SM}`}>
            Complete all
          </button>
          <button type="button" onClick={onCompleteOne} className={`btn btn-secondary ${SM}`}>
            Just this task
          </button>
          <button type="button" onClick={onDismiss} className={`btn btn-ghost ${SM}`}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
};

export default LinkedTaskBanner;
