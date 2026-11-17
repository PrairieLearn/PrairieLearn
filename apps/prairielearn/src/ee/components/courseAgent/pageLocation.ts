import { decodeData } from '@prairielearn/browser-utils';
import type { PageLocation } from '@prairielearn/course-agent-types';

/** The page the instructor is viewing, as the agent sees it. */
export function currentPageLocation(): PageLocation {
  return {
    path: window.location.pathname.slice(0, 2000),
    ...decodeData<Omit<PageLocation, 'path'>>('course-agent-page'),
  };
}
