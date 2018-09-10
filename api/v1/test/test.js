module.exports = (req, res, _next) => {
    res.send(res.locals);
};