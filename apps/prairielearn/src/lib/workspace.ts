// @ts-check
import fetch from 'node-fetch';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as fse from 'fs-extra';
import * as async from 'async';
import debugfn from 'debug';
import archiver = require('archiver');
import klaw = require('klaw');
import { v4 as uuidv4 } from 'uuid';
import * as tmp from 'tmp-promise';
import * as mustache from 'mustache';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { ok as assert } from 'node:assert';
import type { Socket } from 'socket.io';
import type { Entry } from 'fast-glob';

import * as sqldb from '@prairielearn/postgres';
import * as workspaceUtils from '@prairielearn/workspace-utils';
import { contains } from '@prairielearn/path-utils';
import { checkSignedToken } from '@prairielearn/signed-token';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from './config';
import * as socketServer from './socket-server';
import * as chunks from './chunks';
import * as workspaceHostUtils from './workspaceHost';
import * as issues from './issues';
import {
  CourseSchema,
  DateFromISOString,
  QuestionSchema,
  VariantSchema,
  WorkspaceHostSchema,
  WorkspaceSchema,
} from './db-types';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqldb.loadSqlEquiv(__filename);

const WorkspaceDataSchema = z.object({
  workspace: WorkspaceSchema,
  variant: VariantSchema,
  question: QuestionSchema,
  course: CourseSchema,
});

const WorkspaceVersionAndGradedFilesSchema = z.object({
  workspace_version: WorkspaceSchema.shape.version,
  workspace_graded_files: QuestionSchema.shape.workspace_graded_files,
});

interface DiskWorkspaceFile {
  name: string;
  localPath: string;
}

interface BufferWorkspaceFile {
  name: string;
  buffer: Buffer | string;
}

type WorkspaceFile = DiskWorkspaceFile | BufferWorkspaceFile;

interface DynamicWorkspaceFile {
  name?: string;
  contents?: string;
  encoding?: BufferEncoding;
  questionFile?: string;
}

interface InitializeResult {
  sourcePath: string;
  destinationPath: string;
}

/**
 * Internal error type for tracking submission with format issues.
 */
export class SubmissionFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubmissionFormatError';
  }
}

export async function init(): Promise<void> {
  workspaceUtils.init(socketServer.io);
  socketServer.io
    .of(workspaceUtils.WORKSPACE_SOCKET_NAMESPACE)
    .use((socket, next) => {
      if (!socket.handshake.auth.workspace_id) {
        next(new Error('No workspace_id provided'));
        return;
      }

      if (
        !socket.handshake.auth.token ||
        !checkSignedToken(
          socket.handshake.auth.token,
          { workspace_id: socket.handshake.auth.workspace_id },
          config.secretKey,
        )
      ) {
        next(new Error('Invalid token'));
        return;
      }

      next();
    })
    .on('connection', connection);
}

/**
 * Called when a client connects to the workspace namespace.
 */
function connection(socket: Socket) {
  // The middleware will have already ensured that this property exists and
  // that the client possesses a token that is valid for this workspace ID.
  const workspace_id = socket.handshake.auth.workspace_id;

  socket.on('joinWorkspace', (...args) => {
    // Forwards compatibility with clients who may no longer be sending a message.
    // TODO: remove this in the future once all clients have been updated.
    const callback = args.at(-1);

    socket.join(`workspace-${workspace_id}`);

    sqldb.queryRow(sql.select_workspace, { workspace_id }, WorkspaceSchema).then(
      (workspace) => callback({ workspace_id, state: workspace.state }),
      (err) => {
        callback({ errorMessage: err.message });
        Sentry.captureException(err);
      },
    );
  });

  socket.on('startWorkspace', () => {
    startup(workspace_id).catch(async (err) => {
      logger.error(`Error starting workspace ${workspace_id}`, err);
      await workspaceUtils.updateWorkspaceState(
        workspace_id,
        'stopped',
        `Error! Click "Reboot" to try again. Detail: ${err}`,
      );
    });
  });

  socket.on('heartbeat', (...args) => {
    // Forwards compatibility with clients who may no longer be sending a message.
    // TODO: remove this in the future once all clients have been updated.
    const callback = args.at(-1);

    sqldb.queryRow(sql.update_workspace_heartbeat_at_now, { workspace_id }, DateFromISOString).then(
      (heartbeat_at) => callback({ workspace_id, heartbeat_at }),
      (err) => {
        callback({ errorMessage: err.message });
        Sentry.captureException(err);
      },
    );
  });
}

