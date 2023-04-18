const http = require('http');
const Docker = require('dockerode');

const globalLogger = require('./logger');
const { config } = require('./config');
const lifecycle = require('./lifecycle');

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
module.exports.init = function (callback) {
  const docker = new Docker();

  const handler = (req, res) => {
    if (req.url === '/ping') {
      res.statusCode = healthy ? 200 : 500;
      res.end(healthy ? 'Healthy' : `Unhealthy: ${unhealthyReason}`);
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  };

  const doHealthCheck = () => {
    docker.ping((err) => {
      if (err) {
        module.exports.flagUnhealthy('Docker unreachable');
      }
      setTimeout(doHealthCheck, config.healthCheckInterval);
    });
  };

  docker.ping((err) => {
    if (err) {
      globalLogger.error(`Docker ping failed during healthCheck start: ${err}`);
      return callback(err);
    }

    setTimeout(doHealthCheck, config.healthCheckInterval);

    const server = http.createServer(handler);
    server.listen(config.healthCheckPort, (err) => {
      if (err) {
        globalLogger.error(`Could not start health check server on port ${config.healthCheckPort}`);
        callback(err);
      } else {
        globalLogger.info(`Health check server is listening on port ${config.healthCheckPort}`);
        callback(null);
      }
    });
  });
};

module.exports.flagUnhealthy = function (reason) {
  globalLogger.error(`A health check failed: ${reason}`);
  healthy = false;
  unhealthyReason = reason;
  lifecycle.abandonLaunch();
};

module.exports.isHealthy = function () {
  return healthy;
};
