import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFile, cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { load } from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import sharp from 'sharp';
import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { loadSqlEquiv, queryRow, queryScalar, queryScalars } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import * as aiGradingModel from '../ee/lib/ai-grading/ai-grading-model.js';
import { aiGrade } from '../ee/lib/ai-grading/ai-grading.js';
import { gradeAssessmentInstance, makeAssessmentInstance } from '../lib/assessment.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { SubmissionSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as progress from '../lib/serverJobProgressSocket.js';
import { selectAssessmentQuestionByQuestionId } from '../models/assessment-question.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseByShortName, updateCourseQuestionsReceiveUserData } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { selectQuestionByInstanceQuestionId } from '../models/question.js';
import {
  selectOptionalUnsavedSubmissionForAssessment,
  selectUnsavedSubmissionGeneration,
  upsertUnsavedSubmission,
} from '../models/unsaved-submission.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceId = '1';

describe('Recovered submission author context', { concurrent: false }, () => {
  let temporaryCourse: tmp.DirectoryResult;

  beforeAll(async () => {
    temporaryCourse = await tmp.dir({ unsafeCleanup: true });
    const coursePath = path.join(temporaryCourse.path, 'testCourse');
    await cp(TEST_COURSE_PATH, coursePath, { recursive: true });
    await appendFile(
      path.join(coursePath, 'questions/addNumbers/server.py'),
      `

def author_uid(data):
    user = data["options"]["user"]
    return user["uid"] if user else "missing"


def parse(data):
    data["submitted_answers"]["parsed_by"] = author_uid(data)


def grade(data):
    data["feedback"]["graded_for"] = author_uid(data)


def file(data):
    author = author_uid(data)
    shade = sum(ord(character) for character in author) % 256
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><metadata>{author}|{data["submitted_answers"]["parsed_by"]}</metadata><rect width="20" height="10" fill="rgb({shade},0,0)"/></svg>'
`,
    );
    await appendFile(
      path.join(coursePath, 'questions/addNumbers/question.html'),
      `
<pl-question-panel>
  <p class="author-question">{{options.user.uid}}</p>
  <img class="author-question-file" src="{{options.client_files_question_dynamic_url}}/author.svg">
</pl-question-panel>
<pl-submission-panel><p class="author-submission">{{options.user.uid}}</p></pl-submission-panel>
<pl-answer-panel>
  <p class="author-answer">{{options.user.uid}}</p>
  <img class="author-answer-image" src="{{options.client_files_question_dynamic_url}}/author.svg">
  <a class="author-answer-file" href="{{options.client_files_question_dynamic_url}}/author.svg">Author figure</a>
</pl-answer-panel>
`,
    );
    const assessmentPath = path.join(
      coursePath,
      'courseInstances/Sp15/assessments/exam14-groupWork/infoAssessment.json',
    );
    const assessmentInfo = JSON.parse(await readFile(assessmentPath, 'utf8'));
    assessmentInfo.zones[0].questions[0].manualPoints = 1;
    await writeFile(assessmentPath, JSON.stringify(assessmentInfo));
    await helperServer.before(coursePath)();
  });

  afterAll(async () => {
    await helperServer.after();
    await temporaryCourse.cleanup();
  });

  test('uses each draft author in activity, parsing, grading, rendered history, generated files, and AI prompts', async () => {
    const instructor = await getConfiguredUser();
    const authors = await generateAndEnrollUsers({
      count: 2,
      course_instance_id: courseInstanceId,
    });
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'exam14-groupWork',
    });
    await updateCourseQuestionsReceiveUserData({
      course_id: '1',
      questions_receive_user_data: true,
      old_questions_receive_user_data: false,
      authn_user_id: instructor.id,
      user_id: instructor.id,
    });
    const client = createAssessmentTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        {
          url: getAssessmentTrpcUrl({ courseInstanceId, assessmentId: assessment.id }),
          authn_user_id: instructor.id,
        },
        config.secretKey,
      ),
      courseInstanceId,
      assessmentId: assessment.id,
      urlBase: siteUrl,
    });
    await client.assessmentGroups.addGroup.mutate({
      groupName: 'RecoveryAuthors',
      uids: authors.map((author) => author.uid).join(','),
    });
    const assessmentInstanceId = await makeAssessmentInstance({
      assessment,
      user_id: authors[0].id,
      authn_user_id: instructor.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
    const instanceQuestionId = await queryScalar(
      sql.select_instance_question,
      { assessment_instance_id: assessmentInstanceId },
      IdSchema,
    );
    const instanceQuestionUrl = `${siteUrl}/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}`;
    const initialPage = await withUser(authors[0], () =>
      helperClient.fetchCheerio(instanceQuestionUrl),
    );
    const variantId = initialPage
      .$('form.question-form input[name="__variant_id"]')
      .val() as string;
    const recoveredSubmissions = new Map<string, string>();

    await withConfig(
      {
        features: {
          'unsaved-submissions-ui': true,
          'unsaved-submissions-instructor-promotion': true,
        },
      },
      async () => {
        for (const draftAuthor of authors) {
          expect(
            await upsertUnsavedSubmission({
              variant_id: variantId,
              instance_question_id: instanceQuestionId,
              user_id: draftAuthor.id,
              raw_submitted_answer: { c: '-1' },
              credit: 100,
              uuid: randomUUID(),
              generation: await selectUnsavedSubmissionGeneration({
                instance_question_id: instanceQuestionId,
                user_id: draftAuthor.id,
              }),
            }),
          ).toBe(true);
          const draftId = await queryScalar(
            sql.select_draft_id,
            { instance_question_id: instanceQuestionId, user_id: draftAuthor.id },
            IdSchema,
          );
          const draft = (await selectOptionalUnsavedSubmissionForAssessment({
            unsaved_submission_id: draftId,
            assessment_id: assessment.id,
          }))!;
          const { submission_id } = await client.unsavedSubmissions.promote.mutate({
            unsaved_submission_id: draftId,
            revision: draft.revision,
          });
          recoveredSubmissions.set(submission_id, draftAuthor.uid);
          const submission = await queryRow(
            sql.select_submission,
            { submission_id },
            SubmissionSchema,
          );
          expect(submission).toMatchObject({
            auth_user_id: instructor.id,
            recovered_from_user_id: draftAuthor.id,
            submitted_answer: { parsed_by: draftAuthor.uid },
            feedback: { graded_for: draftAuthor.uid },
          });
        }
      },
    );
    expect(
      new Set(
        await queryScalars(
          sql.select_submission_activity_users,
          {
            course_instance_id: courseInstanceId,
            user_ids: [instructor.id, ...authors.map((author) => author.id)],
          },
          IdSchema,
        ),
      ),
    ).toEqual(new Set(authors.map((author) => author.id)));
    await gradeAssessmentInstance({
      assessment_instance_id: assessmentInstanceId,
      user_id: instructor.id,
      authn_user_id: instructor.id,
      requireOpen: true,
      close: true,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
      client_fingerprint_id: null,
    });
    const page = await helperClient.fetchCheerio(instanceQuestionUrl);
    expect(page.status).toBe(200);
    expect(page.$('.author-question').text()).toBe(authors[1].uid);
    expect(page.$('.author-answer').text()).toBe(authors[1].uid);
    expect(page.$('.author-submission').text()).toBe(authors[1].uid);
    expect(page.$('[data-testid="submission-block"] .card-header').first().text()).toContain(
      `Answer by ${authors[1].uid}, recovered at`,
    );
    for (const [submissionId, authorUid] of recoveredSubmissions) {
      const info = page.$(`#submissionInfoModal-${submissionId}`);
      expect(info.find('tr:has(th:contains("Answer author")) td').text()).toBe(authorUid);
      expect(info.find('tr:has(th:contains("Recovered by")) td').text()).toBe(instructor.uid);
    }
    const olderSubmissionUrl = page
      .$('.js-submission-body.render-pending')
      .attr('data-dynamic-render-url')!;
    const olderSubmissionResponse = await fetch(new URL(olderSubmissionUrl, siteUrl));
    expect(olderSubmissionResponse.status).toBe(200);
    const olderPanels = await olderSubmissionResponse.json();
    const olderPanel = load(olderPanels.submissionPanel);
    expect(olderPanel('.author-submission').text()).toBe(authors[0].uid);
    expect(olderPanel('.card-header').text()).toContain(
      `Answer by ${authors[0].uid}, recovered at`,
    );
    expect(olderPanel('tr:has(th:contains("Recovered by")) td').text()).toBe(instructor.uid);
    for (const url of [
      page.$('.author-question-file').attr('src')!,
      page.$('.author-answer-file').attr('href')!,
    ]) {
      const response = await fetch(new URL(url, siteUrl));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`${authors[1].uid}|${authors[1].uid}`);
    }
    const downloads = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessment.id}/downloads`,
    );
    const csvUrl = downloads.$('a[href$="_all_submissions.csv"]').attr('href')!;
    const csvResponse = await fetch(new URL(csvUrl, siteUrl));
    expect(csvResponse.status).toBe(200);
    const rows = csvParse<Record<string, string>>(await csvResponse.text(), { columns: true });
    expect(rows).toHaveLength(recoveredSubmissions.size);
    for (const row of rows) {
      expect(row.SubmitStudent).toBe(recoveredSubmissions.get(row.submission_id));
      expect(row['Recovered by']).toBe(instructor.uid);
    }

    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              explanation: 'Incorrect sum',
              feedback: 'Try again.',
              score: 0,
            }),
          },
        ],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
      },
    });
    const resolveModel = vi.spyOn(aiGradingModel, 'resolveAiGradingModel').mockResolvedValue({
      model,
      provider: 'openai',
      base_url: null,
      credential_id: null,
    });
    const progressUpdate = vi.spyOn(progress, 'emitServerJobProgressUpdate').mockResolvedValue();
    try {
      const question = await selectQuestionByInstanceQuestionId(instanceQuestionId);
      const jobId = await aiGrade({
        course: await selectCourseByShortName('QA 101'),
        course_instance: {
          ...(await selectCourseInstanceById(courseInstanceId)),
          ai_grading_use_custom_api_keys: true,
        },
        assessment,
        question,
        assessment_question: await selectAssessmentQuestionByQuestionId({
          assessment_id: assessment.id,
          question_id: question.id,
        }),
        urlPrefix: '/pl',
        authn_user_id: instructor.id,
        user_id: instructor.id,
        mode: 'selected',
        instance_question_ids: [instanceQuestionId],
        model_id: 'gpt-6-sol',
      });
      await helperServer.waitForJobSequenceSuccess(jobId);
      expect(model.doGenerateCalls).toHaveLength(1);
      const parts = model.doGenerateCalls[0].prompt.flatMap((message) =>
        message.role === 'user' ? message.content : [],
      );
      const textParts = parts.flatMap((part) => (part.type === 'text' ? [part.text] : []));
      expect(
        load(textParts.find((text) => text.startsWith('## Question\n'))!)(
          '.author-question',
        ).text(),
      ).toBe(authors[1].uid);
      expect(
        load(textParts.find((text) => text.startsWith('## Instructor reference answer\n'))!)(
          '.author-answer',
        ).text(),
      ).toBe(authors[1].uid);
      const images = parts.filter((part) => part.type === 'file');
      expect(images).toHaveLength(2);
      const shade =
        Array.from(authors[1].uid).reduce((sum, character) => sum + character.charCodeAt(0), 0) %
        256;
      for (const image of images) {
        expect(image.mediaType).toBe('image/png');
        assert(image.data.type === 'data');
        assert(typeof image.data.data === 'string');
        const pixel = await sharp(Buffer.from(image.data.data, 'base64'))
          .extract({ left: 0, top: 0, width: 1, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer();
        expect([...pixel]).toEqual([shade, 0, 0]);
      }
    } finally {
      resolveModel.mockRestore();
      progressUpdate.mockRestore();
    }
  });
});
