// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
import * as util from 'node:util';
const express = require('express');
import * as http from 'node:http';
import fetch from 'node-fetch';
import * as path from 'node:path';
import { S3 } from '@aws-sdk/client-s3';
import { ECRClient } from '@aws-sdk/client-ecr';
import { Upload } from '@aws-sdk/lib-storage';
const Docker = require('dockerode');
import * as fs from 'node:fs';
import * as async from 'async';
import * as fsPromises from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
const argv = require('yargs-parser')(process.argv.slice(2));
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
import * as net from 'node:net';
const asyncHandler = require('express-async-handler');
const bodyParser = require('body-parser');
import { Mutex } from 'async-mutex';
import { DockerName, setupDockerAuth } from '@prairielearn/docker-utils';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import * as workspaceUtils from '@prairielearn/workspace-utils';
import { cache } from '@prairielearn/cache';

import { config, loadConfig } from './lib/config';
import { parseDockerLogs } from './lib/docker';
import * as socketServer from './lib/socket-server';
import { makeS3ClientConfig, makeAwsClientConfig } from './lib/aws';
import { REPOSITORY_ROOT_PATH, APP_ROOT_PATH } from './lib/paths';

const sql = sqldb.loadSqlEquiv(__filename);
const docker = new Docker();

const app = express();
app.use(Sentry.Handlers.requestHandler());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get(
  '/status',
  asyncHandler(async (req, res) => {
    let containers;
    try {
      containers = await docker.listContainers({ all: true });
    } catch (_err) {
      containers = null;
    }

    let db_status;
    try {
      await sqldb.queryAsync(sql.update_load_count, {
        instance_id: workspace_server_settings.instance_id,
      });
      db_status = 'ok';
    } catch (_err) {
      db_status = null;
    }

    if (!containers || !db_status) {
      // We must have both Docker and database access in order to consider
      // ourselves healthy.
      res.status(500);
    } else {
      res.status(200);
    }
    res.json({
      docker: containers,
      postgres: db_status,
    });
  }),
);

// TODO: refactor into RESTful endpoints (https://github.com/PrairieLearn/PrairieLearn/pull/2841#discussion_r467245108)
app.post(
  '/',
  asyncHandler(async (req, res) => {
    const workspace_id = req.body.workspace_id;
    const action = req.body.action;
    if (workspace_id == null) {
      res.status(500).send('Missing workspace_id');
    } else if (action == null) {
      res.status(500).send('Missing action');
    } else if (action === 'init') {
      const useInitialZip = _.get(req.body.options, 'useInitialZip', false);
      await initSequenceAsync(workspace_id, useInitialZip, res);
    } else if (action === 'getGradedFiles') {
      await sendGradedFilesArchive(workspace_id, res);
    } else if (action === 'getLogs') {
      await sendLogs(workspace_id, res);
    } else {
      res.status(500).send(`Action '${action}' undefined`);
    }
  }),
);

app.use(Sentry.Handlers.errorHandler());

let server;
let workspace_server_settings = {};

