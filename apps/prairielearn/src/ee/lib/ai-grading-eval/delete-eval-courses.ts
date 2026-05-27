import fs from 'fs-extra';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { type User } from '../../../lib/db-types.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { deleteCourse } from '../../../models/course.js';

import { EVAL_COURSES_ROOT } from './scaffold-course.js';

const sql = loadSqlEquiv(import.meta.url);

const CourseRowSchema = z.object({
  id: z.string(),
  short_name: z.string().nullable(),
  path: z.string().nullable(),
});

/**
 * Soft-deletes every course this harness has scaffolded (identified by the
 * `ai-grading-evals-<unix-ms>` short_name prefix) and removes their on-disk
 * tmp directories. Dev mode only.
 *
 * Returns the server-job sequence id so the caller can redirect to the
 * job-sequence page for visibility.
 */
export async function deleteAllAiGradingEvalCourses(user: User): Promise<string> {
  if (!config.devMode) {
    throw new Error('AI grading eval cleanup is only available in dev mode');
  }

  const serverJob = await createServerJob({
    type: 'ai_grading_eval_cleanup',
    description: 'Delete all AI grading eval courses',
    userId: user.id,
    authnUserId: user.id,
  });

  serverJob.executeInBackground(async (job) => {
    const courses = await queryRows(sql.select_eval_courses, {}, CourseRowSchema);
    if (courses.length === 0) {
      job.info('No AI grading eval courses found.');
    } else {
      job.info(`Found ${courses.length} AI grading eval course(s) to delete.`);
    }

    let deletedRows = 0;
    let removedDirs = 0;
    for (const course of courses) {
      job.info(`Soft-deleting course id=${course.id} short_name=${course.short_name}`);
      await deleteCourse({ course_id: course.id, authn_user_id: user.id });
      deletedRows++;

      if (course.path && (await fs.pathExists(course.path))) {
        await fs.remove(course.path);
        removedDirs++;
        job.info(`Removed course directory ${course.path}`);
      }
    }

    if (await fs.pathExists(EVAL_COURSES_ROOT)) {
      const remaining = await fs.readdir(EVAL_COURSES_ROOT);
      if (remaining.length === 0) {
        await fs.remove(EVAL_COURSES_ROOT);
        job.info(`Removed empty eval courses root ${EVAL_COURSES_ROOT}`);
      }
    }

    job.info(`Done. Soft-deleted ${deletedRows} course(s); removed ${removedDirs} directory(ies).`);
  });

  return serverJob.jobSequenceId;
}
