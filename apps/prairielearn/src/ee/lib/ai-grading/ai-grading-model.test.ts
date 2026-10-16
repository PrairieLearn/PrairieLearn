import { Output, generateText } from 'ai';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import * as publicFetch from '@prairielearn/public-fetch';
import { IdSchema } from '@prairielearn/zod';

import {
  AiGradingJobSchema,
  AssessmentQuestionSchema,
  type CourseInstance,
} from '../../../lib/db-types.js';
import { encryptForStorage } from '../../../lib/encrypted-storage.js';
import * as progress from '../../../lib/serverJobProgressSocket.js';
import {
  deleteCredential,
  replaceCustomCredential,
  updateUseCustomApiKeys,
  upsertCredential,
} from '../../../models/ai-grading-credentials.js';
import { selectCreditPool } from '../../../models/ai-grading-credit-pool.js';
import { selectAssessmentQuestionByQuestionId } from '../../../models/assessment-question.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCourseByShortName } from '../../../models/course.js';
import { selectQuestionByQid } from '../../../models/question.js';
import * as helperCourse from '../../../tests/helperCourse.js';
import * as helperDb from '../../../tests/helperDb.js';
import { getOrCreateUser } from '../../../tests/utils/auth.js';

import * as discovery from './ai-grading-model-discovery.js';
import { resolveAiGradingModel } from './ai-grading-model.js';
import { AiGradingSelectionSchema } from './ai-grading-selection.shared.js';
import {
  generateSubmissionContent,
  insertAiGradingJob,
  insertAiGradingJobWithRotationCorrection,
} from './ai-grading-util.js';
import { aiGrade } from './ai-grading.js';

const sql = loadSqlEquiv(import.meta.url);
const base_url = 'https://provider.example/v1';
const model_id = 'gpt-6-sol';
const secret = 'custom-test-key';
const output = Output.object({ schema: z.object({ explanation: z.string() }) });

function response(body: unknown, status = 200) {
  return Response.json(body, { status }) as unknown as Awaited<
    ReturnType<typeof publicFetch.publicFetch>
  >;
}

