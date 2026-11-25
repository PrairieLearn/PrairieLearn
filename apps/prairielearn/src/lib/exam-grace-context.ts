import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { generateSignedToken, getCheckedSignedTokenData } from '@prairielearn/signed-token';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import type { ExamGraceClientContext, ExamGraceSource } from './client/exam-grace.js';
import { config } from './config.js';
import {
  type Assessment,
  type AssessmentInstance,
  AssessmentInstanceSchema,
  AssessmentSchema,
  type Course,
  type CourseInstance,
  type EnumMode,
  EnumModeSchema,
  type User,
} from './db-types.js';
import { features } from './features/index.js';
import { idsEqual } from './id.js';
import type { ResLocalsForPage } from './res-locals.js';

const sql = loadSqlEquiv(import.meta.url);

const TokenDataSchema = z.object({
  type: z.literal('exam-grace-period'),
  assessmentInstanceId: IdSchema,
  assessmentId: IdSchema,
  courseId: IdSchema,
  courseInstanceId: IdSchema,
  userId: IdSchema,
  authnUserId: IdSchema,
  deadline: z.iso.datetime(),
  source: z.enum(['assessment', 'prairietest']),
  canSave: z.boolean(),
  reservationId: IdSchema.nullable(),
  credit: z.number().nullable(),
  mode: EnumModeSchema,
});

const ReservationSchema = z.object({
  id: IdSchema,
  access_start: DateFromISOString,
  access_end: DateFromISOString,
});

type ExamGraceLocals = Pick<
  ResLocalsForPage<'assessment-instance'>,
  | 'course'
  | 'course_instance'
  | 'assessment'
  | 'assessment_instance'
  | 'user'
  | 'authn_user'
  | 'authz_data'
  | 'authz_result'
  | 'req_date'
>;

export interface VerifiedExamGraceContext {
  assessment: Assessment;
  assessmentInstance: AssessmentInstance;
  deadline: Date;
  source: ExamGraceSource;
  canSave: boolean;
  credit: number | null;
  mode: EnumMode;
  userId: string;
  authnUserId: string;
}

function effectiveDeadline(dateLimit: Date | null, examAccessEnd: Date | null) {
  if (examAccessEnd !== null && (dateLimit === null || examAccessEnd <= dateLimit)) {
    return { deadline: examAccessEnd, source: 'prairietest' as const };
  }
  if (dateLimit !== null) return { deadline: dateLimit, source: 'assessment' as const };
  return null;
}

export async function resolveExamGraceDeadline({
  assessmentId,
  assessmentInstance,
  userId,
  examAccessEnd,
}: {
  assessmentId: string;
  assessmentInstance: Pick<AssessmentInstance, 'date' | 'date_limit' | 'mode'>;
  userId: string;
  examAccessEnd: Date | null;
}) {
  const expiry = effectiveDeadline(assessmentInstance.date_limit, examAccessEnd);
  if (!expiry) return null;
  if (
    examAccessEnd === null &&
    (assessmentInstance.mode !== 'Exam' || assessmentInstance.date_limit === null)
  ) {
    return { ...expiry, reservationId: null };
  }
  const reservation = await queryOptionalRow(
    sql.select_optional_reservation,
    {
      assessment_id: assessmentId,
      user_id: userId,
      reservation_id: null,
      exam_access_end: examAccessEnd,
      max_access_end: examAccessEnd === null ? assessmentInstance.date_limit : null,
      reference_date: examAccessEnd === null ? assessmentInstance.date : null,
    },
    ReservationSchema,
  );
  // Ordinary authorization drops an expired reservation, but it still determines how this exam ends.
  if (reservation !== null && examAccessEnd === null) {
    return {
      deadline: reservation.access_end,
      source: 'prairietest' as const,
      reservationId: reservation.id,
    };
  }
  return { ...expiry, reservationId: reservation?.id ?? null };
}

async function enabled(course: Course, courseInstance: CourseInstance, authnUser: User) {
  return await features.enabled('exam-grace-period', {
    institution_id: course.institution_id,
    course_id: course.id,
    course_instance_id: courseInstance.id,
    user_id: authnUser.id,
  });
}

