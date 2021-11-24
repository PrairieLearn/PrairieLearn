const express = require('express');
const router = express.Router();

const {decodeBarcodes} = require('../../lib/barcodeScanner');

// const {fromPath} = require('pdf2pic');
const error = require('../../prairielib/lib/error');
const ERR = require('async-stacktrace');
// const path = require('path');
// const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res) => {
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'scan_scrap_paper') {
    if (!req.file && !req.file.buffer) {
      ERR(Error('Missing artifact file data'), next); return;
    }

    decodeBarcodes(req.file.buffer, req.file.originalname)
      .then((decodedJpegs) => {
        const barcodes = [];
        decodedJpegs.forEach((decodedJpeg) => {
          if (decodedJpeg.barcode !== null) {
            barcodes.push(decodedJpeg.barcode);
          }
        });
        // 1. we got the barcodes and we are getting the submission objects that contain a barcode match.
        return sqldb.queryAsync(sql.get_submissions_with_barcodes, {barcodes: barcodes.join('||')});
      })
      .then((submissionRows) => {
        // for each submission
        // do not want to throw errors if no data found. We want to export this data to a log that can be read by a faculty/TA
        // It is not our issue if a barcode was left out of a submission because the element was not set to required
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });

      // TO DO: 

      // reference submission in barcode row

      // detach process from request and display stdout in view

      // upload file to s3 and then reintegrate/improve question view to render pdf

      //implement makeshift queue, as https://github.com/serratus/quaggaJS/issues/135 issues when two decoding jobs running simaltaneously
    
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  };
});

module.exports = router;
