/*
Purpose: This file defines TypeScript interfaces and types for the task management application, 
ensuring type safety across components and API interactions.

Variables Summary:
- EditTaskModalState: Interface for edit modal state with status and task.
- Tag: Interface for tag objects with id, name, color.
- Task: Interface for task objects with all properties.
- TaskView: How the home Tasks list is shown (which tasks, sorted by what, which way).
- BaseTaskForm: Base interface for task forms.
- NewTaskForm: Interface for task creation form, extends BaseTaskForm.
- EditTaskForm: Interface for task editing form, extends BaseTaskForm with completed.
- NewTagForm: Interface for tag creation form, omits id from Tag.
- TagStats: Interface for tag statistics with count.
- TaskStats: Interface for task statistics with tasks and tags arrays.
- StatsData: Interface for overall statistics data.

These types define the structure of all data used in the application.
*/

// Types matching the Python Task model
export interface EditTaskModalState {
  status: boolean;
  task: Task | null;
};

export interface Tag {
  id: number;
  name: string;
  color: string;
  /** When the tag was archived (hidden from pickers/filters/folders); null while active. */
  archived_at?: string | null;
}

/** Which tasks the home Tasks list shows. */
export type TaskShow = 'open' | 'done' | 'all';
/** What the home Tasks list is sorted by. */
export type TaskSortKey = 'due' | 'priority' | 'duration' | 'created';
export type SortOrder = 'asc' | 'desc';

export interface TaskView {
  show: TaskShow;
  sortKey: TaskSortKey;
  sortOrder: SortOrder;
}
export type TaskCategory = 'homework' | 'test' | 'project' | 'interview' | 'skill';

export interface Task {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  priority: number | null;
  due_date: string | Date | null;
  due_time: string | Date | null;
  tags: Tag[];
  // optional category that classifies the task
  category?: TaskCategory | null;
  created_date: string | Date;
  completed_date: string | Date | null;
  estimated_time?: number | null;
  parent_task_id?: number | null;
  /** The parent's id and title, when the API sends them; absent from older backends, so parent_task_id stays the source of truth. */
  parent?: ParentSummary | null;
  /** Order among its parent's linked tasks; null for top-level tasks and links saved before ordering existed. */
  position?: number | null;
  /** Supabase Auth UUID — set server-side, never supplied by the client. */
  user_id?: string | null;
  /** When the task was archived; null while active. */
  archived_at?: string | null;
  /** Minutes before the due time to send its reminder; null uses the user's default. */
  reminder_minutes?: number | null;
  /** The Canvas assignment a task added from the Canvas panel follows; absent until the backend sends it. */
  canvas_assignment_id?: number | null;
  /** That assignment's page on the school's Canvas. */
  canvas_html_url?: string | null;
  /** The assignment's due_at as Canvas last gave it, so the backend can tell Canvas moving it from the user editing the date. */
  canvas_due_at?: string | null;
}

/** A task above another one, as a parent trail shows it. */
export interface ParentSummary {
  id: number;
  title: string;
}

export interface BaseTaskForm {

  id: number;
  title: string;
  description: string;
  priority: number | null;
  due_date: string | Date | null;
  due_time: string | Date | null;
  tags: Tag[];
  // optional value coming from TaskCategory union
  category?: TaskCategory | null;
  estimated_time?: number | null;
  parent_task_id?: number | null;
  reminder_minutes?: number | null;
  created_date: string | Date;
  canvas_assignment_id?: number | null;
  canvas_html_url?: string | null;
  canvas_due_at?: string | null;
}


export interface EditTaskForm extends BaseTaskForm {
  completed: boolean;
  completed_date: string | Date | null;
}

/** One linked task in a PUT /update-linked-tasks body: an existing task by id, or a new one by title. */
export type LinkedTaskRef = { id: number } | { title: string };

/**
 * What deleting or archiving a parent does with its linked tasks: `keep`
 * unlinks them so they stay as standalone tasks, `cascade` takes them along.
 */
export type LinkedRemoveMode = "keep" | "cascade";

export type NewTag = Omit<Tag, "id">;

export interface NewHabit {
  title: string;
  tags: Tag[];
  estimated_time?: number | null;
}

export interface TagStats {
  name: string;
  color: string;
  count: number;
}

export interface TaskStats {
  tasks: Task[];
  tags: TagStats[];
}

export interface StatsData {
  total: TaskStats;
  active: TaskStats;
  completed: TaskStats;
  prioritized: TaskStats;
}