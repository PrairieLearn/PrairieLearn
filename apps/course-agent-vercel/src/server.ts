import { type IncomingMessage, createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  CourseAgentPushDecisionRequestSchema,
  CourseAgentSnapshotRequestSchema,
  CourseAgentStartRunRequestSchema,
} from '@prairielearn/course-agent-protocol';

import { authorizeRun, authorizeSnapshot } from './auth.ts';
import { createDriver } from './driver.ts';
import { Runtime } from './runtime.ts';
import { StateStore } from './state.ts';

const EnvironmentSchema = z.object({
  COURSE_AGENT_CAPABILITY_SECRET: z.string().min(32),
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_TEAM_ID: z.string().min(1),
  VERCEL_PROJECT_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  COURSE_AGENT_GITHUB_PAT: z.string().min(1),
  COURSE_AGENT_MODEL: z.string().default('gpt-5.4'),
  COURSE_AGENT_PORT: z.coerce.number().int().min(1024).max(65535).default(8788),
  COURSE_AGENT_STATE_DIRECTORY: z.string().default('.state'),
  COURSE_AGENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(3_600_000)
    .default(30 * 60_000),
});

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_000_000) throw new Error('Request exceeds the size limit.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createRuntimeServer(runtime: Runtime, secret: string) {
  return createServer((request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, runtime: 'vercel', prototype: true }));
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
      }
      const body = await readBody(request);
      if (request.url === '/v1/runs') {
        const parsed = CourseAgentStartRunRequestSchema.parse(body);
        const capability = await authorizeRun(parsed, secret);
        const result = await runtime.start(parsed, capability);
        response.writeHead(202, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      if (request.url === '/v1/push-decisions') {
        const parsed = CourseAgentPushDecisionRequestSchema.parse(body);
        const capability = await authorizeSnapshot(parsed, secret);
        const result = await runtime.decision(parsed, capability);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      const parsed = CourseAgentSnapshotRequestSchema.parse(body);
      const capability = await authorizeSnapshot(parsed, secret);
      const identity = { ...parsed, userId: capability.userId, courseId: capability.courseId };
      if (request.url === '/v1/snapshot') {
        const snapshot = runtime.snapshot(identity);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(snapshot));
        return;
      }
      if (request.url === '/v1/stream') {
        runtime.snapshot(identity);
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        response.flushHeaders();
        let cursor = -1;
        const poll = () => {
          if (response.destroyed) return;
          const snapshot = runtime.snapshot(identity);
          for (const event of snapshot.events) {
            if (event.sequence <= cursor) continue;
            response.write(`data: ${JSON.stringify(event)}\n\n`);
            cursor = event.sequence;
          }
          if (!snapshot.activeRunId) response.end();
        };
        const timer = setInterval(poll, 100);
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000);
        response.on('close', () => {
          clearInterval(timer);
          clearInterval(heartbeat);
        });
        poll();
        return;
      }
      response.writeHead(404).end();
    })().catch(() => {
      if (response.headersSent) {
        response.destroy();
      } else {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error: 'The runtime request was invalid or unavailable. Check the conversation state.',
          }),
        );
      }
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = EnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      `Configure the runtime environment before starting: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
    process.exitCode = 1;
  } else {
    const env = parsed.data;
    const runtime = new Runtime(
      new StateStore(env.COURSE_AGENT_STATE_DIRECTORY),
      createDriver({
        token: env.VERCEL_TOKEN,
        teamId: env.VERCEL_TEAM_ID,
        projectId: env.VERCEL_PROJECT_ID,
        openaiKey: env.OPENAI_API_KEY,
        githubToken: env.COURSE_AGENT_GITHUB_PAT,
        model: env.COURSE_AGENT_MODEL,
        timeoutMs: env.COURSE_AGENT_TIMEOUT_MS,
      }),
      [
        env.VERCEL_TOKEN,
        env.OPENAI_API_KEY,
        env.COURSE_AGENT_GITHUB_PAT,
        env.COURSE_AGENT_CAPABILITY_SECRET,
      ],
    );
    await runtime.initialize();
    const server = createRuntimeServer(runtime, env.COURSE_AGENT_CAPABILITY_SECRET);
    server.listen(env.COURSE_AGENT_PORT, '127.0.0.1', () => {
      console.warn(
        `Course-agent Vercel prototype listening on http://127.0.0.1:${env.COURSE_AGENT_PORT}`,
      );
    });
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.once(signal, () => {
        server.closeAllConnections();
        server.close();
        void runtime.shutdown();
      });
    }
  }
}
