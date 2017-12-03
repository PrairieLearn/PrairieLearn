
module.exports = function(req, res, next) {
    res.locals.formatFloat = function(x, numDecDigits) {
        if (numDecDigits == null) numDecDigits = 2;
        if (Number.isFinite(x)) {
            return x.toFixed(numDecDigits);
        } else {
            return '—';
        }
    };
    next();
};

