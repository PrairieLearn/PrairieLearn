// Summarizes `GIT_TRACE2_PERF` and `GIT_TRACE_CURL` (with `GIT_TRACE_CURL_NO_DATA`) output from a
// course clone into a short timeline: Git's own timing of its steps and child processes, and when
// each HTTP request was sent and its response ended. Lines carry no course file contents.

const MAX_LINES = 120;
// Shorter regions are noise in a clone that takes tens of seconds.
const MIN_REGION_MS = 10;

export interface GitTraceLine {
  source: 'git' | 'http';
  /** Milliseconds after the first trace line, on the container's clock. */
  atMs: number;
  durationMs: number | null;
  text: string;
}

const CLOCK = /^(\d{2}):(\d{2}):(\d{2})\.(\d{6})\s/;

function clockMs(line: string): number | null {
  const match = CLOCK.exec(line);
  if (!match) return null;
  const [, hours, minutes, seconds, micros] = match.map(Number);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Math.floor(micros / 1000);
}

// Child process argv can hold paths and the repository URL; only the Git command is kept.
const GIT_COMMAND = /\b(remote-https?|index-pack|rev-list|fetch-pack|unpack-objects)\b/;

function gitLine(line: string): Omit<GitTraceLine, 'atMs'> | null {
  // `<time> <file:line> | d0 | main | event | rN | t_abs | t_rel | category | data`
  const fields = line.split('|').map((field) => field.trim());
  if (fields.length < 9) return null;
  const [, depth, , event, , , relative, category, data] = fields;
  const seconds = Number(relative);
  const durationMs = relative && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  const child = /^\[(ch\d+)\]/.exec(data)?.[1] ?? '';
  switch (event) {
    case 'region_leave': {
      if (durationMs === null || durationMs < MIN_REGION_MS) return null;
      // Drop path arguments such as `do_write_index /workspace/.../index.lock`.
      const label = data.replace(/^\.*label:/, '').replace(/\s+\/\S*/g, '');
      return { source: 'git', durationMs, text: `${depth} ${category} ${label}` };
    }
    case 'child_start':
      return {
        source: 'git',
        durationMs: null,
        text: `${depth} start ${child} ${GIT_COMMAND.exec(data)?.[1] ?? data.match(/class:\S+/)?.[0] ?? ''}`.trim(),
      };
    case 'child_exit':
      return {
        source: 'git',
        durationMs,
        text: `${depth} exit ${child} ${data.match(/code:-?\d+/)?.[0] ?? ''}`.trim(),
      };
    case 'exit':
      return { source: 'git', durationMs: null, text: `${depth} process exit ${data}` };
    default:
      return null;
  }
}

const HTTP_HEADERS = /^(content-length|transfer-encoding|connection|keep-alive):/i;
const HTTP_INFO =
  /Request completely sent|Connection #\d|[Cc]losing|left intact|transfer closed|timed out|Recv failure|Empty reply|end of response|assume close/;

function httpLine(line: string): string | null {
  const text = line.replace(/^\S+\s+\S+\s+/, '');
  const sent = /^=> Send header: ((?:GET|POST) \S+ \S+)/.exec(text);
  if (sent) return `request ${sent[1].replace(/\?.*? /, ' ')}`;
  const received = /^<= Recv header: (.+)$/.exec(text)?.[1];
  if (received && (received.startsWith('HTTP/') || HTTP_HEADERS.test(received))) {
    return `response ${received}`;
  }
  const info = /^== Info: (.+)$/.exec(text)?.[1];
  if (info && HTTP_INFO.test(info)) return info;
  return null;
}

/** Merge both traces into one timeline, relative to the earliest line in either. */
export function summarizeGitTraces(perf: string, curl: string): GitTraceLine[] {
  const lines: (Omit<GitTraceLine, 'atMs'> & { clock: number })[] = [];
  let base = Infinity;
  for (const line of perf.split('\n')) {
    const clock = clockMs(line);
    if (clock === null) continue;
    base = Math.min(base, clock);
    const parsed = gitLine(line);
    if (parsed) lines.push({ ...parsed, clock });
  }
  for (const line of curl.split('\n')) {
    const clock = clockMs(line);
    if (clock === null) continue;
    base = Math.min(base, clock);
    const text = httpLine(line);
    if (text) lines.push({ source: 'http', durationMs: null, text, clock });
  }
  return lines
    .map(({ clock, ...line }) => ({ ...line, atMs: clock - base }))
    .sort((a, b) => a.atMs - b.atMs)
    .slice(0, MAX_LINES);
}
