const Pool = require('threads').Pool;

const pool = new Pool();

pool.run(([filename, locals], done) => {
    const ejs = require('ejs');
    ejs.renderFile(filename, locals, null, (err, str) => {
        if (err) {
            done(['error', err.stack.toString()]);
        } else {
            done(['success', str]);
        }
    });
});

module.exports = function(req, res, next) {
    res.renderAsync = function(filename, data) {
        const renderJob = pool.send([filename, data]);
        renderJob.on('done', ([status, data]) => {
            if (status === 'error') {
                next(new Error(data));
            } else {
                res.send(data);
            }
        });
        renderJob.on('error', (err) => {
            next(err);
        });
    };
    next();
};
