import React, { useState } from 'react';
import Modal from '@/app/components/common/Modal';
import { LinkedRemoveMode } from '@/app/types/task';

interface RemoveLinkedTasksDialogProps {
  verb: 'delete' | 'archive';
  title: string;
  linkedCount: number;
  onConfirm: (linked: LinkedRemoveMode) => void;
  onClose: () => void;
}

/**
 * Asked before deleting or archiving a task that has linked tasks: keep them
 * as standalone tasks (picked by default) or take them along.
 */
const RemoveLinkedTasksDialog: React.FC<RemoveLinkedTasksDialogProps> = ({
  verb,
  title,
  linkedCount,
  onConfirm,
  onClose,
}) => {
  const [mode, setMode] = useState<LinkedRemoveMode>('keep');
  const Verb = verb === 'delete' ? 'Delete' : 'Archive';

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
        <h3 id="remove-linked-title" className="text-lg font-semibold text-text-primary mb-1.5">
          {Verb} &ldquo;{title}&rdquo;?
        </h3>
        <p className="text-sm text-text-secondary mb-3.5">
          It has {linkedCount} linked task{linkedCount === 1 ? '' : 's'}. What should happen to them?
        </p>
        <div className="flex flex-col gap-2">
          {option('keep', <><b>Keep them</b> as standalone tasks</>, 'They stay in your list, just unlinked.')}
          {option(
            'cascade',
            <b>{Verb} them too</b>,
            verb === 'delete'
              ? 'All of them can be restored from Recently deleted for 30 days.'
              : 'All of them can be restored from the Archive.',
          )}
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
