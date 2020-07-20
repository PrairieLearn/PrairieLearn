const config = require('config');
const octokit = require('@octokit/rest');
const ERR = require('async-stacktrace');
const logger = require('../lib/logger');

/*
  Required configuration options to get this working:
  - config.github_client_token
  - config.github_course_owner
  - config.github_course_template
  - config.github_machine_team
*/

module.exports = {
    getGithubClient: function() {
        if (config.github_client_token === null) {
            return null;
        }
        return new Octokit({ auth: config.github_client_token });
    },

    _waitAsync: function(millis) {
        return new Promise((res, _rej) => {
            setTimeout(res, millis);
        });
    }

    createRepoFromTemplateAsync: async function(client, repo, template) {
        await client.repos.createUsingTemplate({
            template_owner: config.github_course_owner,
            template_repo: template,
            owner: config.github_course_owner,
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
                    owner: config.github_course_owner,
                    repo: repo
                });
                repo_up = true;
            } catch (err) {
                logger.info(`${repo} is not ready yet, polling again in ${poll_time_ms} ms`);
            }

            if (!repo_up) {
                await module.exports._waitAsync(poll_time_ms);
            }
        }
    },

    getFileFromRepoAsync: async function(client, repo, path) {
        const file = await client.repos.getContent({
            owner: config.github_course_owner,
            repo: repo,
            path: path,
        });
        return {
            sha: file.data.sha,
            contents: (Buffer.from(file.data.content, file.data.encoding)).toString('ascii'),
        };
    },

    putFileToRepoAsync: async function(client, repo, path, contents, sha) {
        await client.repos.createOrUpdateFileContents({
            owner: config.github_course_owner,
            repo: repo_name,
            path: path
            message: `Update ${path}`,
            content: Buffer.from(contents, 'ascii').toString('base64'),
            sha: sha,
        });
    },

    addTeamToRepoAsync: async function(client, repo, team, permission) {
        await client.teams.addOrUpdateRepoPermissionsInOrg({
            owner: config.github_course_owner,
            org: config.github_course_owner,
            repo: repo,
            team_slug: team,
            permission: permission,
        });
    },

    addUserToRepoAsync: async function(client, repo, username, permission) {
        await client.repos.addCollaborator({
            owner: config.github_course_owner,
            repo: repo,
            username: username,
            permission: permission,
        });
    }

    createCourseRepoAsync: async function(short_name, title, instructor_github) {
        const client = module.exports.getGithubClient();
        const repo = 'pl-' + short_name.replace(' ', '').toLowerCase();

        logger.log(`Creating GitHub repository for ${repo}`);
        await module.exports.createRepoFromTemplateAsync(client, repo, config.github_course_template);

        /* Update the infoCourse.json file by grabbing the original and JSON editing it. */
        let {sha: sha, courseInfo: contents} = await module.exports.getFileFromRepoAsync(client, repo, 'infoCourse.json');
        let courseInfo = JSON.parse(courseInfo);
        courseInfo.uuid = uuidv4();
        courseInfo.name = short_name;
        courseInfo.title = title;
        courseInfo = JSON.stringify(courseInfo, null, 4);
        await module.exports.putFileToRepoAsync(client, repo, 'infoCourse.json', courseInfo, sha);

        /* Add machine and instructor to the repo */
        await module.exports.addTeamToRepoAsync(client, repo, config.github_machine_team, 'admin');
        if (instructor_github) {
            await module.exports.addUserToRepoAsync(client, repo, instructor_github, 'admin');
        }
    }
};
