import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { run as autoFinishExams } from '../cron/autoFinishExams.js';
import {
  deleteAllAssessmentInstancesForAssessment,
  makeAssessmentInstance,
} from '../lib/assessment.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { type Assessment, SubmissionSchema, type User, VariantSchema } from '../lib/db-types.js';
import * as grading from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { insertCourseInstancePermissions } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import {
  selectOptionalUnsavedSubmissionForAssessment,
  selectUnsavedSubmissionGeneration,
  upsertUnsavedSubmission,
} from '../models/unsaved-submission.js';
import { lockVariant } from '../models/variant.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceId = '1';

describe('Instructor unsaved submission recovery', { concurrent: false }, () => {
  let student: User;
  let teammate: User;
  let editor: User;
  let viewer: User;
  let assessmentId: string;
  let groupAssessment: Assessment;
  let otherAssessmentId: string;
  let assessmentInstanceId: string;
  let otherAssessmentInstanceId: string;
  let instanceQuestionId: string;
  let instanceQuestionUrl: string;
  let variantId: string;
  let correctAnswer: string;

  function createClient(user: User, scopedAssessmentId = assessmentId) {
    return createAssessmentTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        {
          url: getAssessmentTrpcUrl({
            courseInstanceId,
            assessmentId: scopedAssessmentId,
          }),
          authn_user_id: user.id,
        },
        config.secretKey,
      ),
      courseInstanceId,
      assessmentId: scopedAssessmentId,
      urlBase: siteUrl,
    });
  }

  async function seedDraft(user = student, answer = correctAnswer) {
    expect(
      await upsertUnsavedSubmission({
        variant_id: variantId,
        instance_question_id: instanceQuestionId,
        user_id: user.id,
        credit: 25,
        raw_submitted_answer: { c: answer },
        uuid: randomUUID(),
        generation: await selectUnsavedSubmissionGeneration({
          instance_question_id: instanceQuestionId,
          user_id: user.id,
        }),
      }),
    ).toBe(true);
    const id = await queryScalar(
      sql.select_draft_id,
      { instance_question_id: instanceQuestionId, user_id: user.id },
      IdSchema,
    );
    return (await selectOptionalUnsavedSubmissionForAssessment({
      unsaved_submission_id: id,
      assessment_id: assessmentId,
    }))!;
  }

  function previewUrl(id: string, revision: string, instanceId = assessmentInstanceId) {
    return `${siteUrl}/pl/course_instance/${courseInstanceId}/instructor/assessment_instance/${instanceId}/unsaved_submission/${id}?${new URLSearchParams({ revision })}`;
  }

  function selectLatestSubmission() {
    return queryOptionalRow(
      sql.select_latest_submission,
      { variant_id: variantId },
      SubmissionSchema,
    );
  }

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    student = await getConfiguredUser();
    [teammate, editor, viewer] = await generateAndEnrollUsers({
      count: 3,
      course_instance_id: courseInstanceId,
    });
    for (const [user, role] of [
      [editor, 'Student Data Editor'],
      [viewer, 'Student Data Viewer'],
    ] as const) {
      await insertCourseInstancePermissions({
        course_id: '1',
        course_instance_id: courseInstanceId,
        user_id: user.id,
        course_instance_role: role,
        authn_user_id: student.id,
      });
    }

    groupAssessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'exam14-groupWork',
    });
    assessmentId = groupAssessment.id;
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'hw1-automaticTestSuite',
    });
    otherAssessmentId = otherAssessment.id;
    otherAssessmentInstanceId = await makeAssessmentInstance({
      assessment: otherAssessment,
      user_id: student.id,
      authn_user_id: student.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
    await createClient(student).assessmentGroups.addGroup.mutate({
      groupName: 'RecoveryGroup',
      uids: `${student.uid},${teammate.uid}`,
    });
  });

  beforeEach(async () => {
    await deleteAllAssessmentInstancesForAssessment(assessmentId, student.id);
    assessmentInstanceId = await makeAssessmentInstance({
      assessment: groupAssessment,
      user_id: student.id,
      authn_user_id: student.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
    instanceQuestionId = await queryScalar(
      sql.select_instance_question,
      { assessment_instance_id: assessmentInstanceId },
      IdSchema,
    );
    instanceQuestionUrl = `${siteUrl}/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}`;
    const page = await helperClient.fetchCheerio(instanceQuestionUrl);
    variantId = page.$('input[name="__variant_id"]').val() as string;
    const variant = await queryRow(sql.select_variant, { variant_id: variantId }, VariantSchema);
    correctAnswer = String(variant.true_answer!.c);
  });

  test('gates previews and promotion while allowing read-only staff previews without saving', async () => {
    const draft = await seedDraft();
    const input = { unsaved_submission_id: draft.unsaved_submission.id, revision: draft.revision };
    await withUser(viewer, async () => {
      await withConfig({ features: { 'unsaved-submissions-ui': false } }, async () => {
        expect((await fetch(previewUrl(input.unsaved_submission_id, input.revision))).status).toBe(
          403,
        );
      });
      await withConfig(
        {
          features: {
            'unsaved-submissions-ui': true,
            'unsaved-submissions-instructor-promotion': true,
          },
        },
        async () => {
          const before = await selectLatestSubmission();
          const variantBefore = await queryRow(
            sql.select_variant,
            { variant_id: variantId },
            VariantSchema,
          );
          const preview = await fetch(previewUrl(input.unsaved_submission_id, input.revision));
          expect(preview.status).toBe(200);
          expect(preview.headers.get('content-type')).toContain('text/html');
          const body = await preview.text();
          expect(body).toContain('<!doctype html>');
          expect(body).toContain(correctAnswer);
          expect(await selectLatestSubmission()).toEqual(before);
          expect(
            await queryRow(sql.select_variant, { variant_id: variantId }, VariantSchema),
          ).toEqual(variantBefore);
          const previewPrefix = body.match(/document\.urlPrefix = '([^']+)'/)![1];
          expect(
            (await fetch(`${siteUrl}${previewPrefix}/clientFilesCourse/data.txt`)).status,
          ).toBe(200);
          expect(
            (await fetch(`${siteUrl}${previewPrefix}x/clientFilesCourse/data.txt`)).status,
          ).toBe(403);
          await expect(
            createClient(viewer).unsavedSubmissions.promote.mutate(input),
          ).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
          });
          await seedDraft(student, 'newer work');
          expect(
            (await fetch(`${siteUrl}${previewPrefix}/clientFilesCourse/data.txt`)).status,
          ).toBe(404);
        },
      );
    });
    await withUser(editor, async () => {
      const freshDraft = await seedDraft();
      const freshInput = {
        unsaved_submission_id: freshDraft.unsaved_submission.id,
        revision: freshDraft.revision,
      };
      await withConfig(
        {
          features: {
            'unsaved-submissions-ui': true,
            'unsaved-submissions-instructor-promotion': false,
          },
        },
        async () => {
          expect(
            (await fetch(previewUrl(freshInput.unsaved_submission_id, freshInput.revision))).status,
          ).toBe(200);
          await expect(
            createClient(editor).unsavedSubmissions.promote.mutate(freshInput),
          ).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
          });
        },
      );
      await withConfig({ features: { 'unsaved-submissions-ui': false } }, async () => {
        await expect(
          createClient(editor).unsavedSubmissions.promote.mutate(input),
        ).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
      });
    });
  });

  test('does not expose or promote drafts from another assessment or a student account', async () => {
    const draft = await seedDraft();
    const input = { unsaved_submission_id: draft.unsaved_submission.id, revision: draft.revision };
    await withConfig(
      {
        features: {
          'unsaved-submissions-ui': true,
          'unsaved-submissions-instructor-promotion': true,
        },
      },
      async () => {
        await withUser(editor, async () => {
          await expect(
            createClient(editor, otherAssessmentId).unsavedSubmissions.promote.mutate(input),
          ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
          expect(
            (
              await fetch(
                previewUrl(input.unsaved_submission_id, input.revision, otherAssessmentInstanceId),
              )
            ).status,
          ).toBe(404);
        });
        await withUser(teammate, async () => {
          expect(
            (await fetch(previewUrl(input.unsaved_submission_id, input.revision))).status,
          ).toBe(403);
          await expect(
            createClient(teammate).unsavedSubmissions.promote.mutate(input),
          ).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
          });
        });
      },
    );
  });

  test.each([false, true])(
    'promotes a closed attempt (correct: %s) without reopening it, preserving credit and other group drafts',
    async (correct) => {
      const answer = correct ? correctAnswer : '-1';
      const draft = await seedDraft(student, answer);
      const otherDraft = await seedDraft(teammate, 'unfinished');
      await execute(sql.set_open, { variant_id: variantId, open: false });
      await withConfig(
        {
          features: {
            'unsaved-submissions-collection': false,
            'unsaved-submissions-ui': true,
            'unsaved-submissions-instructor-promotion': true,
          },
        },
        async () => {
          await withUser(editor, async () => {
            const { submission_id } = await createClient(editor).unsavedSubmissions.promote.mutate({
              unsaved_submission_id: draft.unsaved_submission.id,
              revision: draft.revision,
            });
            const submission = await selectLatestSubmission();
            expect(submission).toMatchObject({
              id: submission_id,
              variant_id: variantId,
              auth_user_id: editor.id,
              recovered_from_user_id: student.id,
              credit: 25,
              raw_submitted_answer: { c: answer },
              submitted_answer: { c: Number(answer) },
              score: correct ? 1 : 0,
            });
            expect(submission!.graded_at).not.toBeNull();
            expect(
              await queryScalar(
                sql.select_question_auto_points,
                { instance_question_id: instanceQuestionId },
                z.number(),
              ),
            ).toBe(correct ? 10 : 0);
            expect((await selectAssessmentInstanceById(assessmentInstanceId)).score_perc).toBe(
              correct ? 25 : 0,
            );
          });
        },
      );
      expect(
        await selectOptionalUnsavedSubmissionForAssessment({
          unsaved_submission_id: draft.unsaved_submission.id,
          assessment_id: assessmentId,
        }),
      ).toBeNull();
      expect(
        await selectOptionalUnsavedSubmissionForAssessment({
          unsaved_submission_id: otherDraft.unsaved_submission.id,
          assessment_id: assessmentId,
        }),
      ).toMatchObject({
        unsaved_submission: { user_id: teammate.id, raw_submitted_answer: { c: 'unfinished' } },
      });
      expect(
        await queryRow(
          sql.select_open,
          { variant_id: variantId },
          z.object({
            assessment_open: z.boolean(),
            question_open: z.boolean(),
            variant_open: z.boolean(),
          }),
        ),
      ).toEqual({ assessment_open: false, question_open: false, variant_open: false });
    },
  );

  test('resumes a committed recovery after grading is interrupted without duplicating its submission or score', async () => {
    const draft = await seedDraft();
    await execute(sql.set_open, { variant_id: variantId, open: false });
    const startGrading = vi
      .spyOn(grading, 'gradeVariant')
      .mockRejectedValueOnce(new Error('Interrupted before grading'));
    try {
      await withConfig(
        {
          features: {
            'unsaved-submissions-ui': true,
            'unsaved-submissions-instructor-promotion': true,
          },
        },
        async () =>
          withUser(editor, async () => {
            await expect(
              createClient(editor).unsavedSubmissions.promote.mutate({
                unsaved_submission_id: draft.unsaved_submission.id,
                revision: draft.revision,
              }),
            ).rejects.toMatchObject({ data: { code: 'INTERNAL_SERVER_ERROR' } });
          }),
      );
    } finally {
      startGrading.mockRestore();
    }
    const saved = (await selectLatestSubmission())!;
    expect(saved).toMatchObject({
      score: null,
      grading_requested_at: null,
      recovered_from_user_id: student.id,
    });
    expect((await selectAssessmentInstanceById(assessmentInstanceId)).grading_needed).toBe(false);
    expect(
      await selectOptionalUnsavedSubmissionForAssessment({
        unsaved_submission_id: draft.unsaved_submission.id,
        assessment_id: assessmentId,
      }),
    ).toBeNull();

    await withConfig(
      {
        features: {
          'unsaved-submissions-ui': false,
          'unsaved-submissions-instructor-promotion': false,
        },
      },
      async () => {
        await autoFinishExams();
        await autoFinishExams();
      },
    );
    expect(await selectLatestSubmission()).toMatchObject({
      id: saved.id,
      score: 1,
      credit: 25,
      auth_user_id: editor.id,
      recovered_from_user_id: student.id,
    });
    expect((await selectAssessmentInstanceById(assessmentInstanceId)).score_perc).toBe(25);
    expect(
      await queryRow(
        sql.select_recovery_grading_counts,
        { submission_id: saved.id },
        z.object({
          grading_job_count: z.number(),
          auth_user_id: IdSchema,
          number_attempts: z.number(),
        }),
      ),
    ).toEqual({ grading_job_count: 1, auth_user_id: editor.id, number_attempts: 1 });
  });

  test('does not retry a recovery superseded by a student Save on another variant', async () => {
    const draft = await seedDraft();
    const course = await selectCourseById(draft.variant.course_id);
    const { submission_id } = await grading.saveSubmission(
      {
        variant_id: variantId,
        user_id: editor.id,
        auth_user_id: editor.id,
        submitted_answer: { c: correctAnswer },
        credit: 25,
        mode: 'Public',
      },
      draft.variant,
      draft.question,
      course,
      { draftUserId: student.id },
    );
    await execute(sql.close_variant, { variant_id: variantId });
    const newerVariant = await ensureVariant({
      question_id: null,
      instance_question_id: instanceQuestionId,
      user_id: student.id,
      authn_user_id: student.id,
      course_instance: await selectCourseInstanceById(courseInstanceId),
      variant_course: course,
      question_course: course,
      options: {},
      require_open: true,
      client_fingerprint_id: null,
    });
    expect(newerVariant.id).not.toBe(variantId);
    await grading.saveSubmission(
      {
        variant_id: newerVariant.id,
        user_id: student.id,
        auth_user_id: student.id,
        submitted_answer: { c: '23' },
        credit: 100,
        mode: 'Public',
      },
      newerVariant,
      draft.question,
      course,
    );
    const selectRetryState = () =>
      queryRow(
        sql.select_recovery_retry_state,
        { submission_id },
        z.object({ grading_job_count: z.number(), question_status: z.string() }),
      );
    const before = await selectRetryState();
    expect(before).toEqual({ grading_job_count: 0, question_status: 'saved' });
    await grading.gradeVariant({
      variant: draft.variant,
      check_submission_id: submission_id,
      question: draft.question,
      variant_course: course,
      user_id: editor.id,
      authn_user_id: editor.id,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
    });
    expect(await selectRetryState()).toEqual(before);
    await autoFinishExams();
    await autoFinishExams();
    expect(await selectRetryState()).toEqual(before);
  });

  test('rejects promotion and preview after the selected draft changes', async () => {
    const draft = await seedDraft();
    const replacement = await seedDraft(student, '23');
    expect(replacement.revision).not.toBe(draft.revision);
    const before = await selectLatestSubmission();
    await withConfig(
      {
        features: {
          'unsaved-submissions-ui': true,
          'unsaved-submissions-instructor-promotion': true,
        },
      },
      async () => {
        await withUser(editor, async () => {
          expect(
            (await fetch(previewUrl(draft.unsaved_submission.id, draft.revision))).status,
          ).toBe(409);
          await expect(
            createClient(editor).unsavedSubmissions.promote.mutate({
              unsaved_submission_id: draft.unsaved_submission.id,
              revision: draft.revision,
            }),
          ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
        });
      },
    );
    expect(await selectLatestSubmission()).toEqual(before);
    expect(
      await selectOptionalUnsavedSubmissionForAssessment({
        unsaved_submission_id: draft.unsaved_submission.id,
        assessment_id: assessmentId,
      }),
    ).toMatchObject({
      revision: replacement.revision,
      unsaved_submission: { raw_submitted_answer: { c: '23' } },
    });
  });

  test('does not promote an older draft after an earlier queued student Save', async () => {
    await withConfig(
      {
        features: {
          'unsaved-submissions-collection': true,
          'unsaved-submissions-ui': true,
          'unsaved-submissions-instructor-promotion': true,
        },
      },
      async () => {
        const draft = await seedDraft();
        const page = await helperClient.fetchCheerio(instanceQuestionUrl);
        const csrfToken = page.$('form.question-form input[name="__csrf_token"]').attr('value')!;
        const cookie = page.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ');
        const locked = withResolvers<undefined>();
        const release = withResolvers<undefined>();
        const holder = runInTransactionAsync(async () => {
          await lockVariant({ variant_id: variantId });
          locked.resolve(undefined);
          await release.promise;
        });
        const pending: Promise<unknown>[] = [holder];
        let saved!: Promise<unknown>;
        let promoted!: Promise<unknown>;
        const waiting = (queryPattern: string) =>
          queryScalar(
            sql.count_waiting_assessment_locks,
            { query_pattern: queryPattern },
            z.number(),
          );
        try {
          await Promise.race([locked.promise, holder]);
          saved = fetch(instanceQuestionUrl, {
            method: 'POST',
            headers: { cookie },
            body: new URLSearchParams({
              __variant_id: variantId,
              __action: 'save',
              __csrf_token: csrfToken,
              c: '23',
            }),
          }).then(
            (response) => ({ response }),
            (error: unknown) => ({ error }),
          );
          pending.push(saved);
          await expect
            .poll(() => waiting('%lock_assessment_instance AS%'), { timeout: 10_000 })
            .toBe(1);
          await withUser(editor, async () => {
            promoted = createClient(editor)
              .unsavedSubmissions.promote.mutate({
                unsaved_submission_id: draft.unsaved_submission.id,
                revision: draft.revision,
              })
              .then(
                (result) => ({ result }),
                (error: unknown) => ({ error }),
              );
            pending.push(promoted);
            await expect.poll(() => waiting('%assessment_instances%'), { timeout: 10_000 }).toBe(2);
          });
        } finally {
          release.resolve(undefined);
          await Promise.allSettled(pending);
        }
        expect(await saved).toMatchObject({ response: { status: 200 } });
        expect(await selectLatestSubmission()).toMatchObject({ raw_submitted_answer: { c: '23' } });
        expect(await promoted).toMatchObject({ error: { data: { code: 'NOT_FOUND' } } });
      },
    );
  });
});