async
  .series([
    async () => {
      // For backwards compatibility, we'll default to trying to load config
      // files from both the application and repository root.
      //
      // We'll put the app config file second so that it can override anything
      // in the repository root config file.
      let configPaths = [
        path.join(REPOSITORY_ROOT_PATH, 'config.json'),
        path.join(APP_ROOT_PATH, 'config.json'),
      ];

      // If a config file was specified on the command line, we'll use that
      // instead of the default locations.
      if ('config' in argv) {
        configPaths = [argv['config']];
      }

      await loadConfig(configPaths);
      if (config.runningInEc2) {
        // copy discovered variables into workspace_server_settings
        workspace_server_settings.instance_id = config.instanceId;
        workspace_server_settings.hostname = config.hostname;
        workspace_server_settings.server_to_container_hostname = config.hostname;
      } else {
        // Otherwise, use the defaults in the config file
        config.instanceId = config.workspaceDevHostInstanceId;
        workspace_server_settings.instance_id = config.workspaceDevHostInstanceId;
        workspace_server_settings.hostname = config.workspaceDevHostHostname;
        workspace_server_settings.server_to_container_hostname =
          config.workspaceDevContainerHostname;
      }
    },
    async () => {
      if (config.sentryDsn) {
        await Sentry.init({
          dsn: config.sentryDsn,
          environment: config.sentryEnvironment,
        });
      }
    },
    async () => {
      // Always grab the port from the config
      workspace_server_settings.port = config.workspaceHostPort;
    },
    (callback) => {
      const pgConfig = {
        user: config.postgresqlUser,
        database: config.postgresqlDatabase,
        host: config.postgresqlHost,
        password: config.postgresqlPassword ?? undefined,
        max: config.postgresqlPoolSize,
        idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
      };
      logger.verbose(
        `Connecting to database ${pgConfig.user}@${pgConfig.host}:${pgConfig.database}`,
      );
      const idleErrorHandler = function (err) {
        logger.error('idle client error', err);
        // https://github.com/PrairieLearn/PrairieLearn/issues/2396
        process.exit(1);
      };
      sqldb.init(pgConfig, idleErrorHandler, function (err) {
        if (ERR(err, callback)) return;
        logger.verbose('Successfully connected to database');
        callback(null);
      });
    },
    (callback) => {
      server = http.createServer(app);
      server.listen(workspace_server_settings.port);
      logger.info(`Workspace server listening on port ${workspace_server_settings.port}`);
      callback(null);
    },
    async () => socketServer.init(),
    async () => workspaceUtils.init(socketServer.io),
    async () => {
      // Set up a periodic pruning of containers that shouldn't exist.
      //
      // Note that this updates the load count. The cron job that kills workspace
      // hosts will only kill hosts that have a load count of 0. This should ensure
      // that we never kill a host before its had a chance to spin down all its
      // containers (and flush their logs and record their disk usage).
      async function pruneContainersTimeout() {
        try {
          await pruneStoppedContainers();
          await pruneRunawayContainers();
          await sqldb.queryAsync(sql.update_load_count, {
            instance_id: workspace_server_settings.instance_id,
          });
        } catch (err) {
          logger.error('Error pruning containers', err);
          Sentry.captureException(err);
        }

        setTimeout(pruneContainersTimeout, config.workspaceHostPruneContainersSec * 1000);
      }
      setTimeout(pruneContainersTimeout, config.workspaceHostPruneContainersSec * 1000);
    },
    (callback) => {
      // Add ourselves to the workspace hosts directory. After we
      // do this we will start receiving requests so everything else
      // must be initialized before this.
      const params = {
        hostname: workspace_server_settings.hostname + ':' + workspace_server_settings.port,
        instance_id: workspace_server_settings.instance_id,
      };
      sqldb.query(sql.insert_workspace_hosts, params, function (err, _result) {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    async () => {
      // If we have any running workspaces, we're probably recovering from a
      // crash and we should sync files to S3
      const result = await sqldb.queryAsync(sql.recover_crash_workspaces, {
        instance_id: workspace_server_settings.instance_id,
      });
      await async.eachSeries(result.rows, async (ws) => {
        if (ws.state === 'launching') {
          // We don't know what state the container is in, kill it and let the
          // user retry initializing it.
          await workspaceUtils.updateWorkspaceState(ws.id, 'stopped', 'Status unknown');
          await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
            workspace_id: ws.id,
            instance_id: workspace_server_settings.instance_id,
          });
          try {
            const container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
            await killAndRemoveWorkspace(ws.id, container);
          } catch (err) {
            debug(`Couldn't find container: ${err}`);
          }
        }
      });

      // Especially in dev mode, there may be containers that are running but
      // don't correspond to any known workspace. Clean them up.
      const allContainers = await docker.listContainers({
        all: true,
        filters: JSON.stringify({ label: ['prairielearn.workspace-id'] }),
      });
      for (const container of allContainers) {
        const containerWorkspaceId = container.Labels['prairielearn.workspace-id'];
        if (result.rows.some((ws) => ws.id === containerWorkspaceId)) continue;

        logger.info(
          `Killing dangling container ${container.Id} for workspace ${containerWorkspaceId}`,
        );
        await killAndRemoveWorkspace(containerWorkspaceId, docker.getContainer(container.Id));
      }
    },
    async () => {
      await cache.init({
        type: config.cacheType,
        keyPrefix: config.cacheKeyPrefix,
        redisUrl: config.redisUrl,
      });
    },
  ])
  .then(() => {
    logger.info('Workspace host ready');
  })
  .catch(async function (err) {
    Sentry.captureException(err);
    logger.error('Error initializing workspace host:', err);
    await markSelfUnhealthy(err);
  });

/**
 * Remove any recently stopped containers. These are identified by having a
 * non-null launch_uuid and launch_port, but are marked as stopped by the main
 * PrairieLearn instance.
 */
async function pruneStoppedContainers() {
  const instance_id = workspace_server_settings.instance_id;
  const recently_stopped = await sqldb.queryAsync(sql.get_stopped_workspaces, {
    instance_id,
  });
  await async.each(recently_stopped.rows, async (ws) => {
    let container;
    try {
      // Try to grab the container, but don't care if it doesn't exist
      container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
    } catch (_err) {
      // No container
      await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
        workspace_id: ws.id,
        instance_id: workspace_server_settings.instance_id,
      });
      return;
    }
    await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
      workspace_id: ws.id,
      instance_id: workspace_server_settings.instance_id,
    });
    await killAndRemoveWorkspace(ws.id, container);
  });
}

