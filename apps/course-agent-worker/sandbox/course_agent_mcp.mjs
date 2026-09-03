#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

function gitRaw(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function git(...args) {
  return gitRaw(...args).trim();
}

async function pushSync() {
  if (git('status', '--porcelain')) {
    throw new Error('Commit all intended changes before calling push_sync');
  }
  const branch = git('branch', '--show-current');
  const proposedSha = git('rev-parse', 'HEAD');
  const baseSha = git('rev-parse', `origin/${branch}`);
  execFileSync('git', ['merge-base', '--is-ancestor', baseSha, proposedSha]);
  const response = await fetch('http://course-agent.internal/push-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch,
      baseSha,
      proposedSha,
      diffSummary: git('diff', '--stat', `${baseSha}..${proposedSha}`),
      diff: gitRaw('diff', '--binary', '--no-ext-diff', `${baseSha}..${proposedSha}`),
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

async function handle(message) {
  const method = message.method;
  const id = message.id;
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'prairielearn-course-agent', version: '1' },
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }
  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: [
        {
          name: 'push_sync',
          description:
            'Submit the current committed diff for instructor approval, then wait for PrairieLearn to push and sync it.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        },
      ],
    });
  }
  if (method === 'tools/call') {
    try {
      if (message.params?.name !== 'push_sync') throw new Error('Unknown tool');
      const value = await pushSync();
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(value) }],
      });
    } catch (error) {
      return rpcResult(id, {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      });
    }
  }
  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
  return null;
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const response = await handle(JSON.parse(line));
  if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
}
