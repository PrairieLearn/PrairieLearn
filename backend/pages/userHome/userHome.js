var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

router.get('/', function(req, res, next) {
    res.render(path.join(__dirname, 'userHome'), res.locals);
});

module.exports = router;