/**
 * Remove any containers that are running but do not have a corresponding launch_uuid in the database.
 */
async function pruneRunawayContainers() {
  const instance_id = workspace_server_settings.instance_id;
  const db_workspaces = await sqldb.queryAsync(sql.get_running_workspaces, {
    instance_id,
  });
  const db_workspaces_uuid_set = new Set(
    db_workspaces.rows.map((ws) => `workspace-${ws.launch_uuid}`),
  );
  let running_workspaces;
  try {
    running_workspaces = await docker.listContainers({ all: true });
  } catch (err) {
    // Nothing to do
    return;
  }

  await async.each(running_workspaces, async (container_info) => {
    if (container_info.Names.length !== 1) return;
    // Remove the preceding forward slash
    const name = container_info.Names[0].substring(1);
    if (!name.startsWith('workspace-') || db_workspaces_uuid_set.has(name)) return;
    const container = docker.getContainer(container_info.Id);
    const containerWorkspaceId = container_info.Labels['prairielearn.workspace-id'];

    await killAndRemoveWorkspace(containerWorkspaceId, container);
  });
}

/**
 * Looks up a docker container by the UUID used to launch it.
 * Throws an exception if the container was not found or if there
 * are multiple containers with the same UUID (this shouldn't happen?)
 * @param {string} launch_uuid UUID to search by
 * @return {Promise<import('dockerode').Container>}
 */
async function _getDockerContainerByLaunchUuid(launch_uuid) {
  try {
    const containers = await docker.listContainers({
      filters: JSON.stringify({ name: [`workspace-${launch_uuid}`] }),
    });
    return docker.getContainer(containers[0].Id);
  } catch (err) {
    logger.error(`Error looking up container for launch_uuid ${launch_uuid}`, err);
    throw err;
  }
}

/**
 * Attempts to kill and remove a container. Will fail silently if the container
 * is already stopped or does not exist.
 *
 * After the container is removed, the workspace's disk usage will be updated.
 *
 * @param {string} workspace_id
 * @param {import('dockerode').Container} container
 */
async function killAndRemoveWorkspace(workspace_id, container) {
  try {
    await container.inspect();

    try {
      await container.kill();
    } catch (err) {
      logger.error('Error killing container', err);
    }

    // Flush all logs from this container to S3. We must do this before the
    // container is removed, otherwise any remaining logs will be lost.
    try {
      await flushLogsToS3(container);
    } catch (err) {
      Sentry.captureException(err);
      logger.error('Error flushing container logs to S3', err);
    }

    try {
      await container.remove();
    } catch (err) {
      Sentry.captureException(err);
      logger.error('Error removing stopped container', err);
    }
  } catch (err) {
    // This container doesn't exist on this machine.
    logger.error('Could not inspect container', err);
    Sentry.captureException(err);
  }

  try {
    await workspaceUtils.updateWorkspaceDiskUsage(workspace_id, config.workspaceHostHomeDirRoot);
  } catch (err) {
    logger.error('Error updating workspace disk usage', err);
    Sentry.captureException(err);
  }
}

/**
 * Marks the host as "unhealthy", we typically want to do this when we hit some unrecoverable error.
 * This will also set the "unhealthy__at" field if applicable.
 *
 * @param {Error | string} reason The reason that this host is unhealthy
 */
async function markSelfUnhealthy(reason) {
  try {
    Sentry.captureException(reason);
    const params = {
      instance_id: workspace_server_settings.instance_id,
      unhealthy_reason: reason,
    };
    await sqldb.queryAsync(sql.mark_host_unhealthy, params);
    logger.warn('Marked self as unhealthy', reason);
  } catch (err) {
    // This could error if we don't even have a DB connection. In that case, we
    // should let the main server mark us as unhealthy.
    logger.error('Could not mark self as unhealthy', err);
  }
}

/**
 * Looks up a workspace object by the workspace id.
 * This object contains all columns in the 'workspaces' table as well as:
 * - local_name (container name)
 * - remote_name (subdirectory name on disk)
 * @param {string | number} workspace_id Workspace ID to search by.
 * @return {Promise<Object>} Workspace object, as described above.
 */
async function _getWorkspaceAsync(workspace_id) {
  const result = await sqldb.queryOneRowAsync(sql.get_workspace, {
    workspace_id,
    instance_id: workspace_server_settings.instance_id,
  });
  const workspace = result.rows[0];
  workspace.local_name = `workspace-${workspace.launch_uuid}`;
  workspace.remote_name = `workspace-${workspace.id}-${workspace.version}`;

  return workspace;
}

