import React from 'react';
import { CornerDownRight } from 'lucide-react';
import { ParentSummary } from '@/app/types/task';


const VARIANTS = {
  /** Small and quiet, beside a task's title in the list. */
  row: 'text-xs font-normal text-text-muted',
  /** Form-sized, inside the editor's "Leads up to" field. */
  field: 'text-sm font-medium text-text-primary',
};

/**
 * "↳ Apply to Google › Mock interview": the tasks above a linked task, from
 * the topmost down to its own parent (see parentChain). Each one opens that
 * task when `onOpen` is given. A trail longer than `maxShown` keeps the
 * topmost task (unless `maxShown` is 1) and the closest ones, with "…"
 * between; the tooltip always has the whole trail.
 */
const ParentTrail: React.FC<{
  chain: ParentSummary[];
  onOpen?: (id: number) => void;
  variant?: keyof typeof VARIANTS;
  maxShown?: number;
  className?: string;
}> = ({ chain, onOpen, variant = 'row', maxShown = 3, className = '' }) => {
  if (chain.length === 0) return null;
  const head = maxShown > 1 ? [chain[0]] : [];
  const shown: (ParentSummary | null)[] = chain.length > maxShown
    ? [...head, null, ...chain.slice(chain.length - (maxShown - head.length))]
    : chain;
  const fullTrail = chain.map(p => p.title).join(' › ');

  return (
    <span
      className={`inline-flex items-center gap-1 min-w-0 overflow-hidden ${VARIANTS[variant]} ${className}`}
      title={`Leads up to ${fullTrail}`}
    >
      <CornerDownRight className="w-3 h-3 flex-shrink-0 text-text-muted" aria-label="Leads up to" />
      {shown.map((p, i) => (
        <React.Fragment key={p?.id ?? 'more'}>
          {i > 0 && <span aria-hidden>›</span>}
          {p === null ? (
            <span aria-label={`${chain.length - maxShown} more`}>…</span>
          ) : onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="min-w-0 max-w-[12rem] truncate hover:text-accent hover:underline"
              aria-label={`Open parent task ${p.title}`}
            >
              {p.title}
            </button>
          ) : (
            <span className="min-w-0 max-w-[12rem] truncate">{p.title}</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

export default ParentTrail;