/** Preserves existing save permission or permits an expired native exam to finish. */
export async function createExamGraceContext(
  locals: ExamGraceLocals,
): Promise<ExamGraceClientContext | null> {
  const {
    course,
    course_instance: courseInstance,
    assessment,
    assessment_instance: assessmentInstance,
    authz_result: authzResult,
  } = locals;
  if (
    assessment.type !== 'Exam' ||
    !assessmentInstance.open ||
    !authzResult.authorized_edit ||
    !(await enabled(course, courseInstance, locals.authn_user))
  ) {
    return null;
  }
  const expiry = await resolveExamGraceDeadline({
    assessmentId: assessment.id,
    assessmentInstance,
    userId: locals.user.id,
    examAccessEnd: authzResult.exam_access_end,
  });
  if (!expiry) return null;
  const canSave = expiry.deadline > locals.req_date;
  if (canSave ? !authzResult.active : expiry.source !== 'assessment') return null;
  if (authzResult.exam_access_end !== null && expiry.reservationId === null) return null;

  const token = generateSignedToken(
    {
      type: 'exam-grace-period',
      assessmentInstanceId: assessmentInstance.id,
      assessmentId: assessment.id,
      courseId: course.id,
      courseInstanceId: courseInstance.id,
      userId: locals.user.id,
      authnUserId: locals.authn_user.id,
      deadline: expiry.deadline.toISOString(),
      source: expiry.source,
      canSave,
      reservationId: expiry.reservationId,
      credit: authzResult.credit,
      mode: locals.authz_data.mode,
    } satisfies z.input<typeof TokenDataSchema>,
    config.secretKey,
  );
  return {
    token,
    deadline: expiry.deadline.toISOString(),
    source: expiry.source,
    canSave,
    assessmentInstanceId: assessmentInstance.id,
    courseInstanceId: courseInstance.id,
  };
}

/** Checks this capability against current ownership and the current exam deadline. */
export async function verifyExamGraceContext({
  token,
  assessmentInstanceId,
  course,
  courseInstance,
  user,
  authnUser,
}: {
  token: string;
  assessmentInstanceId: string;
  course: Course;
  courseInstance: CourseInstance;
  user: User;
  authnUser: User;
}): Promise<VerifiedExamGraceContext | null> {
  const parsed = TokenDataSchema.safeParse(getCheckedSignedTokenData(token, config.secretKey));
  if (!parsed.success) return null;
  const data = parsed.data;
  if (
    !idsEqual(data.assessmentInstanceId, assessmentInstanceId) ||
    !idsEqual(data.courseId, course.id) ||
    !idsEqual(data.courseInstanceId, courseInstance.id) ||
    !idsEqual(data.userId, user.id) ||
    !idsEqual(data.authnUserId, authnUser.id) ||
    !(await enabled(course, courseInstance, authnUser))
  ) {
    return null;
  }
  const current = await queryOptionalRow(
    sql.select_optional_context,
    {
      assessment_instance_id: data.assessmentInstanceId,
      assessment_id: data.assessmentId,
      course_instance_id: courseInstance.id,
      course_id: course.id,
      user_id: user.id,
    },
    z.object({ assessment_instance: AssessmentInstanceSchema, assessment: AssessmentSchema }),
  );
  if (current?.assessment.type !== 'Exam') return null;

  const reservation =
    data.reservationId === null
      ? null
      : await queryOptionalRow(
          sql.select_optional_reservation,
          {
            assessment_id: current.assessment.id,
            user_id: user.id,
            reservation_id: data.reservationId,
            exam_access_end: null,
            max_access_end: null,
            reference_date: null,
          },
          ReservationSchema,
        );
  if (data.reservationId !== null && reservation === null) return null;
  const expiry = effectiveDeadline(
    current.assessment_instance.date_limit,
    reservation?.access_end ?? null,
  );
  if (
    !expiry ||
    expiry.deadline.toISOString() !== data.deadline ||
    expiry.source !== data.source ||
    (reservation !== null && reservation.access_start > expiry.deadline)
  ) {
    return null;
  }
  return {
    assessment: current.assessment,
    assessmentInstance: current.assessment_instance,
    deadline: expiry.deadline,
    source: expiry.source,
    canSave: data.canSave,
    credit: data.credit,
    mode: data.mode,
    userId: user.id,
    authnUserId: authnUser.id,
  };
}
