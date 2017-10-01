const logger = require('./logger');
const sqldb = require('./sqldb');
const sql = require('./sql-loader').loadSqlEquiv(__filename);

var initialized = false;
var currentJobs, maxJobs, reportIntervalSec, instanceId, lastEstimateTime, lastIncrementTime, integratedLoad;

module.exports = {
    init(newMaxJobs, newReportIntervalSec, newInstanceId) {
        maxJobs = newMaxJobs;
        reportIntervalSec = newReportIntervalSec;
        instanceId = newInstanceId;
        lastEstimateTime = Date.now();
        integratedLoad = 0;
        currentJobs = 0;
        maxJobs = newMaxJobs;
        initialized = true;
        setTimeout(this._reportLoad, config.reportIntervalSec * 1000);
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
        if (currentJobs < 0) throw new Error('startJob(): currentJobs < 0');
    },

    _getAndResetLoadEstimate() {
        this._addIntegratedLoad();
        const now = Date.now();
        const deltaSeconds = (now - lastEstimateTime) / 1000;
        const loadEstimate = totalLoad / deltaSeconds;

        // reset stats
        lastEstimateTime = now;
        lastIncrementTime = now;
        integratedLoad = 0;

        return loadEstimate;
    },

    _addIntegratedLoad() {
        const now = Date.now();
        const delta = (now - lastIncrementTime) / 1000;
        integratedLoad += delta * currentJobs;
        lastIncrementTime = now;
    },

    _reportLoad() {
        var params = {
            instance_id: instanceId,
            queue_name: config.queueName,
            average_jobs: this._getAndResetLoadEstimate(),
            max_jobs: maxJobs,
        };
        sqldb.query(sql.insert_load, params, (err) => {
            if (err) logger.error(String(err));
            setTimeout(this._reportLoad, config.reportIntervalSec * 1000);
        });
    },
};
