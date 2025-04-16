import { ECRClient } from '@aws-sdk/client-ecr';
import * as async from 'async';
import Docker from 'dockerode';

import { DockerName, setupDockerAuth } from '@prairielearn/docker-utils';
import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';
import logger from './logger.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export default async function pullImages() {
  const docker = new Docker();

  logger.info('Pinging docker');
  await docker.ping();

  let dockerAuth = {};
  if (config.cacheImageRegistry) {
    logger.info('Authenticating to docker');
    const ecr = new ECRClient(makeAwsClientConfig());
    dockerAuth = await setupDockerAuth(ecr);
  }

  logger.info('Querying for recent images');
  const results = await sqldb.queryAsync(sql.select_recent_images, []);
  const images = results.rows.map((row) => row.external_grading_image);

  logger.info(`Need to pull ${images.length} images`);
  await async.eachLimit(images, config.parallelInitPulls, async (image) => {
    try {
      logger.info(
        `Pulling latest version of "${image}" image from ${
          config.cacheImageRegistry || 'default registry'
        }`,
      );
      const repository = new DockerName(image);
      if (config.cacheImageRegistry) {
        repository.setRegistry(config.cacheImageRegistry);
      }

      const stream = await docker.createImage(dockerAuth, {
        fromImage: repository.getRegistryRepo(),
        tag: repository.getTag() || 'latest',
      });

      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          stream,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(null);
            }
          },
          (output) => {
            logger.info('docker output:', output);
          },
        );
      });
    } catch (err) {
      // if an error occurs during image pull, log it but keep going
      logger.error(`Error pulling "${image}"`, err);
    }
  });
}
