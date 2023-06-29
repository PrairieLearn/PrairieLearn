// @ts-check
const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const { setTimeout: sleep } = require('node:timers/promises');

const { config } = require('./config');
const { logger } = require('@prairielearn/logger');
const courseUtil = require('./courseUtil');
const syncFromDisk = require('../sync/syncFromDisk');
const opsbot = require('./opsbot');
const chunks = require('./chunks');
const { createServerJob } = require('./server-jobs');

const Sentry = require('@prairielearn/sentry');
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
   * Creates an octokit client from the client token specified in the config.
   */
  getGithubClient: function () {
    if (config.githubClientToken === null) {
      return null;
    }
    return new Octokit({ auth: config.githubClientToken });
  },

  /**
   * Slugs a course shortname into a GitHub repository name.
   * @param {string} short_name Course shortname
   */
  reponameFromShortname(short_name) {
    return 'pl-' + short_name.replace(' ', '').toLowerCase();
  },

  /**
   * Creates a new repository from a given template.
   * @param {Octokit} client Octokit client
   * @param {string} repo Name of the new repo to create
   * @param {string} template Name of the template to use
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
    // so poll for a bit until all the files are finally copied in.
    let repo_up = false;
    const poll_time_ms = 100;
    while (!repo_up) {
      try {
        // If the repo is not ready yet, this will fail with "repo is empty"
        await client.repos.getContent({
          owner: config.githubCourseOwner,
          repo: repo,
          path: '/',
        });
        repo_up = true;
      } catch (err) {
        logger.debug(`${repo} is not ready yet, polling again in ${poll_time_ms} ms`);
      }

      if (!repo_up) {
        await sleep(poll_time_ms);
      }
    }
  },

  /**
   * Pulls the contents of a file from a repository.
   * @param {Octokit} client Octokit client
   * @param {string} repo Repository to get file contents from
   * @param {string} path Path to the file, relative from the root of the repository.
   * @returns An object representing the file data.  Raw contents are stored in the 'contents' key,
   * while the file's SHA is stored in 'sha' (this is needed if you want to update the contents later)
   */
  getFileFromRepoAsync: async function (client, repo, path) {
    const file = await client.repos.getContent({
      owner: config.githubCourseOwner,
      repo: repo,
      path: path,
    });
    if (Array.isArray(file.data) || file.data.type !== 'file') {
      throw new Error('Unexpected array response from GitHub API');
    }
    if (file.data.encoding !== 'base64') {
      throw new Error(`Unexpected encoding from GitHub API: ${file.data.encoding}`);
    }
    return {
      sha: file.data.sha,
      contents: Buffer.from(file.data.content, 'base64').toString('utf-8'),
    };
  },

  /**
   * Updates a file's contents in a repository.
   * @param {Octokit} client Octokit client
   * @param {string} repo Repository to set file contents in
   * @param {string} path Path to the file, relative from the root of the repository.
   * @param {string} contents Raw contents of the file, stored as a string.
   * @param {string} sha The file's SHA that is being updated (this is returned in getFileFromRepoAsync).
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
   * @param { Octokit} client Octokit client
   * @param {string} repo Repository to update
   * @param {string} team Team to add
   * @param {'pull' | 'triage' | 'push' | 'maintain' | 'admin'} permission String permission to give to the team
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
   * @param {Octokit} client Octokit client
   * @param {string} repo Repository to update
   * @param {string} username Username to add
   * @param {'pull' | 'triage' | 'push' | 'maintain' | 'admin'} permission String permission to give to the user
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
   * Starts a new server job to create a course GitHub repo, add it to the database, and then sync it locally.
   * @param options Options for creating the course, should contain the following keys:
   * - short_name
   * - title
   * - institution_id
   * - display_timezone
   * - path
   * - repo_short_name
   * - github_user
   * - course_request_id
   * @param authn_user Authenticated user that is creating the course.
   * @param callback Callback to run once the job sequence is created.  Will contain the sequence id as an argument.
   */
  createCourseRepoJob: async function (options, authn_user) {
    /**
     * @param {import('./server-jobs').ServerJob} job
     */
    const createCourseRepo = async (job) => {
      const client = module.exports.getGithubClient();
      if (client === null) {
        // If we are running locally and don't have a client, then just exit early
        job.info('Nothing to do, exiting...');
        return;
      }

      // As a debug step, show the course information given to us since the
      // info can be changed by an admin before the job is run.
      job.info(`Creating course ${options.short_name}`);
      job.info(JSON.stringify(options, null, 4));

      // Create base github repo from template
      job.info('Creating repository from template');
      await module.exports.createRepoFromTemplateAsync(
        client,
        options.repo_short_name,
        config.githubCourseTemplate
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
      // TODO: use local variable instead of `options`?
      options.branch = branches[0].name || config.githubMainBranch;
      job.info(`Main branch for new repository: "${options.branch}"`);

      // Update the infoCourse.json file by grabbing the original and JSON editing it.
      logger.info('Updating infoCourse.json');
      let { sha: sha, contents } = await module.exports.getFileFromRepoAsync(
        client,
        options.repo_short_name,
        'infoCourse.json'
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
        sha
      );
      job.info('Uploaded new infoCourse.json file');

      // Add machine and instructor to the repo
      logger.info('Adding machine team to repo');
      await module.exports.addTeamToRepoAsync(
        client,
        options.repo_short_name,
        config.githubMachineTeam,
        'admin'
      );
      job.info(
        `Added team ${config.githubMachineTeam} as administrator of repo ${options.repo_short_name}`
      );

      if (options.github_user) {
        logger.info('Adding instructor to repo');
        try {
          await module.exports.addUserToRepoAsync(
            client,
            options.repo_short_name,
            options.github_user,
            'admin'
          );
          job.info(
            `Added user ${options.github_user} as administrator of repo ${options.repo_short_name}`
          );
        } catch (err) {
          job.error(`Could not add user "${options.github_user}": ${err}`);
        }
      }

      // Insert the course into the courses table
      logger.info('Adding course to database');
      const inserted_course = (
        await sqldb.callAsync('courses_insert', [
          options.institution_id,
          options.short_name,
          options.title,
          options.display_timezone,
          options.path,
          `git@github.com:${config.githubCourseOwner}/${options.repo_short_name}.git`,
          options.branch,
          authn_user.user_id,
        ])
      ).rows[0];
      job.verbose('Inserted course into database:');
      job.verbose(JSON.stringify(inserted_course, null, 4));

      // Give the owner required permissions
      logger.info('Giving user owner permission');
      await sqldb.queryOneRowAsync(sql.set_course_owner_permission, {
        course_id: inserted_course.id,
        course_request_id: options.course_request_id,
      });

      // Automatically sync the new course. This part is shamelessly stolen
      // from `pages/shared/syncHelpers.js`.
      const git_env = process.env;
      if (config.gitSshCommand != null) {
        git_env.GIT_SSH_COMMAND = config.gitSshCommand;
      }

      logger.info('Clone from remote git repository');
      await job.exec('git', ['clone', inserted_course.repository, inserted_course.path], {
        // Executed in the root directory, but this shouldn't really matter.
        cwd: '/',
        env: git_env,
      });

      logger.info('Sync git repository to database');
      const sync_result = await syncFromDisk.syncDiskToSqlAsync(
        inserted_course.path,
        inserted_course.id,
        job
      );

      // If we have chunks enabled, then create associated chunks for the new course
      if (config.chunksGenerator) {
        logger.info('Create course chunks');
        const chunkChanges = await chunks.updateChunksForCourse({
          coursePath: inserted_course.path,
          courseId: inserted_course.id,
          courseData: sync_result.courseData,
        });
        chunks.logChunkChangesToJob(chunkChanges, job);
      }

      logger.info('Update course commit hash');
      await courseUtil.updateCourseCommitHashAsync(inserted_course);
    };

    // Create a server job to wrap the course creation process.
    const serverJob = await createServerJob({
      userId: authn_user.user_id,
      authnUserId: authn_user.user_id,
      type: 'create_course_repo',
      description: 'Create course repository from request',
      courseRequestId: options.course_request_id,
    });

    serverJob.executeInBackground(async (job) => {
      try {
        await createCourseRepo(job);
        await sqldb.queryAsync(sql.set_course_request_status, {
          status: 'approved',
          course_request_id: options.course_request_id,
        });
      } catch (err) {
        await sqldb.queryAsync(sql.set_course_request_status, {
          status: 'failed',
          course_request_id: options.course_request_id,
        });

        opsbot.sendCourseRequestMessage(
          `*Failed to create course "${options.short_name}"*\n\n` +
            '```\n' +
            `${err.message.trim()}\n` +
            '```'
        );
        Sentry.captureException(err);
      }
    });

    return serverJob.jobSequenceId;
  },
};
