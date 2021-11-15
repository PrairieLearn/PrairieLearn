const ERR = require('async-stacktrace');
const _ = require('lodash');
const util = require('util');
const express = require('express');
const app = express();
const http = require('http');
const request = require('request');
const path = require('path');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require('fs');
const async = require('async');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser')(process.argv.slice(2));
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
const net = require('net');
const unzipper = require('unzipper');
const stream = require('stream');
const asyncHandler = require('express-async-handler');

const dockerUtil = require('../lib/dockerUtil');
const awsHelper = require('../lib/aws');
const socketServer = require('../lib/socket-server'); // must load socket server before workspace
const workspaceHelper = require('../lib/workspace');
const logger = require('../lib/logger');
const sprocs = require('../sprocs');
const LocalLock = require('../lib/local-lock');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

let lastAutoUpdateTime = Date.now();
let lastPushAllTime = Date.now();

const config = require('../lib/config');
let configFilename = 'config.json';
if ('config' in argv) {
  configFilename = argv['config'];
}
config.loadConfig(configFilename);

if (config.workspaceHostWatchJobFiles) {
  setInterval(() => {
    const elapsedSec = (Date.now() - lastAutoUpdateTime) / 1000;
    if (elapsedSec > 30) {
      logger.error(
        `_autoUpdateJobManager() has not run for ${elapsedSec} seconds, update_queue: ${JSON.stringify(
          update_queue
        )}`
      );
    }
  }, 1000);
}

setInterval(() => {
  const elapsedSec = (Date.now() - lastPushAllTime) / 1000;
  if (elapsedSec > 900) {
    logger.error(`_pushAllRunningContainersToS3() has not run for ${elapsedSec} seconds`);
  }
}, 1000);

const bodyParser = require('body-parser');
const docker = new Docker();

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
      /* We should have both docker and postgres access in order to consider ourselves healthy */
      res.status(500);
    } else {
      res.status(200);
    }
    res.jsonp({
      docker: containers,
      postgres: db_status,
    });
  })
);

// TODO: refactor into RESTful endpoints (https://github.com/PrairieLearn/PrairieLearn/pull/2841#discussion_r467245108)
app.post(
  '/',
  asyncHandler(async (req, res) => {
    const workspace_id = req.body.workspace_id;
    const action = req.body.action;
    const useInitialZip = _.get(req.body.options, 'useInitialZip', false);
    if (workspace_id == null) {
      res.status(500).send('Missing workspace_id');
    } else if (action == null) {
      res.status(500).send('Missing action');
    } else if (action === 'init') {
      await initSequenceAsync(workspace_id, useInitialZip, res);
    } else if (action === 'reset') {
      resetSequence(workspace_id, res);
    } else if (action === 'getGradedFiles') {
      gradeSequence(workspace_id, res);
    } else {
      res.status(500).send(`Action '${action}' undefined`);
    }
  })
);

let server;
let workspace_server_settings = {};

/* Globals for detecting file changes */
let update_queue = {}; // key: path of file on local, value: action ('update' or 'remove').
let workspacePrefix; /* Jobs directory */
let watcher;

