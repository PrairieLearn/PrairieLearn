// Boot sequence and safety guards for the experimental agent MCP server.
//
// This server is a local development tool. It exposes PrairieLearn's database,
// sync pipeline, and question rendering engine to an external agent harness
// with NO authorization checks. The guards in `assertLocalOnly` are the only
// thing standing between that and a production database, so they refuse to run
// anywhere that doesn't look unambiguously like a developer's machine.

import { cache } from '@prairielearn/cache';
import * as namedLocks from '@prairielearn/named-locks';
import * as sqldb from '@prairielearn/postgres';

import * as assets from '../lib/assets.js';
import * as codeCaller from '../lib/code-caller/index.js';
import { config, loadConfig } from '../lib/config.js';
import { type Course } from '../lib/db-types.js';
import * as load from '../lib/load.js';
import { selectCourseById } from '../models/course.js';
import * as freeformServer from '../question-servers/freeform.js';
import * as sprocs from '../sprocs/index.js';

/** Hosts that we're willing to believe are a developer's own machine. */
const ALLOWED_POSTGRES_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

/**
 * Search schema prefix for this process's stored procedures. The process ID is
 * part of the prefix so that concurrent MCP servers — a harness usually spawns
 * one automatically while a developer runs another by hand — don't drop each
 * other's schemas and leave the surviving process unable to call any sproc.
 */
const SCHEMA_PREFIX = `pl_mcp_${process.pid}`;

export class McpSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpSafetyError';
  }
}

/**
 * Refuses to continue if the process environment claims production. Runs before
 * the config is even loaded, so this is the first thing that can stop us.
 */
function assertNotProductionEnv() {
  if (process.env.NODE_ENV === 'production') {
    throw new McpSafetyError('NODE_ENV is "production". The agent MCP server is local-only.');
  }
}

/**
 * Refuses to continue unless the loaded config points at a local development
 * database. Called after the config loads and before any connection is opened.
 */
function assertLocalOnly() {
  assertNotProductionEnv();

  if (!config.devMode) {
    throw new McpSafetyError('config.devMode is false. The agent MCP server is local-only.');
  }

  if (!ALLOWED_POSTGRES_HOSTS.has(config.postgresqlHost)) {
    throw new McpSafetyError(
      `Refusing to connect to Postgres host "${config.postgresqlHost}". ` +
        `The agent MCP server only runs against ${Array.from(ALLOWED_POSTGRES_HOSTS).join(', ')}.`,
    );
  }
}

export interface McpContext {
  /** The single course this server is scoped to. */
  course: Course;
  /** Effective and authenticated user for rendering and test submissions. */
  userId: string;
  authnUserId: string;
}

let initialized = false;

/**
 * Initializes the subset of PrairieLearn that the tools need: config, database,
 * named locks, the Python worker pool, the element cache, and the freeform
 * question server. Mirrors the relevant portion of `server.ts`.
 */
export async function initPrairieLearn(configPaths: string[]) {
  if (initialized) return;

  // Checked before the config loads so that a production environment fails with
  // our message rather than a config validation error.
  assertNotProductionEnv();

  await loadConfig(configPaths);

  // Must happen after the config is loaded and before we touch the database.
  assertLocalOnly();

  const pgConfig = {
    user: config.postgresqlUser,
    database: config.postgresqlDatabase,
    host: config.postgresqlHost,
    password: config.postgresqlPassword ?? undefined,
    max: config.postgresqlPoolSize,
    idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
    ssl: config.postgresqlSsl,
    errorOnUnusedParameters: config.devMode,
  };

  const idleErrorHandler = (err: Error) => {
    console.error('Postgres idle client error', err);
  };

  await sqldb.initAsync(pgConfig, idleErrorHandler);
  await namedLocks.init(pgConfig, idleErrorHandler, {
    renewIntervalMs: config.namedLocksRenewIntervalMs,
  });

  // PrairieLearn keeps stored procedures in a per-process schema so that
  // servers can be upgraded independently (see `server.ts`). Sync and question
  // rendering both call sprocs, so this process needs its own copy. We clear
  // schemas left behind by an earlier crashed run of this same process ID
  // first, so repeated runs don't accumulate them; this is safe because
  // `assertLocalOnly` has already run.
  await sqldb.clearSchemasStartingWith(SCHEMA_PREFIX);
  await sqldb.setRandomSearchSchemaAsync(SCHEMA_PREFIX);
  await sprocs.init();

  // The load estimators are read by the code caller, so they have to exist
  // before we initialize the worker pool.
  load.initEstimator('python', 1, false);
  load.initEstimator('python_worker_active', 1);
  load.initEstimator('python_worker_idle', 1, false);
  load.initEstimator('python_callback_waiting', 1);

  await codeCaller.init({ lazyWorkers: true });
  // Rendering a question resolves asset URLs, which requires the asset
  // manifest to be loaded even though nothing here serves HTTP.
  await assets.init();
  await cache.init({
    type: config.cacheType,
    keyPrefix: config.cacheKeyPrefix,
    redisUrl: config.redisUrl,
  });
  await freeformServer.init();

  initialized = true;
}

export async function shutdownPrairieLearn() {
  if (!initialized) return;
  // Drop this process's sproc schema so schemas don't accumulate across runs.
  await sqldb.clearSchemasStartingWith(SCHEMA_PREFIX).catch(() => {});
  await codeCaller.finish();
  await cache.close();
  await namedLocks.close();
  await sqldb.closeAsync();
  initialized = false;
}

/**
 * Resolves the course this server is scoped to, and refuses courses that must
 * never be modified by an agent.
 */
export async function resolveCourse(courseId: string): Promise<Course> {
  const course = await selectCourseById(courseId);

  if (course.example_course) {
    throw new McpSafetyError(
      `Course ${courseId} is the example course, which cannot be modified. Use a scratch course.`,
    );
  }

  if (course.deleted_at !== null) {
    throw new McpSafetyError(`Course ${courseId} is deleted.`);
  }

  return course;
}
