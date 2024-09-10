import * as http from 'node:http';

import Docker from 'dockerode';

import { config } from './config.js';
import * as lifecycle from './lifecycle.js';
import globalLogger from './logger.js';

/**
 * Stores our current status. Once we transition to an unhealthy state, there's
 * no going back. We'll be killed eventually.
 */
let healthy = true;
let unhealthyReason = null;

/**
 * We have two levels of health checks here:
 *
 * 1) a /ping endpoint that will send a 200 status if we can connect to the
 *    Docker daemon and a 500 status otherwise.
 * 2) an internal checker that will ping docker at a certain interval and will
 *    kill our process if the daemon can't be reached.
 */
export async function init() {
  const docker = new Docker();

  const doHealthCheck = () => {
    docker.ping((err) => {
      if (err) {
        flagUnhealthy('Docker unreachable');
      }
      setTimeout(doHealthCheck, config.healthCheckInterval);
    });
  };

  await docker.ping().catch((err) => {
    globalLogger.error(`Docker ping failed during healthCheck start: ${err}`);
    throw err;
  });

  setTimeout(doHealthCheck, config.healthCheckInterval);

  const server = http.createServer((req, res) => {
    if (req.url === '/ping') {
      res.statusCode = healthy ? 200 : 500;
      res.end(healthy ? 'Healthy' : `Unhealthy: ${unhealthyReason}`);
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      globalLogger.error(`Could not start health check server on port ${config.healthCheckPort}`);
      reject(err);
    });
    server.once('listening', () => {
      globalLogger.info(`Health check server is listening on port ${config.healthCheckPort}`);
      resolve(null);
    });
    server.listen(config.healthCheckPort);
  });
}

export function flagUnhealthy(reason) {
  globalLogger.error(`A health check failed: ${reason}`);
  healthy = false;
  unhealthyReason = reason;
  lifecycle.abandonLaunch();
}

export function isHealthy() {
  return healthy;
}
