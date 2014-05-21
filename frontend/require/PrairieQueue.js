
define(["underscore", "async"], function(_, async) {

    /** Constructor for a new PrairieQueue.

        @constructor
        @this {PrairieQueue}
        @param {Number} concurrency The maximum number of tasks to process simultaneously (Optional, default: 1).
     */
    var PrairieQueue = function(concurrency) {
        this.locks = {};
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency || 1;
    };

    /** Add a task to the queue.

        @param {Object} lock An object of attributes to lock for this task.
        @param {Function} task The task to execute after all locks have been acquired.
    */
    PrairieQueue.prototype.add = function(lock, task) {
        this.queue.push({lock: lock, task: task});
        this._schedule();
    };

    /** Internal helper function to schedule new tasks for execution.
     */
    PrairieQueue.prototype._schedule = function() {
        var i = 0;
        while (this.running < this.concurrency) {
            if (i >= this.queue.length)
                break;
            var lock = this.queue[i].lock;
            var task = this.queue[i].task;
            if (this._lockAvailable(lock)) {
                this._lock(lock);
                this.running++;
                this.queue.splice(i, 1);
                this._runTask(lock, task);
            } else {
                i++;
            }
        }
    };

    /** Internal helper function to run a task.

        @param {Object} lock An object of attributes to lock for this task.
        @param {Function} task The task to execute after all locks have been acquired.
     */
    PrairieQueue.prototype._runTask = function(lock, task) {
        var that = this;
        async.nextTick(function() {
            task();
            that.running--;
            that._unlock(lock);
            that._schedule();
        });
    };

    /** Internal helper function to check whether a single lock is available.

        @param {String} value The value for the lock.
        @param {String} key The key for the lock.
     */
    PrairieQueue.prototype._lockAvailableSingle = function(value, key) {
        if (this.locks[key] !== undefined && this.locks[key][value] !== undefined)
            return false;
        return true;
    };

    /** Internal helper function to check whether a lock is available.

        @param {Object} lock The set of (key: value) pairs for the lock.
     */
    PrairieQueue.prototype._lockAvailable = function(lock) {
        return _(lock).every(this._lockAvailableSingle.bind(this));
    };

    /** Internal helper function to lock.

        @param {Object} lock The set of (key: value) pairs for the lock.
     */
    PrairieQueue.prototype._lock = function(lock) {
        _(lock).each(function(value, key) {
            if (this.locks[key] === undefined)
                this.locks[key] = {};
            this.locks[key][value] = true;
        });
    };

    /** Internal helper function to unlock.

        @param {Object} lock The set of (key: value) pairs for the lock.
     */
    PrairieQueue.prototype._unlock = function(lock) {
        _(lock).each(function(value, key) {
            delete this.locks[key][value];
        });
    };

    return {
        PrairieQueue: PrairieQueue
    };
});
