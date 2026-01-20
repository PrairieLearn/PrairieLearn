import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { queryOptionalRow } from '@prairielearn/postgres';

import { StudentGroupSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  createStudentGroup,
  deleteStudentGroup,
  selectStudentGroupsByCourseInstance,
  updateStudentGroup,
} from '../models/student-group.js';

import { fetchCheerio } from './helperClient.js';
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
    // Create a new group using the model function
    const group = await createStudentGroup({
      course_instance_id: '1',
      name: 'Test Group Alpha',
      color: 'blue1',
    });

    assert.isNotNull(group);
    assert.equal(group.name, 'Test Group Alpha');
    assert.equal(group.color, 'blue1');

    // Verify the group exists in the database
    const dbGroup = await queryOptionalRow(
      "SELECT * FROM student_groups WHERE name = 'Test Group Alpha' AND course_instance_id = '1'",
      {},
      StudentGroupSchema,
    );
    assert.isNotNull(dbGroup);
    assert.equal(dbGroup.name, 'Test Group Alpha');
  });

  test.sequential('should rename a student group', async () => {
    // First get the group
    const groups = await selectStudentGroupsByCourseInstance('1');
    const group = groups.find((g) => g.name === 'Test Group Alpha');
    assert.isOk(group);

    // Rename the group using the model function
    await updateStudentGroup({
      id: group.id,
      name: 'Test Group Beta',
      color: group.color ?? 'blue1',
    });

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
    // First get the group
    const groups = await selectStudentGroupsByCourseInstance('1');
    const group = groups.find((g) => g.name === 'Test Group Beta');
    assert.isOk(group);

    // Delete the group using the model function
    await deleteStudentGroup(group.id);

    // Verify the group no longer exists in the database (or is soft-deleted)
    const deletedGroup = await queryOptionalRow(
      'SELECT * FROM student_groups WHERE id = $id AND deleted_at IS NULL',
      { id: group.id },
      StudentGroupSchema,
    );
    assert.isNull(deletedGroup);
  });

  test.sequential('should not allow creating duplicate group names', async () => {
    // Create a group
    const group = await createStudentGroup({
      course_instance_id: '1',
      name: 'Unique Group',
      color: 'green1',
    });

    // Try to create another group with the same name - should throw
    let errorThrown = false;
    try {
      await createStudentGroup({
        course_instance_id: '1',
        name: 'Unique Group',
        color: 'green1',
      });
    } catch (error) {
      errorThrown = true;
      // The database should enforce uniqueness
      assert.include(
        (error as Error).message.toLowerCase(),
        'duplicate key value violates unique constraint',
      );
    }

    assert.isTrue(errorThrown, 'Expected an error to be thrown for duplicate group name');

    // Clean up
    await deleteStudentGroup(group.id);
  });

  test.sequential('should return groups with student counts via data.json', async () => {
    // Create a test group
    const group = await createStudentGroup({
      course_instance_id: '1',
      name: 'Count Test Group',
      color: 'purple1',
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
    const testGroup = data.find(
      (g: { student_group: { name: string } }) => g.student_group.name === 'Count Test Group',
    );
    assert.isNotNull(testGroup);
    assert.property(testGroup.student_group, 'id');
    assert.property(testGroup.student_group, 'name');
    assert.property(testGroup, 'user_data');
    assert.isArray(testGroup.user_data);
    assert.equal(testGroup.user_data.length, 0);

    // Clean up
    await deleteStudentGroup(group.id);
  });
});
