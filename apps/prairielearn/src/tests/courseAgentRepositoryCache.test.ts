import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { RepositorySnapshotStatus } from '@prairielearn/course-agent-types';

import { cacheCourseAgentRepositories } from '../ee/lib/course-agent/repository-snapshots.js';
import { config } from '../lib/config.js';
import { updateCourseColumn } from '../models/course.js';

import * as helperServer from './helperServer.js';

describe('Course agent repository cache', () => {
  // The fake service answers the build request with `building`, then each poll with the next status.
  let polls: RepositorySnapshotStatus[] = [];
  const serviceRequests: { method: string; url: string; body: unknown }[] = [];
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    serviceRequests.push({
      method: request.method!,
      url: request.url!,
      body: body ? JSON.parse(body) : null,
    });
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = request.method === 'POST' ? 202 : 200;
    response.end(
      JSON.stringify(
        request.method === 'POST'
          ? { build: { status: 'building' }, snapshot: null }
          : polls.shift(),
      ),
    );
  });
  const originalConfig = {
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
  };

  beforeAll(async () => {
    service.listen(0, '127.0.0.1');
    await once(service, 'listening');
    const address = service.address();
    if (!address || typeof address === 'string') throw new Error('Expected a service TCP address');
    Object.assign(config, {
      courseAgentServiceUrl: `http://127.0.0.1:${address.port}`,
      courseAgentServiceToken: 'test-token',
    });
    await helperServer.before()();
    await updateCourseColumn({
      courseId: '1',
      columnName: 'repository',
      value: 'git@github.com:PrairieLearn/test-course.git',
      authnUserId: '1',
    });
    await updateCourseColumn({
      courseId: '1',
      columnName: 'branch',
      value: 'main',
      authnUserId: '1',
    });
  });
  beforeEach(() => {
    serviceRequests.length = 0;
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    service.close();
    await once(service, 'close');
  });
  afterAll(() => Object.assign(config, originalConfig));

  test('requests a build for the course repository and waits for it', async () => {
    polls = [
      {
        build: { status: 'idle' },
        snapshot: { commit: 'a'.repeat(40), bytes: 1000, builtAt: new Date().toISOString() },
      },
    ];
    const jobSequenceId = await cacheCourseAgentRepositories(['1'], '1');
    await helperServer.waitForJobSequenceSuccess(jobSequenceId);
    expect(serviceRequests).toEqual([
      {
        method: 'POST',
        url: '/repository-snapshots',
        body: { repository: 'PrairieLearn/test-course', branch: 'main' },
      },
      {
        method: 'GET',
        url: '/repository-snapshots?repository=PrairieLearn%2Ftest-course&branch=main',
        body: null,
      },
    ]);
  });

  test('fails the job when a build fails or a course cannot be cached', async () => {
    polls = [
      { build: { status: 'failed', error: 'Remote branch main not found' }, snapshot: null },
    ];
    // Course 999 does not exist; the remaining course is still attempted.
    const jobSequenceId = await cacheCourseAgentRepositories(['999', '1'], '1');
    await helperServer.waitForJobSequenceStatus(jobSequenceId, 'Error');
    expect(serviceRequests.map((request) => request.method)).toEqual(['POST', 'GET']);
  });
});