async function controlContainer(workspace_id: string, action: 'getGradedFiles'): Promise<string>;
async function controlContainer(
  workspace_id: string,
  action: 'init',
  options: { useInitialZip: boolean },
): Promise<void>;
async function controlContainer(
  workspace_id: string,
  action: 'init' | 'getGradedFiles',
  options = {},
): Promise<any> {
  const workspace_host = await sqldb.queryOptionalRow(
    sql.select_workspace_host,
    { workspace_id },
    WorkspaceHostSchema,
  );
  if (workspace_host == null) {
    throw new Error(`No host for workspace_id=${workspace_id}`);
  }
  if (!config.workspaceEnable) return;

  const postJson = { workspace_id, action, options };
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
    const stream = fs.createWriteStream(zipPath);

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
}

async function startup(workspace_id: string): Promise<void> {
  const result = await sqldb.queryRow(sql.select_workspace, { workspace_id }, WorkspaceSchema);
  const state = result.state;

  if (state !== 'uninitialized' && state !== 'stopped') return;

  const useInitialZip = state === 'uninitialized';

  let initializeResult: InitializeResult | null = null;
  if (state === 'uninitialized') {
    initializeResult = await initialize(workspace_id);
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
    const workspace = await sqldb.queryRow(
      sql.select_and_lock_workspace,
      { workspace_id },
      WorkspaceSchema,
    );

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
            { overwrite: true },
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
      await workspaceUtils.updateWorkspaceState(workspace_id, 'stopped', 'Initialization complete');
    }

    // If the workspace is in the stopped state (or we just transitioned to it),
    // transition to the launching state.
    if (workspace.state === 'stopped' || shouldTransitionToStopped) {
      await workspaceUtils.updateWorkspaceState(
        workspace_id,
        'launching',
        'Assigning workspace host',
      );
      shouldAssignHost = true;
    }
  });

  // Bail out if needed; this should only ever occur if another host is
  // already trying to assign this host to a workspace.
  if (!shouldAssignHost) return;

  let workspace_host_id: string | null = null;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (attempt > config.workspaceLaunchingRetryAttempts) {
      throw new Error('Time exceeded to deploy more computational resources');
    }
    workspace_host_id = await assignHost(workspace_id);
    if (workspace_host_id != null) {
      break; // success, we got a host
    }
    const t = attempt * config.workspaceLaunchingRetryIntervalSec;
    await workspaceUtils.updateWorkspaceMessage(
      workspace_id,
      `Deploying more computational resources (${t} seconds elapsed)`,
    );
    await sleep(config.workspaceLaunchingRetryIntervalSec * 1000);
    attempt++;
  }
  await workspaceUtils.updateWorkspaceMessage(workspace_id, 'Sending launch command to host');
  await controlContainer(workspace_id, 'init', { useInitialZip });
}

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
 */
