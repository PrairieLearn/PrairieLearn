const ERR = require('async-stacktrace');
const request = require('request');

const config = require('./config.js');
const logger = require('./logger');

module.exports = {
    controlContainer(workspace_id, action, callback) {
        const options = {
            json: {
                workspace_id: workspace_id,
                action: action,
            },
        };
        request.post(`http://${config.workspaceContainerLocalhost}:${config.workspaceContainerPort}/`, options, (err, res, body) => {
            if (ERR(err, callback)) return;
            logger.info(`controlContainer ${action} statusCode: ${res.statusCode}`);
            logger.info(`controlContainer body: ${body}`);
            if (res.statusCode == 200) {
                if (action == 'init') {
                    logger.info('controlContainer: container started');
                }
                callback(null);
            } else {
                let server_error = 'unknown error';
                if ('json' in body) {
                    if ('data' in body.json) {
                        // need to decode the `data` array to be human readable
                        server_error = new Buffer.from(body.json.data).toString();
                    } else if ('message' in body.json) {
                        server_error = body.json.message;
                    }
                }
                callback(new Error(`controlContainer could not connect to workspace host: ${server_error}`));
            }
        });
    },
};
