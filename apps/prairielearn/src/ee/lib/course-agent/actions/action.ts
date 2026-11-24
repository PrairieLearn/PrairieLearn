import { z } from 'zod';

import { type CourseActionCard, CourseActionCardSchema } from '@prairielearn/course-agent-types';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { type AuthzData, type CourseRole, hasRole } from '../../../../lib/authz-data-lib.js';
import type { Course, User } from '../../../../lib/db-types.js';
import type { CourseDatasetName } from '../../../routers/courseAgentData/datasets.js';

/**
 * A request the action cannot carry out as asked. The course agent is shown the message, so it
 * says what is wrong and what would be accepted.
 */
export class CourseActionError extends Error {}

/** Whom an action runs for, and where. */
export interface CourseActionContext {
  course: Course;
  /** The instructor who owns the conversation. Actions use their permissions and are logged as theirs. */
  user: User;
  authz_data: AuthzData;
}

interface CourseActionDescription {
  /** What will happen, in the instructor's words, such as `Close 3 issues`. */
  title: string;
  /** Anything the title leaves out that the instructor should know, such as what is left as is. */
  subtitle?: string | null;
  /** Everything that will change, each with a link to its page in PrairieLearn when it has one. */
  items: CourseActionCard['items'];
}

/**
 * How a run ended. Return `failed` when the action could not be done for a reason the course agent
 * can act on; `error` is shown to the agent, which explains it to the instructor.
 */
export type CourseActionOutcome =
  | { status: 'succeeded'; summary: string }
  | { status: 'failed'; error: string };

interface CourseActionDefinition<Schema extends z.ZodObject> {
  /** The course data dataset whose rows the action changes, and whose IDs its input takes. */
  group: CourseDatasetName;
  /** A Bootstrap icon for what the action does, without the `bi-` prefix. */
  icon: string;
  /** `positive` resolves or adds something; `caution` changes something that exists. */
  tone: CourseActionCard['tone'];
  /** What the action does and when to use it instead of the nearest alternative. */
  description: string;
  /** What is different afterward, for staff and for students. */
  results: string;
  /** The instructor needs one of these course roles, as model functions take them. */
  requiredRole: CourseRole[];
  input: Schema;
  /**
   * Checks the request against the database and says what approving it will do. The instructor
   * decides on this, never on the agent's own description. It is computed again at approval, and
   * the action runs only if it still says the same, so name everything the action will change
   * and leave out anything that changes on its own.
   */
  describe: (args: {
    ctx: CourseActionContext;
    input: z.infer<Schema>;
  }) => Promise<CourseActionDescription>;
  /**
   * Carries the action out and says, in one sentence, what happened. It runs in a transaction. A
   * run fails in one of three ways, and each rolls back what it changed and reaches the course
   * agent as a failed result: it returns `failed`; it throws `CourseActionError`, as the checks
   * before it do; or it throws anything else, which is logged and reported and reaches the agent
   * as an internal error.
   */
  run: (args: { ctx: CourseActionContext; input: z.infer<Schema> }) => Promise<CourseActionOutcome>;
}

export interface CourseAction {
  group: CourseDatasetName;
  description: string;
  results: string;
  input: z.ZodObject;
  describe: (ctx: CourseActionContext, input: unknown) => Promise<CourseActionCard>;
  run: (ctx: CourseActionContext, input: unknown) => Promise<CourseActionOutcome>;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** `3 issues`, `1 issue`. */
export function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Defines an action on the course. */
export function action<Schema extends z.ZodObject>(
  definition: CourseActionDefinition<Schema>,
): CourseAction {
  // The instructor's role and the rows an action names can change between the request and its
  // approval, so both steps check them.
  const check = (ctx: CourseActionContext, raw: unknown) => {
    const parsed = definition.input.safeParse(raw);
    // Zod's message says what is allowed, so the course agent can correct its request.
    if (!parsed.success) throw new CourseActionError(z.prettifyError(parsed.error));
    if (!hasRole(ctx.authz_data, definition.requiredRole)) {
      throw new CourseActionError(
        `The instructor needs ${definition.requiredRole.join(' or ')} access to the course for this, which they do not have. Tell them, and do not retry. A course owner can grant it on the Staff page.`,
      );
    }
    return { ctx, input: parsed.data };
  };
  return {
    group: definition.group,
    description: definition.description,
    results: definition.results,
    input: definition.input,
    async describe(ctx, raw) {
      const description = await definition.describe(check(ctx, raw));
      return CourseActionCardSchema.parse({
        icon: definition.icon,
        tone: definition.tone,
        title: clip(description.title, 200),
        subtitle: description.subtitle ? clip(description.subtitle, 300) : null,
        items: description.items.map((item) => ({ ...item, label: clip(item.label, 300) })),
      });
    },
    async run(ctx, raw) {
      const args = check(ctx, raw);
      // A run that fails partway is rolled back, so a failed result always means nothing changed.
      return await runInTransactionAsync(async () => {
        const outcome = await definition.run(args);
        if (outcome.status === 'failed') throw new CourseActionError(outcome.error);
        return outcome;
      });
    },
  };
}
