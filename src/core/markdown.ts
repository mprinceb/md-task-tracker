import { Task, TaskPriority, TaskStatus, WorkBoard, WorklogEntry } from './types.js';

const statusOrder: TaskStatus[] = ['in_progress', 'blocked', 'pending', 'done', 'dropped'];
const priorityOrder: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

function isStatus(value: string): value is TaskStatus {
  return ['pending', 'in_progress', 'blocked', 'done', 'dropped'].includes(value);
}

function isPriority(value: string): value is TaskPriority {
  return ['low', 'medium', 'high', 'critical'].includes(value);
}

export function validateTask(task: Task, allIds: Set<string>): void {
  if (!task.id || !/^[a-z0-9-]+$/.test(task.id)) throw new Error(`Invalid id: ${task.id}`);
  if (allIds.has(task.id)) throw new Error(`Duplicate id: ${task.id}`);
  allIds.add(task.id);
  if (!task.title.trim()) throw new Error(`Missing title for ${task.id}`);
  if (!isStatus(task.status)) throw new Error(`Invalid status for ${task.id}`);
  if (!isPriority(task.priority)) throw new Error(`Invalid priority for ${task.id}`);
  if (task.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) throw new Error(`Invalid due_date for ${task.id}`);
  if (!task.created_at || !task.updated_at) throw new Error(`Missing timestamps for ${task.id}`);
  for (const w of task.worklog) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) throw new Error(`Invalid worklog date on ${task.id}`);
  }
}

function parseInlineArray(raw: string): string[] {
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return [];
  const content = m[1].trim();
  if (!content) return [];
  return content.split(',').map((x) => x.trim()).filter(Boolean);
}

export function parseWorkBoard(markdown: string): WorkBoard {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '# Work Board') throw new Error('Missing # Work Board header');

  const tasks: Task[] = [];
  let i = 0;
  let section: 'active' | 'archived' | null = null;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '## Active') section = 'active';
    else if (line === '## Archived') section = 'archived';

    const taskHeader = line.match(/^### \[task:([a-z0-9-]+)\]$/);
    if (taskHeader) {
      if (!section) throw new Error(`Task outside Active/Archived at line ${i + 1}`);

      const id = taskHeader[1];
      const meta = new Map<string, string>();
      const nextSteps: string[] = [];
      const worklog: WorklogEntry[] = [];
      const seenSections = new Set<string>();
      let summary = '';
      let notes = '';
      let mode: '' | 'summary' | 'next' | 'notes' | 'worklog' = '';
      i++;
      while (i < lines.length) {
        const cur = lines[i];
        const t = cur.trim();
        if (t.startsWith('### [task:') || t === '## Active' || t === '## Archived') {
          i--;
          break;
        }
        const metaMatch = t.match(/^- ([a-z_]+):\s*(.*)$/);
        if (metaMatch && mode === '') {
          meta.set(metaMatch[1], metaMatch[2]);
        } else if (t === '#### Summary') { mode = 'summary'; seenSections.add(mode); }
        else if (t === '#### Next Steps') { mode = 'next'; seenSections.add(mode); }
        else if (t === '#### Notes') { mode = 'notes'; seenSections.add(mode); }
        else if (t === '#### Worklog') { mode = 'worklog'; seenSections.add(mode); }
        else if (mode === 'summary' && !t.startsWith('####')) summary += (summary ? '\n' : '') + cur.trim();
        else if (mode === 'notes' && !t.startsWith('####')) notes += (notes ? '\n' : '') + cur.trim();
        else if (mode === 'next' && t.startsWith('- ')) nextSteps.push(t.slice(2));
        else if (mode === 'worklog' && t.startsWith('- ')) {
          const w = t.slice(2).match(/^(\d{4}-\d{2}-\d{2})(?:\s+\[([a-z_]+)\])?:\s*(.*)$/);
          if (!w) throw new Error(`Invalid worklog line at ${i + 1}`);
          worklog.push({ date: w[1], kind: w[2] as WorklogEntry['kind'] | undefined, text: w[3] });
        } else if (t) {
          throw new Error(`Malformed line at ${i + 1}: ${t}`);
        }
        i++;
      }

      for (const field of ['title', 'status', 'priority', 'category', 'tags', 'created_at', 'updated_at', 'archived']) {
        if (!meta.has(field)) throw new Error(`Missing ${field} for ${id}`);
      }
      for (const requiredSection of ['summary', 'next', 'notes', 'worklog']) {
        if (!seenSections.has(requiredSection)) throw new Error(`Missing section ${requiredSection} for ${id}`);
      }

      const task: Task = {
        id,
        title: meta.get('title') ?? '',
        status: (meta.get('status') as TaskStatus) ?? 'pending',
        priority: (meta.get('priority') as TaskPriority) ?? 'medium',
        category: meta.get('category') ?? 'work',
        summary,
        next_steps: nextSteps,
        notes: notes || undefined,
        tags: parseInlineArray(meta.get('tags') ?? '[]'),
        created_at: meta.get('created_at') ?? '',
        updated_at: meta.get('updated_at') ?? '',
        due_date: meta.get('due_date') || undefined,
        archived: section === 'archived' || meta.get('archived') === 'true',
        worklog,
      };
      tasks.push(task);
    }
    i++;
  }

  const ids = new Set<string>();
  for (const t of tasks) validateTask(t, ids);
  return { tasks };
}

function cmpTask(a: Task, b: Task): number {
  const s = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
  if (s !== 0) return s;
  const p = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  if (p !== 0) return p;
  return b.updated_at.localeCompare(a.updated_at);
}

function serializeTask(task: Task): string {
  const lines: string[] = [];
  lines.push(`### [task:${task.id}]`);
  lines.push(`- title: ${task.title}`);
  lines.push(`- status: ${task.status}`);
  lines.push(`- priority: ${task.priority}`);
  lines.push(`- category: ${task.category}`);
  lines.push(`- tags: [${task.tags.join(', ')}]`);
  lines.push(`- due_date: ${task.due_date ?? ''}`);
  lines.push(`- created_at: ${task.created_at}`);
  lines.push(`- updated_at: ${task.updated_at}`);
  lines.push(`- archived: ${task.archived ? 'true' : 'false'}`);
  lines.push('');
  lines.push('#### Summary');
  lines.push(task.summary || '');
  lines.push('');
  lines.push('#### Next Steps');
  for (const s of task.next_steps) lines.push(`- ${s}`);
  lines.push('');
  lines.push('#### Notes');
  lines.push(task.notes ?? '');
  lines.push('');
  lines.push('#### Worklog');
  for (const w of task.worklog) lines.push(`- ${w.date}${w.kind ? ` [${w.kind}]` : ''}: ${w.text}`);
  lines.push('');
  return lines.join('\n');
}

export function serializeWorkBoard(board: WorkBoard): string {
  const active = board.tasks.filter((t) => !t.archived).sort(cmpTask);
  const archived = board.tasks.filter((t) => t.archived).sort(cmpTask);
  const out: string[] = ['# Work Board', '', '## Active', ''];
  for (const t of active) out.push(serializeTask(t));
  out.push('## Archived', '');
  for (const t of archived) out.push(serializeTask(t));
  return out.join('\n').trimEnd() + '\n';
}

export function newBoard(): WorkBoard {
  return { tasks: [] };
}
