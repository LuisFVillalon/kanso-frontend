import React from 'react';
import { Check } from 'lucide-react';
import { Task } from '@/app/types/task';

export const LinkedProgressBar: React.FC<{ done: number; total: number; className?: string }> = ({
  done,
  total,
  className = '',
}) => (
  <div
    role="progressbar"
    aria-label="Linked tasks done"
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
    className={`h-1.5 rounded-full overflow-hidden ${className}`}
    style={{ backgroundColor: 'var(--tm-surface-raised)' }}
  >
    <span
      className="block h-full rounded-full transition-[width] duration-300"
      style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: 'var(--tm-success)' }}
    />
  </div>
);

/** "2/5" pill shown on a compact card that has linked tasks. */
export const LinkedCountPill: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const allDone = done === total;
  return (
    <span
      className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      style={{
        backgroundColor: allDone ? 'var(--tm-success-subtle)' : 'var(--tm-surface-raised)',
        color: allDone ? 'var(--tm-success-text)' : 'var(--tm-text-secondary)',
      }}
      title={`${done} of ${total} linked tasks done`}
    >
      {done}/{total}
    </span>
  );
};

/** One of a parent card's linked tasks, and how many linked tasks of its own it has. */
export interface LinkedChip {
  task: Task;
  linkedCount: number;
}

/**
 * The bottom of a parent card: "Linked tasks · x of y done" with a progress
 * bar, and a chip for each linked task (each one its own card in the list)
 * that goes to that card. "+N" marks a linked task with linked tasks of its own.
 */
const LinkedTasksSummary: React.FC<{
  linked: LinkedChip[];
  onGoTo: (id: number) => void;
}> = ({ linked, onGoTo }) => {
  const done = linked.filter(c => c.task.completed).length;
  return (
    <div className="mt-3 pt-2.5 border-t border-border-subtle">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-semibold text-text-primary">Linked tasks</span>
        <span className="text-text-secondary whitespace-nowrap">{done} of {linked.length} done</span>
        <LinkedProgressBar done={done} total={linked.length} className="flex-1 max-w-40 min-w-12" />
      </div>
      <ul className="list-none flex flex-wrap gap-1.5 mt-1.5" aria-label="Linked tasks">
        {linked.map(({ task, linkedCount }) => (
          <li key={task.id} className="min-w-0 max-w-[15rem]">
            <button
              type="button"
              onClick={() => onGoTo(task.id)}
              className="w-full inline-flex items-center gap-1.5 rounded-full border border-border pl-1.5 pr-2.5 text-xs text-text-secondary hover:border-[var(--tm-accent)] hover:text-accent"
              style={{ backgroundColor: 'var(--tm-surface-raised)' }}
              title={`Go to ${task.title}`}
              aria-label={`Go to linked task: ${task.title}${task.completed ? ' (done)' : ''}`}
            >
              <span
                aria-hidden
                className="w-[11px] h-[11px] flex-shrink-0 rounded-[3px] border-[1.5px] flex items-center justify-center"
                style={task.completed
                  ? { backgroundColor: 'var(--tm-success)', borderColor: 'var(--tm-success)', color: '#fff' }
                  : { borderColor: 'var(--tm-border-strong)' }}
              >
                {task.completed && <Check className="w-2 h-2" strokeWidth={3} />}
              </span>
              <span className={`min-w-0 truncate ${task.completed ? 'line-through text-text-muted' : ''}`}>{task.title}</span>
              {linkedCount > 0 && (
                <span
                  className="flex-shrink-0 text-[10.5px] text-text-muted"
                  title={`${linkedCount} linked task${linkedCount === 1 ? '' : 's'} under it`}
                >
                  +{linkedCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LinkedTasksSummary;
