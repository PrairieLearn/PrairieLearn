import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';

import {
  type CoursePageAuthzDataSchema,
  type Role,
  hasRole,
  isCourseInstanceRole,
} from '../../../../lib/authz-data-lib.js';
import type { Assessment, Course, CourseInstance, User } from '../../../../lib/db-types.js';
import { idsEqual } from '../../../../lib/id.js';
import { selectOptionalAssessmentByTid } from '../../../../models/assessment.js';
import {
  selectCourseInstancesWithStaffAccess,
  selectOptionalCourseInstanceByShortName,
} from '../../../../models/course-instances.js';

/**
 * A request the action cannot carry out as asked. The course agent is shown the message, so it
 * says what is wrong and what would be accepted.
 */
export class CourseActionError extends Error {}

type CourseAuthzData = z.infer<typeof CoursePageAuthzDataSchema>;

/** Whom an action runs for, and where. */
export interface CourseActionContext {
  course: Course;
  /** The instructor who owns the conversation. Actions run as them and are logged as theirs. */
  user: User;
  /** Their permissions, as the course's pages get them. */
  authz_data: CourseAuthzData;
}

export interface CourseInstanceActionContext extends CourseActionContext {
  course_instance: CourseInstance;
  /** The course's permissions plus the instructor's access to student data in this course instance. */
  authz_data: CourseAuthzData & {
    has_course_instance_permission_view: boolean;
    has_course_instance_permission_edit: boolean;
  };
}

export interface AssessmentActionContext extends CourseInstanceActionContext {
  assessment: Assessment;
}

interface CourseActionDefinition<Schema extends z.ZodObject, Context extends CourseActionContext> {
  /** What the action does, in a sentence or two, for the course agent. */
  description: string;
  /**
   * The roles that allow the action, any one of which is enough, as PrairieLearn's model functions
   * take them. Match the PrairieLearn page that does the same thing.
   */
  requiredRole: Role[];
  input: Schema;
  /**
   * Carries the action out and says, in one sentence, what happened. It runs in a transaction, so
   * throwing `CourseActionError`, or anything else, leaves the course as it was.
   */
  run: (args: { ctx: Context; input: z.infer<Schema> }) => Promise<{ summary: string }>;
}

export interface CourseAction {
  description: string;
  input: z.ZodObject;
  run: (ctx: CourseActionContext, input: unknown) => Promise<{ summary: string }>;
}

/** `3 issues`, `1 issue`. */
export function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Refuses the action unless the instructor has one of `requiredRole`. */
export function requireRole(
  ctx: CourseActionContext | CourseInstanceActionContext,
  requiredRole: Role[],
) {
  if (hasRole(ctx.authz_data, requiredRole)) return;
  const where =
    requiredRole.some(isCourseInstanceRole) && 'course_instance' in ctx
      ? `in the course instance "${ctx.course_instance.short_name}"`
      : 'to the course';
  throw new CourseActionError(
    `The instructor needs ${requiredRole.join(' or ')} access ${where} for this, which they do not have. Tell them, and do not retry. A course Owner can grant it on the Staff page.`,
  );
}

function build<Schema extends z.ZodObject, Context extends CourseActionContext>(
  definition: CourseActionDefinition<Schema, Context>,
  locate: (ctx: CourseActionContext, input: z.infer<Schema>) => Promise<Context>,
): CourseAction {
  return {
    description: definition.description,
    input: definition.input,
    // A run that fails partway is rolled back, so a failed action never leaves a partial change.
    run: async (ctx, raw) =>
      await runInTransactionAsync(async () => {
        const parsed = definition.input.safeParse(raw);
        // Zod's message says what is allowed, so the course agent can correct its request.
        if (!parsed.success) throw new CourseActionError(z.prettifyError(parsed.error));
        const located = await locate(ctx, parsed.data);
        requireRole(located, definition.requiredRole);
        return await definition.run({ ctx: located, input: parsed.data });
      }),
  };
}

/** An action on the course itself. */
export function action<Schema extends z.ZodObject>(
  definition: CourseActionDefinition<Schema, CourseActionContext>,
): CourseAction {
  return build(definition, async (ctx) => ctx);
}

/** The inputs that say where an action happens, named as the course files and course data name them. */
export const COURSE_INSTANCE_INPUT = {
  course_instance_short_name: z
    .string()
    .min(1)
    .describe(
      "The course instance's directory name under courseInstances/ in the course files, which is course_instance_short_name in course data.",
    ),
};
export const ASSESSMENT_INPUT = {
  ...COURSE_INSTANCE_INPUT,
  assessment_tid: z
    .string()
    .min(1)
    .describe(
      "The assessment's directory within its course instance's assessments/ directory, which is assessment_tid in course data.",
    ),
};

// The input was validated against the action's own schema, which includes these.
const CourseInstanceInputSchema = z.object(COURSE_INSTANCE_INPUT);
const AssessmentInputSchema = z.object(ASSESSMENT_INPUT);

/**
 * The course instance and the instructor's access to its student data, which the course's own
 * permissions do not include. Course data reads check student data access the same way.
 */
async function locateCourseInstance(
  ctx: CourseActionContext,
  shortName: string,
): Promise<CourseInstanceActionContext> {
  const course_instance = await selectOptionalCourseInstanceByShortName({
    course: ctx.course,
    shortName,
  });
  if (!course_instance) {
    throw new CourseActionError(
      `This course has no course instance named "${shortName}". Use a directory name from courseInstances/ in the course files.`,
    );
  }
  const staffAccess = (
    await selectCourseInstancesWithStaffAccess({ course: ctx.course, authzData: ctx.authz_data })
  ).find((ci) => idsEqual(ci.id, course_instance.id));
  return {
    ...ctx,
    course_instance,
    authz_data: {
      ...ctx.authz_data,
      has_course_instance_permission_view:
        staffAccess?.has_course_instance_permission_view ?? false,
      has_course_instance_permission_edit:
        staffAccess?.has_course_instance_permission_edit ?? false,
    },
  };
}

/** An action in one course instance. Its input includes `COURSE_INSTANCE_INPUT`. */
export function courseInstanceAction<
  Schema extends z.ZodObject<typeof COURSE_INSTANCE_INPUT & z.ZodRawShape>,
>(definition: CourseActionDefinition<Schema, CourseInstanceActionContext>): CourseAction {
  return build(definition, (ctx, input) =>
    locateCourseInstance(ctx, CourseInstanceInputSchema.parse(input).course_instance_short_name),
  );
}

/** An action on one assessment. Its input includes `ASSESSMENT_INPUT`. */
export function assessmentAction<
  Schema extends z.ZodObject<typeof ASSESSMENT_INPUT & z.ZodRawShape>,
>(definition: CourseActionDefinition<Schema, AssessmentActionContext>): CourseAction {
  return build(definition, async (ctx, input) => {
    const { course_instance_short_name, assessment_tid } = AssessmentInputSchema.parse(input);
    const located = await locateCourseInstance(ctx, course_instance_short_name);
    const assessment = await selectOptionalAssessmentByTid({
      course_instance_id: located.course_instance.id,
      tid: assessment_tid,
    });
    if (!assessment) {
      throw new CourseActionError(
        `The course instance "${course_instance_short_name}" has no assessment named "${assessment_tid}". Use a directory name from its assessments/ directory.`,
      );
    }
    return { ...located, assessment };
  });
}
