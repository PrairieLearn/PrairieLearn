import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { queryOptionalRow } from '@prairielearn/postgres';

import { StudentLabelSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  createStudentLabel,
  deleteStudentLabel,
  selectStudentLabelsByCourseInstance,
  updateStudentLabel,
} from '../models/student-label.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${process.env.VITEST_POOL_ID ? 3007 + Number.parseInt(process.env.VITEST_POOL_ID) : 3007}`;

describe('Student labels page', () => {
  beforeAll(helperServer.before(TEST_COURSE_PATH));
  afterAll(helperServer.after);

  const studentLabelsUrl = `${siteUrl}/pl/course_instance/1/instructor/instance_admin/students/labels`;

  test.sequential('should load the student labels page', async () => {
    const response = await fetchCheerio(studentLabelsUrl);
    assert.equal(response.status, 200);
    assert.include(response.$('h1').text(), 'Student labels');
  });

  test.sequential('should create a student label', async () => {
    // Create a new label using the model function
    const label = await createStudentLabel({
      course_instance_id: '1',
      name: 'Test Label Alpha',
      color: 'blue1',
    });

    assert.isNotNull(label);
    assert.equal(label.name, 'Test Label Alpha');
    assert.equal(label.color, 'blue1');

    // Verify the label exists in the database
    const dbLabel = await queryOptionalRow(
      "SELECT * FROM student_labels WHERE name = 'Test Label Alpha' AND course_instance_id = '1'",
      {},
      StudentLabelSchema,
    );
    assert.isNotNull(dbLabel);
    assert.equal(dbLabel.name, 'Test Label Alpha');
  });

  test.sequential('should rename a student label', async () => {
    // First get the label
    const labels = await selectStudentLabelsByCourseInstance('1');
    const label = labels.find((l) => l.name === 'Test Label Alpha');
    assert.isOk(label);

    // Rename the label using the model function
    await updateStudentLabel({
      id: label.id,
      name: 'Test Label Beta',
      color: label.color ?? 'blue1',
    });

    // Verify the label was renamed in the database
    const renamedLabel = await queryOptionalRow(
      "SELECT * FROM student_labels WHERE name = 'Test Label Beta' AND course_instance_id = '1'",
      {},
      StudentLabelSchema,
    );
    assert.isNotNull(renamedLabel);
    assert.equal(renamedLabel.name, 'Test Label Beta');
    assert.equal(renamedLabel.id, label.id);

    // Verify the old name no longer exists
    const oldLabel = await queryOptionalRow(
      "SELECT * FROM student_labels WHERE name = 'Test Label Alpha' AND course_instance_id = '1'",
      {},
      StudentLabelSchema,
    );
    assert.isNull(oldLabel);
  });

  test.sequential('should delete a student label', async () => {
    // First get the label
    const labels = await selectStudentLabelsByCourseInstance('1');
    const label = labels.find((l) => l.name === 'Test Label Beta');
    assert.isOk(label);

    // Delete the label using the model function
    await deleteStudentLabel(label.id);

    // Verify the label no longer exists in the database (or is soft-deleted)
    const deletedLabel = await queryOptionalRow(
      'SELECT * FROM student_labels WHERE id = $id AND deleted_at IS NULL',
      { id: label.id },
      StudentLabelSchema,
    );
    assert.isNull(deletedLabel);
  });

  test.sequential('should not allow creating duplicate label names', async () => {
    // Create a label
    const label = await createStudentLabel({
      course_instance_id: '1',
      name: 'Unique Label',
      color: 'green1',
    });

    // Try to create another label with the same name - should throw
    let errorThrown = false;
    try {
      await createStudentLabel({
        course_instance_id: '1',
        name: 'Unique Label',
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

    assert.isTrue(errorThrown, 'Expected an error to be thrown for duplicate label name');

    // Clean up
    await deleteStudentLabel(label.id);
  });

  test.sequential('should return labels with student counts via data.json', async () => {
    // Create a test label
    const label = await createStudentLabel({
      course_instance_id: '1',
      name: 'Count Test Label',
      color: 'purple1',
    });

    // Fetch the data.json endpoint
    const dataResponse = await fetchCheerio(`${studentLabelsUrl}/data.json`, {
      headers: {
        Accept: 'application/json',
      },
    });

    assert.equal(dataResponse.status, 200);

    const text = await dataResponse.text();
    const data = JSON.parse(text);

    assert.isArray(data);
    const testLabel = data.find(
      (l: { student_label: { name: string } }) => l.student_label.name === 'Count Test Label',
    );
    assert.isNotNull(testLabel);
    assert.property(testLabel.student_label, 'id');
    assert.property(testLabel.student_label, 'name');
    assert.property(testLabel, 'user_data');
    assert.isArray(testLabel.user_data);
    assert.equal(testLabel.user_data.length, 0);

    // Clean up
    await deleteStudentLabel(label.id);
  });
});
