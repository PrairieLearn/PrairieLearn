const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const JsBarcode = require('jsbarcode');
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {

    // canvas has a large overhead on the linux container, so we will try this client side.
    // const barcode = JsBarcode(canvas, 'Hello');
    // new PDFDocument()

    // by default 'A4'; may parameterize
    // var doc = new jsPdf();
    // doc.setFontSize(40);
    // doc.text(30, 20, 'Hello world!');
    // doc.addImage(img.src, 'JPEG', 15, 40, 180, 160);
    // const data = doc.save();

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {

});

module.exports = router;
