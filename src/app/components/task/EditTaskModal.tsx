import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, X, Loader2 } from 'lucide-react';
import { LinkedTaskRef, Task, Tag } from '@/app/types/task';
import TaskFormFields, { TaskFormData } from './TaskFormFields';
import LinkedTasksField, { LeadsUpToField } from './LinkedTasksField';
import Modal from '@/app/components/common/Modal';
import {
  LinkedDraft, LinkedTasksSaveError, linkedDraftsChanged, linkedDraftsFor, linkedSaveMessage, toLinkedRefs,
} from '@/app/utils/linkedTasks';
import { parentChain } from '@/app/utils/taskUtils';
import { toggleById } from '@/app/hooks/useTaskHandlers';

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
  /**
   * Saves a linked task opened from the Linked tasks section, then `linked`
   * as its linked tasks when given. Resolves to false when the task didn't
   * save. Without it, linked tasks can't be opened in the editor.
   */
  onSaveLinkedTask?: (task: Task, linked?: LinkedTaskRef[]) => Promise<boolean>;
}

const EditTaskModal: React.FC<EditTaskModalProps> = props => {
  if (!props.isOpen || !props.task) return null;
  return <EditTaskStack key={props.task.id} {...props} task={props.task} />;
};

/**
 * The open modal: the task being edited and, on top of it, any linked task
 * opened from its Linked tasks section (and theirs), each with "Back to" the
 * one below. Every task's form stays mounted while another is on top, so
 * going back keeps its unsaved changes. Saving an opened task goes back.
 */
const EditTaskStack: React.FC<EditTaskModalProps & { task: Task }> = ({
  task, onClose, onTaskChange, onToggleTag, onSubmit, onSaveLinkedTask, ...shared
}) => {
  // The opened linked tasks, oldest first, each as its form has it now.
  const [opened, setOpened] = useState<Task[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const frames = [task, ...opened];

  const scrollToTop = () => topRef.current?.closest('.modal-panel')?.scrollTo?.({ top: 0 });
  const open = (t: Task) => { setOpened(prev => [...prev, t]); scrollToTop(); };
  const back = () => { setOpened(prev => prev.slice(0, -1)); scrollToTop(); };
  const change = (index: number, patch: Partial<Task>) =>
    setOpened(prev => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  return (
    <Modal onClose={onClose} panelClassName="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-custom">
      <div ref={topRef} />
      {frames.map((t, i) => {
        const nested = i > 0;
        return (
          <div key={`${i}-${t.id}`} hidden={i !== frames.length - 1}>
            <EditTaskForm
              {...shared}
              task={t}
              backTo={nested ? frames[i - 1] : null}
              onBack={back}
              onClose={onClose}
              onTaskChange={nested ? next => change(i - 1, next as Partial<Task>) : onTaskChange}
              onToggleTag={nested ? tag => change(i - 1, { tags: toggleById(t.tags, tag) }) : onToggleTag}
              onSubmit={nested
                ? async (e, linked) => {
                  e.preventDefault();
                  if (await onSaveLinkedTask!(t, linked)) back();
                }
                : onSubmit}
              onOpenTask={onSaveLinkedTask && open}
            />
          </div>
        );
      })}
    </Modal>
  );
};

interface EditTaskFormProps extends Omit<EditTaskModalProps, 'isOpen' | 'task' | 'onSaveLinkedTask'> {
  task: Task;
  /** The task this one was opened from, for "Back to"; null for the task the editor opened with. */
  backTo: Task | null;
  onBack: () => void;
  onOpenTask?: (task: Task) => void;
}

/** One task's form in the editor, mounted fresh for each task so its linked-task rows start from that task's. */
const EditTaskForm: React.FC<EditTaskFormProps> = ({
  task, backTo, onBack, onOpenTask, onClose, onTaskChange, tags, onToggleTag,
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
    if (showLinkedField && linked.some(d => d.kind === 'new' && !d.form.title.trim())) {
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
    <>
      <div
        className="sticky top-0 z-30 px-6 py-4 flex items-center justify-between border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        <div className="min-w-0">
          {backTo && (
            <button
              type="button"
              onClick={onBack}
              className="max-w-full inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
            >
              <ArrowLeft className="w-3 h-3 flex-shrink-0" aria-hidden />
              <span className="truncate">Back to “{backTo.title}”</span>
            </button>
          )}
          <h2 className="text-xl text-text-primary">Edit task</h2>
        </div>
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
                parentTitle={task.title}
                parentTags={task.tags}
                parentPriority={task.priority}
                tags={tags}
                activeTaskCount={activeTaskCount}
                usedPriorityLevels={usedPriorityLevels}
                onOpenTask={onOpenTask}
                drafts={linked}
                onChange={setLinked}
                mode="edit"
                error={linkedError}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {/* An opened linked task's Cancel goes back, keeping the task below it as it was. */}
          <button type="button" onClick={backTo ? onBack : onClose} disabled={isLoading} className="btn btn-secondary flex-1 py-2.5">
            Cancel
          </button>
          <button type="submit" disabled={isLoading} className="btn btn-primary flex-1 py-2.5">
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : backTo ? 'Save and go back' : 'Save Changes'}
          </button>
        </div>
      </form>
    </>
  );
};

export default EditTaskModal;
