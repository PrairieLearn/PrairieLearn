const ERR = require('async-stacktrace');
const async = require('async');
const Docker = require('dockerode');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const logger = require('./logger');
const dockerUtil = require('./dockerUtil');
const sql = sqlLoader.loadSqlEquiv(__filename);
const config = require('./config').config;

module.exports = function (callback) {
  const docker = new Docker();
  var dockerAuth = {};

  async.waterfall(
    [
      (callback) => {
        logger.info('Pinging docker');
        docker.ping((err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        if (config.cacheImageRegistry) {
          logger.info('Authenticating to docker');
          dockerUtil.setupDockerAuth((err, auth) => {
            if (ERR(err, callback)) return;
            dockerAuth = auth;
            callback(null);
          });
        } else {
          callback(null);
        }
      },
      (callback) => {
        logger.info('Querying for recent images');
        sqldb.query(sql.select_recent_images, [], (err, results) => {
          if (ERR(err, callback)) return;
          const images = results.rows.map((row) => row.external_grading_image);
          callback(null, images);
        });
      },
      (images, callback) => {
        logger.info(`Need to pull ${images.length} images`);
        async.eachLimit(
          images,
          config.parallelInitPulls,
          (image, callback) => {
            let callbackCalled = false;
            var ourAuth = {};
            logger.info(
              `Pulling latest version of "${image}" image from ${
                config.cacheImageRegistry || 'default registry'
              }`
            );
            var repository = new dockerUtil.DockerName(image);
            if (config.cacheImageRegistry) {
              repository.registry = config.cacheImageRegistry;
              ourAuth = dockerAuth;
            }
            const params = {
              fromImage: repository.getRegistryRepo(),
              tag: repository.getTag() || 'latest',
            };

            docker.createImage(ourAuth, params, (err, stream) => {
              if (err) {
                // Just log the error, don't pass it to callback() because
                // we want to keep going.
                logger.error(`Error pulling "${image}" (createImage)`, err);
                if (!callbackCalled) {
                  callbackCalled = true;
                  callback(null);
                }
                return;
              }

              docker.modem.followProgress(
                stream,
                (err) => {
                  if (err) {
                    // Just log the error, don't pass it to callback() because
                    // we want to keep going.
                    logger.error(`Error pulling "${image}" (followProgress)`, err);
                  }
                  if (!callbackCalled) {
                    callbackCalled = true;
                    callback(null);
                  }
                },
                (output) => {
                  logger.info('docker output:', output);
                }
              );
            });
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
  );
};
