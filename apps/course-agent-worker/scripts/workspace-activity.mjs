import { watch } from 'node:fs';

// Native filesystem events do not leave a Sandbox SDK request or polling loop open.
export function watchWorkspaceActivity(cwd) {
  let timer;
  const watcher = watch(cwd, { recursive: true }, (_event, filename) => {
    if (!filename || filename.startsWith('.course-agent/')) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void fetch('http://course-agent.internal/workspace-activity', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }, 1000);
    timer.unref();
  });
  return () => {
    watcher.close();
    clearTimeout(timer);
  };
}
