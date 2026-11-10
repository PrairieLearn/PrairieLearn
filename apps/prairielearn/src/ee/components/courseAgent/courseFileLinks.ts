import { defaultUrlTransform } from 'react-markdown';

import { COURSE_DIR } from '@prairielearn/course-agent-types';

import { encodePathNoNormalize } from '../../../lib/uri-util.shared.js';

/** A line or line-and-column suffix, as in `info.json:12` or `info.json:12:3`. */
const LINE_SUFFIX = /(?::\d+){1,2}$/;

/**
 * The agent links to course files by their absolute paths in its sandbox, which mean nothing in
 * the browser. Send them to PrairieLearn, which opens each file's page in the course.
 */
export function courseFileLinkTransform(courseId: string) {
  return (url: string) => {
    let target = url;
    try {
      target = decodeURIComponent(url);
    } catch {
      // A malformed escape is not a sandbox path; leave the link as written.
    }
    if (target !== COURSE_DIR && !target.startsWith(`${COURSE_DIR}/`)) {
      return defaultUrlTransform(url);
    }
    const relPath = target.slice(COURSE_DIR.length + 1).replace(LINE_SUFFIX, '');
    return `/pl/course/${courseId}/course_agent/file/${encodePathNoNormalize(relPath)}`;
  };
}
