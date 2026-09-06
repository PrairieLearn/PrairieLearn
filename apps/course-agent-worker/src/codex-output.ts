export function codexFailureMessage(stdout: string, stderr: string) {
  for (const line of stdout.split('\n').toReversed()) {
    const event = parseLine(line);
    if (event?.type === 'turn.failed' && isRecord(event.error)) {
      if (typeof event.error.message === 'string') return event.error.message;
    }
    if (event?.type === 'error' && typeof event.message === 'string') return event.message;
  }
  return stderr.trim() || 'Agent process failed';
}

function parseLine(line: string) {
  try {
    const value = JSON.parse(line) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
