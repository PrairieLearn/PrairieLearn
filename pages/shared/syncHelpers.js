const ERR = require('async-stacktrace');
const fs = require('fs-extra');
const async = require('async');
const logger = require('../../lib/logger');
const config = require('../../lib/config');
const serverJobs = require('../../lib/server-jobs');
const serverJobs2 = require('../../lib/server-jobs-2');
const syncFromDisk = require('../../sync/syncFromDisk');
const requireFrontend = require('../../lib/require-frontend');
const courseUtil = require('../../lib/courseUtil');
const util = require('util');
const chunks = require('../../lib/chunks');
const dockerUtil = require('../../lib/dockerUtil');
const debug = require('debug')('prairielearn:syncHelpers');

const error = require('../../prairielib/lib/error');

module.exports.pullAndUpdate = async function (locals) {
  const jobSequence = await serverJobs2.createJobSequence({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    type: 'sync',
    description: 'Pull from remote git repository',
  });

  const gitEnv = process.env;
  if (config.gitSshCommand != null) {
    gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
  }

  jobSequence.execute(async ({ runJob, spawnJob }) => {
    let startGitHash = null;
    const coursePathExists = await fs.pathExists(locals.course.path);
    if (coursePathExists) {
      // path does not exist, start with 'git clone'
      await spawnJob({
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'clone_from_git',
        description: 'Clone from remote git repository',
        command: 'git',
        arguments: [
          'clone',
          '-b',
          locals.course.branch,
          locals.course.repository,
          locals.course.path,
        ],
        env: gitEnv,
      });
    } else {
      // path exists, update remote origin address, then 'git fetch' and reset to latest with 'git reset'

      startGitHash = await courseUtil.getOrUpdateCourseCommitHashAsync(locals.course);

      await spawnJob({
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'add_git_remote_origin',
        description: 'Updating to latest remote origin address',
        command: 'git',
        arguments: ['remote', 'set-url', 'origin', locals.course.repository],
        working_directory: locals.course.path,
        env: gitEnv,
      });

      await spawnJob({
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'fetch_from_git',
        description: 'Fetch from remote git repository',
        command: 'git',
        arguments: ['fetch'],
        working_directory: locals.course.path,
        env: gitEnv,
      });

      await spawnJob({
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'clean_git_repo',
        description: 'Clean local files not in remote git repository',
        command: 'git',
        arguments: ['clean', '-fdx'],
        working_directory: locals.course.path,
        env: gitEnv,
      });

      await spawnJob({
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'reset_from_git',
        description: 'Reset state to remote git repository',
        command: 'git',
        arguments: ['reset', '--hard', `origin/${locals.course.branch}`],
        working_directory: locals.course.path,
        env: gitEnv,
      });
    }

    // After either cloning or fetching and resetting from Git, we'll need
    // to load and store the current commit hash in the database
    const endGitHash = await courseUtil.updateCourseCommitHash(locals.course);

    let syncResult = null;
    await runJob(
      {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync_from_disk',
        description: 'Sync git repository to database',
      },
      async (job) => {
        syncResult = await syncFromDisk.syncDiskToSqlAsync(
          locals.course.path,
          locals.course.id,
          job
        );

        const checkJsonErrors = () => {};

        if (config.chunksGenerator) {
          await chunks.updateChunksForCourse({
            coursePath: locals.course.path,
            courseId: locals.course.id,
            courseData: syncResult.courseData,
            oldHash: startGitHash,
            newHash: endGitHash,
          });
        }
        checkJsonErrors();
      }
    );

    // Before erroring the job from sync errors, reload server.js files.
    await runJob(
      {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'reload_question_servers',
        description: 'Reload question server.js code',
        last_in_sequence: true,
      },
      async (job) => {
        const coursePath = locals.course.path;
        await util.promisify(requireFrontend.undefQuestionServers)(coursePath, job);
      }
    );

    if (syncResult.hadJsonErrors) {
      throw new Error('One or more JSON files contained errors and were unable to be synced');
    }
  });

  return jobSequence.id;
};

module.exports.gitStatus = async function (locals) {
  const jobSequence = await serverJobs2.createJobSequence({
    courseId: locals.course.id,
    userId: locals.user.user_id,
    authnUserId: locals.authz_data.authn_user.user_id,
    type: 'git_status',
    description: 'Show server git status',
  });

  jobSequence.execute(async ({ spawnJob }) => {
    await spawnJob({
      course_id: locals.course.id,
      user_id: locals.user.user_id,
      authn_user_id: locals.authz_data.authn_user.user_id,
      type: 'describe_git',
      description: 'Describe current git HEAD',
      command: 'git',
      arguments: ['show', '--format=fuller', '--quiet', 'HEAD'],
      working_directory: locals.course.path,
    });

    await spawnJob({
      course_id: locals.course.id,
      user_id: locals.user.user_id,
      authn_user_id: locals.authz_data.authn_user.user_id,
      type: 'git_history',
      description: 'List git history',
      command: 'git',
      arguments: ['log', '--all', '--graph', '--date=short', '--format=format:%h %cd%d %cn %s'],
      working_directory: locals.course.path,
      last_in_sequence: true,
    });
  });

  return jobSequence.id;
};

module.exports.ecrUpdate = function (locals, callback) {
  if (!config.cacheImageRegistry) {
    return callback(new Error('cacheImageRegistry not defined'));
  }

  dockerUtil.setupDockerAuth((err, auth) => {
    if (ERR(err, callback)) return;

    const options = {
      course_id: locals.course.id,
      user_id: locals.user.user_id,
      authn_user_id: locals.authz_data.authn_user.user_id,
      type: 'images_sync',
      description: 'Sync Docker images from Docker Hub to PL registry',
    };
    serverJobs.createJobSequence(options, function (err, job_sequence_id) {
      if (ERR(err, callback)) return;
      callback(null, job_sequence_id);

      var lastIndex = locals.images.length - 1;
      async.eachOfSeries(locals.images || [], (image, index, callback) => {
        if (ERR(err, callback)) return;

        var jobOptions = {
          course_id: locals.course ? locals.course.id : null,
          type: 'image_sync',
          description: `Pull image from Docker Hub and push to PL registry: ${image.image}`,
          job_sequence_id,
        };

        if (index === lastIndex) {
          jobOptions.last_in_sequence = true;
        }

        serverJobs.createJob(jobOptions, (err, job) => {
          if (err) {
            logger.error('Error in createJob()', err);
            serverJobs.failJobSequence(job_sequence_id);
            return callback(err);
          }
          debug('successfully created job ', { job_sequence_id });

          // continue executing here to launch the actual job
          dockerUtil.pullAndPushToECR(image.image, auth, job, (err) => {
            if (err) {
              job.fail(error.newMessage(err, `Error syncing ${image.image}`));
              return callback(err);
            }

            job.succeed();
            callback(null);
          });
        });
      });
    });
  });
};
