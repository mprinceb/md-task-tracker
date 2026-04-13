import { parseWorkBoard } from './markdown.js';
import { GitService } from './git.js';
import { Task, TaskChange } from './types.js';

function mapTasks(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function diffTasks(prev: Task[], curr: Task[]): TaskChange[] {
  const out: TaskChange[] = [];
  const p = mapTasks(prev);
  const c = mapTasks(curr);

  for (const [id, task] of c) {
    const old = p.get(id);
    if (!old) {
      out.push({ taskId: id, taskTitle: task.title, type: 'added', detail: 'Task created' });
      continue;
    }
    if (old.status !== task.status) out.push({ taskId: id, taskTitle: task.title, type: 'status_changed', detail: `${old.status} -> ${task.status}` });
    if (old.priority !== task.priority || old.due_date !== task.due_date || old.category !== task.category || old.tags.join('|') !== task.tags.join('|')) {
      out.push({ taskId: id, taskTitle: task.title, type: 'metadata_changed', detail: 'priority/category/tags/due updated' });
    }
    if (old.summary !== task.summary || old.next_steps.join('|') !== task.next_steps.join('|') || (old.notes ?? '') !== (task.notes ?? '')) {
      out.push({ taskId: id, taskTitle: task.title, type: 'content_changed', detail: 'summary/next_steps/notes updated' });
    }
    if (old.worklog.length !== task.worklog.length) out.push({ taskId: id, taskTitle: task.title, type: 'worklog_updated', detail: 'worklog entries updated' });
    if (old.archived !== task.archived) out.push({ taskId: id, taskTitle: task.title, type: task.archived ? 'archived' : 'restored', detail: task.archived ? 'archived' : 'restored' });
    if (task.worklog.some((w) => w.kind === 'scope_change')) out.push({ taskId: id, taskTitle: task.title, type: 'scope_changed', detail: 'scope change worklog exists' });
  }
  return out;
}

export function historyChanges(git: GitService, currentTasks: Task[], sinceIso: string): TaskChange[] {
  const commits = git.commitsSince(sinceIso);
  const results: TaskChange[] = [];
  for (const hash of commits) {
    try {
      const content = git.fileAtCommit(hash);
      const prevTasks = parseWorkBoard(content).tasks;
      results.push(...diffTasks(prevTasks, currentTasks));
    } catch {
      // ignore invalid points
    }
  }
  const dedupe = new Map<string, TaskChange>();
  for (const c of results) dedupe.set(`${c.taskId}:${c.type}:${c.detail}`, c);
  return Array.from(dedupe.values());
}
