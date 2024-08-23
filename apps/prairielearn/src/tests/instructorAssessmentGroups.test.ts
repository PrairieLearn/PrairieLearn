import { assert } from 'chai';
import fetchCookie from 'fetch-cookie';
import { step } from 'mocha-steps';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { IdSchema, type User } from '../lib/db-types.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import {
  assertAlert,
  extractAndSaveCSRFToken,
  fetchCheerio,
  getCSRFToken,
} from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Instructor group controls', () => {
  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  const siteUrl = 'http://localhost:' + config.serverPort;
  const baseUrl = siteUrl + '/pl';
  const courseInstanceUrl = baseUrl + '/course_instance/1';

  let users: User[] = [];
  let assessment_id: string;
  let instructorAssessmentGroupsUrl: string;
  let group1RowId: string | undefined;
  let group2RowId: string | undefined;

  step('has group-based homework assessment', async () => {
    assessment_id = await queryRow(sql.select_group_work_assessment, {}, IdSchema);
    instructorAssessmentGroupsUrl = `${courseInstanceUrl}/instructor/assessment/${assessment_id}/groups`;
  });

  step('enroll random users', async () => {
    users = await generateAndEnrollUsers({ count: 5, course_instance_id: '1' });
  });

  step('can create a new group', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addGroupModal');

    const response = await fetchCheerio(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_group',
        group_name: 'TestGroup',
        // Add first two users to the group
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    const groupRow = response.$('#usersTable tr:contains(TestGroup)');
    assert.lengthOf(groupRow, 1);
    assert.ok(groupRow.is(`:contains(${users[0].uid})`));
    assert.ok(groupRow.is(`:contains(${users[1].uid})`));
    group1RowId = groupRow.attr('data-test-group-id');
  });

  step('cannot create a group with a user already in another group', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addGroupModal');

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_group',
        group_name: 'TestGroup2',
        // Add first two users to the group
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    assertAlert(response.$, 'in another group');
    assert.lengthOf(response.$('#usersTable td:contains(TestGroup2)'), 0);
  });

  step('can create a second group', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addGroupModal');

    const response = await fetchCheerio(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_group',
        group_name: 'TestGroup2',
        // Add second two users to the group
        uids: users
          .slice(2, 4)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    const groupRow = response.$('#usersTable tr:contains(TestGroup2)');
    assert.lengthOf(groupRow, 1);
    assert.ok(groupRow.is(`:contains(${users[2].uid})`));
    assert.ok(groupRow.is(`:contains(${users[3].uid})`));
    group2RowId = groupRow.attr('data-test-group-id');
  });

  step('can create a group with an instructor', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addGroupModal');

    const response = await fetchCheerio(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_group',
        group_name: 'TestGroupWithInstructor',
        // Add instructor to the group
        uids: 'dev@example.com',
      }),
    });
    assert.equal(response.status, 200);
    const groupRow = response.$('#usersTable tr:contains(TestGroupWithInstructor)');
    assert.lengthOf(groupRow, 1);
    assert.ok(groupRow.is(':contains("dev@example.com")'));
  });

  step('can add a user to an existing group', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});

    // The add member form is dynamically rendered on the client, so we need to
    // grab the CSRF token from somewhere else instead of getting it from the
    // actual form.
    const csrfToken = getCSRFToken(getResponse.$);

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_member',
        group_id: group1RowId || '',
        // Add final user to the first group
        add_member_uids: users[4].uid,
      }),
    });
    assert.equal(response.status, 200);
    assert.lengthOf(response.$('.alert'), 0);
    assert.lengthOf(response.$(`#usersTable tr:contains(TestGroup):contains(${users[4].uid})`), 1);
  });

  step('cannot add a user to a group if they are already in another group', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentGroupsUrl, {});

    // The add member form is dynamically rendered on the client, so we need to
    // grab the CSRF token from somewhere else instead of getting it from the
    // actual form.
    const csrfToken = getCSRFToken(getResponse.$);

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentGroupsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_member',
        group_id: group2RowId || '',
        // Add final user to the second group
        add_member_uids: users[4].uid,
      }),
    });
    assert.equal(response.status, 200);
    assertAlert(response.$, 'in another group');
    assert.lengthOf(response.$(`#usersTable tr:contains(TestGroup):contains(${users[4].uid})`), 1);
    assert.lengthOf(response.$(`#usersTable tr:contains(TestGroup2):contains(${users[4].uid})`), 0);
  });
});