const _allocateContainerPortMutex = new Mutex();

/**
 * Allocates and returns an unused port for a workspace.  This will insert the new port into the workspace table.
 * @param {object} workspace Workspace object, should at least contain an id.
 * @return {Promise<number>} Port that was allocated to the workspace.
 */
async function _allocateContainerPort(workspace) {
  // Check if a port is considered free in the database
  async function check_port_db(port) {
    const params = {
      instance_id: workspace_server_settings.instance_id,
      port,
    };
    const result = await sqldb.queryOneRowAsync(sql.get_is_port_occupied, params);
    return !result.rows[0].port_used;
  }

  // Spin up a server to check if a port is free
  async function check_port_server(port) {
    return new Promise((res) => {
      var server = net.createServer();
      server.listen(port, function (_) {
        server.once('close', function () {
          res(true);
        });
        server.close();
      });
      server.on('error', function (_) {
        res(false);
      });
    });
  }

  return _allocateContainerPortMutex.runExclusive(async () => {
    let port;
    let done = false;
    // Max attempts <= 0 means unlimited attempts, > 0 mean a finite number of attempts.
    const max_attempts =
      config.workspaceHostMaxPortAllocationAttempts > 0
        ? config.workspaceHostMaxPortAllocationAttempts
        : Infinity;
    for (let i = 0; !done && i < max_attempts; i++) {
      // Generate a random port from the ranges specified in config.
      port =
        config.workspaceHostMinPortRange +
        Math.floor(
          Math.random() * (config.workspaceHostMaxPortRange - config.workspaceHostMinPortRange),
        );
      if (!(await check_port_db(port))) continue;
      if (!(await check_port_server(port))) continue;
      done = true;
    }
    if (!done || !port) {
      throw new Error(`Failed to allocate port after ${max_attempts} attempts!`);
    }
    await sqldb.queryAsync(sql.set_workspace_launch_port, {
      workspace_id: workspace.id,
      launch_port: port,
      instance_id: workspace_server_settings.instance_id,
    });
    return port;
  });
}

/**
 * @param {object} workspace
 * @param {function} callback
 */
function _checkServer(workspace, callback) {
  const startTimeout = config.workspaceStartTimeoutSec * 1000;
  const healthCheckInterval = config.workspaceHealthCheckIntervalSec * 1000;
  const healthCheckTimeout = config.workspaceHealthCheckTimeoutSec * 1000;

  const startTime = new Date().getTime();
  function checkWorkspace() {
    fetch(
      `http://${workspace_server_settings.server_to_container_hostname}:${workspace.launch_port}/`,
      { signal: AbortSignal.timeout(healthCheckTimeout) },
    )
      .then(() => {
        // We might get all sorts of strange status codes from the server.
        // This is okay since it still means the server is running and we're
        // getting responses. So we don't need to check the response status.
        callback(null, workspace);
      })
      .catch(() => {
        // Do nothing, because errors are expected while the container is launching.
        const endTime = new Date().getTime();
        if (endTime - startTime > startTimeout) {
          const { id, version, launch_uuid } = workspace;
          callback(
            new Error(
              `Max startup time exceeded for workspace ${id} (version ${version}, launch uuid ${launch_uuid})`,
            ),
          );
        } else {
          setTimeout(checkWorkspace, healthCheckInterval);
        }
      });
  }
  checkWorkspace();
}
const _checkServerAsync = util.promisify(_checkServer);

/**
 * Looks up all the question-specific workspace launch settings associated with a workspace id.
 * @param {string | number} workspace_id Workspace ID to search by.
 * @return {Promise<Object>} Workspace launch settings.
 */
async function _getWorkspaceSettingsAsync(workspace_id) {
  const result = await sqldb.queryOneRowAsync(sql.select_workspace_settings, {
    workspace_id,
  });
  const workspace_environment = result.rows[0].workspace_environment || {};

  // Set base URL needed by certain workspaces (e.g., jupyterlab, rstudio)
  workspace_environment['WORKSPACE_BASE_URL'] = `/pl/workspace/${workspace_id}/container/`;

  const settings = {
    workspace_image: result.rows[0].workspace_image,
    workspace_port: result.rows[0].workspace_port,
    workspace_home: result.rows[0].workspace_home,
    workspace_graded_files: result.rows[0].workspace_graded_files,
    workspace_args: result.rows[0].workspace_args || '',
    workspace_enable_networking: !!result.rows[0].workspace_enable_networking,
    // Convert {key: 'value'} to ['key=value'] and {key: null} to ['key'] for Docker API
    workspace_environment: Object.entries(workspace_environment).map(([k, v]) =>
      v === null ? k : `${k}=${v}`,
    ),
  };

  if (config.cacheImageRegistry) {
    const repository = new DockerName(settings.workspace_image);
    repository.setRegistry(config.cacheImageRegistry);
    const newImage = repository.getCombined();
    logger.info(`Using ${newImage} for ${settings.workspace_image}`);
    settings.workspace_image = newImage;
  }

  return settings;
}

