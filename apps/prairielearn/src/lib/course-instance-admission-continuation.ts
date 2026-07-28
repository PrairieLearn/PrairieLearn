import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

const SESSION_KEY = 'course_instance_admission_continuation';

const AdmissionContinuationBaseSchema = z.object({
  course_instance_id: IdSchema,
  expires_at: z.iso.datetime(),
  user_id: IdSchema,
});

const OrdinaryAdmissionContinuationSchema = AdmissionContinuationBaseSchema.extend({
  type: z.literal('ordinary'),
}).strict();

const Lti13AdmissionContinuationSchema = AdmissionContinuationBaseSchema.extend({
  lti13_course_instance_id: IdSchema,
  sub: z.string().min(1),
  type: z.literal('lti13'),
}).strict();

export const CourseInstanceAdmissionContinuationSchema = z.discriminatedUnion('type', [
  OrdinaryAdmissionContinuationSchema,
  Lti13AdmissionContinuationSchema,
]);

export type CourseInstanceAdmissionContinuation = z.infer<
  typeof CourseInstanceAdmissionContinuationSchema
>;
export type OrdinaryAdmissionContinuation = z.infer<typeof OrdinaryAdmissionContinuationSchema>;
export type Lti13AdmissionContinuation = z.infer<typeof Lti13AdmissionContinuationSchema>;

type SessionData = Record<string, unknown>;

export function clearCourseInstanceAdmissionContinuation(session: SessionData) {
  delete session[SESSION_KEY];
}

export function setLti13CourseInstanceAdmissionContinuation({
  courseInstanceId,
  launchExpiresAtSeconds,
  lti13CourseInstanceId,
  session,
  sub,
  userId,
}: {
  courseInstanceId: string;
  launchExpiresAtSeconds: number;
  lti13CourseInstanceId: string;
  session: SessionData;
  sub: string;
  userId: string;
}): Lti13AdmissionContinuation {
  const continuation = Lti13AdmissionContinuationSchema.parse({
    course_instance_id: courseInstanceId,
    expires_at: new Date(launchExpiresAtSeconds * 1000).toISOString(),
    lti13_course_instance_id: lti13CourseInstanceId,
    sub,
    type: 'lti13',
    user_id: userId,
  });
  session[SESSION_KEY] = continuation;
  return continuation;
}

export function replaceLti13ContinuationWithOrdinary({
  continuation,
  session,
}: {
  continuation: Lti13AdmissionContinuation;
  session: SessionData;
}): OrdinaryAdmissionContinuation {
  const ordinaryContinuation = OrdinaryAdmissionContinuationSchema.parse({
    course_instance_id: continuation.course_instance_id,
    expires_at: continuation.expires_at,
    type: 'ordinary',
    user_id: continuation.user_id,
  });
  session[SESSION_KEY] = ordinaryContinuation;
  return ordinaryContinuation;
}

export function getCourseInstanceAdmissionContinuation({
  courseInstanceId,
  now = new Date(),
  session,
  userId,
}: {
  courseInstanceId: string;
  now?: Date;
  session: SessionData;
  userId: string;
}): CourseInstanceAdmissionContinuation | null {
  const parsed = CourseInstanceAdmissionContinuationSchema.safeParse(session[SESSION_KEY]);
  if (
    !parsed.success ||
    new Date(parsed.data.expires_at).getTime() <= now.getTime() ||
    parsed.data.course_instance_id !== courseInstanceId ||
    parsed.data.user_id !== userId
  ) {
    clearCourseInstanceAdmissionContinuation(session);
    return null;
  }
  return parsed.data;
}
