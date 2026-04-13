import { parseWorkBoard } from './markdown.js';
import { GitService } from './git.js';
import { Task, TaskChange } from './types.js';

export interface DatedTaskChange extends TaskChange {
  commit: string;
  commitDate: string;
  commitMessage: string;
}

function mapTasks(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

export function diffTasks(prev: Task[], curr: Task[]): TaskChange[] {
  const out: TaskChange[] = [];
  const p = mapTasks(prev);
  const c = mapTasks(curr);

  for (const [id, old] of p) {
    if (!c.has(id)) {
      out.push({ taskId: id, taskTitle: old.title, type: 'archived', detail: 'Task removed from current snapshot' });
    }
  }

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
    if (old.worklog.length !== task.worklog.length || old.worklog.some((w, idx) => JSON.stringify(w) !== JSON.stringify(task.worklog[idx]))) {
      out.push({ taskId: id, taskTitle: task.title, type: 'worklog_updated', detail: 'worklog entries updated' });
    }
    if (old.archived !== task.archived) {
      out.push({ taskId: id, taskTitle: task.title, type: task.archived ? 'archived' : 'restored', detail: task.archived ? 'archived' : 'restored' });
    }
    if (old.summary !== task.summary || old.next_steps.join('|') !== task.next_steps.join('|') || task.worklog.some((w) => w.kind === 'scope_change')) {
      out.push({ taskId: id, taskTitle: task.title, type: 'scope_changed', detail: 'scope-related update detected' });
    }
  }
  return out;
}

function parseBoardAt(git: GitService, spec: string): Task[] {
  return parseWorkBoard(git.fileAtCommit(spec)).tasks;
}

export function historyChanges(git: GitService, sinceIso: string): DatedTaskChange[] {
  const timeline = git.commitTimelineSince(sinceIso);
  if (timeline.length === 0) return [];

  const beforeHash = git.lastCommitTouchingFileBefore(sinceIso);
  let previous = beforeHash ? parseBoardAt(git, beforeHash) : [];
  const changes: DatedTaskChange[] = [];

  for (const commit of timeline) {
    const current = parseBoardAt(git, commit.hash);
    for (const change of diffTasks(previous, current)) {
      changes.push({ ...change, commit: commit.hash, commitDate: commit.isoDate, commitMessage: commit.subject });
    }
    previous = current;
  }

  return changes;
}

export function buildSummary(changes: DatedTaskChange[], title: string): string {
  const by = (fn: (c: DatedTaskChange) => boolean) => {
    const rows = changes.filter(fn).map((c) => `- ${c.taskTitle} — ${c.detail}`);
    return rows.length ? rows.join('\n') : '- None';
  };

  return `## ${title}\n\n### Added\n${by((c) => c.type === 'added')}\n\n### Progressed\n${by((c) => c.type === 'worklog_updated' || (c.type === 'status_changed' && c.detail.includes('-> in_progress')))}\n\n### Done\n${by((c) => c.type === 'status_changed' && c.detail.endsWith('-> done'))}\n\n### Blocked\n${by((c) => c.type === 'status_changed' && c.detail.endsWith('-> blocked'))}\n\n### Dropped\n${by((c) => c.type === 'status_changed' && c.detail.endsWith('-> dropped'))}\n\n### Scope Changed\n${by((c) => c.type === 'scope_changed')}\n`;
}
