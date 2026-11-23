import { z } from 'zod';

import {
  type CourseActionCard,
  type CourseActionCatalog,
  CourseActionCatalogSchema,
  CourseActionRequestReplySchema,
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
    `Course actions (API version ${catalog.version}). Each changes something in PrairieLearn that course files do not hold. Request one with request_course_action; the instructor decides, and the result arrives in a later message. IDs are strings and come from the dataset an action is listed under, in get_course_data.`,
    ...Object.entries(catalog.actions).flatMap(([name, action]) => {
      const input = InputSchema.parse(action.input);
      return [
        '',
        `${name} (${action.group}): ${action.description}`,
        `  Effect: ${action.effects}`,
        `  Undo: ${action.undo ?? 'Cannot be undone.'}`,
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
 * Asks PrairieLearn to check and record a request, with
 * `POST /pl/course/:course_id/course_agent/actions/:action`. Nothing in the course changes until
 * the instructor approves it in PrairieLearn.
 */
export async function requestCourseAction(
  context: PrairieLearnContext,
  { id, action, input }: CourseActionRequest & { id: string },
): Promise<{ card: CourseActionCard } | { error: string }> {
  if (!context.courseId) return { error: UNAVAILABLE.text };
  const response = await fetch(
    new URL(
      `/pl/course/${context.courseId}/course_agent/actions/${encodeURIComponent(action)}`,
      context.plUrl,
    ),
    {
      method: 'POST',
      headers: { ...authHeaders(context), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, input }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  // Inputs can name students, so only the action is logged.
  logEvent('course_action_requested', {
    conversationId: context.conversationId,
    action,
    status: response.status,
  });
  if (!response.ok) return { error: `${response.status}: ${await errorMessage(response)}` };
  return CourseActionRequestReplySchema.parse(await response.json());
}

/** The tool reply for a recorded request: what the instructor is being asked, in plain text. */
export function describeRequestedAction(card: CourseActionCard, autoApprove: boolean) {
  const rows = card.rows.map((row) => `- ${row.label}${row.detail ? `: ${row.detail}` : ''}`);
  if (card.moreRows > 0) rows.push(`- and ${card.moreRows} more`);
  return [
    `Requested: ${card.title}${card.context ? ` (${card.context})` : ''}.`,
    ...rows,
    autoApprove
      ? 'The instructor chose to approve requests without reviewing them, so PrairieLearn is carrying this out now. The result arrives in a later message.'
      : 'The instructor sees this request and decides whether to approve it. The decision arrives in a later message.',
    'End your turn now, saying in one short sentence what you requested, and make no further tool calls.',
  ].join('\n');
}
