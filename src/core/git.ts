import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
    const file = this.dataFileRel;
    this.run(['add', file]);
    const status = this.run(['status', '--porcelain', '--', file]);
    if (!status) return false;
    this.run(['commit', '-m', message, '--', file]);
    return true;
  }

  fileAtCommit(commit: string): string {
    return this.run(['show', `${commit}:${this.dataFileRel}`]);
  }

  commitsSince(sinceIso: string): string[] {
    const output = this.run(['log', '--since', sinceIso, '--pretty=format:%H', '--', this.dataFileRel]);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  commitsCount(): number {
    const out = this.run(['rev-list', '--count', 'HEAD']);
    return Number(out || '0');
  }

  repoPath(): string {
    return path.join(this.repoRoot, this.dataFileRel);
  }
}
