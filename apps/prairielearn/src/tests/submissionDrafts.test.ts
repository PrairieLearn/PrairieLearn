import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { gradeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectOptionalSubmissionDraft } from '../models/submission-draft.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;

describe('Submission drafts', { timeout: 60_000, concurrent: false }, () => {
  let assessmentInstanceUrl: string;
  let questionUrl: string;
  let csrfToken: string;
  let variantId: string;
  let draftBaseSubmissionId: string;
  const draftClientId = crypto.randomUUID();
  let draftRevision = 0;

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    const { id: assessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    const response = await helperClient.fetchCheerio(
      `${courseInstanceUrl}/assessment/${assessmentId}/`,
    );
    assert.isTrue(response.ok);
    assessmentInstanceUrl = response.url;
    questionUrl = `${siteUrl}${response.$('a:contains("Add two numbers")').attr('href')}`;
  });

  async function loadQuestion() {
    const response = await helperClient.fetchCheerio(questionUrl);
    assert.isTrue(response.ok);
    csrfToken = helperClient.getCSRFToken(response.$('.question-form'));
    variantId = response.$('.question-container').attr('data-variant-id')!;
    draftBaseSubmissionId = response.$('.question-form').attr('data-submission-draft-base')!;
    return response.$;
  }

  function post(action: string, answer: Record<string, string> = {}) {
    return fetch(questionUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: action,
        __csrf_token: csrfToken,
        __variant_id: variantId,
        ...(action === 'save_draft' || action === 'clear_draft'
          ? {
              __draft_base_submission_id: draftBaseSubmissionId,
              __draft_client_id: draftClientId,
              __draft_revision: String(++draftRevision),
            }
          : {}),
        ...answer,
      }),
    });
  }

  test('enables drafts on the question form', async () => {
    const $ = await loadQuestion();
    assert.lengthOf($('form.question-form[data-submission-drafts]'), 1);
    assert.lengthOf($('button[value="restore_draft"]'), 0);
  });

  test('keeps the newer draft when requests from one page arrive out of order', async () => {
    assert.equal((await post('save_draft', { c: '42', __draft_revision: '2' })).status, 204);
    assert.equal((await post('save_draft', { c: '41', __draft_revision: '1' })).status, 204);

    const draft = await selectOptionalSubmissionDraft({ variant_id: variantId, user_id: '1' });
    assert.deepEqual(draft?.raw_submitted_answer, { c: '42' });
  });

  test('clears a reverted draft even if an older save arrives afterward', async () => {
    assert.equal((await post('clear_draft', { __draft_revision: '4' })).status, 204);
    assert.equal((await post('save_draft', { c: '41', __draft_revision: '3' })).status, 204);

    const $ = await loadQuestion();
    assert.lengthOf($('button[value="restore_draft"]'), 0);
  });

  test('offers to restore a saved draft', async () => {
    const response = await post('save_draft', { c: '42' });
    assert.equal(response.status, 204);

    const $ = await loadQuestion();
    assert.lengthOf($('button[value="restore_draft"]'), 1);
  });

  test('restoring a draft saves it as a submission', async () => {
    const response = await post('restore_draft');
    assert.isTrue(response.ok);

    const $ = await loadQuestion();
    assert.lengthOf($('button[value="restore_draft"]'), 0);
    assert.equal($('input[name="c"]').val(), '42');
  });

  test('saving an answer clears the draft', async () => {
    assert.equal((await post('save_draft', { c: '43' })).status, 204);
    const staleBaseSubmissionId = draftBaseSubmissionId;
    assert.isTrue((await post('save', { c: '44' })).ok);

    const staleDraftResponse = await post('save_draft', {
      c: '43',
      __draft_base_submission_id: staleBaseSubmissionId,
    });
    assert.equal(staleDraftResponse.status, 409);
    const { latestSubmissionId } = await staleDraftResponse.json();

    const $ = await loadQuestion();
    assert.equal(draftBaseSubmissionId, latestSubmissionId);
    assert.lengthOf($('button[value="restore_draft"]'), 0);
    assert.equal($('input[name="c"]').val(), '44');
  });

  test('discarding a draft keeps the saved answer', async () => {
    assert.equal((await post('save_draft', { c: '45' })).status, 204);
    assert.isTrue((await post('discard_draft')).ok);

    const $ = await loadQuestion();
    assert.lengthOf($('button[value="restore_draft"]'), 0);
    assert.equal($('input[name="c"]').val(), '44');
  });

  test('rejects drafts once the assessment is closed', async () => {
    await gradeAssessmentInstance({
      assessment_instance_id: String(helperClient.parseAssessmentInstanceId(assessmentInstanceUrl)),
      user_id: '1',
      authn_user_id: '1',
      requireOpen: true,
      close: true,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
      client_fingerprint_id: null,
    });

    assert.equal((await post('save_draft', { c: '46' })).status, 400);

    const { $ } = await helperClient.fetchCheerio(questionUrl);
    assert.lengthOf($('form.question-form[data-submission-drafts]'), 0);
  });
});
