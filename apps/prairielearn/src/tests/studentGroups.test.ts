import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { StudentGroupSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';

import { fetchCheerio, getCSRFToken } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${process.env.VITEST_POOL_ID ? 3007 + Number.parseInt(process.env.VITEST_POOL_ID) : 3007}`;

describe('Student groups page', () => {
  beforeAll(helperServer.before(TEST_COURSE_PATH));
  afterAll(helperServer.after);

  const studentGroupsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students/groups`;

  test.sequential('should load the student groups page', async () => {
    const response = await fetchCheerio(studentGroupsUrl);
    assert.equal(response.status, 200);
    assert.include(response.$('h1').text(), 'Student groups');
  });

  test.sequential('should create a student group', async () => {
    const pageResponse = await fetchCheerio(studentGroupsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Create a new group
    const createResponse = await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'create_group',
        __csrf_token: csrfToken,
        name: 'Test Group Alpha',
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(createResponse.status, 200);

    // Verify the group exists in the database
    const group = await queryOptionalRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Alpha' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );
    assert.isNotNull(group);
    assert.equal(group.name, 'Test Group Alpha');
  });

  test.sequential('should rename a student group', async () => {
    // First get the group ID
    const group = await queryRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Alpha' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );

    const pageResponse = await fetchCheerio(studentGroupsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Rename the group
    const renameResponse = await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'rename_group',
        __csrf_token: csrfToken,
        group_id: group.id,
        name: 'Test Group Beta',
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(renameResponse.status, 200);

    // Verify the group was renamed in the database
    const renamedGroup = await queryOptionalRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Beta' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );
    assert.isNotNull(renamedGroup);
    assert.equal(renamedGroup.name, 'Test Group Beta');
    assert.equal(renamedGroup.id, group.id);

    // Verify the old name no longer exists
    const oldGroup = await queryOptionalRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Alpha' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );
    assert.isNull(oldGroup);
  });

  test.sequential('should delete a student group', async () => {
    // First get the group ID
    const group = await queryRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Beta' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );

    const pageResponse = await fetchCheerio(studentGroupsUrl);
    assert.equal(pageResponse.status, 200);

    const csrfToken = getCSRFToken(pageResponse.$);

    // Delete the group
    const deleteResponse = await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'delete_group',
        __csrf_token: csrfToken,
        group_id: group.id,
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(deleteResponse.status, 200);

    // Verify the group no longer exists in the database
    const deletedGroup = await queryOptionalRow(
      'SELECT * FROM student_groups WHERE id = $id',
      { id: group.id },
      StudentGroupSchema,
    );
    assert.isNull(deletedGroup);
  });

  test.sequential('should not allow creating duplicate group names', async () => {
    const pageResponse = await fetchCheerio(studentGroupsUrl);
    const csrfToken = getCSRFToken(pageResponse.$);

    // Create a group
    await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'create_group',
        __csrf_token: csrfToken,
        name: 'Unique Group',
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    // Try to create another group with the same name
    const duplicateResponse = await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'create_group',
        __csrf_token: csrfToken,
        name: 'Unique Group',
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(duplicateResponse.status, 400);

    // Clean up: delete the group we created
    const group = await queryRow(
      "SELECT * FROM student_groups WHERE name = 'Unique Group' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );
    await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'delete_group',
        __csrf_token: csrfToken,
        group_id: group.id,
      }),
      headers: {
        Accept: 'application/json',
      },
    });
  });

  test.sequential('should return groups with student counts via data.json', async () => {
    // Create a test group
    const pageResponse = await fetchCheerio(studentGroupsUrl);
    const csrfToken = getCSRFToken(pageResponse.$);

    await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'create_group',
        __csrf_token: csrfToken,
        name: 'Count Test Group',
      }),
      headers: {
        Accept: 'application/json',
      },
    });

    // Fetch the data.json endpoint
    const dataResponse = await fetchCheerio(`${studentGroupsUrl}/data.json`, {
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(dataResponse.status, 200);

    const text = await dataResponse.text();
    const data = JSON.parse(text);

    assert.isArray(data);
    const testGroup = data.find((g: { name: string }) => g.name === 'Count Test Group');
    assert.isNotNull(testGroup);
    assert.property(testGroup, 'id');
    assert.property(testGroup, 'name');
    assert.property(testGroup, 'student_count');
    assert.equal(testGroup.student_count, 0);

    // Clean up
    await fetchCheerio(studentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'delete_group',
        __csrf_token: csrfToken,
        group_id: testGroup.id,
      }),
      headers: {
        Accept: 'application/json',
      },
    });
  });
});
