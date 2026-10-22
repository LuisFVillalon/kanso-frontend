import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { BaseTaskForm, LinkedTaskRef, Tag, Task } from '@/app/types/task';
import TaskFormFields, { TaskFormData } from './TaskFormFields';
import LinkedTasksField from './LinkedTasksField';
import Modal from '@/app/components/common/Modal';
import { LinkedDraft, LinkedTasksSaveError, linkedSaveMessage, toLinkedRefs } from '@/app/utils/linkedTasks';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  newTask: BaseTaskForm;
  onTaskChange: (task: BaseTaskForm) => void;
  tags: Tag[];
  onToggleTag: (tag: Tag) => void;
  /**
   * Creates the task, then saves `linked` as its linked tasks when given.
   * `created` is set when a previous try created the task but its linked
   * tasks failed: update that task instead of creating another.
   */
  onSubmit: (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task) => void | Promise<void>;
  activeTaskCount: number;
  usedPriorityLevels: number[];
  /** Every loaded task. When given, the form gets a Linked tasks section. */
  allTasks?: Task[];
}

const NewTaskModal: React.FC<NewTaskModalProps> = props => {
  if (!props.isOpen) return null;
  return <NewTaskForm {...props} />;
};

/** The open modal's body, mounted fresh each time it opens so the linked-task rows start empty. */
const NewTaskForm: React.FC<NewTaskModalProps> = ({
  onClose, newTask, onTaskChange, tags, onToggleTag,
  onSubmit, activeTaskCount, usedPriorityLevels, allTasks,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedDraft[]>([]);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  // Set once the task exists but its linked tasks didn't save, so trying
  // again doesn't create it twice.
  const [created, setCreated] = useState<Task | null>(null);

  const handleFieldChange = (next: TaskFormData) => {
    onTaskChange({ ...newTask, ...next } as BaseTaskForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLinkedError(null);
    if (linked.some(d => d.kind === 'new' && !d.form.title.trim())) {
      setLinkedError('Give each new linked task a title, or remove it.');
      return;
    }
    const refs = allTasks ? toLinkedRefs(linked, allTasks) : [];
    setIsLoading(true);
    try {
      await onSubmit(e, refs.length || created ? refs : undefined, created ?? undefined);
    } catch (err) {
      if (err instanceof LinkedTasksSaveError) {
        setCreated(err.task);
        setLinkedError(linkedSaveMessage(err, allTasks ?? [], "The task was created, but its linked tasks weren't saved"));
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
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
        <h2 className="text-xl text-text-primary">Create new task</h2>
        <button onClick={onClose} className="btn btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">

        <TaskFormFields
          values={newTask as TaskFormData}
          onChange={handleFieldChange}
          tags={tags}
          onToggleTag={onToggleTag}
          activeTaskCount={activeTaskCount}
          usedPriorityLevels={usedPriorityLevels}
        />

        {allTasks && (
          <div>
            {/* .perf zeroes its own margins, so the gap below it lives on this wrapper's second child. */}
            <hr className="perf" />
            <div className="mt-5">
              <LinkedTasksField
                allTasks={allTasks}
                parentId={created?.id ?? null}
                parentDueDate={newTask.due_date}
                parentTitle={newTask.title}
                parentTags={newTask.tags}
                parentPriority={newTask.priority}
                tags={tags}
                activeTaskCount={activeTaskCount + 1}
                usedPriorityLevels={usedPriorityLevels}
                drafts={linked}
                onChange={setLinked}
                mode={created ? 'edit' : 'create'}
                error={linkedError}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm rounded-md px-3 py-2" style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={isLoading} className="btn btn-secondary flex-1 py-2.5">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn btn-primary flex-1 py-2.5">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {created ? 'Saving…' : 'Creating…'}</>
              : created ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewTaskModal;
