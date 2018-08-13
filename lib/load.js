const _ = require('lodash');

const logger = require('./logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const config = require('./config');
const sql = require('@prairielearn/prairielib/sql-loader').loadSqlEquiv(__filename);

class LoadEstimator {
    constructor(jobType, maxJobCount) {
        this.jobType = jobType;
        const nowMS = Date.now();
        this.lastEstimateTimeMS = nowMS;
        this.lastIncrementTimeMS = nowMS;
        this.integratedLoad = 0;
        this.currentJobs = {};
        this.maxJobCount = maxJobCount || 1;
        this.timeoutID = null;
        this._reportLoad();
    }

    startJob(id) {
        this._addIntegratedLoad();
        if (_.has(this.currentJobs, id)) {
            logger.error(`load.startJob(): ${this.jobType} id already running: ${id}`);
        }
        this.currentJobs[id] = Date.now();
    }

    endJob(id) {
        this._addIntegratedLoad();
        if (_.has(this.currentJobs, id)) {
            delete this.currentJobs[id];
        } else {
            logger.error(`load.endJob(): ${this.jobType} no such id: ${id}`);
        }
    }

    close() {
        if (this.timeoutID != null) {
            clearTimeout(this.timeoutID);
        }
    }

    _getAndResetLoadEstimate() {
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
        const currentJobCount = _.size(this.currentJobs);
        const nowMS = Date.now();
        const delta = Math.max(1, nowMS - this.lastIncrementTimeMS) / 1000;
        this.integratedLoad += delta * currentJobCount;
        this.lastIncrementTimeMS = nowMS;
    }

    _reportLoad() {
        this._warnOldJobs();
        var params = {
            instance_id: config.instanceId,
            group_name: config.groupName,
            job_type: this.jobType,
            average_jobs: this._getAndResetLoadEstimate(),
            max_jobs: this.maxJobCount,
        };
        sqldb.query(sql.insert_load, params, (err) => {
            if (err) logger.error('Error reporting load', {err});
            this.timeoutID = setTimeout(this._reportLoad.bind(this), config.reportIntervalSec * 1000);
        });
    }

    _warnOldJobs() {
        const nowMS = Date.now();
        _.forEach(this.currentJobs, (startMS, id) => {
            if (nowMS - startMS > config.maxResponseTimeSec * 1000) {
                logger.error(`load._warnOldJobs(): ${this.jobType} id ${id} has age ${nowMS - startMS} ms`);
            }
        });
    }
}

const estimators = {};

module.exports = {
    initEstimator(jobType, maxJobCount) {
        if (_.has(estimators, jobType)) throw new Error(`duplicate jobType: ${jobType}`);
        estimators[jobType] = new LoadEstimator(jobType, maxJobCount);
    },

    startJob(jobType, id, maxJobCount) {
        if (!_.has(estimators, jobType)) {
            // lazy estimator creation, needed for unit tests
            estimators[jobType] = new LoadEstimator(jobType, maxJobCount);
        }
        estimators[jobType].startJob(id);
    },

    endJob(jobType, id) {
        if (!_.has(estimators, jobType)) throw new Error(`endJob(): no such estimator: ${jobType}`);
        estimators[jobType].endJob(id);
    },

    close() {
        for (const jobType in estimators) {
            estimators[jobType].close();
            delete estimators[jobType];
        }
    },
};
