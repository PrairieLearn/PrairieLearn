// @ts-check

const { ECR, ECRClient } = require('@aws-sdk/client-ecr');
const _ = require('lodash');
const ERR = require('async-stacktrace');
const async = require('async');
const Docker = require('dockerode');
const { DockerName, setupDockerAuth } = require('@prairielearn/docker-utils');

const { makeAwsClientConfig } = require('../../lib/aws');
const { config } = require('../../lib/config');
const { createServerJob } = require('../../lib/server-jobs');
const { pullAndUpdateCourse } = require('../../lib/course');
const util = require('util');
const debug = require('debug')('prairielearn:syncHelpers');

const docker = new Docker();

module.exports.pullAndUpdate = async function (locals) {
  const { jobSequenceId } = await pullAndUpdateCourse({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    ...locals.course,
  });
  return jobSequenceId;
};

module.exports.gitStatus = async function (locals) {
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
};

function locateImage(image, callback) {
  debug('locateImage');
  docker.listImages(function (err, list = []) {
    if (ERR(err, callback)) return;
    debug(`locateImage: list=${list}`);
    for (var i = 0, len = list.length; i < len; i++) {
      if (list[i].RepoTags && list[i].RepoTags?.indexOf(image) !== -1) {
        return callback(null, docker.getImage(list[i].Id));
      }
    }
    return callback(new Error(`Unable to find image=${image}`));
  });
}

function confirmOrCreateECRRepo(repo, job, callback) {
  const ecr = new ECR(makeAwsClientConfig());
  job.info(`Describing repositories with name: ${repo}`);
  ecr.describeRepositories({ repositoryNames: [repo] }, (err, data) => {
    let repositoryFound = false;
    if (err) {
      job.info(`Error returned from describeRepositories(): ${err}`);
      job.info('Treating this error as meaning the desired repository does not exist');
    } else {
      repositoryFound = !!_.find(data.repositories, ['repositoryName', repo]);
    }

    if (!repositoryFound) {
      job.info('Repository not found');

      job.info(`Creating repository: ${repo}`);
      var params = {
        repositoryName: repo,
      };
      ecr.createRepository(params, (err) => {
        if (ERR(err, callback)) return;
        job.info('Successfully created repository');
        callback(null);
      });
    } else {
      job.info('Repository found');
      // Already exists, nothing to do
      callback(null);
    }
  });
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
 * @param {Pick<import('../../lib/server-jobs').ServerJob, 'info'>} job
 * @param {Function} callback
 */
function pullAndPushToECR(image, dockerAuth, job, callback) {
  debug(`pullAndPushtoECR for ${image}`);

  const { cacheImageRegistry } = config;
  if (!cacheImageRegistry) {
    return callback(new Error('cacheImageRegistry not defined'));
  }

  const repository = new DockerName(image);
  const params = {
    fromImage: repository.getRepository(),
    tag: repository.getTag() || 'latest',
  };
  job.info(`Pulling ${repository.getCombined()}`);
  docker.createImage({}, params, (err, stream) => {
    if (ERR(err, callback)) return;
    if (!stream) throw new Error('Missing stream from createImage()');

    const printedInfos = new Set();
    docker.modem.followProgress(
      stream,
      (err) => {
        if (ERR(err, callback)) return;

        job.info('Pull complete');

        // Find the image we just downloaded
        const downloadedImage = repository.getCombined(true);
        job.info(`Locating downloaded image: ${downloadedImage}`);
        locateImage(downloadedImage, (err, localImage) => {
          if (ERR(err, callback)) return;
          job.info('Successfully located downloaded image');

          // Tag the image to add the new registry
          repository.setRegistry(cacheImageRegistry);

          var options = {
            repo: repository.getCombined(),
          };
          job.info(`Tagging image: ${options.repo}`);
          localImage.tag(options, (err) => {
            if (ERR(err, callback)) return;
            job.info('Successfully tagged image');

            const repositoryName = repository.getRepository();
            job.info(`Ensuring repository exists: ${repositoryName}`);
            confirmOrCreateECRRepo(repositoryName, job, (err) => {
              if (ERR(err, callback)) return;
              job.info('Successfully ensured repository exists');

              // Create a new docker image instance with the new registry name
              // localImage isn't specific enough to the ECR repo
              const pushImageName = repository.getCombined();
              var pushImage = new Docker.Image(docker.modem, pushImageName);

              job.info(`Pushing image: ${repository.getCombined()}`);
              pushImage.push(
                {
                  // @ts-expect-error: We seem to be missing a `serveraddress` property,
                  // but it works fine without it?
                  authconfig: dockerAuth,
                },
                (err, stream) => {
                  if (ERR(err, callback)) return;
                  if (!stream) throw new Error('Missing stream from push()');

                  const printedInfos = new Set();
                  docker.modem.followProgress(
                    stream,
                    (err) => {
                      if (ERR(err, callback)) return;
                      job.info('Push complete');
                      callback(null);
                    },
                    (output) => {
                      logProgressOutput(output, job, printedInfos, 'Push progress: ');
                    },
                  );
                },
              );
            });
          });
        });
      },
      (output) => {
        logProgressOutput(output, job, printedInfos, 'Pull progress: ');
      },
    );
  });
}

/**
 * @param {{ image: string }[]} images
 * @param {any} locals
 */
module.exports.ecrUpdate = async function (images, locals) {
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
      await util.promisify(pullAndPushToECR)(image.image, auth, job);
    });
  });

  return serverJob.jobSequenceId;
};
