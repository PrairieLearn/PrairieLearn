module.exports = function(req, res, next) {
    res.locals.req_date = new Date();
    res.locals.true_req_date = res.locals.req_date;
    next();
};
