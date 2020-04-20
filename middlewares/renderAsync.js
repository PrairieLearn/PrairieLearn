const { spawn, Pool, Worker } = require('threads');

const pool = Pool(() => spawn(new Worker('./renderAsyncWorker')));

// FIXME
// await pool.completed()
// await pool.terminate()

module.exports = function(req, res, next) {
    res.renderAsync = function(filename, data) {
        pool.queue(async render => {
            let str;
            try {
                str = await render(filename, data);
            } catch (err) {
                return next(err);
            }
            res.send(str);
        });
    };
    next();
};
