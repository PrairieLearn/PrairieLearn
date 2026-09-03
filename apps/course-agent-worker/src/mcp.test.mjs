import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

describe('course-agent MCP bridge', () => {
  it('advertises the push_sync tool', async () => {
    const child = spawn(process.execPath, ['sandbox/course_agent_mcp.mjs'], {
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
    expect(responses[1].result.tools.map((tool) => tool.name)).toEqual(['push_sync']);
  });
});
