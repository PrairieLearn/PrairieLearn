const _ = require('lodash');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('./logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const config = require('./config');
const sql = require('@prairielearn/prairielib/sql-loader').loadSqlEquiv(__filename);

class LoadEstimator {
    constructor(jobType, maxJobCount, warnOnOldJobs) {
        debug(`LoadEstimator(): jobType = ${jobType}`);
        this.jobType = jobType;
        const nowMS = Date.now();
        this.lastEstimateTimeMS = nowMS;
        this.lastIncrementTimeMS = nowMS;
        this.integratedLoad = 0;
        this.currentJobs = {};
        this.maxJobCount = maxJobCount || 1;
        this.warnOnOldJobs = (warnOnOldJobs == null) ? true : warnOnOldJobs;
        this.timeoutID = null;
        this.active = true;
        this._reportLoad();
    }

    startJob(id) {
        debug(`LoadEstimator.startJob(): jobType = ${this.jobType}, id = ${id}`);
        this._addIntegratedLoad();
        if (_.has(this.currentJobs, id)) {
            logger.error(`load.startJob(): ${this.jobType} id already running: ${id}`);
        }
        this.currentJobs[id] = Date.now();
    }

    endJob(id) {
        debug(`LoadEstimator.endJob(): jobType = ${this.jobType}, id = ${id}`);
        this._addIntegratedLoad();
        if (_.has(this.currentJobs, id)) {
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
        const currentJobCount = _.size(this.currentJobs);
        const nowMS = Date.now();
        const delta = Math.max(1, nowMS - this.lastIncrementTimeMS) / 1000;
        this.integratedLoad += delta * currentJobCount;
        this.lastIncrementTimeMS = nowMS;
    }

    _reportLoad() {
        debug(`LoadEstimator._reportLoad(): jobType = ${this.jobType}`);
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
            if (!this.active) return;
            debug(`LoadEstimator._reportLoad(): jobType = ${this.jobType}, scheduling next call for ${config.reportIntervalSec * 1000} ms`);
            this.timeoutID = setTimeout(this._reportLoad.bind(this), config.reportIntervalSec * 1000);
        });
    }

    _warnOldJobs() {
        debug(`LoadEstimator._warnOldJobs(): jobType = ${this.jobType}`);
        if (!this.warnOnOldJobs) return;
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
    initEstimator(jobType, maxJobCount, warnOnOldJobs) {
        debug(`initEstimator(): jobType = ${jobType}, maxJobCount = ${maxJobCount}, warnOnOldJobs = ${warnOnOldJobs}`);
        if (_.has(estimators, jobType)) throw new Error(`duplicate jobType: ${jobType}`);
        estimators[jobType] = new LoadEstimator(jobType, maxJobCount, warnOnOldJobs);
    },

    startJob(jobType, id, maxJobCount) {
        debug(`startJob(): jobType = ${jobType}, id = ${id}, maxJobCount = ${maxJobCount}`);
        if (!_.has(estimators, jobType)) {
            // lazy estimator creation, needed for unit tests
            estimators[jobType] = new LoadEstimator(jobType, maxJobCount);
        }
        estimators[jobType].startJob(id);
    },

    endJob(jobType, id) {
        debug(`endJob(): jobType = ${jobType}, id = ${id}`);
        if (!_.has(estimators, jobType)) throw new Error(`endJob(): no such estimator: ${jobType}`);
        estimators[jobType].endJob(id);
    },

    close() {
        debug(`close(): ${_.size(estimators)} estimators`);
        for (const jobType in estimators) {
            estimators[jobType].close();
            delete estimators[jobType];
        }
    },
};
