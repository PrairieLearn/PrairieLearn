const ERR = require('async-stacktrace');
const async = require('async');
const Docker = require('dockerode');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');

const logger = require('./logger');
const util = require('./util');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(callback) {
    const docker = new Docker();
    async.waterfall([
        (callback) => {
            logger.info('Pinging docker');
            docker.ping((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            logger.info('Querying for recent images');
            sqldb.query(sql.select_recent_images, [], (err, results) => {
                if (ERR(err, callback)) return;
                const images = results.rows.map(row => row.external_grading_image);
                callback(null, images);
            });
        },
        (images, callback) => {
            logger.info(`Need to pull ${images.length} images`);
            async.each(images, (image, callback) => {
                logger.info(`Pulling latest version of "${image}" image`);
                const repository = util.parseRepositoryTag(image);
                const params = {
                    fromImage: repository.repository,
                    tag: repository.tag || 'latest'
                };

                docker.createImage(params, (err, stream) => {
                    if (ERR(err, callback)) return;

                    docker.modem.followProgress(stream, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    }, (output) => {
                        logger.info(output);
                    });
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
