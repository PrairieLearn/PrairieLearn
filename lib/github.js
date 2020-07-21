const { Octokit } = require('@octokit/rest');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');
const util = require('util');
const path = require('path');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

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
    getGithubClient: function() {
        if (config.githubClientToken === null) {
            return null;
        }
        return new Octokit({ auth: config.githubClientToken });
    },

    _waitAsync: function(millis) {
        return new Promise((res, _rej) => {
            setTimeout(res, millis);
        });
    },

    /**
     * Creates a new repository from a given template.
     * @param client Octokit client
     * @param repo Name of the new repo to create
     * @param template Name of the template to use
     */
    createRepoFromTemplateAsync: async function(client, repo, template) {
        await client.repos.createUsingTemplate({
            template_owner: config.githubCourseOwner,
            template_repo: template,
            owner: config.githubCourseOwner,
            name: repo,
            private: true,
        });

        /* The above call will complete before the repo itself is actually ready to use,
           so poll for a bit until all the files are finally copied in */
        let repo_up = false;
        const poll_time_ms = 100;
        while (!repo_up) {
            try {
                /* If the repo is not ready yet, this will fail with "repo is empty" */
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
    getFileFromRepoAsync: async function(client, repo, path) {
        const file = await client.repos.getContent({
            owner: config.githubCourseOwner,
            repo: repo,
            path: path,
        });
        return {
            sha: file.data.sha,
            contents: (Buffer.from(file.data.content, file.data.encoding)).toString('ascii'),
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
    putFileToRepoAsync: async function(client, repo, path, contents, sha) {
        await client.repos.createOrUpdateFileContents({
            owner: config.githubCourseOwner,
            repo: repo,
            path: path,
            message: `Update ${path}`,
            content: Buffer.from(contents + '\n', 'ascii').toString('base64'), /* Add ending newline */
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
    addTeamToRepoAsync: async function(client, repo, team, permission) {
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
    addUserToRepoAsync: async function(client, repo, username, permission) {
        await client.repos.addCollaborator({
            owner: config.githubCourseOwner,
            repo: repo,
            username: username,
            permission: permission,
        });
    },

    /**
     * Creates and initializes a repository for a course.
     * Will automatically set up the infoCourse.json file with the course settings and a fresh UUID
     * @params short_name Rubric and number for the course (i.e. XC 101)
     * @params title Long name of the course (i.e. Example Course)
     * @params instructor_github The instructor's github name (can be null to skip adding them)
     * @return Name of the newly created repository
     */
    createCourseRepoAsync: async function(short_name, title, instructor_github) {
        const client = module.exports.getGithubClient();
        const repo = 'pl-' + short_name.replace(' ', '').toLowerCase();
        if (client === null) {
            /* If we are running locally and don't have a client, then just exit early */
            return repo;
        }

        await module.exports.createRepoFromTemplateAsync(client, repo, config.githubCourseTemplate);

        /* Update the infoCourse.json file by grabbing the original and JSON editing it. */
        let {sha: sha, contents: courseInfo} = await module.exports.getFileFromRepoAsync(client, repo, 'infoCourse.json');
        courseInfo = JSON.parse(courseInfo);
        courseInfo.uuid = uuidv4();
        courseInfo.name = short_name;
        courseInfo.title = title;
        courseInfo = JSON.stringify(courseInfo, null, 4);
        await module.exports.putFileToRepoAsync(client, repo, 'infoCourse.json', courseInfo, sha);

        /* Add machine and instructor to the repo */
        await module.exports.addTeamToRepoAsync(client, repo, config.githubMachineTeam, 'admin');
        if (instructor_github) {
            try {
                await module.exports.addUserToRepoAsync(client, repo, instructor_github, 'admin');
            } catch (err) {
                logger.error(`Could not add user "${instructor_github}": ${err}`);
            }
        }

        return repo;
    },

    /**
     * Callback-based version of above
     */
    createCourseRepo: function(short_name, title, instructor_github, callback) {
        return util.callbackify(module.exports.createCourseRepoAsync)(short_name, title, instructor_github, callback);
    },

    /**
     * From a course request, creates a course page on GitHub and inserts it into the database.
     * @param course_request_id Course request to create a course from.
     * @param authn_user Authenticated user that is authorizing the request.
     * @param Name of the newly created repository.
     */
    createAndAddCourseFromRequestAsync: async function(course_request_id, authn_user) {
        /* Create the repo on GitHub */
        const course_request = await sqldb.queryOneRowAsync(sql.get_course_request, {course_request_id});
        const repo = await module.exports.createCourseRepoAsync(course_request.rows[0].short_name, course_request.rows[0].title, course_request.rows[0].github_user);

        /* Insert the course into the courses table */
        let sql_params = [
            course_request_id,
            null,
            path.join(config.coursesRoot, repo),
            `git@github.com:${config.githubCourseOwner}/${repo}.git`,
            authn_user.id,
        ];
        const inserted_course = await sqldb.callAsync('courses_insert_from_request', sql_params);

        /* Give the owner required permissions */
        sql_params = {
            'course_id': inserted_course.rows[0].id,
            'user_id': course_request.rows[0].user_id,
        };
        await sqldb.queryOneRowAsync(sql.set_course_owner_permission, sql_params);

        /* TODO: automatically sync the course */

        await sqldb.queryAsync(sql.set_course_request_approved, { course_request_id });
        return repo;
    },

    /**
     * Callback-based version of above
     */
    createAndAddCourseFromRequest: async function(course_request_id, authn_user_id, callback) {
        return util.callbackify(module.exports.createAndAddCourseFromRequestAsync)(course_request_id, authn_user_id, callback);
    },
};
