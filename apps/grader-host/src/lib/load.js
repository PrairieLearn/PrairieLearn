const sqldb = require('@prairielearn/postgres');
const logger = require('./logger');
const { config } = require('./config');
const lifecycle = require('./lifecycle');
const healthCheck = require('./healthCheck');
const sql = sqldb.loadSqlEquiv(__filename);

var initialized = false;
var currentJobs, maxJobs, lastEstimateTimeMS, lastIncrementTimeMS, integratedLoad;

module.exports = {
  init(newMaxJobs) {
    maxJobs = newMaxJobs;
    const nowMS = Date.now();
    lastEstimateTimeMS = nowMS;
    lastIncrementTimeMS = nowMS;
    integratedLoad = 0;
    currentJobs = 0;
    maxJobs = newMaxJobs;
    initialized = true;
    this._reportLoad();
    this._reportConfig();
  },

  startJob() {
    if (!initialized) return;
    this._addIntegratedLoad();
    currentJobs++;
    if (currentJobs > maxJobs) throw new Error('startJob(): currentJobs > maxJobs');
  },

  endJob() {
    if (!initialized) return;
    this._addIntegratedLoad();
    currentJobs--;
    if (currentJobs < 0) throw new Error('endJob(): currentJobs < 0');
  },

  getCurrentJobs() {
    return currentJobs;
  },

  _getAndResetLoadEstimate() {
    this._addIntegratedLoad();
    const nowMS = Date.now();
    const deltaSeconds = Math.max(1, nowMS - lastEstimateTimeMS) / 1000;
    const loadEstimate = integratedLoad / deltaSeconds;

    // reset stats
    lastEstimateTimeMS = nowMS;
    lastIncrementTimeMS = nowMS;
    integratedLoad = 0;

    return loadEstimate;
  },

  _addIntegratedLoad() {
    const nowMS = Date.now();
    const delta = Math.max(1, nowMS - lastIncrementTimeMS) / 1000;
    integratedLoad += delta * currentJobs;
    lastIncrementTimeMS = nowMS;
  },

  _reportLoad() {
    var params = {
      instance_id: config.instanceId,
      queue_name: config.jobsQueueName,
      average_jobs: this._getAndResetLoadEstimate(),
      max_jobs: maxJobs,
      lifecycle_state: lifecycle.getState(),
      healthy: healthCheck.isHealthy(),
    };
    sqldb.query(sql.insert_load, params, (err) => {
      if (err) logger.error('Error reporting load:', err);
      setTimeout(this._reportLoad.bind(this), config.reportIntervalSec * 1000);
    });
  },

  _reportConfig() {
    var params = {
      instance_id: config.instanceId,
      queue_name: config.jobsQueueName,
      average_jobs: 0,
      max_jobs: 0,
      config,
    };
    sqldb.query(sql.insert_config, params, (err) => {
      if (err) logger.error('Error reporting config:', err);
    });
  },
};
