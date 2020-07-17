const config = require('config');
const octokit = require('@octokit/core');

module.exports = {
    getGithubClient: function() {
        if (config.github_client_token === null) {
            return null;
        }
        return new Octokit({ auth: config.github_client_token });
    },

    createRepoFromTemplateAsync: async function(client, repo, template) {
        return await client.request('POST /repos/{template_owner}/{template_repo}/generate', {
            template_owner: config.github_course_owner,
            template_repo: template,
            name: repo,
            owner: config.github_course_owner,
            private: true,
            mediaType: {
                previews: [
                    'baptiste'
                ]
            }
        });
    },

    getFileFromRepoAsync: async function(client, repo, path) {
        const file = await client.request('GET /repos/{owner}/{repo}/contents/{path}', {
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
        await client.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: config.github_course_owner,
            repo: repo_name,
            path: 'infoCourse.json',
            message: 'Update infoCourse.json',
            content: Buffer.from(contents, 'ascii').toString('base64'),
            sha: sha,
        });
    },

    addTeamToRepoAsync: async function(client, repo, team, permission) {
        await client.request('PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}', {
            owner: config.github_course_owner,
            org: config.github_course_owner,
            repo: repo,
            team_slug: team,
            permission: permission,
        });
    },

    addUserToRepoAsync: async function(client, repo, username, permission) {
        await client.request('PUT /repos/{owner}/{repo}/collaborators/{username}', {
            owner: config.github_course_owner,
            repo: repo,
            username: username,
            permission: permission,
        });
    }
};
