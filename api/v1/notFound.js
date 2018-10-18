module.exports = (req, res, _next) => {
    res.status(404).send({
        message: 'Not Found',
    });
};
