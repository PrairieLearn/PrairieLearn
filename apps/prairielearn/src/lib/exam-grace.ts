import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { getCurrentRequestDate } from '../middlewares/date.js';
import {
  deleteAssessmentInstanceGraceSave,
  deleteExpiredAssessmentInstanceGraceSaves,
  hasActiveAssessmentInstanceGraceSaves,
  insertAssessmentInstanceGraceSave,
  selectOptionalAssessmentInstanceGraceSave,
} from '../models/assessment-instance-grace-save.js';

import { closeAssessmentInstance, gradeAssessmentInstance } from './assessment.js';
import {
  EXAM_GRACE_ADMISSION_DURATION_MS,
  EXAM_GRACE_CLIENT_DURATION_MS,
  EXAM_GRACE_SERVER_DURATION_MS,
} from './client/exam-grace.js';
import {
  AssessmentInstanceSchema,
  EnumQuestionAccessModeSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  VariantSchema,
} from './db-types.js';
import { type VerifiedExamGraceContext, resolveExamGraceDeadline } from './exam-grace-context.js';
import { features } from './features/index.js';
import { saveSubmission } from './grading.js';
import { getGroupConfig, getGroupInfo, getQuestionGroupPermissions } from './groups.js';
import { idsEqual } from './id.js';
import { parseSubmissionBody } from './question-submission.js';
import type { ResLocalsForPage } from './res-locals.js';

const sql = loadSqlEquiv(import.meta.url);

const GraceVariantSchema = z.object({
  variant: VariantSchema,
  instance_question: InstanceQuestionSchema,
  question: QuestionSchema,
  question_access_mode: EnumQuestionAccessModeSchema,
});

async function lockAssessmentInstance(assessmentInstanceId: string) {
  return await queryRow(
    sql.lock_assessment_instance,
    { assessment_instance_id: assessmentInstanceId },
    AssessmentInstanceSchema,
  );
}

async function selectGraceVariant(context: VerifiedExamGraceContext, variantId: string) {
  const row = await queryOptionalRow(
    sql.select_variant,
    { variant_id: variantId, assessment_instance_id: context.assessmentInstance.id },
    GraceVariantSchema,
  );
  if (
    !row ||
    !row.variant.open ||
    row.variant.broken_at !== null ||
    !row.instance_question.open ||
    ['blocked_sequence', 'blocked_lockpoint', 'read_only_lockpoint'].includes(
      row.question_access_mode,
    )
  ) {
    throw new HttpStatusError(403, 'This question is not accepting submissions');
  }
  if (context.assessment.team_work) {
    const config = await getGroupConfig(context.assessment.id);
    if (config.has_roles) {
      const group = await getGroupInfo(context.assessmentInstance.team_id!, config);
      const permissions = await getQuestionGroupPermissions(
        row.instance_question.id,
        context.assessmentInstance.team_id!,
        context.userId,
      );
      if (!group.start || !permissions.can_view || !permissions.can_submit) {
        throw new HttpStatusError(403, 'Your group role cannot submit this question');
      }
    }
  }
  return row;
}

export async function beginExamGraceSave({
  context,
  variantId,
  receivedAt,
  now,
}: {
  context: VerifiedExamGraceContext;
  variantId: string;
  receivedAt: Date;
  now: () => Date;
}) {
  if (
    !context.canSave ||
    receivedAt < context.deadline ||
    receivedAt.getTime() > context.deadline.getTime() + EXAM_GRACE_SERVER_DURATION_MS
  ) {
    throw new HttpStatusError(403, 'The exam saving period is not available');
  }
  return await runInTransactionAsync(async () => {
    const instance = await lockAssessmentInstance(context.assessmentInstance.id);
    const admittedAt = now();
    if (
      !instance.open ||
      (context.source === 'assessment' &&
        instance.date_limit?.getTime() !== context.deadline.getTime())
    ) {
      throw new HttpStatusError(403, 'The exam is no longer accepting submissions');
    }
    await selectGraceVariant(context, variantId);
    await deleteExpiredAssessmentInstanceGraceSaves({
      now: admittedAt,
      assessment_instance_id: instance.id,
    });
    const save = await insertAssessmentInstanceGraceSave({
      id: randomUUID(),
      assessment_instance_id: instance.id,
      variant_id: variantId,
      user_id: context.userId,
      deadline: context.deadline,
      expires_at: new Date(admittedAt.getTime() + EXAM_GRACE_ADMISSION_DURATION_MS),
      credit: context.credit,
      mode: context.mode,
    });
    return { id: save.id, expiresAt: save.expires_at.toISOString() };
  });
}

