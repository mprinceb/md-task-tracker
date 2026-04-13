import { execFileSync } from 'node:child_process';

export interface GitCommitMeta {
  hash: string;
  isoDate: string;
  subject: string;
}

export class GitService {
  constructor(private repoRoot: string, private dataFileRel: string) {}

  private run(args: string[]): string {
    return execFileSync('git', args, { cwd: this.repoRoot, encoding: 'utf-8' }).trim();
  }

  ensureRepo(): void {
    try {
      this.run(['rev-parse', '--is-inside-work-tree']);
    } catch {
      this.run(['init']);
    }
  }

  commitIfChanged(message: string): boolean {
    this.run(['add', this.dataFileRel]);
    const status = this.run(['status', '--porcelain', '--', this.dataFileRel]);
    if (!status) return false;
    this.run(['commit', '-m', message, '--', this.dataFileRel]);
    return true;
  }

  fileAtCommit(spec: string): string {
    return this.run(['show', `${spec}:${this.dataFileRel}`]);
  }

  commitTimelineSince(sinceIso: string): GitCommitMeta[] {
    const out = this.run([
      'log',
      '--since',
      sinceIso,
      '--reverse',
      '--pretty=format:%H|%cI|%s',
      '--',
      this.dataFileRel,
    ]);
    if (!out) return [];
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, isoDate, subject] = line.split('|');
        return { hash, isoDate, subject };
      });
  }

  lastCommitTouchingFileBefore(sinceIso: string): string | null {
    const out = this.run(['rev-list', '-n', '1', `--before=${sinceIso}`, 'HEAD', '--', this.dataFileRel]);
    return out || null;
  }
}
