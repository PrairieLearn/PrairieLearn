// @ts-check
const fetch = require('node-fetch').default;
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const fse = require('fs-extra');
const async = require('async');
const util = require('util');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
const klaw = require('klaw');
const { v4: uuidv4 } = require('uuid');
const tmp = require('tmp-promise');
const mustache = require('mustache');
const workspaceUtils = require('@prairielearn/workspace-utils');
const { contains } = require('@prairielearn/path-utils');

const config = require('./config');
const { logger } = require('@prairielearn/logger');
const socketServer = require('./socket-server');
const chunks = require('./chunks');

const sqldb = require('@prairielearn/postgres');
const ERR = require('async-stacktrace');
const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Internal error type for tracking submission with format issues.
 */
class SubmissionFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubmissionFormatError';
  }
}

module.exports = {
  SubmissionFormatError,

  async init() {
    workspaceUtils.init(socketServer.io);
    workspaceUtils.getWorkspaceSocketNamespace().on('connection', module.exports.connection);
  },

  /**
   * Called when a client connects to the workspace namespace.
   *
   * @param {import('socket.io').Socket} socket
   */
  connection(socket) {
    socket.on('joinWorkspace', (msg, callback) => {
      const workspace_id = msg.workspace_id;
      socket.join(`workspace-${workspace_id}`);

      sqldb.queryOneRow(sql.select_workspace, { workspace_id }, (err, result) => {
        if (ERR(err, callback)) return;
        const workspace = result.rows[0];

        callback({
          workspace_id,
          state: workspace.state,
        });
      });
    });

    socket.on('startWorkspace', (msg) => {
      const workspace_id = msg.workspace_id;
      module.exports.startup(workspace_id).catch(async (err) => {
        logger.error(`Error starting workspace ${workspace_id}`, err);
        await workspaceUtils.updateWorkspaceState(
          workspace_id,
          'stopped',
          `Error! Click "Reboot" to try again. Detail: ${err}`
        );
      });
    });

    socket.on('heartbeat', (msg, callback) => {
      const workspace_id = msg.workspace_id;
      sqldb.queryOneRow(sql.update_workspace_heartbeat_at_now, { workspace_id }, (err, result) => {
        if (ERR(err, callback)) return;
        const heartbeat_at = result.rows[0].heartbeat_at;
        callback({
          workspace_id,
          heartbeat_at,
        });
      });
    });
  },

  async controlContainer(workspace_id, action, options = {}) {
    const result = await sqldb.queryZeroOrOneRowAsync(sql.select_workspace_host, { workspace_id });
    if (result.rowCount === 0) {
      throw new Error(`No host for workspace_id=${workspace_id}`);
    }
    if (!config.workspaceEnable) return;

    const workspace_host = result.rows[0];
    const postJson = {
      workspace_id,
      action,
      options,
    };
    const res = await fetch(`http://${workspace_host.hostname}/`, {
      method: 'post',
      body: JSON.stringify(postJson),
      headers: { 'Content-Type': 'application/json' },
    });
    if (action === 'getGradedFiles') {
      if (!res.ok) {
        throw new SubmissionFormatError((await res.json()).message);
      }
      const contentDisposition = res.headers.get('content-disposition');
      if (contentDisposition == null) throw new Error(`Content-Disposition is null`);
      const match = contentDisposition.match(/^attachment; filename="(.*)"$/);
      if (!match) throw new Error(`Content-Disposition format error: ${contentDisposition}`);
      const zipPath = await tmp.tmpName({ postfix: '.zip' });

      debug(`controlContainer: saving ${zipPath}`);
      let stream = fs.createWriteStream(zipPath);

      return new Promise((resolve, reject) => {
        stream
          .on('open', () => {
            res.body.pipe(stream);
          })
          .on('error', (err) => {
            reject(err);
          })
          .on('finish', () => {
            resolve(zipPath);
          });
      });
    }
    if (res.ok) return;

    // if there was an error, we should have an error message from the host
    const json = await res.json();
    throw new Error(`Error from workspace host: ${json.message}`);
  },

  async startup(workspace_id) {
    const result = await sqldb.queryOneRowAsync(sql.select_workspace, { workspace_id });
    const state = result.rows[0].state;

    if (state !== 'uninitialized' && state !== 'stopped') return;

    let useInitialZip = state === 'uninitialized';

    /** @type {InitializeResult | null} */
    let initializeResult;
    if (state === 'uninitialized') {
      initializeResult = await module.exports.initialize(workspace_id);
    }

    // We don't lock the above call to `initialize()` because it contains
    // a fair amount of I/O and we don't want to hold a lock during a
    // potentially long operation. However, we will lock here to ensure
    // that we don't run into problems if `startup()` was called concurrently
    // somewhere else:
    //
    // - We don't want an interleaving of state transitions like this:
    //   stopped -> launching -> stopped -> launching
    // - We don't want multiple hosts trying to assign a host for the same
    //   workspace at the same time.
    let shouldAssignHost = false;
    await sqldb.runInTransactionAsync(async () => {
      // First, lock the workspace row.
      const workspaceResults = await sqldb.queryOneRowAsync(sql.select_and_lock_workspace, {
        workspace_id,
      });
      const workspace = workspaceResults.rows[0];

      // If the initial state was `uninitialized`, we should check if it's
      // still uninitialized. If so, we'll need to perform a state transition.
      const shouldTransitionToStopped =
        state === 'uninitialized' && workspace.state === 'uninitialized';
      if (shouldTransitionToStopped) {
        if (initializeResult !== null) {
          // First, move any existing directory out of the way to get a clean start. This
          // should never happen in production environments, but when running
          // workspaces locally in development, we may end up trying to reuse the
          // same workspace ID and thus directory, for instance if the database
          // is reset in the middle of testing. In that case, we want to ensure
          // that we don't try to write on top of an existing directory, as this
          // could lead to unexpected behavior.
          try {
            const timestampSuffix = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, '-');
            await fse.move(
              initializeResult.destinationPath,
              `${initializeResult.destinationPath}-bak-${timestampSuffix}`,
              {
                overwrite: true,
              }
            );
          } catch (err) {
            // If the directory couldn't be moved because it didn't exist, ignore the error.
            // But otherwise, rethrow it.
            if (err.code !== 'ENOENT') {
              throw err;
            }
          }

          // Next, move the newly created directory into place. This will be
          // done with a lock held, so we shouldn't worry about other processes
          // trying to work with these directories at the same time.
          await fse.move(initializeResult.sourcePath, initializeResult.destinationPath, {
            overwrite: true,
          });
        }
        await workspaceUtils.updateWorkspaceState(
          workspace_id,
          'stopped',
          'Initialization complete'
        );
      }

      // If the workspace is in the stopped state (or we just transitioned to it),
      // transition to the launching state.
      if (workspace.state === 'stopped' || shouldTransitionToStopped) {
        await workspaceUtils.updateWorkspaceState(
          workspace_id,
          'launching',
          'Assigning workspace host'
        );
        shouldAssignHost = true;
      }
    });

    // Bail out if needed; this should only ever occur if another host is
    // already trying to assign this host to a workspace.
    if (!shouldAssignHost) return;

    let workspace_host_id = null;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (attempt > config.workspaceLaunchingRetryAttempts) {
        throw new Error('Time exceeded to deploy more computational resources');
      }
      workspace_host_id = await module.exports.assignHost(workspace_id);
      if (workspace_host_id != null) {
        break; // success, we got a host
      }
      const t = attempt * config.workspaceLaunchingRetryIntervalSec;
      await workspaceUtils.updateWorkspaceMessage(
        workspace_id,
        `Deploying more computational resources (${t} seconds elapsed)`
      );
      await util.promisify(setTimeout)(config.workspaceLaunchingRetryIntervalSec * 1000);
      attempt++;
    }
    await workspaceUtils.updateWorkspaceMessage(workspace_id, 'Sending launch command to host');
    await module.exports.controlContainer(workspace_id, 'init', {
      useInitialZip,
    });
  },

  /**
   * @typedef {Object} InitializeResult
   * @property {string} sourcePath
   * @property {string} destinationPath
   */

  /**
   * This function constructs the initial state of a workspace.
   *
   * We'll construct the initial directory on disk in a temporary location and
   * then return the path to that directory, as well as the path that the
   * directory should be moved to. The caller is responsible for obtaining a
   * lock for this workspace and moving the directory into its final location.
   * Locking ensures that multiple hosts can't clobber writes to the same
   * workspace. This is mostly important on NFS volumes, where renames (moves)
   * are not atomic.
   *
   * @param {string | number} workspace_id
   * @returns {Promise<InitializeResult | null>}
   */
  async initialize(workspace_id) {
    const { workspace, variant, question, course } = (
      await sqldb.queryOneRowAsync(sql.select_workspace_data, { workspace_id })
    ).rows[0];
    const course_path = chunks.getRuntimeDirectoryForCourse(course);
    await chunks.ensureChunksForCourseAsync(course.id, {
      type: 'question',
      questionId: question.id,
    });

    // TODO: remove this code once nothing is reading from the `homedir_location` columns.
    await sqldb.queryOneRowAsync(sql.update_workspace_homedir_location, {
      workspace_id,
      homedir_location: 'FileSystem',
    });

    // local workspace files
    const questionBasePath = path.join(course_path, 'questions', question.qid);
    const localPath = path.join(questionBasePath, 'workspace');
    const templatePath = path.join(questionBasePath, 'workspaceTemplates');

    // base workspace directory wherever we are uploading to
    const remoteDirName = `workspace-${workspace_id}-${workspace.version}`;
    const remotePath = path.join(remoteDirName, 'current');

    const staticFiles = (
      await async
        .mapSeries(klaw(localPath), async (file) => {
          return file.stats.isFile()
            ? { name: path.relative(localPath, file.path), localPath: file.path }
            : null;
        })
        .catch(() => {
          // Path does not exist or is not accessible, do nothing
          return [];
        })
    ).filter((file) => file);

    const mustacheParams = { params: variant.params, correct_answers: variant.true_answer };

    const templateFiles = (
      await async
        .mapSeries(klaw(templatePath), async (file) => {
          const generatedFileName = path.relative(
            templatePath,
            file.path.replace(/\.mustache$/i, '')
          );
          try {
            if (!file.stats.isFile()) return null;
            return {
              name: generatedFileName,
              buffer: mustache.render(
                await fsPromises.readFile(file.path, { encoding: 'utf-8' }),
                mustacheParams
              ),
            };
          } catch (_err) {
            // File cannot be rendered, treat file as static file
            return { name: generatedFileName, localPath: file.path };
          }
        })
        .catch(() => {
          // Template directory does not exist or is not accessible, do nothing
          return [];
        })
    ).filter((file) => file);

    /** @type {{name: string; localPath?: string; buffer?: Buffer }[]} */
    const dynamicFiles = (
      await async.mapSeries(variant.params._workspace_files || [], async (file) => {
        try {
          // Ignore files without a name
          if (!file.name) return null;
          // Discard names with directory traversal outside the home directory
          if (!contains(remotePath, path.join(remotePath, file.name), false)) {
            return null;
          }

          if (file.questionFile) {
            const localPath = path.join(questionBasePath, file.questionFile);
            // Discard paths with directory traversal outside the question
            if (!contains(questionBasePath, localPath, false)) return null;
            // To avoid race conditions, no check if file exists here, rather an exception is
            // captured when attempting to copy.
            return {
              name: file.name,
              localPath,
            };
          }

          // Discard encodings outside of explicit list of allowed encodings
          if (file.encoding && !['utf-8', 'base64', 'hex'].includes(file.encoding)) {
            return null;
          }
          return {
            name: file.name,
            buffer: Buffer.from(file.contents ?? '', file.encoding || 'utf-8'),
          };
        } catch (_err) {
          // Error retrieving contents of dynamic file. Ignoring file.
          return null;
        }
      })
    ).filter((file) => file);

    const allWorkspaceFiles = staticFiles.concat(templateFiles).concat(dynamicFiles);

    const root = config.workspaceHomeDirRoot;
    const destinationPath = path.join(root, remotePath);
    const sourcePath = `${destinationPath}-${uuidv4()}`;

    await fse.ensureDir(sourcePath);
    await fsPromises.chown(
      sourcePath,
      config.workspaceJobsDirectoryOwnerUid,
      config.workspaceJobsDirectoryOwnerGid
    );

    if (allWorkspaceFiles.length > 0) {
      await async.eachSeries(allWorkspaceFiles, async ({ name, localPath, buffer }) => {
        const sourceFile = path.join(sourcePath, name);
        try {
          await fse.ensureDir(path.dirname(sourceFile));
          if (localPath) {
            await fse.copy(localPath, sourceFile);
          } else {
            await fse.writeFile(sourceFile, buffer);
          }
        } catch (err) {
          debug(`File ${name} could not be written`, err);
        }
      });

      // Update permissions so that the directory and all contents are owned by the workspace user
      for await (const file of klaw(sourcePath)) {
        await fsPromises.chown(
          file.path,
          config.workspaceJobsDirectoryOwnerUid,
          config.workspaceJobsDirectoryOwnerGid
        );
      }
    }

    return {
      sourcePath,
      destinationPath,
    };
  },

  async assignHost(workspace_id) {
    if (!config.workspaceEnable) return;

    const params = [workspace_id, config.workspaceLoadHostCapacity];
    const result = await sqldb.callOneRowAsync('workspace_hosts_assign_workspace', params);
    const workspace_host_id = result.rows[0].workspace_host_id;
    debug(`assignHost(): workspace_id=${workspace_id}, workspace_host_id=${workspace_host_id}`);
    return workspace_host_id; // null means we didn't assign a host
  },

  async getGradedFiles(workspace_id) {
    let zipPath;
    const workspace = (await sqldb.queryOneRowAsync(sql.select_workspace, { workspace_id }))
      .rows[0];

    if (workspace.state === 'uninitialized') {
      // there are no files yet
      return null;
    }

    if (workspace.state === 'running') {
      // Attempt to get the files directly from the host.
      try {
        zipPath = await module.exports.controlContainer(workspace_id, 'getGradedFiles');
      } catch (err) {
        logger.error('Error getting graded files from container', err);
        if (err instanceof SubmissionFormatError) throw err;
      }
    }

    // If this is null, something went wrong, so fall back to fetching from the filesystem.
    if (zipPath == null) {
      zipPath = await module.exports.getGradedFilesFromFileSystem(workspace_id);
    }

    return zipPath;
  },

  async getGradedFilesFromFileSystem(workspace_id) {
    const { workspace_version, workspace_graded_files } = (
      await sqldb.queryOneRowAsync(sql.select_workspace_version_and_graded_files, { workspace_id })
    ).rows[0];
    const zipPath = await tmp.tmpName({ postfix: '.zip' });

    const archive = archiver('zip');
    const remoteName = `workspace-${workspace_id}-${workspace_version}`;
    const remoteDir = path.join(config.workspaceHomeDirRoot, remoteName, 'current');

    let gradedFiles;
    try {
      gradedFiles = await workspaceUtils.getWorkspaceGradedFiles(
        remoteDir,
        workspace_graded_files,
        {
          maxFiles: config.workspaceMaxGradedFilesCount,
          maxSize: config.workspaceMaxGradedFilesSize,
        }
      );
    } catch (err) {
      // Turn any error into a `SubmissionFormatError` so that it is handled correctly.
      throw new SubmissionFormatError(err.message);
    }

    // Zip files from filesystem to zip file
    await async.eachLimit(gradedFiles, config.workspaceJobsParallelLimit, async (file) => {
      try {
        const remotePath = path.join(remoteDir, file.path);
        debug(`Zipping graded file ${remotePath} into ${zipPath}`);
        archive.file(remotePath, { name: file.path });
      } catch (err) {
        debug(`Graded file ${file.path} does not exist`);
      }
    });

    // Write zip file to disk
    const stream = fs.createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
      stream
        .on('open', () => {
          archive.pipe(stream);
          archive.on('error', (err) => {
            throw err;
          });
          archive.finalize();
        })
        .on('error', (err) => {
          reject(err);
        })
        .on('finish', () => {
          debug(`Zipped graded files as ${zipPath} (${archive.pointer()} total bytes)`);
          resolve(zipPath);
        });
    });
    return zipPath;
  },
};
