import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../lib/client/errors.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import type { AssessmentUploadsError } from '../trpc/assessment/assessment-uploads.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperServer from './helperServer.js';

// The happy path (CSV contents are parsed and scores updated) is covered
// end-to-end by `exam.test.ts`. This file covers the tRPC layer that's new:
// the `FormData` transport over the Express adapter and the error mapping.

const siteUrl = `http://localhost:${config.serverPort}`;
const COURSE_INSTANCE_ID = '1';

function createUploadClient(assessmentId: string) {
  const csrfToken = generatePrefixCsrfToken(
    {
      url: getAssessmentTrpcUrl({ courseInstanceId: COURSE_INSTANCE_ID, assessmentId }),
      authn_user_id: '1',
    },
    config.secretKey,
  );
  return createAssessmentTrpcClient({
    csrfToken,
    courseInstanceId: COURSE_INSTANCE_ID,
    assessmentId,
    urlBase: siteUrl,
  });
}

describe('Assessment uploads tRPC router', () => {
  let assessmentId: string;

  beforeAll(async () => {
    await helperServer.before()();
    const assessment = await selectAssessmentByTid({
      course_instance_id: COURSE_INSTANCE_ID,
      tid: 'exam1-automaticTestSuite',
    });
    assessmentId = assessment.id;
  });

  afterAll(helperServer.after);

  test('rejects an upload submitted without a file', async () => {
    const client = createUploadClient(assessmentId);
    // A `file` field that isn't a file: the body still parses as `FormData`,
    // but the procedure's `instanceof File` guard must reject it.
    const formData = new FormData();
    formData.append('file', 'not-a-file');
    try {
      await client.assessmentUploads.instanceQuestionScores.mutate(formData);
      assert.fail('expected the upload to throw');
    } catch (err) {
      const appError = getAppError<AssessmentUploadsError['instanceQuestionScores']>(err);
      assert.isNotNull(appError);
      assert.equal(appError.code, 'UNKNOWN');
      assert.match(appError.message, /No CSV file uploaded/);
    }
  });
});
