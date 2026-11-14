import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { parseGithubRepository } from '../../../lib/github-utils.js';
import { type ServerJob, createServerJob } from '../../../lib/server-jobs.js';
import { selectOptionalCourseById } from '../../../models/course.js';

import {
  getCourseAgentRepositorySnapshot,
  requestCourseAgentRepositorySnapshot,
} from './client.js';

const POLL_INTERVAL_MS = 2000;
// A build is a full clone and upload. It keeps running in the service after this gives up.
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Cache each course's repository in the course agent service, so new conversations restore it
 * instead of cloning from GitHub. Caching a course again replaces its copy with a fresh clone.
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

  let status = await requestCourseAgentRepositorySnapshot(binding);
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (status.build.status === 'building') {
    if (Date.now() > deadline) {
      job.error(`${name} is still being cached; check the course agent service`);
      return false;
    }
    await sleep(POLL_INTERVAL_MS);
    status = await getCourseAgentRepositorySnapshot(binding);
  }
  if (status.build.status === 'failed') {
    job.error(`Could not cache ${name}: ${status.build.error}`);
    return false;
  }
  assert(status.snapshot, 'A finished build leaves a snapshot');
  job.info(
    `Cached ${name} at ${status.snapshot.commit.slice(0, 7)} (${Math.round(status.snapshot.bytes / 1e6)} MB)`,
  );
  return true;
}
