import { z } from 'zod';

import { HttpStatusError, addData } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryScalars,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import {
  lockUnsavedSubmissionState,
  selectOptionalUnsavedSubmissionForAssessment,
  selectOptionalUnsavedSubmissionMetadataForAssessment,
} from '../models/unsaved-submission.js';

import {
  type Course,
  CourseSchema,
  QuestionSchema,
  type Submission,
  SubmissionSchema,
  VariantSchema,
} from './db-types.js';
import { gradeVariant, saveSubmission } from './grading.js';
import { lockAssessmentInstanceForInstanceQuestion } from './question-variant.js';
import type { ResLocalsForPage } from './res-locals.js';

const sql = loadSqlEquiv(import.meta.url);
const RecoveredSubmissionForGradingSchema = z.object({
  submission: SubmissionSchema.pick({
    id: true,
    auth_user_id: true,
    recovered_from_user_id: true,
  }),
  variant: VariantSchema,
  question: QuestionSchema,
  course: CourseSchema,
});

export function canCollectUnsavedSubmissions(locals: ResLocalsForPage<'instance-question'>) {
  return (
    locals.authz_result.authorized_edit &&
    locals.authz_result.active &&
    !locals.authz_result.time_limit_expired &&
    locals.assessment_instance.open &&
    locals.instance_question.open &&
    locals.instance_question_info.question_access_mode !== 'read_only_lockpoint' &&
    (!locals.group_config?.has_roles || !!locals.group_role_permissions?.can_submit)
  );
}

export async function promoteUnsavedSubmission({
  assessment_id,
  unsaved_submission_id,
  revision,
  course,
  authn_user_id,
  mode,
  client_fingerprint_id,
}: {
  assessment_id: string;
  unsaved_submission_id: string;
  revision: string;
  course: Course;
  authn_user_id: string;
  mode: Submission['mode'];
  client_fingerprint_id: string;
}): Promise<{ submission_id: string }> {
  const saved = await runInTransactionAsync(async () => {
    const metadata = await selectOptionalUnsavedSubmissionMetadataForAssessment({
      unsaved_submission_id,
      assessment_id,
    });
    if (!metadata) {
      throw new HttpStatusError(404, 'Unsaved submission is no longer available');
    }

    await lockAssessmentInstanceForInstanceQuestion(
      metadata.unsaved_submission.instance_question_id,
    );
    await lockUnsavedSubmissionState({
      instance_question_id: metadata.unsaved_submission.instance_question_id,
      user_id: metadata.unsaved_submission.user_id,
    });
    const draft = await selectOptionalUnsavedSubmissionForAssessment({
      unsaved_submission_id,
      assessment_id,
    });
    if (!draft) {
      throw new HttpStatusError(404, 'Unsaved submission is no longer available');
    }
    if (draft.revision !== revision) {
      throw new HttpStatusError(
        409,
        'Unsaved submission has changed. Preview it again before saving.',
      );
    }
    if (draft.variant.broken_at !== null) {
      throw new HttpStatusError(400, 'Cannot recover an unsaved submission for a broken variant');
    }

    const result = await saveSubmission(
      {
        variant_id: draft.variant.id,
        user_id: draft.unsaved_submission.user_id,
        auth_user_id: authn_user_id,
        submitted_answer: structuredClone(draft.unsaved_submission.raw_submitted_answer),
        credit: draft.unsaved_submission.credit,
        mode,
        client_fingerprint_id,
      },
      draft.variant,
      draft.question,
      course,
      { draftUserId: draft.unsaved_submission.user_id },
    );
    return { ...result, draft };
  });

  // Keep the broken submission and course issue committed for diagnosis.
  if (saved.broken) {
    throw new HttpStatusError(
      400,
      'A question error prevented saving this draft for grading. The draft has been kept.',
    );
  }

  // External graders must be able to read the committed submission when their job starts.
  // The persisted recovery author lets the cron retry find a save interrupted before grading.
  await gradeVariant({
    variant: saved.variant,
    check_submission_id: saved.submission_id,
    question: saved.draft.question,
    variant_course: course,
    user_id: saved.draft.unsaved_submission.user_id,
    authn_user_id,
    ignoreGradeRateLimit: true,
    ignoreRealTimeGradingDisabled: true,
  });
  return { submission_id: saved.submission_id };
}

/** Resume recovered answers and grading jobs interrupted before execution or dispatch completed. */
export async function retryPendingRecoveredSubmissions(): Promise<void> {
  const submissionIds = await queryScalars(sql.select_pending_recovered_submission_ids, IdSchema);
  for (const submissionId of submissionIds) {
    try {
      const pending = await queryOptionalRow(
        sql.select_recovered_submission_for_grading,
        { submission_id: submissionId },
        RecoveredSubmissionForGradingSchema,
      );
      if (!pending) continue;
      await gradeVariant({
        variant: pending.variant,
        check_submission_id: pending.submission.id,
        question: pending.question,
        variant_course: pending.course,
        user_id: pending.submission.recovered_from_user_id,
        authn_user_id: pending.submission.auth_user_id,
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
      });
    } catch (err) {
      logger.error(
        'Error grading recovered submission',
        addData(err, { submission_id: submissionId }),
      );
      Sentry.captureException(err, { tags: { 'submission.id': submissionId } });
    }
  }
}