async function _pullImage(workspace) {
  if (!config.workspacePullImagesFromDockerHub) {
    logger.info('Not pulling docker image');
    return;
  }

  await workspaceUtils.updateWorkspaceMessage(workspace.id, 'Checking image');
  const workspace_image = workspace.settings.workspace_image;
  logger.info(`Pulling docker image: ${workspace_image}`);

  // We only auth if a specific ECR registry is configured. Otherwise, we'll
  // assume we're pulling from the public Docker Hub registry.
  const ecr = new ECRClient(makeAwsClientConfig());
  const auth = config.cacheImageRegistry ? await setupDockerAuth(ecr) : null;

  let percentDisplayed = false;
  let stream;
  try {
    stream = await docker.pull(workspace_image, { authconfig: auth });
  } catch (err) {
    logger.error(
      `Error pulling "${workspace_image}" image; attempting to fall back to cached version.`,
      err,
    );
    return;
  }

  // We monitor the pull progress to calculate the
  // percentage complete. This is roughly "current / total",
  // but as docker pulls new layers the "total" can
  // increase, which would cause the percentage to
  // decrease. To avoid this, we track a "base" value for
  // both "current" and "total" and compute the percentage
  // as an increment above these values. This ensures that
  // our percentage starts at 0, ends at 100, and never
  // decreases. It has the disadvantage that the percentage
  // will tend to go faster at the start (when we only know
  // about a few layers) and slow down at the end (when we
  // know about all layers). To allow for more accurate
  // progress reporting, we cache the layer details after
  // the first successful pull. This allows us to reference
  // the previously pulled layers and provide a more accurate
  // percantage calculation on any subsequent pulls.
  let progressDetails = (await cache.get(`workspaceProgressInit:${workspace_image}`)) || {};
  let progressDetailsInit = {};
  let current = 0;
  let total = 0;
  let fraction = 0;
  let currentBase;
  let fractionBase;
  let outputCount = 0;
  let percentCache = -1;
  let dateCache = Date.now() - 1e6;

  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => {
        if (err) {
          reject(err);
          return;
        }

        if (!percentDisplayed) {
          resolve(null);
          return;
        }

        const toDatabase = false;
        cache.set(
          `workspaceProgressInit:${workspace_image}`,
          progressDetailsInit,
          1000 * 60 * 60 * 24 * 30, // 30 days
        );
        workspaceUtils
          .updateWorkspaceMessage(workspace.id, `Pulling image (100%)`, toDatabase)
          .catch((err) => {
            logger.error('Error updating workspace message', err);
            Sentry.captureException(err);
          })
          .then(resolve);
      },
      (output) => {
        debug('Docker pull output: ', output);
        if ('progressDetail' in output && output.progressDetail.total) {
          // track different states (Download/Extract)
          // separately by making them separate keys
          const key = `${output.id}/${output.status}`;
          progressDetails[key] = output.progressDetail;
          progressDetailsInit[key] = { ...output.progressDetail, current: 0 };
        }
        current = Object.values(progressDetails).reduce(
          (current, detail) => detail.current + current,
          0,
        );
        const newTotal = Object.values(progressDetails).reduce(
          (total, detail) => detail.total + total,
          0,
        );
        if (outputCount <= 200) {
          // limit progress initially to wait for most layers to be seen
          current = Math.min(current, (outputCount / 200) * newTotal);
        }
        if (newTotal > total) {
          total = newTotal;
          currentBase = current;
          fractionBase = fraction;
        }
        if (total > 0) {
          outputCount++;
          const fractionIncrement =
            total > currentBase ? (current - currentBase) / (total - currentBase) : 0;
          fraction = fractionBase + (1 - fractionBase) * fractionIncrement;
          const percent = Math.floor(fraction * 100);
          const date = Date.now();
          const percentDelta = percent - percentCache;
          const dateDeltaSec = (date - dateCache) / 1000;
          if (percentDelta > 0 && dateDeltaSec >= config.workspacePercentMessageRateLimitSec) {
            percentCache = percent;
            dateCache = date;
            percentDisplayed = true;
            const toDatabase = false;
            workspaceUtils
              .updateWorkspaceMessage(workspace.id, `Pulling image (${percent}%)`, toDatabase)
              .catch((err) => {
                logger.error('Error updating workspace message', err);
                Sentry.captureException(err);
              });
          }
        }
      },
    );
  });
}

