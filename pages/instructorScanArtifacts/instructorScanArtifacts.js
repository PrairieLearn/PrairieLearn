const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    // we will leverage client side, as reading and converting PDFs is resource intensive. Best to just post the segmented and
    // barcoded files below.

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {

});

module.exports = router;
