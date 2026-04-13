export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'dropped';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorklogKind = 'progress' | 'decision' | 'blocker' | 'scope_change' | 'note';

export interface WorklogEntry {
  date: string;
  text: string;
  kind?: WorklogKind;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  summary: string;
  next_steps: string[];
  notes?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  due_date?: string;
  archived: boolean;
  worklog: WorklogEntry[];
}

export interface WorkBoard {
  tasks: Task[];
}

export type Role = 'owner' | 'manager';
export type ChangeType = 'added' | 'status_changed' | 'metadata_changed' | 'content_changed' | 'worklog_updated' | 'archived' | 'restored' | 'scope_changed';

export interface TaskChange {
  taskId: string;
  taskTitle: string;
  type: ChangeType;
  detail: string;
}