/**
 * @param {object} workspace
 * @param {function} callback
 */
function _createContainer(workspace, callback) {
  const localName = workspace.local_name;
  const remoteName = workspace.remote_name;

  const jobDirectory = config.workspaceHostHomeDirRoot;
  const workspaceDir = process.env.HOST_JOBS_DIR
    ? path.join(process.env.HOST_JOBS_DIR, 'workspaces')
    : jobDirectory;

  // Where docker will see the jobs (host path outside docker container).
  const workspacePath = path.join(workspaceDir, remoteName, 'current');
  // Where we are putting the job files relative to the server (`/jobs` inside Docker container).
  const workspaceJobPath = path.join(jobDirectory, remoteName, 'current');

  const containerPath = workspace.settings.workspace_home;
  let args = workspace.settings.workspace_args.trim();
  if (args.length === 0) {
    args = null;
  } else {
    args = args.split(' ');
  }

  let networkMode = 'bridge';
  if (!workspace.settings.workspace_enable_networking) {
    if (config.workspaceSupportNoInternet) {
      networkMode = 'no-internet';
    } else {
      logger.verbose('Workspace requested unsupported feature enableNetworking:false');
    }
  }

  let container;

  debug(`Creating docker container for image=${workspace.settings.workspace_image}`);
  debug(`Exposed port: ${workspace.settings.workspace_port}`);
  debug(`Networking enabled: ${workspace.settings.workspace_enable_networking}`);
  debug(`Network mode: ${networkMode}`);
  debug(`Env vars: ${workspace.settings.workspace_environment}`);
  debug(
    `User binding: ${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`,
  );
  debug(`Port binding: ${workspace.settings.workspace_port}:${workspace.launch_port}`);
  debug(`Volume mount: ${workspacePath}:${containerPath}`);
  debug(`Container name: ${localName}`);
  async.series(
    [
      async () => {
        try {
          await fsPromises.access(workspaceJobPath);
        } catch (err) {
          throw Error('Could not access workspace files.', { cause: err });
        }
      },
      (callback) => {
        debug(`Creating directory ${workspaceJobPath}`);
        fs.mkdir(workspaceJobPath, { recursive: true }, (err) => {
          if (err && err.code !== 'EEXIST') {
            // Ignore the directory if it already exists.
            ERR(err, callback);
            return;
          }
          callback(null);
        });
      },
      (callback) => {
        fs.chown(
          workspaceJobPath,
          config.workspaceJobsDirectoryOwnerUid,
          config.workspaceJobsDirectoryOwnerGid,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          },
        );
      },
      (callback) => {
        docker.createContainer(
          {
            Image: workspace.settings.workspace_image,
            ExposedPorts: {
              [`${workspace.settings.workspace_port}/tcp`]: {},
            },
            Env: workspace.settings.workspace_environment,
            User: `${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`,
            HostConfig: {
              PortBindings: {
                [`${workspace.settings.workspace_port}/tcp`]: [
                  { HostPort: `${workspace.launch_port}` },
                ],
              },
              Binds: [`${workspacePath}:${containerPath}`],
              Memory: config.workspaceDockerMemory,
              MemorySwap: config.workspaceDockerMemorySwap,
              KernelMemory: config.workspaceDockerKernelMemory,
              DiskQuota: config.workspaceDockerDiskQuota,
              CpuPeriod: config.workspaceDockerCpuPeriod,
              CpuQuota: config.workspaceDockerCpuQuota,
              PidsLimit: config.workspaceDockerPidsLimit,
              IpcMode: 'private',
              NetworkMode: networkMode,
              Ulimits: [
                {
                  // Disable core dumps, which can get very large and bloat our storage.
                  Name: 'core',
                  Soft: 0,
                  Hard: 0,
                },
              ],
            },
            Labels: {
              'prairielearn.workspace-id': String(workspace.id),
              'prairielearn.workspace-version': String(workspace.version),
              'prairielearn.course-id': String(workspace.course_id),
              'prairielearn.institution-id': String(workspace.institution_id),
            },
            Cmd: args, // FIXME: proper arg parsing
            name: localName,
            Volumes: {
              [containerPath]: {},
            },
          },
          (err, newContainer) => {
            if (ERR(err, callback)) return;
            container = newContainer;

            sqldb.query(
              sql.update_load_count,
              { instance_id: workspace_server_settings.instance_id },
              function (err, _result) {
                if (ERR(err, callback)) return;
                callback(null, container);
              },
            );
          },
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, container);
    },
  );
}
const _createContainerAsync = util.promisify(_createContainer);

