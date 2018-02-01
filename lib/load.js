const _ = require('lodash');

const logger = require('./logger');
const sqldb = require('./sqldb');
const config = require('./config');
const sql = require('./sql-loader').loadSqlEquiv(__filename);

var initialized = false;
var currentJobs, maxJobCount, lastEstimateTimeMS, lastIncrementTimeMS, integratedLoad;

module.exports = {
    init(newMaxJobCount) {
        const nowMS = Date.now();
        lastEstimateTimeMS = nowMS;
        lastIncrementTimeMS = nowMS;
        integratedLoad = 0;
        currentJobs = {};
        maxJobCount = newMaxJobCount;
        initialized = true;
        this._reportLoad();
    },

    startJob(id) {
        if (!initialized) return;
        this._addIntegratedLoad();
        if (_.has(currentJobs, id)) {
            logger.error('load.startJob(): id already running: ' + id);
        }
        currentJobs[id] = Date.now();
    },

    endJob(id) {
        if (!initialized) return;
        this._addIntegratedLoad();
        if (_.has(currentJobs, id)) {
            delete currentJobs[id];
        } else {
            logger.error('load.endJob(): no such id: ' + id);
        }
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
        const currentJobCount = _.size(currentJobs);
        const nowMS = Date.now();
        const delta = Math.max(1, nowMS - lastIncrementTimeMS) / 1000;
        integratedLoad += delta * currentJobCount;
        lastIncrementTimeMS = nowMS;
    },

    _reportLoad() {
        this._clearOldJobs();
        var params = {
            instance_id: config.instanceId,
            group_name: config.groupName,
            average_jobs: this._getAndResetLoadEstimate(),
            max_jobs: maxJobCount,
        };
        sqldb.query(sql.insert_load, params, (err) => {
            if (err) logger.error('Error reporting load: ' + String(err));
            setTimeout(this._reportLoad.bind(this), config.reportIntervalSec * 1000);
        });
    },

    _clearOldJobs() {
        const nowMS = Date.now();
        _.forEach(currentJobs, (startMS, id) => {
            if (nowMS - startMS > config.maxResponseTimeSec * 1000) {
                logger.error('load._clearOldJobs(): clearing old id: ' + id);
                delete currentJobs[id];
            }
        });
    },
};