function completion(content = '{"explanation":"Correct"}') {
  return response({
    id: 'test-completion',
    object: 'chat.completion',
    created: 0,
    model: model_id,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

describe('custom AI grading model', () => {
  let courseInstance: CourseInstance;
  let credentialId: string;
  let userId: string;
  const discover = vi.spyOn(discovery, 'discoverAiGradingModels');

  beforeAll(async () => {
    vi.spyOn(progress, 'emitServerJobProgressUpdate').mockResolvedValue(undefined);
    await helperDb.before();
    await helperCourse.syncCourse();
    const course = await selectCourseByShortName('QA 101');
    courseInstance = {
      ...(await selectCourseInstanceByShortName({ course, shortName: 'Sp15' })),
      ai_grading_use_custom_api_keys: true,
    };
    userId = (await getOrCreateUser({ uid: 'admin@example.com', name: 'Admin', uin: 'admin1' })).id;
    credentialId = (
      await replaceCustomCredential({
        course_instance_id: courseInstance.id,
        expected_credential_id: null,
        base_url,
        encrypted_secret_key: encryptForStorage(secret),
        created_by: userId,
      })
    ).id;
  });
  beforeEach(async () => {
    await updateUseCustomApiKeys({
      course_instance_id: courseInstance.id,
      ai_grading_use_custom_api_keys: true,
    });
    discover.mockReset().mockResolvedValue([model_id, 'campus-text']);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await helperDb.after();
  });

  async function resolve(
    model = model_id,
    credential_id = credentialId,
    instance = courseInstance,
  ) {
    return resolveAiGradingModel(instance, {
      provider: 'openai-compatible',
      model_id: model,
      credential_id,
    });
  }

  it('requires explicit custom identity and validates official provider/model pairs', () => {
    expect(AiGradingSelectionSchema.safeParse({ model_id: 'campus-text' }).success).toBe(false);
    expect(
      AiGradingSelectionSchema.safeParse({ provider: 'openai-compatible', model_id }).success,
    ).toBe(false);
    expect(AiGradingSelectionSchema.safeParse({ provider: 'google', model_id }).success).toBe(
      false,
    );
    expect(AiGradingSelectionSchema.safeParse({ model_id }).success).toBe(true);
  });

  it('rejects disabled BYOK, unavailable models and credentials from another instance', async () => {
    await expect(
      resolve(model_id, credentialId, { ...courseInstance, ai_grading_use_custom_api_keys: false }),
    ).rejects.toThrow('not enabled');
    await expect(resolve('missing-model')).rejects.toThrow('Model not available');
    await expect(resolve(model_id, credentialId, { ...courseInstance, id: '2' })).rejects.toThrow(
      'no longer available',
    );
  });

  it('does not accept an official credential as a custom provider', async () => {
    const official = await upsertCredential({
      course_instance_id: courseInstance.id,
      provider: 'openai',
      encrypted_secret_key: encryptForStorage('official-test-key'),
      created_by: userId,
    });
    await expect(resolve(model_id, official.id)).rejects.toThrow('no longer available');
    const resolved = await resolveAiGradingModel(courseInstance, { model_id });
    expect(resolved.provider).toBe('openai');
    expect(resolved.base_url).toBeNull();
  });

  it.each([model_id, 'campus-text'])(
    'grades and persists custom model %s with structured output and attachments',
    async (selectedModel) => {
      const fetch = vi.spyOn(publicFetch, 'publicFetch').mockResolvedValue(completion());
      try {
        const resolved = await resolve(selectedModel);
        const result = await generateText({
          model: resolved.model,
          output,
          maxRetries: 0,
          messages: [
            {
              role: 'user',
              content: generateSubmissionContent({
                submission_text:
                  '<div data-ai-grading-file-name="answer.pdf"></div><div data-ai-grading-file-name="answer.png"></div>',
                submitted_answer: {
                  _files: [
                    { name: 'answer.pdf', contents: 'cGRm' },
                    { name: 'answer.png', contents: 'aW1hZ2U=' },
                  ],
                },
              }),
            },
          ],
        });
        expect(result.output).toEqual({ explanation: 'Correct' });
        expect(resolved.provider).toBe('openai-compatible');
        expect(discover).toHaveBeenCalledWith({
          baseUrl: base_url,
          apiKey: secret,
          credentialIdentity: { courseInstanceId: courseInstance.id, credentialId },
        });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe(`${base_url}/chat/completions`);
        expect(new Headers(init?.headers as HeadersInit).get('authorization')).toBe(
          `Bearer ${secret}`,
        );
        expect(JSON.parse(init?.body as string)).toMatchObject({
          model: selectedModel,
          response_format: { type: 'json_schema' },
          messages: [
            {
              role: 'user',
              content: expect.arrayContaining([
                {
                  type: 'file',
                  file: { filename: 'answer.pdf', file_data: 'data:application/pdf;base64,cGRm' },
                },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
              ]),
            },
          ],
        });
        const grading_job_id = await queryScalar(
          sql.insert_test_grading_job,
          {
            user_id: userId,
            course_id: courseInstance.course_id,
            course_instance_id: courseInstance.id,
          },
          IdSchema,
        );
        const job_sequence_id = await queryScalar(sql.insert_test_job_sequence, {}, IdSchema);
        const params = {
          grading_job_id,
          job_sequence_id,
          model_id: selectedModel,
          provider: resolved.provider,
          base_url: resolved.base_url,
          prompt: [],
          course_id: courseInstance.course_id,
          course_instance_id: courseInstance.id,
        };
        const jobId = await insertAiGradingJob({ ...params, response: result });
        const saved = await queryRow(
          sql.select_test_ai_grading_job,
          { id: jobId },
          AiGradingJobSchema,
        );
        expect(saved).toMatchObject({
          provider: 'openai-compatible',
          base_url,
          model: selectedModel,
          cost: null,
          prompt_tokens: 10,
          completion_tokens: 5,
        });
        const rotatedId = await insertAiGradingJobWithRotationCorrection({
          ...params,
          gradingResponseWithRotationIssue: result,
          gradingResponseWithRotationCorrection: result,
          rotationCorrections: { 'answer.png': { degreesRotated: 90, response: result } },
        });
        expect(
          await queryRow(sql.select_test_ai_grading_job, { id: rotatedId }, AiGradingJobSchema),
        ).toMatchObject({ cost: null, prompt_tokens: 30, completion_tokens: 15 });
        const officialId = await insertAiGradingJob({
          ...params,
          provider: 'openai',
          model_id,
          base_url: null,
          response: result,
        });
        expect(
          (await queryRow(sql.select_test_ai_grading_job, { id: officialId }, AiGradingJobSchema))
            .cost,
        ).toBeGreaterThan(0);
      } finally {
        fetch.mockRestore();
      }
    },
  );

  it('rejects invalid structured output instead of accepting an unvalidated grade', async () => {
    const fetch = vi
      .spyOn(publicFetch, 'publicFetch')
      .mockResolvedValue(completion('{"wrong":true}'));
    try {
      const resolved = await resolve();
      await expect(
        generateText({ model: resolved.model, output, prompt: 'Grade this', maxRetries: 0 }),
      ).rejects.toThrow();
    } finally {
      fetch.mockRestore();
    }
  });

  it('allows text grading after the provider rejects an attachment request', async () => {
    const fetch = vi
      .spyOn(publicFetch, 'publicFetch')
      .mockResolvedValueOnce(response({ error: { message: 'Images unsupported' } }, 400))
      .mockResolvedValueOnce(completion());
    try {
      const resolved = await resolve();
      await expect(
        generateText({
          model: resolved.model,
          output,
          maxRetries: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', image: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
              ],
            },
          ],
        }),
      ).rejects.toThrow();
      expect(
        (await generateText({ model: resolved.model, output, maxRetries: 0, prompt: 'Text only' }))
          .output,
      ).toEqual({ explanation: 'Correct' });
    } finally {
      fetch.mockRestore();
    }
  });

  it('starts a custom grading job and remembers its identity without platform credits', async () => {
    const course = await selectCourseByShortName('QA 101');
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw10-aiGrading',
    });
    const question = await selectQuestionByQid({ course_id: course.id, qid: 'aiGradingRubrics' });
    const assessment_question = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: question.id,
    });
    const credits = await selectCreditPool(courseInstance.id);
    const jobId = await aiGrade({
      course,
      course_instance: courseInstance,
      assessment,
      question,
      assessment_question,
      urlPrefix: '/pl',
      authn_user_id: userId,
      user_id: userId,
      mode: 'selected',
      instance_question_ids: [],
      model_id,
      provider: 'openai-compatible',
      credential_id: credentialId,
    });
    await expect
      .poll(async () => queryScalar(sql.select_test_job_status, { id: jobId }, z.string()))
      .toBe('Success');
    expect(
      await queryRow(
        sql.select_test_assessment_question,
        { id: assessment_question.id },
        AssessmentQuestionSchema,
      ),
    ).toMatchObject({
      ai_grading_last_selected_model: model_id,
      ai_grading_last_selected_credential_id: credentialId,
    });
    expect(await selectCreditPool(courseInstance.id)).toEqual(credits);
  });

  it('rejects custom API keys disabled during discovery before creating a grading job', async () => {
    const course = await selectCourseByShortName('QA 101');
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw10-aiGrading',
    });
    const question = await selectQuestionByQid({ course_id: course.id, qid: 'aiGradingRubrics' });
    const assessment_question = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: question.id,
    });
    const countBefore = await queryScalar(sql.count_test_job_sequences, {}, z.number());
    discover.mockImplementationOnce(async () => {
      await updateUseCustomApiKeys({
        course_instance_id: courseInstance.id,
        ai_grading_use_custom_api_keys: false,
      });
      return [model_id];
    });
    await expect(
      aiGrade({
        course,
        course_instance: courseInstance,
        assessment,
        question,
        assessment_question,
        urlPrefix: '/pl',
        authn_user_id: userId,
        user_id: userId,
        mode: 'selected',
        instance_question_ids: [],
        model_id,
        provider: 'openai-compatible',
        credential_id: credentialId,
      }),
    ).rejects.toThrow('Custom API keys are not enabled');
    expect(await queryScalar(sql.count_test_job_sequences, {}, z.number())).toBe(countBefore);
  });

  it('rejects a configuration deleted during discovery before creating a grading job', async () => {
    const course = await selectCourseByShortName('QA 101');
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'hw10-aiGrading',
    });
    const question = await selectQuestionByQid({ course_id: course.id, qid: 'aiGradingRubrics' });
    const assessment_question = await selectAssessmentQuestionByQuestionId({
      assessment_id: assessment.id,
      question_id: question.id,
    });
    const countBefore = await queryScalar(sql.count_test_job_sequences, {}, z.number());
    discover.mockImplementationOnce(async () => {
      await deleteCredential({
        credential_id: credentialId,
        course_instance_id: courseInstance.id,
        authn_user_id: userId,
      });
      return [model_id];
    });
    await expect(
      aiGrade({
        course,
        course_instance: courseInstance,
        assessment,
        question,
        assessment_question,
        urlPrefix: '/pl',
        authn_user_id: userId,
        user_id: userId,
        mode: 'selected',
        instance_question_ids: [],
        model_id,
        provider: 'openai-compatible',
        credential_id: credentialId,
      }),
    ).rejects.toThrow('configuration changed');
    expect(await queryScalar(sql.count_test_job_sequences, {}, z.number())).toBe(countBefore);
    credentialId = (
      await replaceCustomCredential({
        course_instance_id: courseInstance.id,
        expected_credential_id: null,
        base_url,
        encrypted_secret_key: encryptForStorage(secret),
        created_by: userId,
      })
    ).id;
  });

  it('rejects the old credential after immutable replacement', async () => {
    const oldId = credentialId;
    credentialId = (
      await replaceCustomCredential({
        course_instance_id: courseInstance.id,
        expected_credential_id: oldId,
        base_url,
        encrypted_secret_key: encryptForStorage(secret),
        created_by: userId,
      })
    ).id;
    await expect(resolve(model_id, oldId)).rejects.toThrow('no longer available');
    await deleteCredential({
      credential_id: credentialId,
      course_instance_id: courseInstance.id,
      authn_user_id: userId,
    });
    await expect(resolve()).rejects.toThrow('no longer available');
  });
});
