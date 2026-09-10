import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function requestPushApproval(cwd) {
  const { stdout } = await execFileAsync(
    'python3',
    ['/opt/prairielearn/course_agent_mcp.py', '--propose'],
    { cwd, maxBuffer: 16 * 1024 * 1024 },
  );
  const response = await fetch('http://course-agent.internal/push-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stdout,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not request publication');
  if (typeof result.approvalId !== 'string') throw new Error('Missing publication approval ID');
  return result.approvalId;
}
