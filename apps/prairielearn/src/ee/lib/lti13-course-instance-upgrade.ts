import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { idsEqual } from '../../lib/id.js';

// Give the student enough time to submit the upgrade form. Once the Stripe
// checkout exists, the relaunch flag in its return URL no longer authorizes
// anything.
const LTI13_COURSE_INSTANCE_UPGRADE_TTL_MS = 30 * 60 * 1000;

const Lti13CourseInstanceUpgradeAuthorizationSchema = z.object({
  course_instance_id: IdSchema,
  enrollment_id: IdSchema,
  expires_at: z.iso.datetime(),
  lti13_course_instance_id: IdSchema,
  sub: z.string().min(1),
  user_id: IdSchema,
});

export type Lti13CourseInstanceUpgradeAuthorization = z.infer<
  typeof Lti13CourseInstanceUpgradeAuthorizationSchema
>;

type SessionData = Record<string, unknown>;

export function setLti13CourseInstanceUpgradeAuthorization({
  courseInstanceId,
  enrollmentId,
  lti13CourseInstanceId,
  now,
  session,
  sub,
  userId,
}: {
  courseInstanceId: string;
  enrollmentId: string;
  lti13CourseInstanceId: string;
  now: Date;
  session: SessionData;
  sub: string;
  userId: string;
}) {
  session.lti13_course_instance_upgrade = Lti13CourseInstanceUpgradeAuthorizationSchema.parse({
    course_instance_id: courseInstanceId,
    enrollment_id: enrollmentId,
    expires_at: new Date(now.getTime() + LTI13_COURSE_INSTANCE_UPGRADE_TTL_MS).toISOString(),
    lti13_course_instance_id: lti13CourseInstanceId,
    sub,
    user_id: userId,
  });
}

export function getLti13CourseInstanceUpgradeAuthorization({
  courseInstanceId,
  now,
  session,
  userId,
}: {
  courseInstanceId: string;
  now: Date;
  session: SessionData;
  userId: string;
}): Lti13CourseInstanceUpgradeAuthorization | null {
  const result = Lti13CourseInstanceUpgradeAuthorizationSchema.safeParse(
    session.lti13_course_instance_upgrade,
  );
  if (!result.success || new Date(result.data.expires_at).getTime() <= now.getTime()) {
    clearLti13CourseInstanceUpgradeAuthorization(session);
    return null;
  }
  if (
    !idsEqual(result.data.course_instance_id, courseInstanceId) ||
    !idsEqual(result.data.user_id, userId)
  ) {
    return null;
  }
  return result.data;
}

export function clearLti13CourseInstanceUpgradeAuthorization(session: SessionData) {
  delete session.lti13_course_instance_upgrade;
}