async function initialize(workspace_id: string): Promise<InitializeResult> {
  const { workspace, variant, question, course } = await sqldb.queryRow(
    sql.select_workspace_data,
    { workspace_id },
    WorkspaceDataSchema,
  );

  assert(question.qid, `Workspace ${workspace_id} is part of a question that has no directory`);

  const course_path = chunks.getRuntimeDirectoryForCourse({ id: course.id, path: course.path });
  await chunks.ensureChunksForCourseAsync(course.id, {
    type: 'question',
    questionId: question.id,
  });

  const fileGenerationErrors: {
    file: string;
    msg: string;
    err?: any;
    data?: Record<string, any>;
  }[] = [];

  // local workspace files
  const questionBasePath = path.join(course_path, 'questions', question.qid);
  const localPath = path.join(questionBasePath, 'workspace');
  const templatePath = path.join(questionBasePath, 'workspaceTemplates');

  // base workspace directory wherever we are uploading to
  const remoteDirName = `workspace-${workspace_id}-${workspace.version}`;
  const remotePath = path.join(remoteDirName, 'current');

  const staticFiles: WorkspaceFile[] = (
    await async
      .mapSeries(klaw(localPath), async (file: klaw.Item): Promise<WorkspaceFile | null> => {
        return file.stats.isFile()
          ? { name: path.relative(localPath, file.path), localPath: file.path }
          : null;
      })
      .catch(() => {
        // Path does not exist or is not accessible, do nothing
        return [] as (WorkspaceFile | null)[];
      })
  ).filter((file): file is WorkspaceFile => !!file);

  const mustacheParams = { params: variant.params, correct_answers: variant.true_answer };

  const templateFiles: WorkspaceFile[] = (
    await async
      .mapSeries(klaw(templatePath), async (file: klaw.Item): Promise<WorkspaceFile | null> => {
        const generatedFileName = path.relative(
          templatePath,
          file.path.replace(/\.mustache$/i, ''),
        );
        try {
          if (!file.stats.isFile()) return null;
          return {
            name: generatedFileName,
            buffer: mustache.render(
              await fsPromises.readFile(file.path, { encoding: 'utf-8' }),
              mustacheParams,
            ),
          };
        } catch (err) {
          fileGenerationErrors.push({
            file: generatedFileName,
            err,
            msg: `Error rendering workspace template file: ${err.message}`,
          });
          // File cannot be rendered, treat file as static file
          return { name: generatedFileName, localPath: file.path };
        }
      })
      .catch(() => {
        // Template directory does not exist or is not accessible, do nothing
        return [] as (WorkspaceFile | null)[];
      })
  ).filter((file): file is WorkspaceFile => !!file);

  const dynamicFiles: WorkspaceFile[] =
    (variant.params?._workspace_files as DynamicWorkspaceFile[] | null)
      ?.map((file: DynamicWorkspaceFile, i: number): WorkspaceFile | null => {
        // Ignore files without a name
        if (!file?.name) {
          fileGenerationErrors.push({
            file: `Dynamic file ${i}`,
            msg: 'Dynamic workspace file does not include a name. File ignored.',
            data: file,
          });
          return null;
        }
        try {
          // Discard names with directory traversal outside the home directory
          if (!contains(remotePath, path.join(remotePath, file.name), false)) {
            fileGenerationErrors.push({
              file: file.name,
              msg: 'Dynamic workspace file includes a name that traverses outside the home directory. File ignored.',
              data: file,
            });
            return null;
          }

          if (file.questionFile) {
            const localPath = path.join(questionBasePath, file.questionFile);
            // Discard paths with directory traversal outside the question
            if (!contains(questionBasePath, localPath, false)) {
              fileGenerationErrors.push({
                file: file.name,
                msg: 'Dynamic workspace file points to a local file outside the question directory. File ignored.',
                data: file,
              });
              return null;
            }
            // To avoid race conditions, no check if file exists here, rather an exception is
            // captured when attempting to copy.
            return {
              name: file.name,
              localPath,
            };
          }

          // Discard encodings outside of explicit list of allowed encodings
          if (file.encoding && !['utf-8', 'base64', 'hex'].includes(file.encoding)) {
            fileGenerationErrors.push({
              file: file.name,
              msg: `Dynamic workspace file has unsupported file encoding (${file.encoding}). File ignored.`,
              data: file,
            });
            return null;
          }

          if (!('contents' in file)) {
            fileGenerationErrors.push({
              file: file.name,
              msg: `Dynamic workspace file has neither "contents" nor "questionFile". Blank file created.`,
              data: file,
            });
          }

          return {
            name: file.name,
            buffer: Buffer.from(file.contents ?? '', file.encoding || 'utf-8'),
          };
        } catch (err) {
          // Error retrieving contents of dynamic file. Ignoring file.
          fileGenerationErrors.push({
            file: file.name,
            msg: `Error decoding dynamic workspace file: ${err.message}`,
            err,
            data: file,
          });
          return null;
        }
      })
      .filter((file): file is WorkspaceFile => !!file) ?? [];

  const allWorkspaceFiles = staticFiles.concat(templateFiles).concat(dynamicFiles);

  const root = config.workspaceHomeDirRoot;
  const destinationPath = path.join(root, remotePath);
  const sourcePath = `${destinationPath}-${uuidv4()}`;

  await fse.ensureDir(sourcePath);
  await fsPromises.chown(
    sourcePath,
    config.workspaceJobsDirectoryOwnerUid,
    config.workspaceJobsDirectoryOwnerGid,
  );

  if (allWorkspaceFiles.length > 0) {
    await async.eachSeries(allWorkspaceFiles, async (workspaceFile) => {
      const sourceFile = path.join(sourcePath, workspaceFile.name);
      try {
        await fse.ensureDir(path.dirname(sourceFile));
        if ('localPath' in workspaceFile) {
          await fse.copy(workspaceFile.localPath, sourceFile);
        } else {
          await fse.writeFile(sourceFile, workspaceFile.buffer);
        }
      } catch (err) {
        fileGenerationErrors.push({
          file: workspaceFile.name,
          msg: `Workspace file could not be written to workspace: ${err.message}`,
          err,
          data: { workspaceFile },
        });
        debug(`File ${workspaceFile.name} could not be written`, err);
      }
    });

    // Update permissions so that the directory and all contents are owned by the workspace user
    for await (const file of klaw(sourcePath)) {
      await fsPromises.chown(
        file.path,
        config.workspaceJobsDirectoryOwnerUid,
        config.workspaceJobsDirectoryOwnerGid,
      );
    }
  }

  if (fileGenerationErrors.length > 0) {
    const output = fileGenerationErrors.map((error) => `${error.file}: ${error.msg}`).join('\n');
    issues.insertIssue({
      variantId: variant.id,
      studentMessage: 'Error initializing workspace files',
      instructorMessage: 'Error initializing workspace files',
      manuallyReported: false,
      courseCaused: true,
      courseData: { workspace, variant, question, course },
      systemData: {
        courseErrData: {
          // This is shown in the console log of the issue
          outputBoth: output,
          // This data is only shown if user is admin (e.g., in dev mode).
          errors: fileGenerationErrors.map((error) => ({
            ...error,
            // Since error is typically not serializable, a custom object is created.
            err: serializeError(error.err),
          })),
        },
      },
      authnUserId: null,
    });
  }

  return {
    sourcePath,
    destinationPath,
  };
}

