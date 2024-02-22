import { assert } from 'chai';
import { step } from 'mocha-steps';
import { queryRow } from '@prairielearn/postgres';

import { config } from '../lib/config';
import { IdSchema } from '../lib/db-types';
import { features } from '../lib/features';
import * as helperServer from './helperServer';
import * as helperClient from './helperClient';

const siteUrl = `http://localhost:${config.serverPort}`;

// `rpy2` is by default no longer allowed in questions. However, a feature flag
// can be used to allow it. This test checks that both the default and the
// feature flag work as expected.
describe('rpy2 blocking', () => {
  let questionId: string;

  before('set up testing server', async () => {
    await helperServer.before()();

    questionId = await queryRow(
      'SELECT id FROM questions WHERE qid = $qid',
      { qid: 'rpy2' },
      IdSchema,
    );
  });
  after('shut down testing server', helperServer.after);

  step('rpy2 is blocked by default', async () => {
    const res = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course/1/question/${questionId}/preview`,
    );
    assert.equal(res.status, 200);

    const issueText = res.$('.card pre:contains("ImportError: module "rpy2" is not allowed")');
    assert(issueText.length > 0);
  });

  step('rpy2 is allowed with feature flag', async () => {
    await features.enable('allow-rpy2');

    const res = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course/1/question/${questionId}/preview`,
    );
    assert.equal(res.status, 200);

    // `rpy2` may fail for other reasons, e.g. not being installed on an ARM Mac.
    // We won't check for the existence of *any* issue, just an issue related to
    // our blocking of `rpy2`.
    const issueText = res.$('.card pre:contains("ImportError: module \'rpy2\' is not allowed")');
    assert.lengthOf(issueText, 0);
  });
});
