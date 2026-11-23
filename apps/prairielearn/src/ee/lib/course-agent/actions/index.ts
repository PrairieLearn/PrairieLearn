import type { CourseActionCatalog } from '@prairielearn/course-agent-types';

import { toJsonSchema } from '../json-schema.js';

import type { CourseAction } from './action.js';
import { aiGradingActions } from './ai-grading.js';
import { attemptActions } from './attempts.js';
import { gradingActions } from './grading.js';
import { issueActions } from './issues.js';
import { sharingActions } from './sharing.js';
import { studentActions } from './students.js';

/**
 * The actions the course agent can request: the single source of truth for what it can change
 * outside course files. The catalog the agent reads and the request route are derived from this
 * registry. Within v1, only add actions and optional inputs; a removal, rename, or change in
 * meaning needs a new version, since a running conversation may still use an older Worker.
 */
export const COURSE_AGENT_ACTIONS: Record<string, CourseAction> = {
  ...issueActions,
  ...attemptActions,
  ...sharingActions,
  ...studentActions,
  ...gradingActions,
  ...aiGradingActions,
};

const COURSE_ACTIONS_VERSION = 1;

/** The action list endpoint's response. */
export function courseActionCatalog(): CourseActionCatalog {
  return {
    version: COURSE_ACTIONS_VERSION,
    actions: Object.fromEntries(
      Object.entries(COURSE_AGENT_ACTIONS).map(([name, action]) => [
        name,
        {
          group: action.group,
          description: action.description,
          effects: action.effects,
          undo: action.undo,
          alwaysAsk: action.alwaysAsk,
          input: toJsonSchema(action.input),
        },
      ]),
    ),
  };
}