export async function saveExamGraceSubmission({
  context,
  saveId,
  formData,
  now,
  clientFingerprintId,
  course,
}: {
  context: VerifiedExamGraceContext;
  saveId: string;
  formData: Record<string, string | string[]>;
  now: Date;
  clientFingerprintId: string;
  course: Parameters<typeof saveSubmission>[3];
}) {
  if (!context.canSave) {
    throw new HttpStatusError(403, 'This exam save is no longer available');
  }
  return await runInTransactionAsync(async () => {
    const instance = await lockAssessmentInstance(context.assessmentInstance.id);
    const admission = await selectOptionalAssessmentInstanceGraceSave(saveId);
    if (
      !instance.open ||
      !admission ||
      !idsEqual(admission.assessment_instance_id, instance.id) ||
      !idsEqual(admission.user_id, context.userId) ||
      admission.expires_at <= now ||
      admission.deadline.getTime() !== context.deadline.getTime() ||
      (context.source === 'assessment' &&
        instance.date_limit?.getTime() !== context.deadline.getTime())
    ) {
      throw new HttpStatusError(403, 'This exam save is no longer available');
    }
    const { variant, question } = await selectGraceVariant(context, admission.variant_id);
    const parsed = parseSubmissionBody(formData, question.type);
    if (!parsed.variant_id || !idsEqual(parsed.variant_id, variant.id)) {
      throw new HttpStatusError(400, 'The submitted variant does not match the admitted save');
    }
    const result = await saveSubmission(
      {
        variant_id: variant.id,
        user_id: context.userId,
        auth_user_id: context.authnUserId,
        submitted_answer: parsed.submitted_answer,
        credit: admission.credit,
        mode: admission.mode,
        client_fingerprint_id: clientFingerprintId,
        grace_period: true,
      },
      variant,
      question,
      course,
    );
    await deleteAssessmentInstanceGraceSave(admission.id);
    return { submissionId: result.submission_id };
  });
}

export async function getExamGraceStatus(context: VerifiedExamGraceContext, now: Date) {
  const clientEnd = context.deadline.getTime() + EXAM_GRACE_CLIENT_DURATION_MS;
  const serverEnd = context.deadline.getTime() + EXAM_GRACE_SERVER_DURATION_MS;
  const pending = await hasActiveAssessmentInstanceGraceSaves({
    assessment_instance_id: context.assessmentInstance.id,
    now,
  });
  return {
    serverNow: now.toISOString(),
    deadline: context.deadline.toISOString(),
    clientEnd: new Date(clientEnd).toISOString(),
    serverEnd: new Date(serverEnd).toISOString(),
    source: context.source,
    phase: !context.assessmentInstance.open
      ? ('finished' as const)
      : now < context.deadline
        ? ('active' as const)
        : now.getTime() < clientEnd
          ? ('grace' as const)
          : context.source === 'prairietest'
            ? ('expired' as const)
            : ('finishing' as const),
    readyToFinish: now.getTime() >= serverEnd && !pending,
  };
}

export async function finishExamGracePeriod({
  context,
  now,
  clientFingerprintId,
}: {
  context: VerifiedExamGraceContext;
  now: () => Date;
  clientFingerprintId: string;
}) {
  if (context.source === 'prairietest') return { status: 'expired' as const };
  const shouldGrade = await runInTransactionAsync(async () => {
    const instance = await lockAssessmentInstance(context.assessmentInstance.id);
    const processingNow = now();
    if (instance.date_limit?.getTime() !== context.deadline.getTime()) {
      throw new HttpStatusError(403, 'The exam time limit has changed');
    }
    if (!instance.open) return instance.grading_needed;
    if (processingNow.getTime() < context.deadline.getTime() + EXAM_GRACE_SERVER_DURATION_MS) {
      return null;
    }
    await deleteExpiredAssessmentInstanceGraceSaves({
      now: processingNow,
      assessment_instance_id: instance.id,
    });
    if (
      await hasActiveAssessmentInstanceGraceSaves({
        assessment_instance_id: instance.id,
        now: processingNow,
      })
    ) {
      return null;
    }
    await closeAssessmentInstance({
      assessment_instance_id: instance.id,
      authn_user_id: context.authnUserId,
      client_fingerprint_id: clientFingerprintId,
    });
    return true;
  });
  if (shouldGrade === null) return { status: 'waiting' as const };
  if (shouldGrade) {
    await gradeAssessmentInstance({
      assessment_instance_id: context.assessmentInstance.id,
      user_id: context.userId,
      authn_user_id: context.authnUserId,
      requireOpen: false,
      close: false,
      ignoreGradeRateLimit: true,
      ignoreRealTimeGradingDisabled: true,
      client_fingerprint_id: clientFingerprintId,
    });
  }
  return { status: 'finished' as const };
}

export async function finishExamGraceIfEnabled(
  locals: Pick<
    ResLocalsForPage<'assessment-instance'>,
    | 'course'
    | 'course_instance'
    | 'assessment'
    | 'assessment_instance'
    | 'authz_result'
    | 'authz_data'
    | 'user'
    | 'authn_user'
    | 'req_date'
    | 'true_req_date'
  >,
  clientFingerprintId: string,
) {
  const deadline = locals.assessment_instance.date_limit;
  if (
    !deadline ||
    !(await features.enabled('exam-grace-period', {
      institution_id: locals.course.institution_id,
      course_id: locals.course.id,
      course_instance_id: locals.course_instance.id,
      user_id: locals.authn_user.id,
    }))
  ) {
    return null;
  }
  const expiry = await resolveExamGraceDeadline({
    assessmentId: locals.assessment.id,
    assessmentInstance: locals.assessment_instance,
    userId: locals.user.id,
    examAccessEnd: locals.authz_result.exam_access_end,
  });
  if (!expiry) return null;
  return await finishExamGracePeriod({
    context: {
      assessment: locals.assessment,
      assessmentInstance: locals.assessment_instance,
      deadline: expiry.deadline,
      canSave: false,
      source: expiry.source,
      credit: locals.authz_result.credit,
      mode: locals.authz_data.mode,
      userId: locals.user.id,
      authnUserId: locals.authn_user.id,
    },
    now: () => getCurrentRequestDate(locals),
    clientFingerprintId,
  });
}
