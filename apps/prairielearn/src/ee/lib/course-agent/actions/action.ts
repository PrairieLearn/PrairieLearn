import { z } from 'zod';

import { type CourseActionCard, CourseActionCardSchema } from '@prairielearn/course-agent-types';

import {
  type CourseInstancePageAuthzData,
  CourseInstancePageAuthzDataSchema,
  makePageAuthzData,
} from '../../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../../lib/authz-data.js';
import type { Assessment, Course, CourseInstance, User } from '../../../../lib/db-types.js';
import { type FeatureName, features } from '../../../../lib/features/index.js';
import { selectOptionalAssessmentByTid } from '../../../../models/assessment.js';
import { selectOptionalCourseInstanceByShortName } from '../../../../models/course-instances.js';

/**
 * A request the action cannot carry out as asked. The course agent is shown the message, so it
 * says what is wrong and what would be accepted.
 */
export class CourseActionError extends Error {}

interface CourseActionAuthz {
  has_course_permission_edit: boolean;
  has_course_permission_own: boolean;
  has_course_instance_permission_view?: boolean;
  has_course_instance_permission_edit?: boolean;
}

const PERMISSIONS = {
  course_editor: {
    label: 'Editor access to the course',
    allows: (authz: CourseActionAuthz) => authz.has_course_permission_edit,
  },
  course_owner: {
    label: 'Owner access to the course',
    allows: (authz: CourseActionAuthz) => authz.has_course_permission_own,
  },
  student_data_viewer: {
    label: 'Student Data Viewer access to the course instance',
    allows: (authz: CourseActionAuthz) => authz.has_course_instance_permission_view === true,
  },
  student_data_editor: {
    label: 'Student Data Editor access to the course instance',
    allows: (authz: CourseActionAuthz) => authz.has_course_instance_permission_edit === true,
  },
};

type CourseActionPermission = keyof typeof PERMISSIONS;

/** Whom an action runs for, and where. */
export interface CourseActionContext {
  course: Course;
  /** The instructor who owns the conversation. Actions use their permissions and are logged as theirs. */
  user: User;
  is_administrator: boolean;
  authz_data: CourseActionAuthz;
}

interface CourseInstanceActionContext extends CourseActionContext {
  course_instance: CourseInstance;
  /** The instructor's permissions in the course instance, in the form model functions take. */
  authz_data: CourseInstancePageAuthzData;
}

export interface AssessmentActionContext extends CourseInstanceActionContext {
  assessment: Assessment;
}

interface CourseActionDescription {
  /** What will happen, in the instructor's words, such as `Close 3 issues`. */
  title: string;
  /** Where it happens, when the title does not say. */
  context?: string | null;
  /** What is affected, one line each. */
  rows?: { label: string; detail?: string | null }[];
}

/** A job's ID when the action runs in the background, whose finished job gives the result. */
type CourseActionOutcome = { summary: string } | { jobSequenceId: string };

interface CourseActionDefinition<Schema extends z.ZodObject, Context extends CourseActionContext> {
  /** The course data dataset whose rows the action changes. */
  group: string;
  /** What the action does and when to use it instead of the nearest alternative. */
  description: string;
  /** What students or staff notice afterward. */
  effects: string;
  /** How to reverse it, or null when it cannot be reversed. */
  undo: string | null;
  /** Every permission listed is required. */
  permission: CourseActionPermission | CourseActionPermission[];
  /** A feature the course must have turned on. */
  feature?: FeatureName;
  input: Schema;
  /**
   * Checks the request against the database and says what approving it will do. The instructor
   * decides on this, never on the agent's own description.
   */
  describe: (args: { ctx: Context; input: z.infer<Schema> }) => Promise<CourseActionDescription>;
  /** Carries the action out and says, in one sentence, what happened. */
  run: (args: { ctx: Context; input: z.infer<Schema> }) => Promise<CourseActionOutcome>;
}

export interface CourseAction {
  group: string;
  description: string;
  effects: string;
  undo: string | null;
  input: z.ZodObject;
  describe: (ctx: CourseActionContext, input: unknown) => Promise<CourseActionCard>;
  run: (ctx: CourseActionContext, input: unknown) => Promise<CourseActionOutcome>;
}

const MAX_CARD_ROWS = 20;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** `3 issues`, `1 issue`. */
export function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function build<Schema extends z.ZodObject, Context extends CourseActionContext>(
  definition: CourseActionDefinition<Schema, Context>,
  locate: (ctx: CourseActionContext, input: z.infer<Schema>) => Promise<Context>,
): CourseAction {
  // Permissions and the rows an action names can change between the request and its approval,
  // so both steps check them.
  const check = async (ctx: CourseActionContext, raw: unknown) => {
    const parsed = definition.input.safeParse(raw);
    // Zod's message says what is allowed, so the course agent can correct its request.
    if (!parsed.success) throw new CourseActionError(z.prettifyError(parsed.error));
    if (
      definition.feature &&
      !(await features.enabled(definition.feature, {
        institution_id: ctx.course.institution_id,
        course_id: ctx.course.id,
      }))
    ) {
      throw new CourseActionError(
        'This is not available in this course. Tell the instructor, and do not retry.',
      );
    }
    const located = await locate(ctx, parsed.data);
    for (const key of [definition.permission].flat()) {
      if (!PERMISSIONS[key].allows(located.authz_data)) {
        throw new CourseActionError(
          `The instructor needs ${PERMISSIONS[key].label} for this, which they do not have. Tell them, and do not retry. A course owner can grant it on the Staff page.`,
        );
      }
    }
    return { ctx: located, input: parsed.data };
  };
  return {
    group: definition.group,
    description: definition.description,
    effects: definition.effects,
    undo: definition.undo,
    input: definition.input,
    async describe(ctx, raw) {
      const description = await definition.describe(await check(ctx, raw));
      const rows = description.rows ?? [];
      return CourseActionCardSchema.parse({
        title: clip(description.title, 200),
        context: description.context ? clip(description.context, 300) : null,
        rows: rows.slice(0, MAX_CARD_ROWS).map((row) => ({
          label: clip(row.label, 300),
          detail: row.detail ? clip(row.detail, 300) : null,
        })),
        moreRows: Math.max(0, rows.length - MAX_CARD_ROWS),
        undo: definition.undo,
      });
    },
    run: async (ctx, raw) => await definition.run(await check(ctx, raw)),
  };
}

/** An action on the course itself. */
export function action<Schema extends z.ZodObject>(
  definition: CourseActionDefinition<Schema, CourseActionContext>,
): CourseAction {
  return build(definition, async (ctx) => ctx);
}

/** The inputs that say where an action happens, named as the course files and course data name them. */
const COURSE_INSTANCE_INPUT = {
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
const AssessmentInputSchema = z.object(ASSESSMENT_INPUT);

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
  const { authzData } = await constructCourseOrInstanceContext({
    user: ctx.user,
    course_id: ctx.course.id,
    course_instance_id: course_instance.id,
    ip: null,
    req_date: new Date(),
    is_administrator: ctx.is_administrator,
    // Staff permissions do not depend on the exam mode, which is otherwise found from the IP
    // address of a student's request. The routes that reach here already refuse exam mode.
    overrides: { mode: 'Public' },
  });
  if (!authzData) {
    throw new CourseActionError(
      `The instructor has no access to the course instance "${shortName}". Tell them, and do not retry.`,
    );
  }
  return {
    ...ctx,
    course_instance,
    authz_data: CourseInstancePageAuthzDataSchema.parse(
      makePageAuthzData({ authzData, is_administrator: ctx.is_administrator }),
    ),
  };
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
