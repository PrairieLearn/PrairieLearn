// `remote:` phases are GitHub building the pack; the rest run in the container. Checkout progress
// only appears when it takes over a second or two, otherwise its time lands in the delta phase.
const PHASES = [
  ['server_enumerating', 'remote: Enumerating objects:'],
  ['server_counting', 'remote: Counting objects:'],
  ['server_compressing', 'remote: Compressing objects:'],
  ['receiving', 'Receiving objects:'],
  ['resolving_deltas', 'Resolving deltas:'],
  ['checkout', 'Updating files:'],
] as const;

const TAIL_CHARS = 2000;

export interface ClonePhase {
  phase: 'connecting' | (typeof PHASES)[number][0];
  startMs: number;
  durationMs: number;
  /** The phase's last progress line, e.g. object counts, size, and download rate. */
  progress: string | null;
  /** When that line arrived. Time between it and the next phase's start is Git waiting. */
  lastProgressMs: number | null;
}

/**
 * Times the phases of `git clone --progress` from its stderr. Each phase lasts until the next one
 * starts, and `connecting` covers reference discovery before the first.
 */
export class CloneProgress {
  private partial = '';
  private messages = '';
  private seen: {
    phase: ClonePhase['phase'];
    startMs: number;
    progress: string;
    lastProgressMs: number;
  }[] = [];

  constructor(private started: number) {}

  push(chunk: string, now: number) {
    // Progress updates rewrite one line with `\r`; finished phases and messages end with `\n`.
    const lines = (this.partial + chunk).split(/[\r\n]/);
    this.partial = lines.pop() ?? '';
    for (const line of lines) this.line(line.trim(), now);
  }

  phases(now: number): ClonePhase[] {
    this.line(this.partial.trim(), now);
    this.partial = '';
    const endMs = now - this.started;
    const phases: ClonePhase[] = [
      {
        phase: 'connecting',
        startMs: 0,
        durationMs: this.seen[0]?.startMs ?? endMs,
        progress: null,
        lastProgressMs: null,
      },
    ];
    this.seen.forEach(({ phase, startMs, progress, lastProgressMs }, i) => {
      const nextMs = this.seen[i + 1]?.startMs ?? endMs;
      phases.push({ phase, startMs, durationMs: nextMs - startMs, progress, lastProgressMs });
    });
    return phases;
  }

  /** Recent non-progress output, such as the `fatal:` line of a failed clone. */
  get errorOutput() {
    return (this.messages + this.partial).trim();
  }

  private line(line: string, now: number) {
    if (!line) return;
    const match = PHASES.find(([, prefix]) => line.startsWith(prefix));
    if (!match) {
      this.messages = `${this.messages}${line}\n`.slice(-TAIL_CHARS);
      return;
    }
    const last = this.seen.at(-1);
    const atMs = now - this.started;
    if (last?.phase === match[0]) {
      last.progress = line;
      last.lastProgressMs = atMs;
    } else {
      this.seen.push({ phase: match[0], startMs: atMs, progress: line, lastProgressMs: atMs });
    }
  }
}