async.series(
  [
    async () => {
      if (config.runningInEc2) {
        await awsHelper.loadConfigSecrets(); // sets config.* variables
        // copy discovered variables into workspace_server_settings
        workspace_server_settings.instance_id = config.instanceId;
        workspace_server_settings.hostname = config.hostname;
        workspace_server_settings.server_to_container_hostname = config.hostname;
      } else {
        /* Otherwise, use the defaults in the config file */
        config.instanceId = config.workspaceDevHostInstanceId;
        workspace_server_settings.instance_id = config.workspaceDevHostInstanceId;
        workspace_server_settings.hostname = config.workspaceDevHostHostname;
        workspace_server_settings.server_to_container_hostname =
          config.workspaceDevContainerHostname;
      }
    },
    (callback) => {
      util.callbackify(awsHelper.init)((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    async () => {
      /* Always grab the port from the config */
      workspace_server_settings.port = config.workspaceHostPort;
      logger.verbose(`Workspace S3 bucket: ${config.workspaceS3Bucket}`);
    },
    (callback) => {
      const pgConfig = {
        user: config.postgresqlUser,
        database: config.postgresqlDatabase,
        host: config.postgresqlHost,
        password: config.postgresqlPassword,
        max: 100,
        idleTimeoutMillis: 30000,
      };
      logger.verbose(
        `Connecting to database ${pgConfig.user}@${pgConfig.host}:${pgConfig.database}`
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
    async () => {
      await sqldb.setRandomSearchSchemaAsync(config.instanceId);
    },
    (callback) => {
      sprocs.init(function (err) {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (callback) => {
      socketServer.init(server, function (err) {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (callback) => {
      util.callbackify(workspaceHelper.init)((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (callback) => {
      server = http.createServer(app);
      server.listen(workspace_server_settings.port);
      logger.verbose(`Workspace server listening on port ${workspace_server_settings.port}`);
      callback(null);
    },
    async () => {
      /* Set up file watching with chokidar */
      workspacePrefix = config.workspaceJobsDirectory;
      if (!config.workspaceHostWatchJobFiles) {
        return;
      }

      watcher = chokidar.watch(workspacePrefix, {
        ignoreInitial: true,
        awaitWriteFinish: true,
        depth: 10,
      });
      watcher.on('add', (filename) => {
        // Handle new files
        logger.info(`Watching file add ${filename}`);
        var key = [filename, false];
        if (key in update_queue && update_queue[key].action === 'skip') {
          delete update_queue[key];
        } else {
          update_queue[key] = { action: 'update' };
        }
      });
      watcher.on('addDir', (filename) => {
        // Handle new directory
        logger.info(`Watching directory add ${filename}`);
        var key = [filename, true];
        if (key in update_queue && update_queue[key].action === 'skip') {
          delete update_queue[key];
        } else {
          update_queue[key] = { action: 'update' };
        }
      });
      watcher.on('change', (filename) => {
        // Handle file changes
        logger.info(`Watching file change ${filename}`);
        var key = [filename, false];
        if (key in update_queue && update_queue[key].action === 'skip') {
          delete update_queue[key];
        } else {
          update_queue[key] = { action: 'update' };
        }
      });
      watcher.on('unlink', (filename) => {
        // Handle removed files
        var key = [filename, false];
        update_queue[key] = { action: 'delete' };
      });
      watcher.on('unlinkDir', (filename) => {
        // Handle removed directory
        var key = [filename, true];
        update_queue[key] = { action: 'delete' };
      });
      watcher.on('error', (err) => {
        // Handle errors
        markSelfUnhealthy(err, (err2) => {
          if (err2) {
            logger.error(`Error while handling watcher error: ${err2}`);
          }
          logger.error(`Watcher error: ${err}`);
        });
      });
      async function autoUpdateJobManagerTimeout() {
        const timeout_id = setTimeout(() => {
          logger.info(
            `_autoUpdateJobManager() timed out, update queue:\n${JSON.stringify(update_queue)}`
          );
        }, config.workspaceHostFileWatchIntervalSec * 1000);
        try {
          await _autoUpdateJobManager();
        } catch (err) {
          logger.error(`Error from _autoUpdateJobManager(): ${err}`);
          logger.error(`PREVIOUSLY FATAL ERROR: Error from _autoUpdateJobManager(): ${err}`);
        }
        clearTimeout(timeout_id);
        setTimeout(autoUpdateJobManagerTimeout, config.workspaceHostFileWatchIntervalSec * 1000);
      }
      setTimeout(autoUpdateJobManagerTimeout, config.workspaceHostFileWatchIntervalSec * 1000);
    },
    async () => {
      /* Set up a periodic hard push of all containers to S3 */
      async function pushAllContainersTimeout() {
        await pushAllRunningContainersToS3();
        setTimeout(pushAllContainersTimeout, config.workspaceHostForceUploadIntervalSec * 1000);
      }
      setTimeout(pushAllContainersTimeout, config.workspaceHostForceUploadIntervalSec * 1000);
    },
    async () => {
      /* Set up a periodic pruning of running containers */
      async function pruneContainersTimeout() {
        await pruneStoppedContainers();
        await pruneRunawayContainers();
        await sqldb.queryAsync(sql.update_load_count, {
          instance_id: workspace_server_settings.instance_id,
        });

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
      /* If we have any running workspaces we're probably recovering from a crash
           and we should sync files to S3 */
      const result = await sqldb.queryAsync(sql.recover_crash_workspaces, {
        instance_id: workspace_server_settings.instance_id,
      });
      await async.eachSeries(result.rows, async (ws) => {
        if (ws.state === 'launching') {
          /* We don't know what state the container is in, kill it and let the user
                   retry initializing it */
          await workspaceHelper.updateState(ws.id, 'stopped', 'Status unknown');
          await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
            workspace_id: ws.id,
            instance_id: workspace_server_settings.instance_id,
          });
          try {
            const container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
            await dockerAttemptKillAndRemove(container);
          } catch (err) {
            debug(`Couldn't find container: ${err}`);
          }
        } else if (ws.state === 'running') {
          if (ws.launch_uuid) {
            await pushContainerContentsToS3(ws);
          } else {
            await workspaceHelper.updateState(ws.id, 'stopped', 'Shutting down');
            await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
              workspace_id: ws.id,
              instance_id: workspace_server_settings.instance_id,
            });
          }
        }
      });
    },
  ],
  function (err, data) {
    if (err) {
      logger.error('Error initializing workspace host:', err, data);
      markSelfUnhealthyAsync(err);
    } else {
      logger.info('Workspace host ready');
    }
  }
);

/* Periodic hard-push of files to S3 */

/**
 * Push all of the contents of a container's home directory to S3.
 * @param {object} workspace Workspace object, this should contain at least the launch_uuid and id.
 */
async function pushContainerContentsToS3(workspace) {
  if (workspace.homedir_location !== 'S3') {
    /* Nothing to do if we're not on S3 */
    return;
  }

  const workspacePath = path.join(workspacePrefix, `workspace-${workspace.launch_uuid}`);
  const s3Path = `workspace-${workspace.id}-${workspace.version}/current`;
  const settings = _getWorkspaceSettingsAsync(workspace.id);
  try {
    await awsHelper.uploadDirectoryToS3Async(
      config.workspaceS3Bucket,
      s3Path,
      workspacePath,
      settings.workspace_sync_ignore
    );
  } catch (err) {
    /* Ignore any errors that may occur when the directory doesn't exist */
    logger.error(`Error uploading directory: ${err}`);
  }
}

/**
 * Push the contents of all running workspaces to S3.  Workspace home directories are uploaded
 * serially instead of in parallel.
 */
async function pushAllRunningContainersToS3() {
  lastPushAllTime = Date.now();
  const result = await sqldb.queryAsync(sql.get_running_workspaces, {
    instance_id: workspace_server_settings.instance_id,
  });
  await async.eachSeries(result.rows, async (ws) => {
    if (ws.state === 'running' && ws.homedir_location === 'S3') {
      logger.info(
        `Pushing entire running container to S3: workspace_id=${ws.id}, launch_uuid=${ws.launch_uuid}`
      );
      await pushContainerContentsToS3(ws);
      logger.info(
        `Completed push of entire running container to S3: workspace_id=${ws.id}, launch_uuid=${ws.launch_uuid}`
      );
    }
  });
}

/* Prune stopped and runaway containers */

/**
 * Remove any recently stopped containers.  These are identified by having a non-null launch_uuid
 * and launch_port, but are marked as stopped by the main PrairieLearn instance.
 */
async function pruneStoppedContainers() {
  const instance_id = workspace_server_settings.instance_id;
  const recently_stopped = await sqldb.queryAsync(sql.get_stopped_workspaces, {
    instance_id,
  });
  await async.each(recently_stopped.rows, async (ws) => {
    let container;
    try {
      /* Try to grab the container, but don't care if it doesn't exist */
      container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
    } catch (_err) {
      /* No container */
      await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
        workspace_id: ws.id,
        instance_id: workspace_server_settings.instance_id,
      });
      return;
    }
    await pushContainerContentsToS3(ws);
    await sqldb.queryAsync(sql.clear_workspace_on_shutdown, {
      workspace_id: ws.id,
      instance_id: workspace_server_settings.instance_id,
    });
    await dockerAttemptKillAndRemove(container);
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
    db_workspaces.rows.map((ws) => `workspace-${ws.launch_uuid}`)
  );
  let running_workspaces;
  try {
    running_workspaces = await docker.listContainers({ all: true });
  } catch (err) {
    /* Nothing to do */
    return;
  }

  await async.each(running_workspaces, async (container_info) => {
    if (container_info.Names.length !== 1) return;
    const name = container_info.Names[0].substring(1); /* Remove the preceding forward slash */
    if (!name.startsWith('workspace-') || db_workspaces_uuid_set.has(name)) return;
    await dockerAttemptKillAndRemove(container_info.Id);
  });
}

/**
 * Looks up a docker container by the UUID used to launch it.
 * Throws an exception if the container was not found or if there
 * are multiple containers with the same UUID (this shouldn't happen?)
 * @param {string} launch_uuid UUID to search by
 * @return Dockerode container object
 */
async function _getDockerContainerByLaunchUuid(launch_uuid) {
  try {
    const containers = await docker.listContainers({
      filters: `name=workspace-${launch_uuid}`,
    });
    return docker.getContainer(containers[0].Id);
  } catch (err) {
    throw new Error(`Could not find unique container by launch UUID: ${launch_uuid}`);
  }
}

/**
 * Attempts to kill and remove a container.  Will fail silently if the container is already stopped
 * or does not exist.  Also removes the container's home directory.
 * @param {string | Dockerode container} input.  Either the ID of the docker container, or an actual Dockerode
 * container object.
 */
async function dockerAttemptKillAndRemove(input) {
  /* Use these awful try-catch blocks because we actually do want to try each */
  let container;
  if (typeof input === 'string') {
    try {
      container = await docker.getContainer(input);
    } catch (_err) {
      /* Docker failed to get the container, oh well. */
      return;
    }
  } else {
    container = input;
  }

  let name = null;
  try {
    name = (await container.inspect()).Name.substring(1);
  } catch (err) {
    debug(`Couldn't obtain container name: ${err}`);
  }

  try {
    await container.kill();
  } catch (err) {
    debug(`Couldn't kill container: ${err}`);
  }

  try {
    await container.remove();
  } catch (err) {
    debug(`Couldn't remove stopped container: ${err}`);
  }

  if (name) {
    const workspaceJobPath = path.join(workspacePrefix, name);
    try {
      await fsPromises.rmdir(workspaceJobPath, { recursive: true });
    } catch (err) {
      debug(`Couldn't remove directory "${workspaceJobPath}": ${err}`);
    }
  }
}

/**
 * Marks the host as "unhealthy", we typically want to do this when we hit some unrecoverable error.
 * This will also set the "unhealthy__at" field if applicable.
 */
async function markSelfUnhealthyAsync(reason) {
  try {
    const params = {
      instance_id: workspace_server_settings.instance_id,
      unhealthy_reason: reason,
    };
    await sqldb.queryAsync(sql.mark_host_unhealthy, params);
    logger.warn(`Marked self as unhealthy: ${reason}`);
  } catch (err) {
    /* This could error if we don't even have a DB connection, in that case we should let the main server
           mark us as unhealthy. */
    logger.error(`Could not mark self as unhealthy: ${err}`);
  }
}
const markSelfUnhealthy = util.callbackify(markSelfUnhealthyAsync);

/**
 * Looks up a workspace object by the workspace id.
 * This object contains all columns in the 'workspaces' table as well as:
 * - local_name (container name)
 * - remote_name (subdirectory name on s3)
 * @param {integer} workspace_id Workspace ID to search by.
 * @return {object} Workspace object, as described above.
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

/**
 * Allocates and returns an unused port for a workspace.  This will insert the new port into the workspace table.
 * @param {object} workspace Workspace object, should at least contain an id.
 * @return {integer} Port that was allocated to the workspace.
 */
const _allocateContainerPortLock = new LocalLock();
async function _allocateContainerPort(workspace) {
  /* Check if a port is considered free in the database */
  async function check_port_db(port) {
    const params = {
      instance_id: workspace_server_settings.instance_id,
      port,
    };
    const result = await sqldb.queryOneRowAsync(sql.get_is_port_occupied, params);
    return !result.rows[0].port_used;
  }
  /* Spin up a server to check if a port is free */
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

  await _allocateContainerPortLock.lockAsync();
  let port;
  let done = false;
  /* Max attempts <= 0 means unlimited attempts, > 0 mean a finite number of attempts */
  const max_attempts =
    config.workspaceHostMaxPortAllocationAttempts > 0
      ? config.workspaceHostMaxPortAllocationAttempts
      : Infinity;
  for (let i = 0; !done && i < max_attempts; i++) {
    /* Generate a random port from the ranges specified in config */
    port =
      config.workspaceHostMinPortRange +
      Math.floor(
        Math.random() * (config.workspaceHostMaxPortRange - config.workspaceHostMinPortRange)
      );
    if (!(await check_port_db(port))) continue;
    if (!(await check_port_server(port))) continue;
    done = true;
  }
  if (!done) {
    throw new Error(`Failed to allocate port after ${max_attempts} attempts!`);
  }
  await sqldb.queryAsync(sql.set_workspace_launch_port, {
    workspace_id: workspace.id,
    launch_port: port,
    instance_id: workspace_server_settings.instance_id,
  });
  _allocateContainerPortLock.unlock();
  return port;
}

function _checkServer(workspace, callback) {
  const checkMilliseconds = 500;
  const maxMilliseconds = 30000;

  const startTime = new Date().getTime();
  function checkWorkspace() {
    request(
      `http://${workspace_server_settings.server_to_container_hostname}:${workspace.launch_port}/`,
      function (err, res, _body) {
        if (err) {
          /* do nothing, because errors are expected while the container is launching */
        }
        if (res && res.statusCode) {
          /* We might get all sorts of strange status codes from the server, this is okay since it still means the server is running and we're getting responses. */
          callback(null, workspace);
        } else {
          const endTime = new Date().getTime();
          if (endTime - startTime > maxMilliseconds) {
            workspace.container.logs(
              {
                stdout: true,
                stderr: true,
              },
              (err, logs) => {
                if (ERR(err, callback)) return;
                callback(
                  new Error(
                    `Max startup time exceeded for workspace_id=${workspace.id} (launch uuid ${workspace.launch_uuid})\n${logs}`
                  )
                );
              }
            );
          } else {
            setTimeout(checkWorkspace, checkMilliseconds);
          }
        }
      }
    );
  }
  setTimeout(checkWorkspace, checkMilliseconds);
}
const _checkServerAsync = util.promisify(_checkServer);

/**
 * Looks up all the question-specific workspace launch settings associated with a workspace id.
 * @param {integer} workspace_id Workspace ID to search by.
 * @return {object} Workspace launch settings.
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
    workspace_sync_ignore: result.rows[0].workspace_sync_ignore || [],
    workspace_enable_networking: !!result.rows[0].workspace_enable_networking,
    // Convert {key: 'value'} to ['key=value'] and {key: null} to ['key'] for Docker API
    workspace_environment: Object.entries(workspace_environment).map(([k, v]) =>
      v === null ? k : `${k}=${v}`
    ),
  };

  if (config.cacheImageRegistry) {
    const repository = new dockerUtil.DockerName(settings.workspace_image);
    repository.registry = config.cacheImageRegistry;
    const newImage = repository.getCombined();
    logger.info(`Using ${newImage} for ${settings.workspace_image}`);
    settings.workspace_image = newImage;
  }

  return settings;
}

// Extracts `workspace_id` and `/path/to/file` from `/prefix/workspace-${uuid}/path/to/file`
async function _getRunningWorkspaceByPathAsync(path) {
  let localPath = path.replace(`${workspacePrefix}/`, '').split('/');
  const localName = localPath.shift();
  const launch_uuid = localName.replace('workspace-', '');
  localPath = localPath.join('/');

  try {
    const result = await sqldb.queryOneRowAsync(sql.get_running_workspace_id_by_uuid, {
      launch_uuid,
      instance_id: workspace_server_settings.instance_id,
    });
    return {
      workspace_id: result.rows[0].id,
      local_path: localPath,
    };
  } catch (_err) {
    return {
      workspace_id: null,
      local_path: null,
    };
  }
}

async function _autoUpdateJobManager() {
  lastAutoUpdateTime = Date.now();
  var jobs = [];
  for (const key in update_queue) {
    logger.info(`_autoUpdateJobManager: key=${key}`);
    const [path, isDirectory_str] = key.split(',');
    const isDirectory = isDirectory_str === 'true';
    const { workspace_id, local_path } = await _getRunningWorkspaceByPathAsync(path);
    logger.info(`_autoUpdateJobManager: workspace_id=${workspace_id}, local_path=${local_path}`);
    if (workspace_id == null) continue;

    debug(`watch: workspace_id=${workspace_id}, localPath=${local_path}`);
    const workspace = await _getWorkspaceAsync(workspace_id);
    const workspaceSettings = await _getWorkspaceSettingsAsync(workspace_id);
    const remote_name = workspace.remote_name;
    const sync_ignore = workspaceSettings.workspace_sync_ignore;
    debug(`watch: workspace_id=${workspace_id}, isDirectory_str=${isDirectory_str}`);
    debug(`watch: localPath=${local_path}`);
    debug(`watch: syncIgnore=${sync_ignore}`);
    logger.info(
      `_autoUpdateJobManager: workspace_id=${workspace_id}, isDirectory_str=${isDirectory_str}`
    );
    logger.info(`_autoUpdateJobManager: localPath=${local_path}`);
    logger.info(`_autoUpdateJobManager: syncIgnore=${sync_ignore}`);

    let s3_path = null;
    if (local_path === '') {
      // skip root localPath as it produces new S3 dir with empty name
      logger.info(`_autoUpdateJobManager: skip root`);
      continue;
    } else if (sync_ignore.filter((ignored) => local_path.startsWith(ignored)).length > 0) {
      logger.info(`_autoUpdateJobManager: skip ignored`);
      continue;
    } else {
      s3_path = `${remote_name}/current/${local_path}`;
      logger.info(`_autoUpdateJobManager: s3_path=${s3_path}`);
    }

    logger.info(`_autoUpdateJobManager: action=${update_queue[key].action}`);
    if (update_queue[key].action === 'update') {
      logger.info(`_autoUpdateJobManager: adding update job`);
      jobs.push((callback) => {
        logger.info(`Uploading file to S3: ${s3_path}, ${path}`);
        awsHelper.uploadToS3(config.workspaceS3Bucket, s3_path, path, isDirectory, (err) => {
          if (err) {
            logger.error(`Error uploading file to S3: ${s3_path}, ${path}, ${err}`);
            logger.error(
              `PREVIOUSLY FATAL ERROR: Error uploading file to S3: ${s3_path}, ${path}, ${err}`
            );
          } else {
            logger.info(`Successfully uploaded file to S3: ${s3_path}, ${path}`);
          }
          callback(null); // always return success to keep going
        });
      });
    } else if (update_queue[key].action === 'delete') {
      logger.info(`_autoUpdateJobManager: adding delete job`);
      jobs.push((callback) => {
        logger.info(`Removing file from S3: ${s3_path}`);
        awsHelper.deleteFromS3(config.workspaceS3Bucket, s3_path, isDirectory, (err) => {
          if (err) {
            logger.error(`Error removing file from S3: ${s3_path}, ${err}`);
            logger.error(
              `PREVIOUSLY FATAL ERROR: Error removing file from S3: ${s3_path}, ${path}, ${err}`
            );
          } else {
            logger.info(`Successfully removed file from S3: ${s3_path}`);
          }
          callback(null); // always return success to keep going
        });
      });
    }
  }
  update_queue = {};
  try {
    await async.parallel(jobs);
  } catch (err) {
    markSelfUnhealthy(err, (err2) => {
      if (err2) {
        logger.error(`Error while handling error: ${err2}`);
      }
      logger.error(`Error uploading files to S3:\n${err}`);
    });
  }
}

function _recursiveDownloadJobManager(curDirPath, S3curDirPath, callback) {
  const s3 = new AWS.S3();

  var listingParams = {
    Bucket: config.workspaceS3Bucket,
    Prefix: S3curDirPath,
  };

  s3.listObjectsV2(listingParams, (err, data) => {
    if (ERR(err, callback)) return;
    var contents = data['Contents'];
    var ret = [];
    contents.forEach((dict) => {
      if ('Key' in dict) {
        var filePath = path.join(curDirPath, dict['Key'].slice(S3curDirPath.length));
        var S3filePath = dict['Key'];
        ret.push([filePath, S3filePath]);
      }
    });
    callback(null, ret);
  });
}

async function _getInitialZipAsync(workspace) {
  workspaceHelper.updateMessage(workspace.id, 'Loading initial files');
  const localName = workspace.local_name;
  const s3Name = workspace.remote_name;
  const localPath = `${workspacePrefix}/${localName}`;
  const zipPath = `${config.workspaceHostZipsDirectory}/${localName}-initial.zip`;
  const s3Path = `${s3Name}/initial.zip`;

  debug(`Downloading s3Path=${s3Path} to zipPath=${zipPath}`);
  const options = {
    owner: config.workspaceJobsDirectoryOwnerUid,
    group: config.workspaceJobsDirectoryOwnerGid,
  };
  const isDirectory = false;
  update_queue[[zipPath, isDirectory]] = { action: 'skip' };
  await awsHelper.downloadFromS3Async(config.workspaceS3Bucket, s3Path, zipPath, options);
  await fsPromises.access(zipPath);

  debug(`Making directory ${localPath}`);
  await fsPromises.mkdir(localPath, { recursive: true });
  await fsPromises.chown(
    localPath,
    config.workspaceJobsDirectoryOwnerUid,
    config.workspaceJobsDirectoryOwnerGid
  );

  // FIXME: This unzipper was hotfixed to support workspaces with many/large/nested initial files.
  // There's probably a better way to do this if someone has more time/knowhow.
  // See #3146 for gotchas: https://github.com/PrairieLearn/PrairieLearn/pull/3146
  debug(`Unzipping ${zipPath} to ${localPath}`);
  fs.createReadStream(zipPath)
    .pipe(
      unzipper.Parse({
        forceStream: true,
      })
    )
    .pipe(
      stream.Transform({
        objectMode: true,
        transform: (entry, encoding, callback) => {
          const entryPath = path.join(localPath, entry.path);
          if (entry.type === 'Directory') {
            debug(`Making directory ${entryPath}`);
            util.callbackify(async () => {
              await fsPromises.mkdir(entryPath, { recursive: true });
              await fsPromises.chown(
                entryPath,
                config.workspaceJobsDirectoryOwnerUid,
                config.workspaceJobsDirectoryOwnerGid
              );
            })(callback);
          } else {
            debug(`Extracting file ${entryPath}`);
            entry.pipe(fs.createWriteStream(entryPath)).on('finish', () => {
              util.callbackify(async () => {
                await fsPromises.chown(
                  entryPath,
                  config.workspaceJobsDirectoryOwnerUid,
                  config.workspaceJobsDirectoryOwnerGid
                );
              })(callback);
            });
          }
        },
      })
    );

  return workspace;
}

function _getInitialFiles(workspace, callback) {
  workspaceHelper.updateMessage(workspace.id, 'Loading files');

  const localPath = `${workspacePrefix}/${workspace.local_name}`;
  const s3Path = `${workspace.remote_name}/current`;

  _recursiveDownloadJobManager(localPath, s3Path, (err, jobs_params) => {
    if (ERR(err, callback)) return;
    var jobs = [];
    jobs_params.forEach(([localPath, s3Path]) => {
      jobs.push((callback) => {
        const options = {
          owner: config.workspaceJobsDirectoryOwnerUid,
          group: config.workspaceJobsDirectoryOwnerGid,
        };
        const isDirectory = localPath.endsWith('/');
        update_queue[[localPath, isDirectory]] = { action: 'skip' };
        awsHelper.downloadFromS3(config.workspaceS3Bucket, s3Path, localPath, options, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      });
    });

    async.parallel(jobs, function (err) {
      if (ERR(err, callback)) return;
      callback(null, workspace);
    });
  });
}
const _getInitialFilesAsync = util.promisify(_getInitialFiles);

function _pullImage(workspace, callback) {
  workspaceHelper.updateMessage(workspace.id, 'Checking image');
  const workspace_image = workspace.settings.workspace_image;
  if (config.workspacePullImagesFromDockerHub) {
    logger.info(`Pulling docker image: ${workspace_image}`);
    dockerUtil.setupDockerAuth((err, auth) => {
      if (ERR(err, callback)) return;

      let percentDisplayed = false;
      docker.pull(workspace_image, { authconfig: auth }, (err, stream) => {
        if (err) {
          logger.error(
            `Error pulling "${workspace_image}" image; attempting to fall back to cached version.`,
            err
          );
          return callback(null);
        }
        /*
         * We monitor the pull progress to calculate the
         * percentage complete. This is roughly "current / total",
         * but as docker pulls new layers the "total" can
         * increase, which would cause the percentage to
         * decrease. To avoid this, we track a "base" value for
         * both "current" and "total" and compute the percentage
         * as an increment above these values. This ensures that
         * our percentage starts at 0, ends at 100, and never
         * decreases. It has the disadvantage that the percentage
         * will tend to go faster at the start (when we only know
         * about a few layers) and slow down at the end (when we
         * know about all layers).
         */

        let progressDetails = {};
        let current,
          total = 0,
          fraction = 0;
        let currentBase, fractionBase;
        let outputCount = 0;
        let percentCache = -1,
          dateCache = Date.now() - 1e6;
        docker.modem.followProgress(
          stream,
          (err) => {
            if (ERR(err, callback)) return;
            if (percentDisplayed) {
              const toDatabase = false;
              workspaceHelper.updateMessage(workspace.id, `Pulling image (100%)`, toDatabase);
            }
            callback(null, workspace);
          },
          (output) => {
            debug('Docker pull output: ', output);
            if ('progressDetail' in output && output.progressDetail.total) {
              // track different states (Download/Extract)
              // separately by making them separate keys
              const key = `${output.id}/${output.status}`;
              progressDetails[key] = output.progressDetail;
            }
            current = Object.values(progressDetails).reduce(
              (current, detail) => detail.current + current,
              0
            );
            const newTotal = Object.values(progressDetails).reduce(
              (total, detail) => detail.total + total,
              0
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
                workspaceHelper.updateMessage(
                  workspace.id,
                  `Pulling image (${percent}%)`,
                  toDatabase
                );
              }
            }
          }
        );
      });
    });
  } else {
    logger.info('Not pulling docker image');
    callback(null, workspace);
  }
}
const _pullImageAsync = util.promisify(_pullImage);

function _createContainer(workspace, callback) {
  const localName = workspace.local_name;
  const remoteName = workspace.remote_name;
  let jobDirectory;
  let workspacePath; /* Where docker will see the jobs (host path outside docker container) */
  let workspaceJobPath; /* Where we are putting the job files relative to the server (/jobs inside docker container) */

  if (workspace.homedir_location === 'S3') {
    jobDirectory = config.workspaceJobsDirectory;
    const workspaceDir = process.env.HOST_JOBS_DIR
      ? path.join(process.env.HOST_JOBS_DIR, 'workspaces')
      : jobDirectory;

    workspacePath = path.join(workspaceDir, localName);
    workspaceJobPath = path.join(jobDirectory, localName);
  } else if (workspace.homedir_location === 'FileSystem') {
    jobDirectory = config.workspaceHostHomeDirRoot;
    const workspaceDir = process.env.HOST_JOBS_DIR
      ? path.join(process.env.HOST_JOBS_DIR, 'workspaces')
      : jobDirectory;

    workspacePath = path.join(workspaceDir, remoteName, 'current');
    workspaceJobPath = path.join(jobDirectory, remoteName, 'current');
  } else {
    return callback(new Error(`Unknown backing file storage: ${workspace.homedir_location}`));
  }

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
    `User binding: ${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`
  );
  debug(`Port binding: ${workspace.settings.workspace_port}:${workspace.launch_port}`);
  debug(`Volume mount: ${workspacePath}:${containerPath}`);
  debug(`Container name: ${localName}`);
  async.series(
    [
      async () => {
        if (workspace.homedir_location === 'FileSystem') {
          try {
            await fsPromises.access(workspaceJobPath);
          } catch (err) {
            throw Error('Could not access workspace files.');
          }
        }
      },
      (callback) => {
        debug(`Creating directory ${workspaceJobPath}`);
        fs.mkdir(workspaceJobPath, { recursive: true }, (err) => {
          if (err && err.code !== 'EEXIST') {
            /* Ignore the directory if it already exists */
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
          }
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
              // Copied directly from externalGraderLocal.js
              Memory: 1 << 30, // 1 GiB
              MemorySwap: 1 << 30, // same as Memory, so no access to swap
              KernelMemory: 1 << 29, // 512 MiB
              DiskQuota: 1 << 30, // 1 GiB
              IpcMode: 'private',
              NetworkMode: networkMode,
              CpuPeriod: 100000, // microseconds
              CpuQuota: 90000, // portion of the CpuPeriod for this container
              PidsLimit: 1024,
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
              }
            );
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, container);
    }
  );
}
const _createContainerAsync = util.promisify(_createContainer);

function _startContainer(workspace, callback) {
  workspaceHelper.updateMessage(workspace.id, 'Starting container');
  workspace.container.start((err) => {
    if (ERR(err, callback)) return;
    callback(null, workspace);
  });
}
const _startContainerAsync = util.promisify(_startContainer);

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

  const { workspace_version } = (
    await sqldb.queryOneRowAsync(sql.select_workspace_version, { workspace_id })
  ).rows[0];
  const { homedir_location } = (
    await sqldb.queryOneRowAsync(sql.select_workspace_homedir_location, {
      workspace_id,
    })
  ).rows[0];
  const workspace = {
    id: workspace_id,
    launch_uuid: uuid,
    local_name: `workspace-${uuid}`,
    remote_name: `workspace-${workspace_id}-${workspace_version}`,
    homedir_location: homedir_location,
  };

  logger.info(
    `Launching workspace-${workspace_id}-${workspace_version} (useInitialZip=${useInitialZip})`
  );
  try {
    // only errors at this level will set host to unhealthy

    /* We only need to worry about the initial zip or syncing files if we're running on S3.
           Filesystem-backed workspaces can get away with no initial syncing steps. */
    if (homedir_location === 'S3') {
      try {
        if (useInitialZip) {
          debug(`init: bootstrapping workspace with initial.zip`);
          await _getInitialZipAsync(workspace);
        } else {
          debug(`init: syncing workspace from S3`);
          await _getInitialFilesAsync(workspace);
        }
      } catch (err) {
        workspaceHelper.updateState(
          workspace_id,
          'stopped',
          'Error loading workspace files.  Click "Reboot" to try again.'
        );
        return; /* Don't set host to unhealthy, we've probably bungled something up with S3. */
      }
    }

    try {
      debug(`init: configuring workspace`);
      workspace.launch_port = await _allocateContainerPort(workspace);
      workspace.settings = await _getWorkspaceSettingsAsync(workspace.id);
    } catch (err) {
      workspaceHelper.updateState(
        workspace_id,
        'stopped',
        `Error configuring workspace. Click "Reboot" to try again.`
      );
      return; // don't set host to unhealthy
    }

    try {
      await _pullImageAsync(workspace);
    } catch (err) {
      workspaceHelper.updateState(
        workspace_id,
        'stopped',
        `Error pulling image. Click "Reboot" to try again.`
      );
      return; // don't set host to unhealthy
    }

    try {
      workspaceHelper.updateMessage(workspace.id, 'Creating container');
      const hostname = `${workspace_server_settings.server_to_container_hostname}:${workspace.launch_port}`;
      await sqldb.queryAsync(sql.update_workspace_hostname, {
        workspace_id,
        hostname,
      });
      workspace.container = await _createContainerAsync(workspace);
    } catch (err) {
      workspaceHelper.updateState(
        workspace_id,
        'stopped',
        `Error creating container. Click "Reboot" to try again.`
      );
      return; // don't set host to unhealthy
    }

    try {
      await _startContainerAsync(workspace);
      await _checkServerAsync(workspace);
      debug(`init: container initialized for workspace_id=${workspace_id}`);
      workspaceHelper.updateState(workspace_id, 'running', null);
    } catch (err) {
      workspaceHelper.updateState(
        workspace_id,
        'stopped',
        `Error starting container. Click "Reboot" to try again.`
      );
      return; // don't set host to unhealthy
    }
  } catch (err) {
    markSelfUnhealthyAsync(err);
  }
}

// Called by the main server when the user want to reset the file to default
function resetSequence(workspace_id, res) {
  async.waterfall(
    [
      async () => {
        return await _getWorkspaceAsync(workspace_id);
      },
      _getInitialFiles,
    ],
    function (err) {
      if (err) {
        res.status(500).send(err);
      } else {
        res.status(200).send(`Code of workspace ${workspace_id} reset.`);
      }
    }
  );
}

function gradeSequence(workspace_id, res) {
  /* Define this outside so we can still use it in case of errors */
  let zipPath;
  async.waterfall(
    [
      async () => {
        const workspace = await _getWorkspaceAsync(workspace_id);
        const workspaceSettings = await _getWorkspaceSettingsAsync(workspace_id);
        const timestamp = new Date().toISOString().replace(/[-T:.]/g, '-');
        const zipName = `${workspace.remote_name}-${timestamp}.zip`;
        zipPath = path.join(config.workspaceHostZipsDirectory, zipName);

        let homeDir;
        if (workspace.homedir_location === 'S3') {
          homeDir = path.join(config.workspaceJobsDirectory, workspace.local_name);
        } else {
          homeDir = path.join(config.workspaceHostHomeDirRoot, workspace.remote_name, 'current');
        }

        return {
          workspace,
          workspaceSettings,
          workspaceDir: homeDir,
          zipPath,
        };
      },
      async (locals) => {
        const archive = archiver('zip');
        locals.archive = archive;
        for (const file of locals.workspaceSettings.workspace_graded_files) {
          try {
            const file_path = path.join(locals.workspaceDir, file);
            await fsPromises.lstat(file_path);
            archive.file(file_path, { name: file });
            debug(`Sending ${file}`);
          } catch (err) {
            logger.warn(`Graded file ${file} does not exist.`);
            continue;
          }
        }
        return locals;
      },
      (locals, callback) => {
        /* Write the zip archive to disk */
        const archive = locals.archive;
        let output = fs.createWriteStream(locals.zipPath);
        output.on('close', () => {
          callback(null, locals);
        });
        archive.on('warning', (warn) => {
          logger.warn(warn);
        });
        archive.on('error', (err) => {
          ERR(err, callback);
        });
        archive.pipe(output);
        archive.finalize();
      },
    ],
    (err, locals) => {
      if (err) {
        logger.error(`Error in gradeSequence: ${err}`);
        res.status(500).send(err);
        try {
          fsPromises.unlink(zipPath);
        } catch (err) {
          logger.error(`Error deleting ${zipPath}`);
        }
      } else {
        res.attachment(locals.zipPath);
        res.status(200).sendFile(locals.zipPath, { root: '/' }, (_err) => {
          try {
            fsPromises.unlink(locals.zipPath);
          } catch (err) {
            logger.error(`Error deleting ${locals.zipPath}`);
          }
        });
      }
    }
  );
}
