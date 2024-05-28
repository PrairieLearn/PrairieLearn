// @ts-check

import {
  ECR,
  ECRClient,
  RepositoryAlreadyExistsException,
  RepositoryNotFoundException,
} from '@aws-sdk/client-ecr';
import * as async from 'async';
import Docker from 'dockerode';

import { DockerName, setupDockerAuth } from '@prairielearn/docker-utils';
import * as Sentry from '@prairielearn/sentry';

import { makeAwsClientConfig } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { pullAndUpdateCourse } from '../../lib/course.js';
import { createServerJob } from '../../lib/server-jobs.js';

const docker = new Docker();

export async function pullAndUpdate(locals) {
  const { jobSequenceId } = await pullAndUpdateCourse({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    ...locals.course,
  });
  return jobSequenceId;
}

export async function gitStatus(locals) {
  const serverJob = await createServerJob({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    type: 'git_status',
    description: 'Show server git status',
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Describe current git HEAD');
    await job.exec('git', ['show', '--format=fuller', '--quiet', 'HEAD'], {
      cwd: locals.course.path,
    });

    job.info('List git history');
    await job.exec(
      'git',
      ['log', '--all', '--graph', '--date=short', '--format=format:%h %cd%d %cn %s'],
      {
        cwd: locals.course.path,
      },
    );
  });

  return serverJob.jobSequenceId;
}

/**
 * @param {string} repo
 * @param {import('../../lib/server-jobs.js').ServerJob} job
 */
async function ensureECRRepo(repo, job) {
  const ecr = new ECR(makeAwsClientConfig());
  job.info(`Describing repositories with name: ${repo}`);

  try {
    const data = await ecr.describeRepositories({ repositoryNames: [repo] });

    if (data.repositories?.some((r) => r.repositoryName === repo)) {
      // The repository already exists; there's nothing for us to do.
      job.info('Repository found');
      return;
    }
  } catch (err) {
    if (err instanceof RepositoryNotFoundException) {
      // Repository not found; this is expected.
    } else {
      // Something else went wrong; allow it to bubble up.
      Sentry.captureException(err, { tags: { repository: repo } });
      throw err;
    }
  }

  job.info('Repository not found');
  job.info(`Creating repository: ${repo}`);

  try {
    await ecr.createRepository({ repositoryName: repo });
  } catch (err) {
    if (err instanceof RepositoryAlreadyExistsException) {
      // Someone else created the repository before we could; this is fine.
    } else {
      // Something else went wrong; allow it to bubble up.
      Sentry.captureException(err, { tags: { repository: repo } });
      throw err;
    }
  }

  job.info('Successfully created repository');
}

function logProgressOutput(output, job, printedInfos, prefix) {
  let info = null;
  if (
    'status' in output &&
    'id' in output &&
    'progressDetail' in output &&
    output.progressDetail.total
  ) {
    info = `${output.status} ${output.id} (${output.progressDetail.total} bytes)`;
  } else if ('status' in output && 'id' in output) {
    info = `${output.status} ${output.id}`;
  } else if ('status' in output) {
    info = `${output.status}`;
  }
  if (info != null && !printedInfos.has(info)) {
    printedInfos.add(info);
    job.info(prefix + info);
  }
}

/**
 *
 * @param {string} image
 * @param {import('@prairielearn/docker-utils').DockerAuth} dockerAuth
 * @param {import('../../lib/server-jobs.js').ServerJob} job
 */
async function pullAndPushToECR(image, dockerAuth, job) {
  const { cacheImageRegistry } = config;
  if (!cacheImageRegistry) {
    throw new Error('cacheImageRegistry not defined');
  }

  const repository = new DockerName(image);
  job.info(`Pulling ${repository.getCombined()}`);
  const pullStream = await docker.createImage({
    fromImage: repository.getRepository(),
    tag: repository.getTag() || 'latest',
  });

  await new Promise((resolve, reject) => {
    const printedInfos = new Set();
    docker.modem.followProgress(
      pullStream,
      (err) => {
        if (err) reject(err);
        resolve(null);
      },
      (output) => {
        logProgressOutput(output, job, printedInfos, 'Pull progress: ');
      },
    );
  });

  job.info('Pull complete');

  // Find the image we just downloaded
  const downloadedImage = repository.getCombined(true);
  const localImage = docker.getImage(downloadedImage);

  // Tag the image to add the new registry
  repository.setRegistry(cacheImageRegistry);

  const options = {
    repo: repository.getCombined(),
  };
  job.info(`Tagging image: ${options.repo}`);
  await localImage.tag(options);
  job.info('Successfully tagged image');

  const repositoryName = repository.getRepository();
  job.info(`Ensuring repository exists: ${repositoryName}`);
  await ensureECRRepo(repositoryName, job);
  job.info('Successfully ensured repository exists');

  // Create a new docker image instance with the new registry name
  // localImage isn't specific enough to the ECR repo
  const pushImageName = repository.getCombined();
  const pushImage = docker.getImage(pushImageName);

  job.info(`Pushing image: ${repository.getCombined()}`);
  const pushStream = await pushImage.push({ authconfig: dockerAuth });

  await new Promise((resolve, reject) => {
    const printedInfos = new Set();
    docker.modem.followProgress(
      pushStream,
      (err) => {
        if (err) reject(err);
        resolve(null);
      },
      (output) => {
        logProgressOutput(output, job, printedInfos, 'Push progress: ');
      },
    );
  });

  job.info('Push complete');
}

/**
 * @param {{ image: string }[]} images
 * @param {any} locals
 */
export async function ecrUpdate(images, locals) {
  if (!config.cacheImageRegistry) {
    throw new Error('cacheImageRegistry not defined');
  }

  const ecr = new ECRClient(makeAwsClientConfig());
  const auth = await setupDockerAuth(ecr);

  const serverJob = await createServerJob({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    type: 'images_sync',
    description: 'Sync Docker images from Docker Hub to PL registry',
  });

  serverJob.executeInBackground(async (job) => {
    await async.eachOfSeries(images ?? [], async (image) => {
      job.info(`Pull image from Docker Hub and push to PL registry: ${image.image}`);
      await pullAndPushToECR(image.image, auth, job);
    });
  });

  return serverJob.jobSequenceId;
}
