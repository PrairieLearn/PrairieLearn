const ERR = require('async-stacktrace');
const fs = require('fs');
const async = require('async');
const logger = require('../../lib/logger');
const config = require('../../lib/config');
const serverJobs = require('../../lib/server-jobs');
const syncFromDisk = require('../../sync/syncFromDisk');
const requireFrontend = require('../../lib/require-frontend');
const courseUtil = require('../../lib/courseUtil');
const util = require('util');
const chunks = require('../../lib/chunks');
const dockerUtil = require('../../lib/dockerUtil');
const debug = require('debug')('prairielearn:syncHelpers');

const error = require('../../prairielib/lib/error');

module.exports.pullAndUpdate = function (locals, callback) {
  const options = {
    course_id: locals.course.id,
    user_id: locals.user.user_id,
    authn_user_id: locals.authz_data.authn_user.user_id,
    type: 'sync',
    description: 'Pull from remote git repository',
  };
  serverJobs.createJobSequence(options, function (err, job_sequence_id) {
    if (ERR(err, callback)) return;
    callback(null, job_sequence_id);

    const gitEnv = process.env;
    if (config.gitSshCommand != null) {
      gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
    }

    let startGitHash = null;
    let endGitHash = null;

    // We've now triggered the callback to our caller, but we
    // continue executing below to launch the jobs themselves.

    // First define the jobs.
    //
    // We will start with either 1A or 1B below to either clone or
    // update the content.

    const syncStage1A = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
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
        on_success: syncStage2,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const syncStage1B = () => {
      courseUtil.getOrUpdateCourseCommitHash(locals.course, (err, hash) => {
        ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
        startGitHash = hash;
        syncStage1B2();
      });
    };

    const syncStage1B2 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
        type: 'add_git_remote_origin',
        description: 'Updating to latest remote origin address',
        command: 'git',
        arguments: ['remote', 'set-url', 'origin', locals.course.repository],
        working_directory: locals.course.path,
        env: gitEnv,
        on_success: syncStage1B3,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const syncStage1B3 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
        type: 'fetch_from_git',
        description: 'Fetch from remote git repository',
        command: 'git',
        arguments: ['fetch'],
        working_directory: locals.course.path,
        env: gitEnv,
        on_success: syncStage1B4,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const syncStage1B4 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
        type: 'clean_git_repo',
        description: 'Clean local files not in remote git repository',
        command: 'git',
        arguments: ['clean', '-fdx'],
        working_directory: locals.course.path,
        env: gitEnv,
        on_success: syncStage1B5,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const syncStage1B5 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
        type: 'reset_from_git',
        description: 'Reset state to remote git repository',
        command: 'git',
        arguments: ['reset', '--hard', 'origin/' + locals.course.branch],
        working_directory: locals.course.path,
        env: gitEnv,
        on_success: syncStage2,
      };
      serverJobs.spawnJob(jobOptions);
    };

    // After either cloning or fetching and resetting from Git, we'll need
    // to load and store the current commit hash in the database
    const syncStage2 = () => {
      courseUtil.updateCourseCommitHash(locals.course, (err, hash) => {
        ERR(err, (e) => logger.error('Error in updateCourseCommitHash()', e));
        endGitHash = hash;
        syncStage3();
      });
    };

    const syncStage3 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'sync_from_disk',
        description: 'Sync git repository to database',
        job_sequence_id: job_sequence_id,
        on_success: syncStage4,
      };
      serverJobs.createJob(jobOptions, function (err, job) {
        if (err) {
          logger.error('Error in createJob()', err);
          serverJobs.failJobSequence(job_sequence_id);
          return;
        }
        syncFromDisk.syncDiskToSql(
          locals.course.path,
          locals.course.id,
          job,
          function (err, result) {
            if (err) {
              job.fail(err);
              return;
            }

            const checkJsonErrors = () => {
              if (result.hadJsonErrors) {
                job.fail('One or more JSON files contained errors and were unable to be synced');
              } else {
                job.succeed();
              }
            };

            if (config.chunksGenerator) {
              util.callbackify(chunks.updateChunksForCourse)(
                {
                  coursePath: locals.course.path,
                  courseId: locals.course.id,
                  courseData: result.courseData,
                  oldHash: startGitHash,
                  newHash: endGitHash,
                },
                (err) => {
                  if (err) {
                    job.fail(err);
                  } else {
                    checkJsonErrors();
                  }
                }
              );
            } else {
              checkJsonErrors();
            }
          }
        );
      });
    };

    const syncStage4 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'reload_question_servers',
        description: 'Reload question server.js code',
        job_sequence_id: job_sequence_id,
        last_in_sequence: true,
      };
      serverJobs.createJob(jobOptions, function (err, job) {
        if (err) {
          logger.error('Error in createJob()', err);
          serverJobs.failJobSequence(job_sequence_id);
          return;
        }
        const coursePath = locals.course.path;
        requireFrontend.undefQuestionServers(coursePath, job, function (err) {
          if (err) {
            job.fail(err);
          } else {
            job.succeed();
          }
        });
      });
    };

    // Start the first job.
    fs.access(locals.course.path, function (err) {
      if (err) {
        // path does not exist, start with 'git clone'
        syncStage1A();
      } else {
        // path exists, update remote origin address, then 'git fetch' and reset to latest with 'git reset'
        syncStage1B();
      }
    });
  });
};

module.exports.gitStatus = function (locals, callback) {
  const options = {
    course_id: locals.course.id,
    user_id: locals.user.user_id,
    authn_user_id: locals.authz_data.authn_user.user_id,
    type: 'git_status',
    description: 'Show server git status',
  };
  serverJobs.createJobSequence(options, function (err, job_sequence_id) {
    if (ERR(err, callback)) return;
    callback(null, job_sequence_id);

    // We've now triggered the callback to our caller, but we
    // continue executing below to launch the jobs themselves.

    // First define the jobs.

    const statusStage1 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        job_sequence_id: job_sequence_id,
        type: 'describe_git',
        description: 'Describe current git HEAD',
        command: 'git',
        arguments: ['show', '--format=fuller', '--quiet', 'HEAD'],
        working_directory: locals.course.path,
        on_success: statusStage2,
      };
      serverJobs.spawnJob(jobOptions);
    };

    const statusStage2 = function () {
      const jobOptions = {
        course_id: locals.course.id,
        user_id: locals.user.user_id,
        authn_user_id: locals.authz_data.authn_user.user_id,
        type: 'git_history',
        description: 'List git history',
        job_sequence_id: job_sequence_id,
        command: 'git',
        arguments: ['log', '--all', '--graph', '--date=short', '--format=format:%h %cd%d %cn %s'],
        working_directory: locals.course.path,
        last_in_sequence: true,
      };
      serverJobs.spawnJob(jobOptions);
    };

    // Start the first job.
    statusStage1();
  });
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
