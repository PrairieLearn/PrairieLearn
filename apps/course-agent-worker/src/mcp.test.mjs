import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('course-agent MCP bridge', () => {
  it('advertises validation, rendering, and publication tools', async () => {
    const bridgePath = fileURLToPath(new URL('../sandbox/course_agent_mcp.py', import.meta.url));
    const child = spawn('python3', [bridgePath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
    );
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.end();

    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    const [exitCode] = await once(child, 'exit');
    expect(exitCode).toBe(0);

    const responses = Buffer.concat(chunks)
      .toString()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(responses[0].result.serverInfo.name).toBe('prairielearn-course-agent');
    expect(responses[1].result.tools.map((tool) => tool.name)).toEqual([
      'validate_course',
      'render_question_variant',
      'push_sync',
    ]);
  });
});
