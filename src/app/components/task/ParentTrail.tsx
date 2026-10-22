import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import { ParentSummary } from '@/app/types/task';

/** A task in a trail; `completed` strikes its name through. */
export type TrailItem = ParentSummary & { completed?: boolean };

const VARIANTS = {
  /** Small and quiet, beside a task's title in a compact row. */
  row: 'text-xs font-normal text-text-muted',
  /** Its own line under a task card's title. */
  card: 'text-[12.5px] font-normal text-text-muted',
  /** Form-sized, inside the editor's "Leads up to" field. */
  field: 'text-sm font-medium text-text-primary',
};

/** What a task in the trail is to the task the trail belongs to. */
const roleOf = (index: number, length: number) =>
  length === 1 ? 'Leads up to' : index === 0 ? 'Original task' : index === length - 1 ? 'Task before it' : 'Leads up to';

/**
 * "↳ Apply to Google › … › Mock interview": the tasks above a linked task,
 * from the topmost (its original task) down to its own parent (the task
 * before it), see parentChain. Each one is a link when `onOpen` is given. A
 * trail longer than `maxShown` keeps the topmost task (unless `maxShown` is
 * 1) and the closest ones, with "…" between, which shows the rest when
 * clicked; the tooltip always has the whole trail.
 */
const ParentTrail: React.FC<{
  chain: TrailItem[];
  onOpen?: (id: number) => void;
  variant?: keyof typeof VARIANTS;
  maxShown?: number;
  className?: string;
}> = ({ chain, onOpen, variant = 'row', maxShown = 3, className = '' }) => {
  const [expanded, setExpanded] = useState(false);
  if (chain.length === 0) return null;
  const head = maxShown > 1 ? [chain[0]] : [];
  const shown: (TrailItem | null)[] = chain.length > maxShown && !expanded
    ? [...head, null, ...chain.slice(chain.length - (maxShown - head.length))]
    : chain;
  const fullTrail = chain.map(p => p.title).join(' › ');
  const hiddenCount = chain.length - (shown.length - 1);
  const linkTone = variant === 'card' ? 'font-medium text-text-secondary' : '';

  return (
    <span
      className={`inline-flex items-center gap-1 min-w-0 overflow-hidden ${VARIANTS[variant]} ${className}`}
      title={`Leads up to ${fullTrail}`}
    >
      <CornerDownRight className="w-3 h-3 flex-shrink-0 text-text-muted" aria-label="Leads up to" />
      {shown.map((p, i) => {
        if (p === null) {
          return (
            <React.Fragment key="more">
              <span aria-hidden className="flex-shrink-0 text-[var(--tm-pencil)]">›</span>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex-shrink-0 rounded-full border border-border px-1.5 leading-4 text-[11px] text-text-muted hover:text-text-primary"
                style={{ backgroundColor: 'var(--tm-surface-raised)' }}
                aria-label={`Show ${hiddenCount} more`}
                title={chain.slice(head.length, chain.length - (maxShown - head.length)).map(x => x.title).join(' › ')}
              >
                …
              </button>
            </React.Fragment>
          );
        }
        const index = chain.indexOf(p);
        const role = roleOf(index, chain.length);
        const done = p.completed ? 'line-through text-text-muted' : '';
        return (
          <React.Fragment key={p.id}>
            {i > 0 && <span aria-hidden className="flex-shrink-0 text-[var(--tm-pencil)]">›</span>}
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className={`min-w-[2.5rem] max-w-[16rem] truncate text-left hover:text-accent hover:underline ${linkTone} ${done}`}
                aria-label={`Go to ${role === 'Leads up to' ? '' : `${role.toLowerCase()}: `}${p.title}${p.completed ? ' (done)' : ''}`}
                title={`${role}: ${p.title}${p.completed ? ' (done)' : ''}`}
              >
                {p.title}
              </button>
            ) : (
              <span className={`min-w-0 truncate ${variant === 'field' ? '' : 'max-w-[12rem]'} ${linkTone} ${done}`}>{p.title}</span>
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
};

export default ParentTrail;
