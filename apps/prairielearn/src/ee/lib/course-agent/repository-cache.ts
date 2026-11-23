import { formatInterval } from '@prairielearn/formatter';

import { parseGithubRepository } from '../../../lib/github-utils.js';
import { type ServerJob, createServerJob } from '../../../lib/server-jobs.js';
import { selectOptionalCourseById } from '../../../models/course.js';

import { cacheCourseAgentRepository } from './client.js';

/**
 * Have the course agent service clone each course's repository and save a copy, so that the
 * course's conversations restore it instead of cloning from GitHub. A course that already has a
 * copy gets a fresh one.
 */
export async function cacheCourseAgentRepositories(courseIds: string[], authnUserId: string) {
  const serverJob = await createServerJob({
    type: 'cache_course_agent_repositories',
    description: 'Cache course repositories for the course agent',
    userId: authnUserId,
    authnUserId,
  });

  serverJob.executeInBackground(async (job) => {
    let failed = 0;
    for (const [i, courseId] of courseIds.entries()) {
      job.info(`Caching the repository of course ${courseId} [${i + 1}/${courseIds.length}]`);
      if (!(await cacheCourseRepository(courseId, job))) failed++;
    }
    if (failed > 0) job.fail(`Could not cache ${failed} of ${courseIds.length} courses`);
  });

  return serverJob.jobSequenceId;
}

async function cacheCourseRepository(courseId: string, job: ServerJob) {
  const course = await selectOptionalCourseById(courseId);
  if (!course || course.deleted_at) {
    job.error(`Course ${courseId} does not exist`);
    return false;
  }
  const repository = parseGithubRepository(course.repository ?? '');
  if (!repository || !course.branch) {
    job.error(`${course.short_name} has no GitHub repository and branch configured`);
    return false;
  }
  const binding = { repository: `${repository.owner}/${repository.repo}`, branch: course.branch };
  const name = `${binding.repository} (${binding.branch})`;
  try {
    const { cloneMs, snapshotMs } = await cacheCourseAgentRepository(course.id, binding);
    job.info(
      `Cached ${name}: cloned in ${formatInterval(cloneMs)}, saved in ${formatInterval(snapshotMs)}`,
    );
    return true;
  } catch (err) {
    // One course's failure must not stop the rest of the list.
    job.error(`Could not cache ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
