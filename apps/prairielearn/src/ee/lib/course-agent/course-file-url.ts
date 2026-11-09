import * as path from 'node:path';

import fs from 'fs-extra';

import type { Course } from '../../../lib/db-types.js';
import { encodePath } from '../../../lib/uri-util.js';
import { selectOptionalAssessmentByTid } from '../../../models/assessment.js';
import { selectOptionalCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectOptionalQuestionByQid } from '../../../models/question.js';

/**
 * Splits `segments` at the shortest prefix that `lookup` finds. Question IDs, course instance
 * names, and assessment IDs may span several directories, but they never nest in one another.
 */
async function findByPrefix<T>(
  segments: string[],
  lookup: (name: string) => Promise<T | null>,
): Promise<{ row: T; rest: string } | null> {
  for (let i = 1; i <= segments.length; i++) {
    const row = await lookup(segments.slice(0, i).join('/'));
    if (row) return { row, rest: segments.slice(i).join('/') };
  }
  return null;
}

/** The nearest path at or above `relPath` that exists in the course directory. */
async function nearestExisting(coursePath: string, relPath: string) {
  let current = relPath;
  while (current !== '' && !(await fs.pathExists(path.join(coursePath, current)))) {
    current = path.posix.dirname(current) === '.' ? '' : path.posix.dirname(current);
  }
  return current;
}

/**
 * The page that best shows a course file: a question preview, a settings page, or a file view.
 * `found` is false when the file is not in the course, for example because it is part of course
 * agent changes that have not been approved; the URL then shows its nearest existing directory.
 */
export async function courseFileUrl(
  course: Pick<Course, 'id' | 'path'>,
  requestedPath: string,
): Promise<{ url: string; found: boolean }> {
  const normalized = path.posix.normalize(requestedPath.replace(/^\/+/, '')).replace(/\/+$/, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    return { url: await urlForPath(course, ''), found: false };
  }
  const relPath = normalized === '.' ? '' : normalized;
  const existing = course.path ? await nearestExisting(course.path, relPath) : '';
  return { url: await urlForPath(course, existing), found: existing === relPath };
}

async function urlForPath(course: Pick<Course, 'id'>, relPath: string) {
  const coursePrefix = `/pl/course/${course.id}`;
  // File views take paths relative to the course, whichever page shows them.
  const fileView = (prefix: string, filePath = relPath) =>
    filePath ? `${prefix}/file_view/${encodePath(filePath)}` : `${prefix}/file_view`;
  const [top, ...segments] = relPath === '' ? [] : relPath.split('/');

  if (top === 'questions') {
    if (segments.length === 0) return `${coursePrefix}/course_admin/questions`;
    const question = await findByPrefix(segments, (qid) =>
      selectOptionalQuestionByQid({ qid, course_id: course.id }),
    );
    if (question) {
      const questionPrefix = `${coursePrefix}/question/${question.row.id}`;
      if (question.rest === '' || question.rest === 'question.html') {
        return `${questionPrefix}/preview`;
      }
      if (question.rest === 'info.json') return `${questionPrefix}/settings`;
      return fileView(questionPrefix);
    }
    // Only a question's own pages can show files under `questions`.
    return `${coursePrefix}/course_admin/questions`;
  }

  if (top === 'courseInstances') {
    const instance = await findByPrefix(segments, (shortName) =>
      selectOptionalCourseInstanceByShortName({ course, shortName }),
    );
    if (instance) {
      const instancePrefix = `/pl/course_instance/${instance.row.id}/instructor`;
      const [sub, ...assessmentSegments] = instance.rest === '' ? [] : instance.rest.split('/');
      if (sub === 'assessments') {
        if (assessmentSegments.length === 0) return `${instancePrefix}/instance_admin/assessments`;
        const assessment = await findByPrefix(assessmentSegments, (tid) =>
          selectOptionalAssessmentByTid({ course_instance_id: instance.row.id, tid }),
        );
        if (assessment) {
          const assessmentPrefix = `${instancePrefix}/assessment/${assessment.row.id}`;
          if (assessment.rest === '') return `${assessmentPrefix}/questions`;
          if (assessment.rest === 'infoAssessment.json') return `${assessmentPrefix}/settings`;
          return fileView(assessmentPrefix);
        }
        return `${instancePrefix}/instance_admin/assessments`;
      }
      if (instance.rest === 'infoCourseInstance.json') {
        return `${instancePrefix}/instance_admin/settings`;
      }
      return fileView(`${instancePrefix}/instance_admin`);
    }
    return `${coursePrefix}/course_admin/instances`;
  }

  if (relPath === 'infoCourse.json') return `${coursePrefix}/course_admin/settings`;
  // The course file view cannot show Git's internal files.
  if (top === '.git') return fileView(`${coursePrefix}/course_admin`, '');
  return fileView(`${coursePrefix}/course_admin`);
}
