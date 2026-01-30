import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;

describe('instructorCourseAdminSets', () => {
  beforeAll(async () => {
    await helperServer.before(TEST_COURSE_PATH)();
  });

  afterAll(helperServer.after);

  test('renders assessment sets page with correct structure', async () => {
    const response = await fetchCheerio(`${siteUrl}/pl/course/1/course_admin/sets`);
    assert.equal(response.status, 200);

    // Verify the page title
    const title = response.$('h1').first().text();
    assert.equal(title, 'Assessment sets');

    // Verify the table exists
    const table = response.$('table[aria-label="Assessment sets"]');
    assert.lengthOf(table, 1);

    // Verify table headers
    const headers = response.$('table thead th');
    const headerTexts = headers.map((_, el) => response.$(el).text().trim()).get();
    assert.include(headerTexts, 'Abbreviation');
    assert.include(headerTexts, 'Name');
    assert.include(headerTexts, 'Heading');
    assert.include(headerTexts, 'Action');

    // Verify assessment sets are rendered
    const rows = response.$('table tbody tr');
    assert.isAtLeast(rows.length, 1, 'Should have at least one assessment set row');

    // Verify each row has the expected structure (badge, name, heading, used by button)
    const firstRow = response.$(rows[0]);
    const badge = firstRow.find('.badge');
    assert.isAtLeast(badge.length, 1, 'Should have a badge for abbreviation');

    // Verify the "View assessments" button exists
    const viewButton = firstRow.find('button.btn-outline-secondary');
    assert.lengthOf(viewButton, 1, 'Should have a View assessments button');
    assert.equal(viewButton.text().trim(), 'View assessments');
  });
});
