import React, { useState } from 'react';
import Modal from '@/app/components/common/Modal';
import { LinkedRemoveMode, Task } from '@/app/types/task';

/** One of the task's direct linked tasks, with every task under it. */
export interface RemovedBranch {
  task: Task;
  under: Task[];
}

interface RemoveLinkedTasksDialogProps {
  verb: 'delete' | 'archive';
  title: string;
  /** The task's direct linked tasks, in order. */
  linked: RemovedBranch[];
  onConfirm: (linked: LinkedRemoveMode) => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const names = (tasks: Task[]) => tasks.map((t, i) => (
  <React.Fragment key={t.id}>{i > 0 && ', '}<b>{t.title}</b></React.Fragment>
));

/**
 * Asked before deleting or archiving a task that has linked tasks: keep them
 * (picked by default; the ones directly under it become standalone and keep
 * their own linked tasks) or take them along. Lists what each choice does.
 */
const RemoveLinkedTasksDialog: React.FC<RemoveLinkedTasksDialogProps> = ({
  verb,
  title,
  linked,
  onConfirm,
  onClose,
}) => {
  const [mode, setMode] = useState<LinkedRemoveMode>('keep');
  const Verb = verb === 'delete' ? 'Delete' : 'Archive';
  const all = linked.flatMap(b => [b.task, ...b.under]);
  const deeper = all.length - linked.length;

  const option = (value: LinkedRemoveMode, label: React.ReactNode, hint: string) => (
    <label
      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer text-text-primary"
      style={mode === value
        ? { borderColor: 'var(--tm-accent)', backgroundColor: 'var(--tm-accent-subtle)' }
        : { borderColor: 'var(--tm-border)' }}
    >
      <input
        type="radio"
        name="linked-remove-mode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-[3px]"
        style={{ accentColor: 'var(--tm-accent)' }}
      />
      <span>
        {label}
        <br />
        <span className="text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <Modal onClose={onClose} layer="top" panelClassName="modal-panel max-w-[420px] w-full p-[22px]">
      <div role="dialog" aria-modal="true" aria-labelledby="remove-linked-title">
        <h3 id="remove-linked-title" className="text-h3 text-text-primary mb-1.5">
          {Verb} &ldquo;{title}&rdquo;?
        </h3>
        <p className="text-sm text-text-secondary mb-3.5">
          It has {all.length} linked {plural(all.length, 'task')}
          {deeper > 0 && ` (${linked.length} directly under it)`}. They&apos;re all in your list too. What should happen to them?
        </p>
        <div className="flex flex-col gap-2">
          {option('keep', <><b>Keep them</b> as tasks</>, 'They stay in your list. The ones directly under it become standalone.')}
          {option(
            'cascade',
            <b>{Verb} them too</b>,
            verb === 'delete'
              ? 'All of them can be restored from Recently deleted for 30 days.'
              : 'All of them can be restored from the Archive.',
          )}
        </div>
        <div className="mt-3.5">
          <span className="block text-xs text-text-muted">What happens</span>
          <ul className="list-disc pl-[18px] mt-1 text-[12.5px] text-text-secondary">
            {mode === 'keep' ? (
              <>
                {linked.map(({ task, under }) => {
                  const own = under.filter(t => t.parent_task_id === task.id).length;
                  return (
                    <li key={task.id}>
                      <b>{task.title}</b> becomes a standalone task
                      {own > 0 && `, and keeps its ${own} linked ${plural(own, 'task')}`}
                    </li>
                  );
                })}
                {linked.filter(b => b.under.length > 0).map(({ task, under }) => (
                  <li key={`root-${task.id}`}>
                    {names(under)} now {plural(under.length, 'names', 'name')} <b>{task.title}</b> as{' '}
                    {plural(under.length, 'its', 'their')} original task
                  </li>
                ))}
              </>
            ) : (
              all.map(t => <li key={t.id}>{t.title}</li>)
            )}
          </ul>
        </div>
        <div className="flex gap-3 mt-[18px]">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1 py-2">
            Cancel
          </button>
          <button type="button" autoFocus onClick={() => onConfirm(mode)} className="btn btn-primary flex-1 py-2">
            {Verb}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RemoveLinkedTasksDialog;
