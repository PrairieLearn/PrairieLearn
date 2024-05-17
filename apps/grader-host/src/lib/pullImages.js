// @ts-check
import { ECRClient } from '@aws-sdk/client-ecr';
import * as async from 'async';
import ERR from 'async-stacktrace';
import Docker from 'dockerode';

import { DockerName, setupDockerAuth } from '@prairielearn/docker-utils';
import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';
import logger from './logger.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default function pullImages(callback) {
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
      async () => {
        if (config.cacheImageRegistry) {
          logger.info('Authenticating to docker');
          const ecr = new ECRClient(makeAwsClientConfig());
          dockerAuth = await setupDockerAuth(ecr);
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
            ((callback) => {
              var ourAuth = {};
              logger.info(
                `Pulling latest version of "${image}" image from ${
                  config.cacheImageRegistry || 'default registry'
                }`,
              );
              var repository = new DockerName(image);
              if (config.cacheImageRegistry) {
                repository.setRegistry(config.cacheImageRegistry);
                ourAuth = dockerAuth;
              }
              const params = {
                fromImage: repository.getRegistryRepo(),
                tag: repository.getTag() || 'latest',
              };

              docker.createImage(ourAuth, params, (err, stream) => {
                if (ERR(err, callback)) return;
                if (!stream) throw new Error('Missing stream from createImage()');

                docker.modem.followProgress(
                  stream,
                  (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                  },
                  (output) => {
                    logger.info('docker output:', output);
                  },
                );
              });
            })((err) => {
              // if an error occurs during image pull, log it but keep going
              if (err) logger.error(`Error pulling "${image}"`, err);
              callback(null);
            });
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          },
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
}
