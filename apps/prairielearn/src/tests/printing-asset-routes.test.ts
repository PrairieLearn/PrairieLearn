import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import {
  PRINT_ASSET_TOKEN_HEADER,
  beginPrintAssetAccess,
} from '../lib/printing/print-asset-access.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectUserByUid } from '../models/user.js';

import { fetchCheerio, parseAssessmentInstanceId } from './helperClient.js';
import * as helperServer from './helperServer.js';

describe('Print asset routes', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('serves scoped assets without a session and refuses unrelated instructor paths', async () => {
    const siteUrl = `http://localhost:${config.serverPort}`;
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam1-automaticTestSuite',
    });
    const user = await selectUserByUid('dev@example.com');
    const assessmentUrl = `${siteUrl}/pl/course_instance/1/assessment/${assessment.id}/`;
    const page = await fetchCheerio(assessmentUrl);
    const csrfToken = page.$('form input[name="__csrf_token"]').val();
    assert(typeof csrfToken === 'string');
    const started = await fetch(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({ __action: 'new_instance', __csrf_token: csrfToken }),
    });
    assert.equal(started.status, 200);
    const assessmentInstanceId = String(parseAssessmentInstanceId(started.url));
    const { token } = beginPrintAssetAccess(
      {
        courseInstanceId: '1',
        assessmentId: assessment.id,
        assessmentInstanceId,
        instanceQuestionIds: [],
        authnUserId: user.id,
        userId: user.id,
      },
      config.secretKey,
    );
    const headers = { [PRINT_ASSET_TOKEN_HEADER]: token, Accept: 'application/json' };

    const asset = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessment.id}/clientFilesCourse/data.txt`,
      { headers },
    );
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), 'This data is specific to the course.');

    const instructorPage = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessment.id}/questions`,
      { headers },
    );
    assert.equal(instructorPage.status, 403);

    const otherAssessmentAsset = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/999999999/clientFilesCourse/data.txt`,
      { headers },
    );
    assert.equal(otherAssessmentAsset.status, 403);
  });
});