/**
 * @returns The ID of the host that was assigned to the workspace.
 */
async function assignHost(workspace_id: string): Promise<string | null> {
  if (!config.workspaceEnable) return null;

  const workspaceHostId = await workspaceHostUtils.assignWorkspaceToHost(
    workspace_id,
    config.workspaceLoadHostCapacity,
  );
  debug(`assignHost(): workspace_id=${workspace_id}, workspace_host_id=${workspaceHostId}`);
  return workspaceHostId; // null means we didn't assign a host
}

export async function getGradedFiles(workspace_id: string): Promise<string | null> {
  let zipPath: string | null = null;
  const workspace = await sqldb.queryRow(sql.select_workspace, { workspace_id }, WorkspaceSchema);

  if (workspace.state === 'uninitialized') {
    // there are no files yet
    return null;
  }

  if (workspace.state === 'running') {
    // Attempt to get the files directly from the host.
    try {
      zipPath = await controlContainer(workspace_id, 'getGradedFiles');
    } catch (err) {
      logger.error('Error getting graded files from container', err);
      if (err instanceof SubmissionFormatError) throw err;
    }
  }

  // If this is null, something went wrong, so fall back to fetching from the filesystem.
  if (zipPath == null) {
    zipPath = await getGradedFilesFromFileSystem(workspace_id);
  }

  return zipPath;
}

async function getGradedFilesFromFileSystem(workspace_id: string): Promise<string | null> {
  const { workspace_version, workspace_graded_files } = await sqldb.queryRow(
    sql.select_workspace_version_and_graded_files,
    { workspace_id },
    WorkspaceVersionAndGradedFilesSchema,
  );
  const zipPath = await tmp.tmpName({ postfix: '.zip' });

  const archive = archiver('zip');
  const remoteName = `workspace-${workspace_id}-${workspace_version}`;
  const remoteDir = path.join(config.workspaceHomeDirRoot, remoteName, 'current');

  let gradedFiles: Entry[];
  try {
    gradedFiles = await workspaceUtils.getWorkspaceGradedFiles(
      remoteDir,
      workspace_graded_files ?? [],
      {
        maxFiles: config.workspaceMaxGradedFilesCount,
        maxSize: config.workspaceMaxGradedFilesSize,
      },
    );
  } catch (err) {
    // Turn any error into a `SubmissionFormatError` so that it is handled correctly.
    throw new SubmissionFormatError(err.message);
  }

  // Zip files from filesystem to zip file
  (gradedFiles ?? []).forEach((file) => {
    const remotePath = path.join(remoteDir, file.path);
    debug(`Zipping graded file ${remotePath} into ${zipPath}`);
    archive.file(remotePath, { name: file.path });
  });

  // Write zip file to disk
  const stream = fs.createWriteStream(zipPath);
  await new Promise((resolve, reject) => {
    archive.on('error', (err) => reject(err));

    stream
      .on('error', (err) => reject(err))
      .on('finish', () => {
        debug(`Zipped graded files as ${zipPath} (${archive.pointer()} total bytes)`);
        resolve(zipPath);
      });

    archive.pipe(stream);
    archive.finalize().catch((err) => reject(err));
  });
  return zipPath;
}

function serializeError(
  err: (Error & { data?: any; cause?: Error }) | null,
): (Error & { data?: any; cause?: Error }) | null {
  if (err == null) return err;
  return {
    ...err,
    stack: err.stack,
    data: err.data,
    message: err.message,
    cause: err.cause,
  };
}
