import debugfn from 'debug';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const debug = debugfn('prairielearn:load');

interface JobLoad {
  startMS: number;
  warned?: boolean;
}

class LoadEstimator {
  jobType: string;
  lastEstimateTimeMS: number;
  lastIncrementTimeMS: number;
  integratedLoad: number;
  currentJobs: Record<string, JobLoad>;
  maxJobCount: number;
  warnOnOldJobs: boolean;
  timeoutID: NodeJS.Timeout | null;
  active: boolean;
  constructor(jobType: string, maxJobCount?: number, warnOnOldJobs?: boolean) {
    debug(`LoadEstimator(): jobType = ${jobType}`);
    this.jobType = jobType;
    const nowMS = Date.now();
    this.lastEstimateTimeMS = nowMS;
    this.lastIncrementTimeMS = nowMS;
    this.integratedLoad = 0;
    this.currentJobs = {};
    this.maxJobCount = maxJobCount || 1;
    this.warnOnOldJobs = warnOnOldJobs == null ? true : warnOnOldJobs;
    this.timeoutID = null;
    this.active = true;
    this._reportLoad();
  }

  startJob(id: string) {
    debug(`LoadEstimator.startJob(): jobType = ${this.jobType}, id = ${id}`);
    this._addIntegratedLoad();
    if (Object.prototype.hasOwnProperty.call(this.currentJobs, id)) {
      logger.error(`load.startJob(): ${this.jobType} id already running: ${id}`);
    }
    this.currentJobs[id] = { startMS: Date.now() };
  }

  endJob(id: string) {
    debug(`LoadEstimator.endJob(): jobType = ${this.jobType}, id = ${id}`);
    this._addIntegratedLoad();
    if (Object.prototype.hasOwnProperty.call(this.currentJobs, id)) {
      delete this.currentJobs[id];
    } else {
      logger.error(`load.endJob(): ${this.jobType} no such id: ${id}`);
    }
  }

  close() {
    debug(`LoadEstimator.close(): jobType = ${this.jobType}`);
    this.active = false;
    if (this.timeoutID != null) {
      debug(`LoadEstimator.close(): jobType = ${this.jobType}, clearing timeout`);
      clearTimeout(this.timeoutID);
    }
  }

  _getAndResetLoadEstimate() {
    debug(`LoadEstimator._getAndResetLoadEstimate(): jobType = ${this.jobType}`);
    this._addIntegratedLoad();
    const nowMS = Date.now();
    const deltaSeconds = Math.max(1, nowMS - this.lastEstimateTimeMS) / 1000;
    const loadEstimate = this.integratedLoad / deltaSeconds;

    // reset stats
    this.lastEstimateTimeMS = nowMS;
    this.lastIncrementTimeMS = nowMS;
    this.integratedLoad = 0;

    return loadEstimate;
  }

  _addIntegratedLoad() {
    debug(`LoadEstimator._addIntegratedLoad(): jobType = ${this.jobType}`);
    const currentJobCount = Object.keys(this.currentJobs).length;
    const nowMS = Date.now();
    const delta = Math.max(1, nowMS - this.lastIncrementTimeMS) / 1000;
    this.integratedLoad += delta * currentJobCount;
    this.lastIncrementTimeMS = nowMS;
  }

  _reportLoad() {
    debug(`LoadEstimator._reportLoad(): jobType = ${this.jobType}`);
    this._warnOldJobs();
    const params = {
      // The instance ID used in the `server_loads` table is not quite the same
      // as the actual instance ID from the config. The config instance ID is
      // the identifier of the EC2 instance we're running on, but we might be
      // running multiple PrairieLearn instances on the same EC2 instance. So,
      // we'll append the port number to get a unique identifier for each
      // distinct PrairieLearn instance.
      //
      // This new value would be more accurately called a "server ID".
      instance_id: `${config.instanceId}:${config.serverPort}`,
      group_name: config.groupName,
      job_type: this.jobType,
      average_jobs: this._getAndResetLoadEstimate(),
      max_jobs: this.maxJobCount,
    };
    sqldb
      .execute(sql.insert_load, params)
      .catch((err) => {
        logger.error('Error reporting load', { err });
      })
      .finally(() => {
        if (!this.active) return;
        debug(
          `LoadEstimator._reportLoad(): jobType = ${this.jobType}, scheduling next call for ${
            config.reportIntervalSec * 1000
          } ms`,
        );
        // Report load again in the future
        this.timeoutID = setTimeout(this._reportLoad.bind(this), config.reportIntervalSec * 1000);
      });
  }

  _warnOldJobs() {
    debug(`LoadEstimator._warnOldJobs(): jobType = ${this.jobType}`);
    if (!this.warnOnOldJobs) return;
    const nowMS = Date.now();
    for (const [id, info] of Object.entries(this.currentJobs)) {
      if (nowMS - info.startMS > config.maxResponseTimeSec * 1000 && !info.warned) {
        const details = {
          jobType: this.jobType,
          id,
          ageMS: nowMS - info.startMS,
          startMS: info.startMS,
          startTimestamp: new Date(info.startMS).toISOString(),
        };
        logger.error('load._warnOldJobs(): job exceeded max response time', details);
        info.warned = true;
      }
    }
  }
}

const estimators: Record<string, LoadEstimator> = {};

export function initEstimator(jobType: string, maxJobCount: number, warnOnOldJobs?: boolean) {
  debug(
    `initEstimator(): jobType = ${jobType}, maxJobCount = ${maxJobCount}, warnOnOldJobs = ${warnOnOldJobs}`,
  );
  if (Object.prototype.hasOwnProperty.call(estimators, jobType)) {
    throw new Error(`duplicate jobType: ${jobType}`);
  }
  estimators[jobType] = new LoadEstimator(jobType, maxJobCount, warnOnOldJobs);
}

export function startJob(jobType: string, id: string, maxJobCount?: number) {
  debug(`startJob(): jobType = ${jobType}, id = ${id}, maxJobCount = ${maxJobCount}`);
  if (!Object.prototype.hasOwnProperty.call(estimators, jobType)) {
    // lazy estimator creation, needed for unit tests
    estimators[jobType] = new LoadEstimator(jobType, maxJobCount);
  }
  estimators[jobType].startJob(id);
}

export function endJob(jobType: string, id: string) {
  debug(`endJob(): jobType = ${jobType}, id = ${id}`);
  if (!(jobType in estimators)) throw new Error(`endJob(): no such estimator: ${jobType}`);
  estimators[jobType].endJob(id);
}

export function close() {
  debug(`close(): ${Object.keys(estimators).length} estimators`);
  for (const jobType in estimators) {
    estimators[jobType].close();
    delete estimators[jobType];
  }
}
