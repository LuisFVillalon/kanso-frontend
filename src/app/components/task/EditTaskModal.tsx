import React, { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { LinkedTaskRef, Task, Tag } from '@/app/types/task';
import TaskFormFields, { TaskFormData } from './TaskFormFields';
import LinkedTasksField, { LeadsUpToField } from './LinkedTasksField';
import Modal from '@/app/components/common/Modal';
import {
  LinkedDraft, LinkedTasksSaveError, linkedDraftsChanged, linkedDraftsFor, linkedSaveMessage, toLinkedRefs,
} from '@/app/utils/linkedTasks';
import { parentChain } from '@/app/utils/taskUtils';

interface EditTaskModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onTaskChange: (task: TaskFormData) => void;
  tags: Tag[];
  onToggleTag: (tag: Tag) => void;
  /** Saves the task, then saves `linked` as its linked tasks when given (only when they changed). */
  onSubmit: (e: React.FormEvent, linked?: LinkedTaskRef[]) => void | Promise<void>;
  activeTaskCount: number;
  usedPriorityLevels: number[];
  /** Every loaded task. When given, the form gets a Linked tasks section. */
  allTasks?: Task[];
}

const EditTaskModal: React.FC<EditTaskModalProps> = props => {
  if (!props.isOpen || !props.task) return null;
  return <EditTaskForm key={props.task.id} {...props} task={props.task} />;
};

/** The open modal's body, mounted fresh for each task so its linked-task rows start from that task's. */
const EditTaskForm: React.FC<EditTaskModalProps & { task: Task }> = ({
  task, onClose, onTaskChange, tags, onToggleTag,
  onSubmit, activeTaskCount, usedPriorityLevels, allTasks,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [savedLinked] = useState<LinkedDraft[]>(() => linkedDraftsFor(allTasks ?? [], task.id));
  const [linked, setLinked] = useState<LinkedDraft[]>(savedLinked);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  // The task's parent when the modal opened, so an unsaved Unlink can be undone.
  const [originalParentId] = useState(task.parent_task_id ?? null);

  const parentId = task.parent_task_id ?? null;
  const byId = useMemo(() => new Map((allTasks ?? []).map(t => [t.id, t])), [allTasks]);
  // The tasks above this one as it was when the modal opened, so the trail stays put while unlinked.
  const parents = parentChain(byId, { ...task, parent_task_id: originalParentId });
  const showLinkedField = !!allTasks;

  const setParent = (parent_task_id: number | null) =>
    onTaskChange({ ...(task as TaskFormData), parent_task_id });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkedError(null);
    if (showLinkedField && linked.some(d => d.kind === 'new' && !d.title.trim())) {
      setLinkedError('Give each new linked task a title, or remove it.');
      return;
    }
    const refs = showLinkedField && linkedDraftsChanged(savedLinked, linked)
      ? toLinkedRefs(linked, allTasks!)
      : undefined;
    setIsLoading(true);
    try {
      await onSubmit(e, refs);
    } catch (err) {
      if (!(err instanceof LinkedTasksSaveError)) throw err;
      setLinkedError(linkedSaveMessage(err, allTasks ?? [], "The task was saved, but its linked tasks weren't"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} panelClassName="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-custom">
      <div
        className="sticky top-0 z-30 px-6 py-4 flex items-center justify-between border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <h2 className="text-xl text-text-primary">Edit task</h2>
        <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">

        <TaskFormFields
          values={task as TaskFormData}
          onChange={onTaskChange}
          tags={tags}
          onToggleTag={onToggleTag}
          activeTaskCount={activeTaskCount}
          usedPriorityLevels={usedPriorityLevels}
          afterTitle={allTasks && originalParentId != null && (
            <LeadsUpToField
              chain={parents}
              unlinked={parentId == null}
              onUnlink={() => setParent(null)}
              onUndo={() => setParent(originalParentId)}
            />
          )}
        />

        {allTasks && (
          <div>
            {/* .perf zeroes its own margins, so the gap below it lives on this wrapper's second child. */}
            <hr className="perf" />
            <div className="mt-5">
              <LinkedTasksField
                allTasks={allTasks}
                parentId={task.id}
                parentOfParent={parentId}
                parentDueDate={task.due_date}
                drafts={linked}
                onChange={setLinked}
                mode="edit"
                error={linkedError}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn btn-secondary flex-1 py-2.5">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn btn-primary flex-1 py-2.5">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditTaskModal;