async function _startContainer(workspace) {
  await workspaceUtils.updateWorkspaceMessage(workspace.id, 'Starting container');
  await workspace.container.start();
}

/**
 * Wrapper around `updateWorkspaceState()` that will ensure any errors don't
 * propagate to the caller. Useful during the initialization sequence when we
 * would mark the host as unhealthy if an error occurred while updating the state.
 * @param {*} workspaceId
 * @param {*} state
 * @param {*} message
 */
function safeUpdateWorkspaceState(workspaceId, state, message) {
  workspaceUtils.updateWorkspaceState(workspaceId, state, message).catch((err) => {
    logger.error('Error updating workspace state', err);
    Sentry.captureException(err);
  });
}

// Called by the main server the first time a workspace is used by a user
async function initSequenceAsync(workspace_id, useInitialZip, res) {
  // send 200 immediately to prevent socket hang up from _pullImage()
  res.status(200).send(`Preparing container for workspace ${workspace_id}`);

  const uuid = uuidv4();
  const params = {
    workspace_id,
    launch_uuid: uuid,
    instance_id: workspace_server_settings.instance_id,
  };
  await sqldb.queryAsync(sql.set_workspace_launch_uuid, params);

  const { version, course_id, institution_id } = (
    await sqldb.queryOneRowAsync(sql.select_workspace, { workspace_id })
  ).rows[0];

  const workspace = {
    id: workspace_id,
    course_id,
    institution_id,
    version,
    launch_uuid: uuid,
    local_name: `workspace-${uuid}`,
    remote_name: `workspace-${workspace_id}-${version}`,
  };

  logger.info(`Launching workspace-${workspace_id}-${version} (useInitialZip=${useInitialZip})`);
  try {
    // Only errors at this level will set host to unhealthy.

    try {
      debug(`init: configuring workspace`);
      workspace.launch_port = await _allocateContainerPort(workspace);
      workspace.settings = await _getWorkspaceSettingsAsync(workspace.id);
    } catch (err) {
      logger.error(`Error configuring workspace ${workspace_id}`, err);
      safeUpdateWorkspaceState(
        workspace_id,
        'stopped',
        `Error configuring workspace. Click "Reboot" to try again.`,
      );
      return; // don't set host to unhealthy
    }

    try {
      await _pullImage(workspace);
    } catch (err) {
      const image = workspace.settings.workspace_image;
      logger.error(`Error pulling image ${image} for workspace ${workspace_id}`, err);
      safeUpdateWorkspaceState(
        workspace_id,
        'stopped',
        `Error pulling image. Click "Reboot" to try again.`,
      );
      return; // don't set host to unhealthy
    }

    try {
      await workspaceUtils.updateWorkspaceMessage(workspace.id, 'Creating container');
      workspace.container = await _createContainerAsync(workspace);
    } catch (err) {
      logger.error(`Error creating container for workspace ${workspace.id}`, err);
      safeUpdateWorkspaceState(
        workspace_id,
        'stopped',
        `Error creating container. Click "Reboot" to try again.`,
      );
      return; // don't set host to unhealthy
    }

    try {
      await _startContainer(workspace);
      await _checkServerAsync(workspace);
      debug(`init: container initialized for workspace_id=${workspace_id}`);

      // Before we transition this workspace to running, check that the container
      // we just launched is the same one that this workspace is still assigned to.
      // To be more precise, we'll check that the container's launch_uuid matches
      // the current launch_uuid for this workspace. If they don't match, then
      // the workspace was relaunched while we were initializing it, and we should
      // abandon it.
      //
      // We don't have to explicitly kill the container here - our usual
      // background maintenance processes will soon notice that this container
      // should not be running on this host and kill it.
      await sqldb.runInTransactionAsync(async () => {
        const currentWorkspace = await sqldb.queryOneRowAsync(sql.select_and_lock_workspace, {
          workspace_id: workspace.id,
        });
        const launch_uuid = currentWorkspace.rows[0].launch_uuid;
        if (launch_uuid !== workspace.launch_uuid) {
          logger.info(
            `Abandoning container for workspace ${workspace.id}: relaunched with launch_uuid ${launch_uuid}`,
          );
          return;
        }

        const hostname = `${workspace_server_settings.server_to_container_hostname}:${workspace.launch_port}`;
        await sqldb.queryAsync(sql.update_workspace_hostname, {
          workspace_id,
          hostname,
        });
        await workspaceUtils.updateWorkspaceState(workspace_id, 'running');
      });
    } catch (err) {
      logger.error(`Error starting container for workspace ${workspace.id}`, err);
      safeUpdateWorkspaceState(
        workspace_id,
        'stopped',
        `Error starting container. Click "Reboot" to try again.`,
      );

      // Immediately kill and remove the container, which will flush any
      // logs to S3 for better debugging.
      await killAndRemoveWorkspace(workspace.id, workspace.container);

      // Don't set host to unhealthy.
      return;
    }
  } catch (err) {
    logger.error(`Error initializing workspace ${workspace_id}; marking self as unhealthy`);
    await markSelfUnhealthy(err);
  }
}

