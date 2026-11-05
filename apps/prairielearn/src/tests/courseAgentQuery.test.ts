import fs from 'fs-extra';
import pg from 'pg';
import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  CourseAgentQueryError,
  closeCourseAgentQueryPool,
  initCourseAgentQueryPool,
  runCourseAgentQuery,
} from '../ee/lib/course-agent/query.js';
import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { User } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';

import { getDatabaseNameForCurrentWorker } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const queryUrl = `http://localhost:${config.serverPort}/pl/webhooks/course_agent/query`;

let owner: User;
let secondCourseDir: tmp.DirectoryResult;

function readerPoolConfig() {
  return {
    user: 'pl_course_agent_test',
    host: 'localhost',
    database: getDatabaseNameForCurrentWorker(),
  };
}

async function queryRows(sql: string, user_id = owner.id) {
  const result = await runCourseAgentQuery({ user_id, course_id: '1', query: sql });
  return result
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('Course agent SQL queries', () => {
  beforeAll(async () => {
    secondCourseDir = await tmp.dir({ unsafeCleanup: true });
    await fs.copy(TEST_COURSE_PATH, secondCourseDir.path);
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'http://127.0.0.1:1',
      courseAgentServiceToken: ['test-token'],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before([TEST_COURSE_PATH, secondCourseDir.path])();
    await sqldb.execute(sql.create_reader_login);
    initCourseAgentQueryPool(readerPoolConfig());
    owner = await getOrCreateUser({ uid: 'owner@example.com', name: 'Owner', uin: 'owner' });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: owner.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });
  afterAll(async () => {
    await closeCourseAgentQueryPool();
    await helperServer.after();
    await secondCourseDir.cleanup();
  });

  test('returns only rows from the claimed course', async () => {
    const count = (course_id: string) =>
      sqldb.queryScalar(sql.count_course_instances, { course_id }, z.number());
    expect(await count('2')).toBeGreaterThan(0);
    const rows = await queryRows('SELECT id, course_id FROM course_instances');
    expect(rows).toHaveLength(await count('1'));
    expect(rows.every((row) => row.course_id === '1')).toBe(true);
  });

  test('scopes child tables through their parents', async () => {
    const rows = await queryRows(
      'SELECT DISTINCT ci.course_id FROM assessments a JOIN course_instances ci ON ci.id = a.course_instance_id',
    );
    expect(rows).toEqual([{ course_id: '1' }]);
    const [{ count }] = await queryRows(
      'SELECT count(*) FROM assessments WHERE course_instance_id NOT IN (SELECT id FROM course_instances)',
    );
    expect(count).toBe('0');
  });

  test('returns no rows after ownership is revoked', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: owner.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    try {
      expect(await queryRows('SELECT id FROM questions')).toEqual([]);
    } finally {
      await updateCoursePermissionsRole({
        course_id: '1',
        user_id: owner.id,
        course_role: 'Owner',
        authn_user_id: '1',
      });
    }
  });

  test('rejects claims that PL did not sign', async () => {
    const client = new pg.Client(readerPoolConfig());
    await client.connect();
    try {
      const future = Math.floor(Date.now() / 1000) + 60;
      for (const claims of [`${owner.id}.2.${future}.${'0'.repeat(64)}`, 'not-a-claim']) {
        await client.query(sql.set_claims, [claims]);
        const result = await client.query(sql.count_visible_course_instances);
        expect(result.rows[0].count).toBe(0);
      }
    } finally {
      await client.end();
    }
  });

  test.each([
    ["SELECT set_config('role', 'postgres', false)", /permission denied to set role/],
    ['RESET ROLE', /syntax error/],
    ['SELECT 1; DELETE FROM courses', /syntax error/],
    ['WITH d AS (DELETE FROM courses RETURNING id) SELECT * FROM d', /top level/],
    ['SELECT enrollment_code FROM course_instances', /permission denied/],
    ['SELECT * FROM users', /permission denied/],
    ['SELECT key FROM course_agent.claim_keys', /permission denied/],
    ['SELECT * FROM generate_series(1, 10001)', /more than 10000 rows/],
  ])('rejects %s', async (sql, message) => {
    const promise = runCourseAgentQuery({ user_id: owner.id, course_id: '1', query: sql });
    await expect(promise).rejects.toThrow(CourseAgentQueryError);
    await expect(promise).rejects.toThrow(message);
  });

  test('serves queries to the course agent service only', async () => {
    const conversation = await insertCourseAgentConversation({
      course_id: '1',
      user_id: owner.id,
      agent_conversation_id: crypto.randomUUID(),
      title: 'Query test',
    });
    const body = JSON.stringify({
      conversation_id: conversation.agent_conversation_id,
      query: 'SELECT short_name FROM course_instances ORDER BY id LIMIT 1;',
    });
    const headers = { 'Content-Type': 'application/json' };
    const denied = await fetch(queryUrl, {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer wrong-token' },
      body,
    });
    expect(denied.status).toBe(401);
    const response = await fetch(queryUrl, {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer test-token' },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^\{"short_name":"[^"]+"\}\n$/);
  });
});
