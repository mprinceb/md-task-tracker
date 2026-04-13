# Markdown + Git Work Tracker

Single-user tracker with manager read-only visibility. The UI is the only editing surface; all data persists in `data/work-board.md` and every successful mutation auto-commits to git.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Default logins:
- owner / owner123
- manager / manager123

Override via env vars (`OWNER_USER`, `OWNER_PASSWORD`, `MANAGER_USER`, `MANAGER_PASSWORD`).

## Architecture

- `src/core/types.ts`: strict schema for tasks/worklog/status/priority.
- `src/core/markdown.ts`: deterministic parser + canonical serializer.
- `src/core/store.ts`: transactional writes, validation, CRUD, and commit calls.
- `src/core/git.ts`: git init/add/commit/history helpers.
- `src/core/history.ts`: semantic change classification (added, status, metadata, content, worklog, archive/restore, scope).
- `src/server.ts`: auth, owner/manager role enforcement, HTML views, required APIs.

## Markdown schema

Task blocks are stored under `## Active` or `## Archived` using stable metadata bullets followed by sections:

- `#### Summary`
- `#### Next Steps`
- `#### Notes`
- `#### Worklog`

Serialization guarantees deterministic order and formatting for clean git diffs.

## Git integration

- repo auto-initialized if missing.
- board init commit when first file is created.
- every mutation calls save -> `git add data/work-board.md` -> commit with structured message.

## Required endpoints

Implemented:
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/worklog`
- `POST /api/tasks/:id/archive`
- `POST /api/tasks/:id/restore`
- `GET /api/history/changes?range=today|week|custom`
- `GET /api/history/task/:id`
- `GET /api/summary?range=today|week|custom`

## Owner and manager flows

- Owner dashboard: quick add task, focus/blocked, today/week changes.
- Task list + detail: edit metadata, status, due date, next steps, notes, tags, quick add worklog, archive/restore.
- Manager dashboard: read-only in-progress/blocked/done-recent/change signals.
- History + Summary pages: today/week change views and copyable markdown summary.
