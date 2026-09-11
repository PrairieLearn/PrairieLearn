import { type z } from 'zod';

import {
  type CourseAgentTokenUsageSchema,
  type CourseAgentUsageCallbackSchema,
} from '@prairielearn/course-agent-protocol';
import * as error from '@prairielearn/error';

import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import {
  authorizeCourseAgentUsageReceipt,
  recordCourseAgentUsageReceipt,
  selectOptionalCourseAgentUsageIdentity,
} from '../../../models/course-agent-run-usage.js';
import { selectOptionalCourseById } from '../../../models/course.js';
import { selectOptionalUserById } from '../../../models/user.js';

import { addCourseAgentCost, checkCourseAgentUsageLimits } from './usage-limits.js';

export function courseAgentTokenPricing(model: string) {
  const prices: Partial<
    Record<
      string,
      {
        input: number;
        cachedInput: number;
        cacheWrite: number;
        output: number;
        longContextThreshold?: number;
      }
    >
  > = { ...config.costPerMillionTokens, ...config.courseAgentTokenPricing };
  const price = prices[model];
  if (!price) {
    throw new error.HttpStatusError(
      503,
      `Course-agent token pricing is not configured for ${model}.`,
    );
  }
  return price;
}

export function courseAgentCost(
  usage: z.infer<typeof CourseAgentTokenUsageSchema>,
  price: {
    input: number;
    cachedInput: number;
    cacheWrite: number;
    output: number;
    longContextThreshold?: number;
  },
) {
  const longContext =
    price.longContextThreshold !== undefined && usage.input_tokens > price.longContextThreshold;
  return (
    (((usage.input_tokens - usage.cache_read_tokens - usage.cache_write_tokens) * price.input +
      usage.cache_read_tokens * price.cachedInput +
      usage.cache_write_tokens * price.cacheWrite) *
      (longContext ? 2 : 1) +
      usage.output_tokens * price.output * (longContext ? 1.5 : 1)) /
    1000
  );
}

export async function handleCourseAgentUsage(
  input: z.infer<typeof CourseAgentUsageCallbackSchema>,
) {
  const identity = await selectOptionalCourseAgentUsageIdentity(input);
  if (!identity) throw new error.HttpStatusError(403, 'Course-agent run not found.');
  const price = courseAgentTokenPricing(input.model);
  if (input.action === 'authorize') {
    if (identity.status !== 'running') {
      throw new error.HttpStatusError(409, 'Course-agent run has ended.');
    }
    const course = await selectOptionalCourseById(input.courseId);
    const user = await selectOptionalUserById(input.userId);
    if (
      !course ||
      course.deleted_at ||
      !user ||
      !(await features.enabled('course-agent', {
        institution_id: course.institution_id,
        course_id: course.id,
        user_id: user.id,
      }))
    ) {
      throw new error.HttpStatusError(403, 'Course agent is not enabled.');
    }
    const context = await constructCourseOrInstanceContext({
      user,
      course_id: course.id,
      course_instance_id: null,
      ip: null,
      req_date: new Date(),
      is_administrator: false,
    });
    if (!context.authzData?.has_course_permission_own) {
      throw new error.HttpStatusError(403, 'Current course ownership is required.');
    }
    const limit = await checkCourseAgentUsageLimits(input);
    if (!limit.allowed) return limit;
    await authorizeCourseAgentUsageReceipt(input.id, input.runId, input.model);
    return limit;
  }
  if (!input.usage) throw new error.HttpStatusError(400, 'Usage is required.');
  const cost = courseAgentCost(input.usage, price);
  const added = await recordCourseAgentUsageReceipt({
    id: input.id,
    runId: input.runId,
    model: input.model,
    usage: input.usage,
    cost,
  });
  // PostgreSQL is authoritative. Like AI grading, Redis is a best-effort spending guardrail,
  // not a ledger or a transaction with provider billing.
  if (added) await addCourseAgentCost(input, cost / 1000);
  return { allowed: true, message: null };
}
