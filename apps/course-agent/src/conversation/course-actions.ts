import { z } from 'zod';

import {
  type CourseActionCatalog,
  CourseActionCatalogSchema,
  CourseActionRunReplySchema,
} from '@prairielearn/course-agent-types';

import { logEvent } from '../monitoring.js';
import type { CourseActionRequest, ToolReply } from '../sandbox/codex.js';

import { type PrairieLearnContext, authHeaders, errorMessage } from './prairielearn.js';

const REQUEST_TIMEOUT_MS = 60_000;

const UNAVAILABLE: ToolReply = {
  success: false,
  text: 'Course actions are unavailable. Reload the PrairieLearn page.',
};

const JsonSchemaProperty = z.looseObject({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  enum: z.array(z.unknown()).optional(),
  description: z.string().optional(),
  items: z.looseObject({ type: z.string().optional() }).optional(),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
});
const InputSchema = z.looseObject({
  properties: z.record(z.string(), JsonSchemaProperty).default({}),
  required: z.array(z.string()).default([]),
});

/** One line per input, such as `issue_ids (list of 1 to 500 string, required): IDs of the issues.` */
function describeInput(
  name: string,
  property: z.infer<typeof JsonSchemaProperty>,
  required: boolean,
) {
  const types = Array.isArray(property.type) ? property.type : property.type ? [property.type] : [];
  const base = types.filter((type) => type !== 'null').join(' or ');
  const size =
    property.minItems !== undefined && property.maxItems !== undefined
      ? ` of ${property.minItems} to ${property.maxItems}`
      : '';
  const type = property.enum
    ? `one of ${property.enum.join(', ')}`
    : base === 'array'
      ? `list${size} ${property.items?.type ?? 'value'}`
      : base;
  const details = [type, required ? 'required' : 'optional'].filter(Boolean).join(', ');
  return `    ${name} (${details})${property.description ? `: ${property.description}` : ''}`;
}

function describeCatalog(catalog: CourseActionCatalog) {
  return [
    `Course actions (API version ${catalog.version}). Each changes something in PrairieLearn that course files do not hold, as the instructor, and takes effect as soon as you run it with run_course_action. IDs are strings and come from course data (get_course_data).`,
    ...Object.entries(catalog.actions).flatMap(([name, action]) => {
      const input = InputSchema.parse(action.input);
      return [
        '',
        `${name}: ${action.description}`,
        '  Input:',
        ...Object.entries(input.properties).map(([key, property]) =>
          describeInput(key, property, input.required.includes(key)),
        ),
      ];
    }),
  ].join('\n');
}

/** Serves `list_course_actions` from `GET /pl/course/:course_id/course_agent/actions`. */
export async function listCourseActions(context: PrairieLearnContext): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  const response = await fetch(
    new URL(`/pl/course/${context.courseId}/course_agent/actions`, context.plUrl),
    { headers: authHeaders(context), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  return {
    success: true,
    text: describeCatalog(CourseActionCatalogSchema.parse(await response.json())),
  };
}

/**
 * Serves `run_course_action` with `POST /pl/course/:course_id/course_agent/actions/:action`,
 * which runs the action in that request. It is never retried here: a retry could repeat an
 * action that did happen.
 */
export async function runCourseAction(
  context: PrairieLearnContext,
  { action, input }: CourseActionRequest,
): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  let response: Response;
  try {
    response = await fetch(
      new URL(
        `/pl/course/${context.courseId}/course_agent/actions/${encodeURIComponent(action)}`,
        context.plUrl,
      ),
      {
        method: 'POST',
        headers: { ...authHeaders(context), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID(), input }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      logEvent('course_action_run', { conversationId: context.conversationId, action, status: 0 });
      return {
        success: false,
        text: 'PrairieLearn did not answer in time, so the action may or may not have happened. Check in course data or ask the instructor before running it again.',
      };
    }
    throw error;
  }
  // Inputs can name students, so only the action is logged.
  logEvent('course_action_run', {
    conversationId: context.conversationId,
    action,
    status: response.status,
  });
  if (response.status >= 500) {
    return {
      success: false,
      text: 'PrairieLearn could not complete the action because of an internal error, so nothing was changed.',
    };
  }
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  return { success: true, text: CourseActionRunReplySchema.parse(await response.json()).summary };
}
