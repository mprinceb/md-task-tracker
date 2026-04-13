import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from './core/auth.js';
import { BoardStore } from './core/store.js';
import { Task, TaskPriority, TaskStatus, WorklogKind } from './core/types.js';
import { buildSummary, historyChanges } from './core/history.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const app = express();
const store = new BoardStore(repoRoot);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: process.env.SESSION_SECRET ?? 'dev-secret', resave: false, saveUninitialized: false }));

declare module 'express-session' {
  interface SessionData { user?: { username: string; role: 'owner' | 'manager' }; }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!req.session.user) return void res.redirect('/login');
  next();
}
function requireOwner(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.session.user?.role !== 'owner') return void res.status(403).send('Read-only manager account');
  next();
}
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function splitLines(value: unknown): string[] {
  return asString(value)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
function splitCsv(value: unknown): string[] {
  return asString(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function toSince(range: string, customSince?: string): Date {
  const now = new Date();
  if (range === 'week') return new Date(now.getTime() - 7 * 86400000);
  if (range === 'custom' && customSince) return new Date(customSince);
  return new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
}

app.get('/login', (_req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).render('login', { error: 'Invalid credentials' });
  req.session.user = { username: user.username, role: user.role };
  res.redirect('/');
});
app.post('/logout', requireAuth, (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/', requireAuth, (req, res) => {
  try {
    const tasks = store.listTasks();
    const changesToday = historyChanges(store.getGitService(), toSince('today').toISOString());
    const changesWeek = historyChanges(store.getGitService(), toSince('week').toISOString());
    res.render(req.session.user?.role === 'manager' ? 'manager' : 'dashboard', {
      user: req.session.user,
      tasks,
      focus: tasks.filter((t) => !t.archived && t.status === 'in_progress'),
      blocked: tasks.filter((t) => !t.archived && t.status === 'blocked'),
      doneRecent: tasks.filter((t) => !t.archived && t.status === 'done').slice(0, 5),
      changedToday: changesToday,
      changedWeek: changesWeek,
    });
  } catch (error) {
    res.status(500).send(`Board parse error: ${(error as Error).message}`);
  }
});

app.get('/tasks', requireAuth, (req, res) => {
  let tasks = store.listTasks().filter((t) => !t.archived);
  const q = asString(req.query.q);
  const status = asString(req.query.status);
  const priority = asString(req.query.priority);
  const category = asString(req.query.category);
  const tag = asString(req.query.tag);
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (priority) tasks = tasks.filter((t) => t.priority === priority);
  if (category) tasks = tasks.filter((t) => t.category === category);
  if (tag) tasks = tasks.filter((t) => t.tags.includes(tag));
  if (q) tasks = tasks.filter((t) => `${t.title} ${t.summary} ${t.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  res.render('tasks', { tasks, user: req.session.user, query: req.query });
});

app.get('/tasks/:id', requireAuth, (req, res) => {
  const taskId = asString(req.params.id);
  const task = store.getTask(taskId);
  if (!task) return res.status(404).send('Not found');
  res.render('task-detail', { task, user: req.session.user });
});

app.post('/tasks', requireAuth, requireOwner, (req, res) => {
  const now = new Date().toISOString();
  const task: Task = {
    id: asString(req.body.id),
    title: asString(req.body.title),
    status: (asString(req.body.status, 'pending') as TaskStatus),
    priority: (asString(req.body.priority, 'medium') as TaskPriority),
    category: asString(req.body.category, 'work'),
    summary: asString(req.body.summary),
    next_steps: splitLines(req.body.next_steps),
    notes: asString(req.body.notes),
    tags: splitCsv(req.body.tags),
    created_at: now,
    updated_at: now,
    due_date: asString(req.body.due_date) || undefined,
    archived: false,
    worklog: [],
  };
  store.createTask(task);
  res.redirect(`/tasks/${task.id}`);
});

app.post('/tasks/:id/update', requireAuth, requireOwner, (req, res) => {
  const taskId = asString(req.params.id);
  store.updateTask(taskId, {
    title: asString(req.body.title),
    status: asString(req.body.status, 'pending') as TaskStatus,
    priority: asString(req.body.priority, 'medium') as TaskPriority,
    category: asString(req.body.category),
    summary: asString(req.body.summary),
    next_steps: splitLines(req.body.next_steps),
    notes: asString(req.body.notes),
    tags: splitCsv(req.body.tags),
    due_date: asString(req.body.due_date) || undefined,
  });
  res.redirect(`/tasks/${taskId}`);
});

app.post('/tasks/:id/worklog', requireAuth, requireOwner, (req, res) => {
  const taskId = asString(req.params.id);
  store.addWorklog(taskId, {
    date: asString(req.body.date),
    kind: asString(req.body.kind) as WorklogKind,
    text: asString(req.body.text),
  });
  res.redirect(`/tasks/${taskId}`);
});

app.post('/tasks/:id/archive', requireAuth, requireOwner, (req, res) => {
  store.setArchived(asString(req.params.id), true);
  res.redirect('/tasks');
});
app.post('/tasks/:id/restore', requireAuth, requireOwner, (req, res) => {
  const taskId = asString(req.params.id);
  store.setArchived(taskId, false);
  res.redirect(`/tasks/${taskId}`);
});

app.get('/history/changes', requireAuth, (req, res) => {
  const range = asString(req.query.range, 'today');
  const since = toSince(range, asString(req.query.since) || undefined);
  const changes = historyChanges(store.getGitService(), since.toISOString());
  res.render('history', { changes, range, user: req.session.user });
});

app.get('/summary', requireAuth, (req, res) => {
  const range = asString(req.query.range, 'today');
  const since = toSince(range, asString(req.query.since) || undefined);
  const changes = historyChanges(store.getGitService(), since.toISOString());
  const title = `${range === 'week' ? 'Weekly' : 'Daily'} Summary — ${new Date().toISOString().slice(0, 10)}`;
  const text = buildSummary(changes, title);
  res.render('summary', { text, user: req.session.user, range });
});

app.get('/api/tasks', requireAuth, (req, res) => res.json(store.listTasks()));
app.post('/api/tasks', requireAuth, requireOwner, (req, res) => { store.createTask(req.body); res.status(201).json(req.body); });
app.get('/api/tasks/:id', requireAuth, (req, res) => res.json(store.getTask(asString(req.params.id))));
app.patch('/api/tasks/:id', requireAuth, requireOwner, (req, res) => res.json(store.updateTask(asString(req.params.id), req.body)));
app.post('/api/tasks/:id/worklog', requireAuth, requireOwner, (req, res) => res.json(store.addWorklog(asString(req.params.id), req.body)));
app.post('/api/tasks/:id/archive', requireAuth, requireOwner, (req, res) => res.json(store.setArchived(asString(req.params.id), true)));
app.post('/api/tasks/:id/restore', requireAuth, requireOwner, (req, res) => res.json(store.setArchived(asString(req.params.id), false)));
app.get('/api/history/changes', requireAuth, (req, res) => {
  const range = asString(req.query.range, 'today');
  const since = toSince(range, asString(req.query.since) || undefined);
  res.json(historyChanges(store.getGitService(), since.toISOString()));
});
app.get('/api/history/task/:id', requireAuth, (req, res) => {
  const taskId = asString(req.params.id);
  const changes = historyChanges(store.getGitService(), new Date(Date.now() - 30 * 86400000).toISOString()).filter((c) => c.taskId === taskId);
  res.json(changes);
});
app.get('/api/summary', requireAuth, (req, res) => {
  const range = asString(req.query.range, 'today');
  const since = toSince(range, asString(req.query.since) || undefined);
  const title = `${range === 'week' ? 'Weekly' : 'Daily'} Summary — ${new Date().toISOString().slice(0, 10)}`;
  res.json({ range, summary: buildSummary(historyChanges(store.getGitService(), since.toISOString()), title) });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