/**
 * @param {string | number} workspace_id
 * @param {import('express').Response} res
 */
async function sendGradedFilesArchive(workspace_id, res) {
  const workspace = await _getWorkspaceAsync(workspace_id);
  const workspaceSettings = await _getWorkspaceSettingsAsync(workspace_id);
  const timestamp = new Date().toISOString().replace(/[-T:.]/g, '-');
  const zipName = `${workspace.remote_name}-${timestamp}.zip`;
  const workspaceDir = path.join(config.workspaceHostHomeDirRoot, workspace.remote_name, 'current');

  let gradedFiles;
  try {
    gradedFiles = await workspaceUtils.getWorkspaceGradedFiles(
      workspaceDir,
      workspaceSettings.workspace_graded_files,
      {
        maxFiles: config.workspaceMaxGradedFilesCount,
        maxSize: config.workspaceMaxGradedFilesSize,
      },
    );
  } catch (err) {
    res.status(500).send(err.message);
    return;
  }

  // Stream the archive back to the client as it's generated.
  res.attachment(zipName).status(200);
  const archive = archiver('zip');
  archive.pipe(res);

  archive.on('error', (err) => {
    logger.error('Error creating archive', err);
    Sentry.captureException(err);

    // Since we've probably already sent some data to the client, we can't do
    // anything to gracefully let them know that we encountered an error.
    // Instead, we'll just destroy the socket so that they pick up an error
    // and handle that however they want.
    res.socket?.destroy();
  });

  for (const file of gradedFiles) {
    try {
      const filePath = path.join(workspaceDir, file.path);
      archive.file(filePath, { name: file.path });
      debug(`Sending ${file.path}`);
    } catch (err) {
      logger.warn(`Graded file ${file.path} does not exist.`);
      continue;
    }
  }

  await archive.finalize();
}

/**
 * @param {string | number} workspaceId
 * @param {import('express').Response} res
 */
async function sendLogs(workspaceId, res) {
  try {
    const workspace = await _getWorkspaceAsync(workspaceId);
    const container = await _getDockerContainerByLaunchUuid(workspace.launch_uuid);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
      // This should give us a reasonable bound on the worst-case performance.
      tail: 50000,
    });
    const parsedLogs = parseDockerLogs(logs);
    res.status(200).send(parsedLogs);
  } catch (err) {
    logger.error('Error getting container logs', err);
    Sentry.captureException(err);
    res.status(500).send();
  }
}

/**
 * @param {import('dockerode').Container} container
 */
async function flushLogsToS3(container) {
  if (!config.workspaceLogsS3Bucket) return;

  // Read all data from the container's labels instead of trying to look it up
  // in the database, as some things (namely the version) may have changed.
  const containerInfo = await container.inspect();

  const workspaceId = containerInfo.Config.Labels['prairielearn.workspace-id'];
  const courseId = containerInfo.Config.Labels['prairielearn.course-id'];
  const institutionId = containerInfo.Config.Labels['prairielearn.institution-id'];
  // We use the version recorded in the container labels instead of in the
  // workspace row from the database. We might be flushing these logs sometime
  // after the workspace has been relaunched in a new version, and we want to
  // associate the logs with the correct (older) version.
  const version = containerInfo.Config.Labels['prairielearn.workspace-version'];

  // For any container versions A and B, if A < B, then the `StartedAt` date for A
  // should be before the `StartedAt` date for B. This means that we can use the
  // date for ordering of logs from different versions.
  const startedAt = containerInfo.State.StartedAt;

  const logs = await container.logs({
    stdout: true,
    stderr: true,
    timestamps: true,
    // This should give us a reasonable bound on the worst-case performance.
    tail: 50000,
  });
  const parsedLogs = parseDockerLogs(logs);

  const key = `${workspaceId}/${version}/${startedAt}.log`;
  const tags = {
    WorkspaceId: workspaceId,
    CourseId: courseId,
    InstitutionId: institutionId,
  };

  const s3 = new S3(makeS3ClientConfig({ maxAttempts: 3 }));
  await new Upload({
    client: s3,
    params: {
      Bucket: config.workspaceLogsS3Bucket,
      Key: key,
      Body: parsedLogs,
      Tagging: new URLSearchParams(tags).toString(),
    },
  }).done();
}
