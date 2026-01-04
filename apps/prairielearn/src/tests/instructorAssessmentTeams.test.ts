import fetchCookie from 'fetch-cookie';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { type User } from '../lib/db-types.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import {
  assertAlert,
  extractAndSaveCSRFToken,
  fetchCheerio,
  getCSRFToken,
} from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Instructor team controls', () => {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  const siteUrl = 'http://localhost:' + config.serverPort;
  const baseUrl = siteUrl + '/pl';
  const courseInstanceUrl = baseUrl + '/course_instance/1';

  let users: User[] = [];
  let assessment_id: string;
  let instructorAssessmentTeamsUrl: string;
  let team1RowId: string | undefined;
  let team2RowId: string | undefined;

  test.sequential('has team-based homework assessment', async () => {
    assessment_id = await queryRow(sql.select_team_work_assessment, IdSchema);
    instructorAssessmentTeamsUrl = `${courseInstanceUrl}/instructor/assessment/${assessment_id}/groups`;
  });

  test.sequential('enroll random users', async () => {
    users = await generateAndEnrollUsers({ count: 5, course_instance_id: '1' });
  });

  test.sequential('can create a new team', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addTeamModal');

    const response = await fetchCheerio(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_team',
        team_name: 'TestTeam',
        // Add first two users to the team
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    const teamRow = response.$('#usersTable tr:contains(TestTeam)');
    assert.lengthOf(teamRow, 1);
    assert.ok(teamRow.is(`:contains(${users[0].uid})`));
    assert.ok(teamRow.is(`:contains(${users[1].uid})`));
    team1RowId = teamRow.attr('data-test-team-id');
  });

  test.sequential('cannot create a team with a user already in another team', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addTeamModal');

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_team',
        team_name: 'TeamTeam2',
        // Add first two users to the team
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    assertAlert(response.$, 'in another group');
    assert.lengthOf(response.$('#usersTable td:contains(TeamTeam2)'), 0);
  });

  test.sequential('can create a second team', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addTeamModal');

    const response = await fetchCheerio(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_team',
        team_name: 'TeamTeam2',
        // Add second two users to the team
        uids: users
          .slice(2, 4)
          .map((u) => u.uid)
          .join(','),
      }),
    });
    assert.equal(response.status, 200);
    const teamRow = response.$('#usersTable tr:contains(TeamTeam2)');
    assert.lengthOf(teamRow, 1);
    assert.ok(teamRow.is(`:contains(${users[2].uid})`));
    assert.ok(teamRow.is(`:contains(${users[3].uid})`));
    team2RowId = teamRow.attr('data-test-team-id');
  });

  test.sequential('can create a team with an instructor', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});
    const csrfToken = extractAndSaveCSRFToken({}, getResponse.$, '#addTeamModal');

    const response = await fetchCheerio(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_team',
        team_name: 'TestTeamWithInstructor',
        // Add instructor to the team
        uids: 'dev@example.com',
      }),
    });
    assert.equal(response.status, 200);
    const teamRow = response.$('#usersTable tr:contains(TestTeamWithInstructor)');
    assert.lengthOf(teamRow, 1);
    assert.ok(teamRow.is(':contains("dev@example.com")'));
  });

  test.sequential('can add a user to an existing team', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});

    // The add member form is dynamically rendered on the client, so we need to
    // grab the CSRF token from somewhere else instead of getting it from the
    // actual form.
    const csrfToken = getCSRFToken(getResponse.$);

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_member',
        team_id: team1RowId || '',
        // Add final user to the first team
        add_member_uids: users[4].uid,
      }),
    });
    assert.equal(response.status, 200);
    assert.lengthOf(response.$('.alert'), 0);
    assert.lengthOf(response.$(`#usersTable tr:contains(TestTeam):contains(${users[4].uid})`), 1);
  });

  test.sequential('cannot add a user to a team if they are already in another team', async () => {
    const getResponse = await fetchCheerio(instructorAssessmentTeamsUrl, {});

    // The add member form is dynamically rendered on the client, so we need to
    // grab the CSRF token from somewhere else instead of getting it from the
    // actual form.
    const csrfToken = getCSRFToken(getResponse.$);

    const response = await fetchCookie(fetchCheerio)(instructorAssessmentTeamsUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: csrfToken,
        __action: 'add_member',
        team_id: team2RowId || '',
        // Add final user to the second team
        add_member_uids: users[4].uid,
      }),
    });
    assert.equal(response.status, 200);
    assertAlert(response.$, 'in another group');
    assert.lengthOf(response.$(`#usersTable tr:contains(TestTeam):contains(${users[4].uid})`), 1);
    assert.lengthOf(response.$(`#usersTable tr:contains(TeamTeam2):contains(${users[4].uid})`), 0);
  });
});
