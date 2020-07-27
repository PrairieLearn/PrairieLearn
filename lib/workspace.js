const request = require('request');

const config = require('./config.js');
const logger = require('./logger');

module.exports = {

    async controlContainer(callback, workspace_id, action) {
        let promise = new Promise(resolve => {
            request.post(`http://${config.workspaceContainerLocalhost}:${config.workspaceContainerPort}/`, {
                json: {
                    workspace_id: workspace_id,
                    action: action,
                },
            }, (error, response, body) => {
                if (error) {
                    logger.error(`controlContainer error: ${error}`);
                    return;
                }
                logger.info(`controlContainer ${action} statusCode: ${response.statusCode}`);
                logger.info(`controlContainer body: ${body}`);
                if (response.statusCode == 200) {
                    resolve(true);
                } else {
                    /* Display an error if we have one from the server */
                    let server_error = 'unknown error';
                    if (body) {
                        server_error = body;
                    }
                    logger.error(`controlContainer could not connect to workspace host: ${server_error}`);
                    resolve(false);
                }
            });
        });
        let res = await promise;
        if (res) {
            if (action == 'init') {
                logger.info('controlContainer: container started');
            }
        } else {
            logger.error(`controlContainer: failed to execute ${action}.`);
        }
    },
};
