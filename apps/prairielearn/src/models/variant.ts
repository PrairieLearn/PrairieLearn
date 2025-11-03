import assert from 'assert';

import { z } from 'zod';

import { AugmentedError } from '@prairielearn/error';
import {
  callRow,
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import {
  type Course,
  IdSchema,
  SubmissionSchema,
  type User,
  type Variant,
  VariantSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const sql = loadSqlEquiv(import.meta.url);

// Currently, users of this type only care about these specific columns, so
// we'll only select and return them. Variants can contain quite a bit of
// data in `params` and such, so this reduces the amount of useless data that
// flows over the wire.
export const SimpleVariantWithScoreSchema = VariantSchema.pick({
  id: true,
  open: true,
}).extend({
  // Since only variants assigned to instance questions are returned, this is never null.
  instance_question_id: IdSchema,
  max_submission_score: SubmissionSchema.shape.score.unwrap(),
});
export type SimpleVariantWithScore = z.infer<typeof SimpleVariantWithScoreSchema>;

export async function resetVariantsForAssessmentQuestion({
  assessment_id,
  unsafe_assessment_question_id,
  authn_user_id,
}: {
  assessment_id: string;
  unsafe_assessment_question_id: string;
  authn_user_id: string;
}) {
  await execute(sql.reset_variants_for_assessment_question, {
    assessment_id,
    unsafe_assessment_question_id,
    authn_user_id,
  });
}

export async function resetVariantsForInstanceQuestion({
  assessment_instance_id,
  unsafe_instance_question_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  unsafe_instance_question_id: string;
  authn_user_id: string;
}) {
  await execute(sql.reset_variants_for_instance_question, {
    assessment_instance_id,
    unsafe_instance_question_id,
    authn_user_id,
  });
}

export async function selectVariantsByInstanceQuestion({
  assessment_instance_id,
  instance_question_id,
}: {
  assessment_instance_id: string;
  instance_question_id?: string;
}) {
  return await queryRows(
    sql.select_variant_by_instance_question_id,
    { assessment_instance_id, instance_question_id },
    SimpleVariantWithScoreSchema,
  );
}

/**
 * Returns whether the given user owns the given variant. There are two cases:
 *
 * - For group work, a user is considered to own a variant if they are in the
 *   group for the assessment instance that the variant is associated with.
 * - For non-group work, a user is considered to own a variant if they are the
 *   user that created the variant, as tracked in `variants.user_id`.
 */
export async function selectUserOwnsVariant({
  user_id,
  variant_id,
}: {
  user_id: string;
  variant_id: string;
}): Promise<boolean> {
  return await queryRow(sql.select_user_owns_variant, { user_id, variant_id }, z.boolean());
}

export async function selectAndAuthzVariant(options: {
  unsafe_variant_id: string;
  variant_course: Course;
  question_id: string;
  course_instance_id?: string;
  instance_question_id?: string;
  authz_data?: Record<string, any>;
  authn_user: User;
  user: User;
  is_administrator: boolean;
  publicQuestionPreview?: boolean;
}): Promise<Variant> {
  const {
    unsafe_variant_id,
    variant_course,
    question_id,
    course_instance_id,
    instance_question_id = null,
    authz_data,
    authn_user,
    user,
    is_administrator,
    publicQuestionPreview,
  } = options;

  const variant = await queryOptionalRow(
    sql.select_variant_by_id,
    { variant_id: unsafe_variant_id },
    VariantSchema,
  );

  function denyAccess(): never {
    throw new AugmentedError('Access denied', {
      status: 403,
      data: options,
    });
  }

  if (variant == null) denyAccess();
  if (!idsEqual(variant.question_id, question_id)) denyAccess();
  if (!idsEqual(variant.course_id, variant_course.id)) denyAccess();

  if (
    instance_question_id != null &&
    (!variant.instance_question_id || !idsEqual(variant.instance_question_id, instance_question_id))
  ) {
    denyAccess();
  }

  // In most courses, we want any variants (at least those not associated with a
  // particular assessment instance) to be accessible to anyone on course staff
  // to allow for debugging, investigations, etc. However, since the example
  // course has looser restrictions on who can be considered course staff, we'll
  // restrict any variant in the example course to only be accessible to the
  // user who created it. We'll make an exception for global administrators.
  //
  // We'll apply the same logic on the public question preview page so that we
  // avoid the possibility of leaking information from a variant created by
  // course staff to someone who isn't course staff.
  //
  // TODO: Once we're tracking the context in which a variant was created, we
  // can improve this check to also assert that variants created on the public
  // question preview page are not accessible to course staff. Put differently:
  // people outside the course shouldn't be able to see things created inside
  // the course, and people inside the course shouldn't be able to see things
  // created outside the course.
  //
  // We'll have to think about how that interacts with automatically-reported
  // issues. While we want to default to keeping user data private, we also want
  // to allow people to opt in to having their issue/variant be visible to
  // course staff for debugging. We could add a button on the public preview
  // page that would make the given variant visible to course staff for
  // debugging?
  if ((variant_course.example_course || publicQuestionPreview) && !is_administrator) {
    const userOwnsVariant = await selectUserOwnsVariant({
      user_id: user.user_id,
      variant_id: variant.id,
    });
    if (!userOwnsVariant) {
      denyAccess();
    }
  }

  if (variant.instance_question_id && !instance_question_id) {
    // This variant is associated with a particular instance question, and thus
    // is considered to be student data. However, we're not viewing it in the
    // context of an assessment; in other words, we're probably viewing it on
    // the instructor question preview. We need to ensure that the current user
    // has the necessary permissions to view student data in the course instance
    // that contains this variant.
    assert(variant.course_instance_id, 'Missing course instance ID for variant');

    // We'll at first assume the easy case: the user is accessing the variant
    // from a course instance route and the course instance is the same as the
    // variant's course instance.
    let authnHasCourseInstancePermissionView =
      authz_data?.authn_has_course_instance_permission_view;
    let hasCourseInstancePermissionView = authz_data?.has_course_permission_view;

    // If we're missing authz data, accessing the variant from a
    // non-course-instance route, or accessing the variant from a different
    // course instance, we need to get the user's actual permissions within that
    // course instance.
    if (
      authnHasCourseInstancePermissionView == null ||
      hasCourseInstancePermissionView == null ||
      course_instance_id == null ||
      !idsEqual(course_instance_id, variant.course_instance_id)
    ) {
      const authnUserPermissions = await callRow(
        'authz_course_instance',
        [authn_user.user_id, variant.course_instance_id, new Date()],
        z.object({ has_course_instance_permission_view: z.boolean() }),
      );

      const userPermissions = await callRow(
        'authz_course_instance',
        [user.user_id, variant.course_instance_id, new Date()],
        z.object({ has_course_instance_permission_view: z.boolean() }),
      );

      authnHasCourseInstancePermissionView =
        authnUserPermissions.has_course_instance_permission_view;
      hasCourseInstancePermissionView = userPermissions.has_course_instance_permission_view;
    }

    // We'll only permit access if both the authenticated user and the
    // effective user have student data viewer permissions in the course instance.
    if (
      !is_administrator &&
      (!authnHasCourseInstancePermissionView || !hasCourseInstancePermissionView)
    ) {
      denyAccess();
    }
  }

  return variant;
}

/**
 * Locks the variant before a grading operation can proceed. If the variant is
 * associated to an assessment instance, lock the assessment instance instead.
 * Assumes that the caller is already within a transaction.
 */
export async function lockVariant({ variant_id }: { variant_id: string }) {
  const locked = await queryOptionalRow(
    sql.select_and_lock_assessment_instance_or_variant,
    { variant_id },
    z.boolean(),
  );
  if (!locked) {
    throw new Error('Variant or assessment instance could not be locked.');
  }
}
