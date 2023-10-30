const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');

const ERR = require('async-stacktrace');
const { config } = require('./config');
const { logger } = require('@prairielearn/logger');
const serverJobs = require('./server-jobs-legacy');
const courseUtil = require('./courseUtil');
const syncFromDisk = require('../sync/syncFromDisk');
const opsbot = require('./opsbot');
const chunks = require('./chunks');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

/*
  Required configuration options to get this working:
  - config.githubClientToken
  - config.githubCourseOwner
  - config.githubCourseTemplate
  - config.githubMachineTeam
*/

module.exports = {
  /**
   * Creates an octokit client from the client token specified in the config]
   * @returns octokit client that can be passed into the other functions in this module.
   */
  getGithubClient: function () {
    if (config.githubClientToken === null) {
      return null;
    }
    return new Octokit({ auth: config.githubClientToken });
  },

  _waitAsync: function (millis) {
    return new Promise((res, _rej) => {
      setTimeout(res, millis);
    });
  },

  /**
   * Slugs a course shortname into a GitHub repository name.
   * @param short_name Course shortname
   */
  reponameFromShortname(short_name) {
    return 'pl-' + short_name.replace(' ', '').toLowerCase();
  },

  /**
   * Creates a new repository from a given template.
   * @param client Octokit client
   * @param repo Name of the new repo to create
   * @param template Name of the template to use
   */
  createRepoFromTemplateAsync: async function (client, repo, template) {
    await client.repos.createUsingTemplate({
      template_owner: config.githubCourseOwner,
      template_repo: template,
      owner: config.githubCourseOwner,
      name: repo,
      private: true,
    });

    // The above call will complete before the repo itself is actually ready to use,
    // so poll for a bit until all the files are finally copied in
    let repo_up = false;
    const poll_time_ms = 100;
    while (!repo_up) {
      try {
        // If the repo is not ready yet, this will fail with "repo is empty"
        await client.repos.getContent({
          owner: config.githubCourseOwner,
          repo: repo,
        });
        repo_up = true;
      } catch (err) {
        logger.debug(`${repo} is not ready yet, polling again in ${poll_time_ms} ms`);
      }

      if (!repo_up) {
        await module.exports._waitAsync(poll_time_ms);
      }
    }
  },

  /**
   * Pulls the contents of a file from a repository.
   * @param client Octokit client
   * @param repo Repository to get file contents from
   * @param path Path to the file, relative from the root of the repository.
   * @returns An object representing the file data.  Raw contents are stored in the 'contents' key,
   * while the file's SHA is stored in 'sha' (this is needed if you want to update the contents later)
   */
  getFileFromRepoAsync: async function (client, repo, path) {
    const file = await client.repos.getContent({
      owner: config.githubCourseOwner,
      repo: repo,
      path: path,
    });
    return {
      sha: file.data.sha,
      contents: Buffer.from(file.data.content, file.data.encoding).toString('ascii'),
    };
  },

  /**
   * Updates a file's contents in a repository.
   * @param client Octokit client
   * @param repo Repository to set file contents in
   * @param path Path to the file, relative from the root of the repository.
   * @param contents Raw contents of the file, stored as a string.
   * @param sha The file's SHA that is being updated (this is returned in getFileFromRepoAsync).
   */
  putFileToRepoAsync: async function (client, repo, path, contents, sha) {
    await client.repos.createOrUpdateFileContents({
      owner: config.githubCourseOwner,
      repo: repo,
      path: path,
      message: `Update ${path}`,
      // Add a trailing newline to the contents.
      content: Buffer.from(contents + '\n', 'ascii').toString('base64'),
      sha: sha,
    });
  },

  /**
   * Add a team to a specific repository.
   * @param client Octokit client
   * @param repo Repository to update
   * @param team Team to add
   * @param permission String permission to give to the team, can be one of the following:
   *  - pull
   *  - push
   *  - admin
   *  - maintain
   *  - triage
   */
  addTeamToRepoAsync: async function (client, repo, team, permission) {
    await client.teams.addOrUpdateRepoPermissionsInOrg({
      owner: config.githubCourseOwner,
      org: config.githubCourseOwner,
      repo: repo,
      team_slug: team,
      permission: permission,
    });
  },

  /**
   * Invites a user to a specific repository.
   * @param client Octokit client
   * @param repo Repository to update
   * @param username Username to add
   * @param permission String permission to give to the user, can be one of the following:
   *  - pull
   *  - push
   *  - admin
   *  - maintain
   *  - triage
   */
  addUserToRepoAsync: async function (client, repo, username, permission) {
    await client.repos.addCollaborator({
      owner: config.githubCourseOwner,
      repo: repo,
      username: username,
      permission: permission,
    });
  },

  /**
   *
   * @param {any} options
   * @param {string} job_sequence_id
   * @param {string} user_id
   * @param {(job: import('./server-jobs-legacy').Job) => Promise<void>} func
   * @returns
   */
  _runJobAsync: function (options, job_sequence_id, user_id, func) {
    return new Promise((resolve, reject) => {
      options = _.defaults(
        {
          user_id: user_id,
          authn_user_id: user_id,
          job_sequence_id,
          on_success: resolve,
          on_error: reject,
        },
        options,
      );

      serverJobs.createJob(options, function (err, job) {
        if (err) {
          logger.error('Error in createJob()', err);
          serverJobs.failJobSequence(job_sequence_id);
          reject(err);
          return;
        }
        func(job)
          .then(() => {
            job.succeed();
            resolve();
          })
          .catch((err) => {
            job.fail(err);
            // Give a descriptive error message
            const err_msg = `Failure while running job "${job.options.description}":\n` + `${err}`;
            reject(new Error(err_msg));
          });
      });
    });
  },

  _runJobCommandAsync: function (options, job_sequence_id, user_id) {
    return new Promise((resolve, reject) => {
      options = _.defaults(
        {
          user_id: user_id,
          authn_user_id: user_id,
          job_sequence_id,
          on_success: resolve,
        },
        options,
      );

      serverJobs.spawnJob(options, (err, job) => {
        if (ERR(err, reject)) return;
        job.options.on_error = () => {
          // Give a descriptive error message
          const err_msg = `Failure while running job "${options.description}":\n` + `${job.output}`;
          reject(new Error(err_msg));
        };
      });
    });
  },

  /**
   * Starts a new server job to create a course GitHub repo, add it to the database, and then sync it locally.
   * @params options Options for creating the course, should contain the following keys:
   * - short_name
   * - title
   * - institution_id
   * - display_timezone
   * - path
   * - repo_short_name
   * - github_user
   * - course_request_id
   * @params authn_user Authenticated user that is creating the course.
   * @params callback Callback to run once the job sequence is created.  Will contain the sequence id as an argument.
   */
  createCourseRepoJob: function (options, authn_user, callback) {
    const worker_function = async (job_sequence_id) => {
      const client = module.exports.getGithubClient();
      if (client === null) {
        // If we are running locally and don't have a client, then just exit early
        await module.exports._runJobAsync(
          {
            type: 'exit_early',
            description: 'Nothing to do, exiting...',
            last_in_sequence: true,
          },
          job_sequence_id,
          authn_user.user_id,
          async () => {
            return;
          },
        );
        return;
      }

      // As a debug step, show the course information given to us since the
      // info can be changed by an admin before the job is run
      await module.exports._runJobAsync(
        { type: 'info', description: 'Show course information' },
        job_sequence_id,
        authn_user.user_id,
        async (job) => {
          job.info(`Creating course ${options.short_name}`);
          job.info(JSON.stringify(options, null, 4));
        },
      );

      // Create base github repo from template
      await module.exports._runJobAsync(
        {
          type: 'create_repo',
          description: 'Creating repository from template',
        },
        job_sequence_id,
        authn_user.user_id,
        async (job) => {
          await module.exports.createRepoFromTemplateAsync(
            client,
            options.repo_short_name,
            config.githubCourseTemplate,
          );
          job.info(`Created repository ${options.repo_short_name}`);

          // Find main branch (which is the only branch in the new repo).
          // The output of this is array of objects following:
          // https://docs.github.com/en/rest/reference/repos#list-branches
          const branches = (
            await client.repos.listBranches({
              owner: config.githubCourseOwner,
              repo: options.repo_short_name,
            })
          ).data;
          if (branches.length !== 1) {
            throw new Error(`New repo has ${branches.length} branches, expected one.`);
          }
          options.branch = branches[0].name || config.githubMainBranch;
          job.info(`Main branch for new repository: "${options.branch}"`);
        },
      );

      // Update the infoCourse.json file by grabbing the original and JSON editing it.
      await module.exports._runJobAsync(
        { type: 'update_info_course', description: 'Updating infoCourse.json' },
        job_sequence_id,
        authn_user.user_id,
        async (job) => {
          let { sha: sha, contents } = await module.exports.getFileFromRepoAsync(
            client,
            options.repo_short_name,
            'infoCourse.json',
          );
          job.info(`Loaded infoCourse.json file (SHA ${sha})`);

          const courseInfo = JSON.parse(contents);
          courseInfo.uuid = uuidv4();
          courseInfo.name = options.short_name;
          courseInfo.title = options.title;
          courseInfo.timezone = options.display_timezone;

          const newContents = JSON.stringify(courseInfo, null, 4);
          job.verbose('New infoCourse.json file:');
          job.verbose(newContents);

          await module.exports.putFileToRepoAsync(
            client,
            options.repo_short_name,
            'infoCourse.json',
            newContents,
            sha,
          );
          job.info('Uploaded new infoCourse.json file');
        },
      );

      // Add machine and instructor to the repo
      await module.exports._runJobAsync(
        { type: 'add_machine', description: 'Adding machine team to repo' },
        job_sequence_id,
        authn_user.user_id,
        async (job) => {
          await module.exports.addTeamToRepoAsync(
            client,
            options.repo_short_name,
            config.githubMachineTeam,
            'admin',
          );
          job.info(
            `Added team ${config.githubMachineTeam} as administrator of repo ${options.repo_short_name}`,
          );
        },
      );
      if (options.github_user) {
        await module.exports._runJobAsync(
          {
            type: 'add_instructor',
            description: 'Adding instructor to repository',
          },
          job_sequence_id,
          authn_user.user_id,
          async (job) => {
            try {
              await module.exports.addUserToRepoAsync(
                client,
                options.repo_short_name,
                options.github_user,
                'admin',
              );
              job.info(
                `Added user ${options.github_user} as administrator of repo ${options.repo_short_name}`,
              );
            } catch (err) {
              job.error(`Could not add user "${options.github_user}": ${err}`);
            }
          },
        );
      }

      // Insert the course into the courses table
      let inserted_course;
      await module.exports._runJobAsync(
        { type: 'update_courses', description: 'Adding course to database' },
        job_sequence_id,
        authn_user.user_id,
        async (job) => {
          const sql_params = [
            options.institution_id,
            options.short_name,
            options.title,
            options.display_timezone,
            options.path,
            `git@github.com:${config.githubCourseOwner}/${options.repo_short_name}.git`,
            options.branch,
            authn_user.user_id,
          ];
          inserted_course = (await sqldb.callAsync('courses_insert', sql_params)).rows[0];
          job.verbose('Inserted course into database:');
          job.verbose(JSON.stringify(inserted_course, null, 4));
        },
      );

      // Give the owner required permissions
      await module.exports._runJobAsync(
        { type: 'update_', description: 'Giving user owner permission' },
        job_sequence_id,
        authn_user.user_id,
        async () => {
          const sql_params = {
            course_id: inserted_course.id,
            course_request_id: options.course_request_id,
          };
          await sqldb.queryOneRowAsync(sql.set_course_owner_permission, sql_params);
        },
      );

      // Automatically sync the new course. This part is shamelessly stolen
      // from `pages/shared/syncHelpers.js`.
      const git_env = process.env;
      if (config.gitSshCommand != null) {
        git_env.GIT_SSH_COMMAND = config.gitSshCommand;
      }
      await module.exports._runJobCommandAsync(
        {
          type: 'clone_from_git',
          description: 'Clone from remote git repository',
          command: 'git',
          arguments: ['clone', inserted_course.repository, inserted_course.path],
          env: git_env,
        },
        job_sequence_id,
        authn_user.user_id,
      );
      let sync_result;
      await module.exports._runJobAsync(
        {
          type: 'sync_from_disk',
          description: 'Sync git repository to database',
          last_in_sequence: !config.chunksGenerator,
        },
        job_sequence_id,
        authn_user.user_id,
        async function (job) {
          sync_result = await syncFromDisk.syncDiskToSqlAsync(
            inserted_course.path,
            inserted_course.id,
            job,
          );
        },
      );

      // If we have chunks enabled, then create associated chunks for the new course
      if (config.chunksGenerator) {
        await module.exports._runJobAsync(
          {
            type: 'load_chunks',
            description: 'Create course chunks',
            last_in_sequence: true,
          },
          job_sequence_id,
          authn_user.user_id,
          async (job) => {
            const chunkChanges = await chunks.updateChunksForCourse({
              coursePath: inserted_course.path,
              courseId: inserted_course.id,
              courseData: sync_result.courseData,
            });
            chunks.logChunkChangesToJob(chunkChanges, job);
          },
        );
      }

      await module.exports._runJobAsync(
        {
          type: 'update_commit_hash',
          description: 'Update course commit hash',
        },
        job_sequence_id,
        authn_user.user_id,
        async () => {
          await courseUtil.updateCourseCommitHashAsync(inserted_course);
        },
      );
    };

    // Create a server job to wrap the course creation process
    serverJobs.createJobSequence(
      {
        user_id: authn_user.user_id,
        authn_user_id: authn_user.user_id,
        type: 'create_course_repo',
        description: 'Create course repository from request',
        course_request_id: options.course_request_id,
      },
      async (err, job_sequence_id) => {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        try {
          await worker_function(job_sequence_id);
          await sqldb.queryAsync(sql.set_course_request_status, {
            status: 'approved',
            course_request_id: options.course_request_id,
          });
        } catch (err) {
          await sqldb.queryAsync(sql.set_course_request_status, {
            status: 'failed',
            course_request_id: options.course_request_id,
          });
          opsbot
            .sendCourseRequestMessage(
              `*Failed to create course "${options.short_name}"*\n\n` +
                '```\n' +
                `${err.message.trim()}\n` +
                '```',
            )
            .catch((err) => logger.error(err));
        }
      },
    );
  },
};
