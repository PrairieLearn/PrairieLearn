import { randomUUID } from 'node:crypto';
import { appendFile, cp } from 'node:fs/promises';
import path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { loadSqlEquiv, queryRow, queryScalar, queryScalars } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { gradeAssessmentInstance, makeAssessmentInstance } from '../lib/assessment.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { SubmissionSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { updateCourseQuestionsReceiveUserData } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
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
    return f'<svg xmlns="http://www.w3.org/2000/svg"><text>{author_uid(data)}|{data["submitted_answers"]["parsed_by"]}</text></svg>'
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
  <a class="author-answer-file" href="{{options.client_files_question_dynamic_url}}/author.svg">Author figure</a>
</pl-answer-panel>
`,
    );
    await helperServer.before(coursePath)();
  });

  afterAll(async () => {
    await helperServer.after();
    await temporaryCourse.cleanup();
  });

  test('uses each draft author in activity, parsing, grading, rendered history, and generated files', async () => {
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
    expect(
      page
        .$('.author-submission')
        .map((_, element) => page.$(element).text())
        .get(),
    ).toEqual([authors[1].uid, authors[0].uid]);
    for (const url of [
      page.$('.author-question-file').attr('src')!,
      page.$('.author-answer-file').attr('href')!,
    ]) {
      const response = await fetch(new URL(url, siteUrl));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`${authors[1].uid}|${authors[1].uid}`);
    }
  });
});
