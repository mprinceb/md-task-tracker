import fs from 'node:fs';
import path from 'node:path';
import { newBoard, parseWorkBoard, serializeWorkBoard, validateTask } from './markdown.js';
import { GitService } from './git.js';
import { Task, WorkBoard, WorklogEntry } from './types.js';

export class BoardStore {
  private git: GitService;
  constructor(private repoRoot: string, private dataFileRel = 'data/work-board.md') {
    this.git = new GitService(repoRoot, dataFileRel);
    this.git.ensureRepo();
  }

  private get dataPath(): string {
    return path.join(this.repoRoot, this.dataFileRel);
  }

  loadBoard(): WorkBoard {
    if (!fs.existsSync(this.dataPath)) {
      const empty = serializeWorkBoard(newBoard());
      fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
      fs.writeFileSync(this.dataPath, empty, 'utf-8');
      this.git.commitIfChanged('board(init): create work-board');
      return newBoard();
    }
    const raw = fs.readFileSync(this.dataPath, 'utf-8');
    return parseWorkBoard(raw);
  }

  saveBoard(board: WorkBoard, commitMsg: string): void {
    const ids = new Set<string>();
    board.tasks.forEach((t) => validateTask(t, ids));
    const serialized = serializeWorkBoard(board);
    const tmp = `${this.dataPath}.tmp`;
    const backup = `${this.dataPath}.bak`;
    const current = fs.existsSync(this.dataPath) ? fs.readFileSync(this.dataPath, 'utf-8') : '';
    fs.writeFileSync(tmp, serialized, 'utf-8');

    try {
      parseWorkBoard(serialized);
    } catch (error) {
      fs.writeFileSync(backup, current, 'utf-8');
      fs.rmSync(tmp, { force: true });
      throw new Error(`Refusing to write invalid markdown: ${(error as Error).message}`);
    }

    fs.renameSync(tmp, this.dataPath);
    this.git.commitIfChanged(commitMsg);
  }

  listTasks(): Task[] { return this.loadBoard().tasks; }
  getTask(id: string): Task | undefined { return this.loadBoard().tasks.find((t) => t.id === id); }

  createTask(task: Task): Task {
    const board = this.loadBoard();
    if (board.tasks.find((t) => t.id === task.id)) throw new Error('Task id already exists');
    board.tasks.push(task);
    this.saveBoard(board, `task(add): create ${task.id}`);
    return task;
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const board = this.loadBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    const before = { ...task };
    Object.assign(task, patch);
    task.updated_at = new Date().toISOString();
    const details: string[] = [];
    if (patch.status && patch.status !== before.status) details.push(`status ${before.status} -> ${patch.status}`);
    if (patch.summary && patch.summary !== before.summary) details.push('summary');
    if (patch.next_steps && patch.next_steps.join('|') !== before.next_steps.join('|')) details.push('next steps');
    const msg = `task(update): ${id} ${details.join(' and ') || 'metadata'}`;
    this.saveBoard(board, msg);
    return task;
  }

  addWorklog(id: string, entry: WorklogEntry): Task {
    const board = this.loadBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    task.worklog.push(entry);
    task.updated_at = new Date().toISOString();
    this.saveBoard(board, `task(worklog): ${id} add entry for ${entry.date}`);
    return task;
  }

  setArchived(id: string, archived: boolean): Task {
    const board = this.loadBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    task.archived = archived;
    task.updated_at = new Date().toISOString();
    this.saveBoard(board, `task(${archived ? 'archive' : 'restore'}): ${id}`);
    return task;
  }

  getGitService(): GitService { return this.git; }
}
