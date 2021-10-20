module.exports = function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  err.data = {
    url: req.url,
    method: req.method,
    authz_data: res.locals.authz_data,
  };
  next(err);
};
