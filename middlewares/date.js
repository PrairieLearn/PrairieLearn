var config = require('../lib/config');

module.exports = function(req, res, next) {
    res.locals.req_date = new Date();
    res.locals.true_req_date = res.locals.req_date;

    // allow date override in dev mode
    if (['none', 'testrun'].includes(config.authType) && req.cookies.pl_requested_date) {
        res.locals.req_date = new Date(Date.parse(req.cookies.pl_requested_date));
    }
    next();
};
