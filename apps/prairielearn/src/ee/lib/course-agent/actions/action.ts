import { z } from 'zod';

import { type CourseActionCard, CourseActionCardSchema } from '@prairielearn/course-agent-types';

import type { Course, User } from '../../../../lib/db-types.js';

/**
 * A request the action cannot carry out as asked. The course agent is shown the message, so it
 * says what is wrong and what would be accepted.
 */
export class CourseActionError extends Error {}

const PERMISSIONS = {
  course_editor: {
    label: 'Editor access to the course',
    allows: (authz: CourseActionAuthz) => authz.has_course_permission_edit,
  },
  course_owner: {
    label: 'Owner access to the course',
    allows: (authz: CourseActionAuthz) => authz.has_course_permission_own,
  },
};

type CourseActionPermission = keyof typeof PERMISSIONS;

interface CourseActionAuthz {
  has_course_permission_edit: boolean;
  has_course_permission_own: boolean;
}

/** Whom an action runs for, and where. */
export interface CourseActionContext {
  course: Course;
  /** The instructor who owns the conversation. Actions use their permissions and are logged as theirs. */
  user: User;
  authz_data: CourseActionAuthz;
}

interface CourseActionDescription {
  /** What will happen, in the instructor's words, such as `Close 3 issues`. */
  title: string;
  /** Where it happens, when the title does not say. */
  context?: string | null;
  /** What is affected, one line each. */
  rows?: { label: string; detail?: string | null }[];
}

interface CourseActionDefinition<Schema extends z.ZodObject> {
  /** The course data dataset whose rows the action changes. */
  group: string;
  /** What the action does and when to use it instead of the nearest alternative. */
  description: string;
  /** What students or staff notice afterward. */
  effects: string;
  /** How to reverse it, or null when it cannot be reversed. */
  undo: string | null;
  permission: CourseActionPermission;
  input: Schema;
  /**
   * Checks the request against the database and says what approving it will do. The instructor
   * decides on this, never on the agent's own description.
   */
  describe: (args: {
    ctx: CourseActionContext;
    input: z.infer<Schema>;
  }) => Promise<CourseActionDescription>;
  /** Carries the action out and says, in one sentence, what happened. */
  run: (args: { ctx: CourseActionContext; input: z.infer<Schema> }) => Promise<{ summary: string }>;
}

export interface CourseAction {
  group: string;
  description: string;
  effects: string;
  undo: string | null;
  input: z.ZodObject;
  describe: (ctx: CourseActionContext, input: unknown) => Promise<CourseActionCard>;
  run: (ctx: CourseActionContext, input: unknown) => Promise<{ summary: string }>;
}

const MAX_CARD_ROWS = 20;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** `3 issues`, `1 issue`. */
export function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function action<Schema extends z.ZodObject>(
  definition: CourseActionDefinition<Schema>,
): CourseAction {
  const check = (ctx: CourseActionContext, input: unknown) => {
    const permission = PERMISSIONS[definition.permission];
    if (!permission.allows(ctx.authz_data)) {
      throw new CourseActionError(
        `The instructor needs ${permission.label} for this, which they do not have. Tell them, and do not retry.`,
      );
    }
    const parsed = definition.input.safeParse(input);
    // Zod's message says what is allowed, so the course agent can correct its request.
    if (!parsed.success) throw new CourseActionError(z.prettifyError(parsed.error));
    return parsed.data;
  };
  return {
    group: definition.group,
    description: definition.description,
    effects: definition.effects,
    undo: definition.undo,
    input: definition.input,
    async describe(ctx, input) {
      const description = await definition.describe({ ctx, input: check(ctx, input) });
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
    // Permissions and the rows an action names can change between the request and its approval.
    run: async (ctx, input) => await definition.run({ ctx, input: check(ctx, input) }),
  };
}
