/** Frame cumulative process-log snapshots into individual JSON notification lines. */
export class CodexLogs {
  private offset = 0;
  private buffer = '';

  read(stdout: string, finished = false): string[] {
    if (stdout.length < this.offset) throw new Error('Codex process logs were truncated');
    this.buffer += stdout.slice(this.offset);
    this.offset = stdout.length;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    if (finished && this.buffer) {
      lines.push(this.buffer);
      this.buffer = '';
    }
    return lines.filter((line) => line.trim());
  }
}
