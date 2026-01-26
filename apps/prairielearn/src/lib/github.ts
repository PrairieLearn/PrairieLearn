import * as path from 'path';

import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { insertCourse, updateCourseCommitHash } from '../models/course.js';
import { syncDiskToSql } from '../sync/syncFromDisk.js';

import { logChunkChangesToJob, updateChunksForCourse } from './chunks.js';
import { config } from './config.js';
import { type Course, type User } from './db-types.js';
import { sendCourseRequestMessage } from './opsbot.js';
import { TEMPLATE_COURSE_PATH } from './paths.js';
import { formatJsonWithPrettier } from './prettier.js';
import { type ServerJob, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/*
  Required configuration options to get this working:
  - config.githubClientToken
  - config.githubCourseOwner
  - config.githubMachineTeam
*/

/**
 * Creates an octokit client from the client token specified in the config.
 */
function getGithubClient() {
  if (config.githubClientToken === null) {
    return null;
  }
  return new Octokit({ auth: config.githubClientToken });
}

/**
 * Creates a new, empty repository.
 * @param client Octokit client
 * @param repo Name of the new repository to create
 */
async function createEmptyRepository(client: Octokit, repo: string) {
  await client.repos.createInOrg({
    org: config.githubCourseOwner,
    owner: config.githubCourseOwner,
    name: repo,
    private: true,
  });
}

/**
 * Adds a file's contents in a repository.
 * @param client Octokit client
 * @param repo Repository to set file contents in
 * @param path Path to the file, relative from the root of the repository.
 * @param contents Raw contents of the file, stored as a string.
 */
async function addFileToRepo(client: Octokit, repo: string, path: string, contents: string) {
  await client.repos.createOrUpdateFileContents({
    owner: config.githubCourseOwner,
    repo,
    path,
    message: `Update ${path}`,
    // Add a trailing newline to the contents.
    content: Buffer.from(contents + '\n', 'ascii').toString('base64'),
  });
}

/**
 * Add a team to a specific repository.
 * @param client Octokit client
 * @param repo Repository to update
 * @param team Team to add
 * @param permission String permission to give to the team
 */
async function addTeamToRepo(
  client: Octokit,
  repo: string,
  team: string,
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin',
) {
  await client.teams.addOrUpdateRepoPermissionsInOrg({
    owner: config.githubCourseOwner,
    org: config.githubCourseOwner,
    repo,
    team_slug: team,
    permission,
  });
}

/**
 * Invites a user to a specific repository.
 * @param client Octokit client
 * @param repo Repository to update
 * @param username Username to add
 * @param permission String permission to give to the user
 */
async function addUserToRepo(
  client: Octokit,
  repo: string,
  username: string,
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin',
) {
  await client.repos.addCollaborator({
    owner: config.githubCourseOwner,
    repo,
    username,
    permission,
  });
}

/**
 * Starts a new server job to create a course GitHub repo, add it to the database, and then sync it locally.
 * @param options Options for creating the course, should contain the following keys:
 * @param options.short_name - The short name of the course.
 * @param options.title - The title of the course.
 * @param options.institution_id - The institution ID of the course.
 * @param options.display_timezone - The display timezone of the course.
 * @param options.path - The path of the course.
 * @param options.repo_short_name - The short name of the repository.
 * @param options.github_user - The GitHub username of the instructor.
 * @param options.course_request_id - The course request ID.
 * @param authn_user Authenticated user that is creating the course.
 */
export async function createCourseRepoJob(
  options: {
    short_name: string;
    title: string;
    institution_id: string;
    display_timezone: string;
    path: string;
    repo_short_name: string;
    github_user: string | null;
    course_request_id: string;
  },
  authn_user: User,
) {
  const createCourseRepo = async (job: ServerJob) => {
    const client = getGithubClient();
    if (client === null) {
      // If we are running locally and don't have a client, then just exit early
      job.info('Nothing to do, exiting...');
      return;
    }

    // As a debug step, show the course information given to us since the
    // info can be changed by an admin before the job is run.
    job.info(`Creating course ${options.short_name}`);
    job.info(JSON.stringify(options, null, 4));

    // Create an empty repository for the course
    job.info('Creating empty repository');
    await createEmptyRepository(client, options.repo_short_name);
    job.info(`Created repository ${options.repo_short_name}`);

    job.info('Creating infoCourse.json based on template');
    const infoCoursePath = path.join(TEMPLATE_COURSE_PATH, 'infoCourse.json');
    const infoCourse = JSON.parse(await fs.readFile(infoCoursePath, 'utf-8'));

    infoCourse.name = options.short_name;
    infoCourse.title = options.title;
    infoCourse.timezone = options.display_timezone;

    const newContents = await formatJsonWithPrettier(JSON.stringify(infoCourse));
    job.verbose('New infoCourse.json file:');
    job.verbose(newContents);

    await addFileToRepo(client, options.repo_short_name, 'infoCourse.json', newContents);
    job.info('Uploaded new infoCourse.json file');

    // Copy the template .gitignore file
    job.info('Copying .gitignore file');
    const gitignorePath = path.join(TEMPLATE_COURSE_PATH, '.gitignore');
    const gitignoreContents = await fs.readFile(gitignorePath, 'utf-8');
    await addFileToRepo(client, options.repo_short_name, '.gitignore', gitignoreContents);
    job.info('Uploaded new .gitignore file');

    job.info('Copying README.md file');
    const readmePath = path.join(TEMPLATE_COURSE_PATH, 'README.md');
    const readmeContents = await fs.readFile(readmePath, 'utf-8');
    await addFileToRepo(client, options.repo_short_name, 'README.md', readmeContents);
    job.info('Uploaded new README.md file');

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
    const branch = branches[0].name;
    job.info(`Main branch for new repository: "${branch}"`);

    // Add machine and instructor to the repo
    job.info('Adding machine team to repo');
    await addTeamToRepo(client, options.repo_short_name, config.githubMachineTeam, 'admin');
    job.info(
      `Added team ${config.githubMachineTeam} as administrator of repo ${options.repo_short_name}`,
    );

    if (options.github_user) {
      job.info('Adding instructor to repo');
      try {
        await addUserToRepo(client, options.repo_short_name, options.github_user, 'admin');
        job.info(
          `Added user ${options.github_user} as administrator of repo ${options.repo_short_name}`,
        );
      } catch (err: any) {
        job.error(`Could not add user "${options.github_user}": ${err}`);
      }
    }

    // Insert the course into the courses table
    job.info('Adding course to database');
    const repository = `git@github.com:${config.githubCourseOwner}/${options.repo_short_name}.git`;
    const inserted_course = await insertCourse({
      institution_id: options.institution_id,
      short_name: options.short_name,
      title: options.title,
      display_timezone: options.display_timezone,
      path: options.path,
      repository,
      branch,
      authn_user_id: authn_user.id,
    });
    job.verbose('Inserted course into database:');
    job.verbose(JSON.stringify(inserted_course, null, 4));

    // Give the owner required permissions
    job.info('Giving user owner permission');
    await sqldb.executeRow(sql.set_course_owner_permission, {
      course_id: inserted_course.id,
      course_request_id: options.course_request_id,
    });

    // Automatically sync the new course. This part is shamelessly stolen
    // from `pages/shared/syncHelpers.js`.
    const git_env = process.env;
    if (config.gitSshCommand != null) {
      git_env.GIT_SSH_COMMAND = config.gitSshCommand;
    }

    job.info('Clone from remote git repository');
    await job.exec('git', ['clone', repository, inserted_course.path], {
      // Executed in the root directory, but this shouldn't really matter.
      cwd: '/',
      env: git_env,
    });

    job.info('Sync git repository to database');
    const syncResult = await syncDiskToSql(inserted_course.id, inserted_course.path, job);
    if (syncResult.status !== 'complete') {
      // Sync should never fail when creating a brand new repository, if we hit this
      // then we have a problem.
      throw new Error('Sync failed on brand new course repository');
    }

    // If we have chunks enabled, then create associated chunks for the new course
    if (config.chunksGenerator) {
      job.info('Create course chunks');
      const chunkChanges = await updateChunksForCourse({
        coursePath: inserted_course.path,
        courseId: inserted_course.id,
        courseData: syncResult.courseData,
      });
      logChunkChangesToJob(chunkChanges, job);
    }

    job.info('Update course commit hash');
    await updateCourseCommitHash(inserted_course);
  };

  // Create a server job to wrap the course creation process.
  const serverJob = await createServerJob({
    type: 'create_course_repo',
    description: 'Create course repository from request',
    userId: authn_user.id,
    authnUserId: authn_user.id,
    courseRequestId: options.course_request_id,
  });

  serverJob.executeInBackground(async (job) => {
    try {
      await createCourseRepo(job);
      await sqldb.execute(sql.set_course_request_status, {
        status: 'approved',
        course_request_id: options.course_request_id,
      });
    } catch (err: any) {
      await sqldb.execute(sql.set_course_request_status, {
        status: 'failed',
        course_request_id: options.course_request_id,
      });

      try {
        await sendCourseRequestMessage(
          `*Failed to create course "${options.short_name}"*\n\n` +
            '```\n' +
            `${err.message.trim()}\n` +
            '```',
        );
      } catch (err: any) {
        logger.error('Error sending course request message to Slack', err);
        Sentry.captureException(err);
      }

      // Throw the error again so that the server job will be marked as failed.
      throw err;
    }
  });

  return serverJob.jobSequenceId;
}

/**
 * Slugs a course shortname into a GitHub repository name.
 * @param short_name Course shortname
 */
export function reponameFromShortname(short_name: string) {
  return 'pl-' + short_name.replaceAll(' ', '').toLowerCase();
}

/**
 * Returns the HTTPS URL for the course page on GitHub, based on the course's
 * repository. Assumes that the repository is set using the SSH URL for GitHub.
 * Returns null if the URL cannot be retrieved from the repository.
 *
 * @param repository The repository associated to the course
 * @returns The HTTP prefix to access course information on GitHub
 */
export function httpPrefixForCourseRepo(repository: string | null): string | null {
  if (repository) {
    const githubRepoMatch = repository.match(/^git@github.com:\/?(.+?)(\.git)?\/?$/);
    if (githubRepoMatch) {
      return `https://github.com/${githubRepoMatch[1]}`;
    }
  }
  return null;
}

export function courseRepoContentUrl(
  course: Pick<Course, 'repository' | 'branch' | 'example_course'>,
  path = '',
): string | null {
  if (path && !path.startsWith('/')) path = `/${path}`;
  if (course.example_course) {
    // The example course is not found at the root of its repository, so its path is hardcoded
    return `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse${path}`;
  }
  const repoPrefix = httpPrefixForCourseRepo(course.repository);
  return repoPrefix && course.branch ? `${repoPrefix}/tree/${course.branch}${path}` : null;
}
