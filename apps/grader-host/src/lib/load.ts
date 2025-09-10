import * as sqldb from '@prairielearn/postgres';

import { config } from './config.js';
import * as healthCheck from './healthCheck.js';
import * as lifecycle from './lifecycle.js';
import logger from './logger.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let initialized = false;
let currentJobs: number;
let maxJobs: number;
let lastEstimateTimeMS: number;
let lastIncrementTimeMS: number;
let integratedLoad: number;

export function init(newMaxJobs: number) {
  maxJobs = newMaxJobs;
  const nowMS = Date.now();
  lastEstimateTimeMS = nowMS;
  lastIncrementTimeMS = nowMS;
  integratedLoad = 0;
  currentJobs = 0;
  maxJobs = newMaxJobs;
  initialized = true;
  _reportLoad();
  _reportConfig();
}

export function startJob() {
  if (!initialized) return;
  _addIntegratedLoad();
  currentJobs++;
  if (currentJobs > maxJobs) throw new Error('startJob(): currentJobs > maxJobs');
}

export function endJob() {
  if (!initialized) return;
  _addIntegratedLoad();
  currentJobs--;
  if (currentJobs < 0) throw new Error('endJob(): currentJobs < 0');
}

export function getCurrentJobs() {
  return currentJobs;
}

function _getAndResetLoadEstimate() {
  _addIntegratedLoad();
  const nowMS = Date.now();
  const deltaSeconds = Math.max(1, nowMS - lastEstimateTimeMS) / 1000;
  const loadEstimate = integratedLoad / deltaSeconds;

  // reset stats
  lastEstimateTimeMS = nowMS;
  lastIncrementTimeMS = nowMS;
  integratedLoad = 0;

  return loadEstimate;
}

function _addIntegratedLoad() {
  const nowMS = Date.now();
  const delta = Math.max(1, nowMS - lastIncrementTimeMS) / 1000;
  integratedLoad += delta * currentJobs;
  lastIncrementTimeMS = nowMS;
}

function _reportLoad() {
  const params = {
    instance_id: config.instanceId,
    queue_name: config.jobsQueueName,
    average_jobs: _getAndResetLoadEstimate(),
    max_jobs: maxJobs,
    lifecycle_state: lifecycle.getState(),
    healthy: healthCheck.isHealthy(),
  };
  // Query will run in the background, without awaiting
  sqldb
    .execute(sql.insert_load, params)
    .catch((err) => {
      logger.error('Error reporting load:', err);
    })
    .finally(() => {
      // Report load again in the future
      setTimeout(_reportLoad, config.reportIntervalSec * 1000);
    });
}

function _reportConfig() {
  const params = {
    instance_id: config.instanceId,
    queue_name: config.jobsQueueName,
    average_jobs: 0,
    max_jobs: 0,
    config,
  };
  sqldb.execute(sql.insert_config, params).catch((err) => {
    logger.error('Error reporting config:', err);
  });
}
