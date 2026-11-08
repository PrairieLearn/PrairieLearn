import { decodeData } from '@prairielearn/browser-utils';
import type { PageLocation } from '@prairielearn/course-agent-types';

/** The page the instructor is viewing, as the agent sees it. */
export function currentPageLocation(): PageLocation {
  const names = decodeData<Pick<PageLocation, 'courseInstance' | 'assessment' | 'question'>>(
    'course-agent-page-names',
  );
  return {
    path: window.location.pathname.slice(0, 2000),
    title: document.title.slice(0, 500),
    ...names,
  };
}
