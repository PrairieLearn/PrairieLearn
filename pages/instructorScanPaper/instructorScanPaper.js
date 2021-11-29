const express = require('express');
const router = express.Router();

const {decodeBarcodes} = require('../../lib/barcodeScanner');
const fileStore = require('../../lib/file-store');
const fs = require('fs').promises;

// const {fromPath} = require('pdf2pic');
const error = require('../../prairielib/lib/error');
const ERR = require('async-stacktrace');
// const path = require('path');
// const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * Helper method to upload a pdf page to S3 via file-store API
 * @param {Array<object>} decodedJpegs array jpeg file meta data object list
 * @param {Array<object>} submissions contains assessment_instance_id, instance_question_id, submission_id meta data
 * @return {Array[object]} debug metadata
 */
const _uploadMatchedPages = async (decodedJpegs, submissions, userId) => {
  const uploaded = [];
  const failed = [];
  for(let i = 0; i < decodedJpegs.length; i++) {
    for(let j = 0; j < submissions.rows.length; j++) {
      const jpeg = decodedJpegs[i];
      const submission = submissions.rows[j];
      // Promise.all memory limitations?
      // TO DO: We only want to upload a file once and never again probably. So if an instructor submits a scan again, we don't want to upload it. 
      // We can discuss this, but things have setup to query the last entry uploaded for a submission until we know what we want to do here. 
      try {
        await fileStore.upload('scrap_paper_upload.pdf', await fs.readFile(jpeg.jpegFilepath), 'artifact_upload', submission.assessment_instance_id, submission.instance_question_id, submission.submission_id, userId, userId, 'S3');
        uploaded.push({jpeg: decodedJpegs[i], submission: submissions.rows[j]});
      } catch (err) {
        failed.push({jpeg: decodedJpegs[i], submission: submissions.rows[j], error: err});
      }
    }
  }
  return {uploaded, failed};
};

const _updateBarcodesTable = async (submissions) => {
  // TO DO: This should probably be turned into a stored procedure
  // if we found a match, we want this submission to be added to the barcodes table
  const barcodeSubmissions = submissions.rows.map((row) => { return {barcode: row.submitted_answer._pl_artifact_barcode, submission_id: row.id} });
  let updateValues = '';

  for (let i = 0; i < barcodeSubmissions.length; i++) {
    updateValues+= `(${barcodeSubmissions[i].submission_id}, '${barcodeSubmissions[i].barcode}'),`;
    if (i === barcodeSubmissions.length -1) {
      updateValues = updateValues.substring(0, updateValues.length - 1);
    }
  }
  // TO DO FIX: Does not work when I rely on queryAsync to substitute values. 
  // -- BLOCK update_barcodes_with_submission

  // DROP TABLE IF EXISTS barcode_submission_ids_temp;

  // CREATE TEMP TABLE barcode_submission_ids_temp
  //     (submission_id BIGINT NOT NULL PRIMARY KEY, barcode TEXT);

  // INSERT INTO
  //     barcode_submission_ids_temp(submission_id, barcode)
  // VALUES
  //     $updateValues;
  //     ^
  //     |
  //     + ERROR POSITION SHOWN ABOVE


  // UPDATE
  //     barcodes b
  // SET
  //     submission_id = bs_temp.submission_id
  // FROM
  //     barcode_submission_ids_temp bs_temp
  // WHERE
  //     b.barcode = bs_temp.barcode
  // RETURNING *;
  // SQL params:

  // {
  //     "updateValues": "(1, '2D581')"
  // }
  const query = sql.update_barcodes_with_submission.replace('$updateValues', updateValues);
  const updated = (await sqldb.queryAsync(query, {}))[3];
  return updated;
}

/**
 * A Pdf Scan is a collection of barcoded paper documents compiled into a 
 * barcoded paper collection of documents. It is expected that one barcode 
 * exists on each page in the PDF. If a barcode is readable by the decoder,
 * the page will be uploaded to S3 and stored with metadata information in 
 * `files` and `barcodes` table to later allow viewing of doc by student.
 * @param {Buffer} pdfBuffer buffered application/pdf scanned document
 * @param {string} originalName uploaded filename
 * @returns void
 */
const _processPdfScan = async (pdfBuffer, originalName, userId) => {
  const barcodes = [];
  const decodedJpegs = await decodeBarcodes(pdfBuffer, originalName);

  decodedJpegs.forEach((decodedJpeg) => {
    if (decodedJpeg.barcode !== null) {
      barcodes.push(decodedJpeg.barcode);
    }
  });

  const submissions = await sqldb.queryAsync(sql.get_submissions_with_barcodes, {barcodes: barcodes.join('||')});

  // 1. we have at least one decoded barcoded and we want to associate the information in the `barcodes` table
  //    ISSUE: If a student has not submitted the barcode through the element, we will not find a match.
  if (submissions.rows.length > 0) {
    const updated = await _updateBarcodesTable(submissions);
    console.log('updated: ', updated);

    // 2. a. since we found some barcodes, we want those barcoded sheets uploaded to s3 so student/instructor can view them
    const jpegsToUpload = decodedJpegs.filter((decodedJpeg) => updated.rows.indexOf(decodedJpeg.barcode));
    //    b. we need to combine the 
    // 3.

    const uploadedFiles = await _uploadMatchedPages(jpegsToUpload, submissions, userId);

    // 3. create report of what sheets could be read or not read by decoder.
    return;
  }
  console.log('no barcodes found in doc.', decodedJpegs);
};

router.get('/', (req, res) => {
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'scan_scrap_paper') {
    if (!req.file) {
      ERR(Error('Missing barcoded pdf collection file data'), next); return;
    }
    if(!res.locals || !res.locals.authn_user || !res.locals.authn_user.user_id) {
      ERR(Error('Authn_user required on file-store API'), next); return;
    }

    _processPdfScan(req.file.buffer, req.file.originalname, res.locals.authn_user.user_id)
      .then((updateQuery) => {
        console.log(updateQuery);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
      // TO DO:

      // convert jpeg to pdf

      // detach process from request and display stdout in view

      // upload file to s3 and then reintegrate/improve question view to render pdf

      //implement makeshift queue, as https://github.com/serratus/quaggaJS/issues/135 issues when two decoding jobs running simaltaneously

      // discuss how we want to handle multiple submissions ie.
      // 1. automatically add new element with javascript if option enabled,
      // 2. store multiple submission referneces in barcodes table (probably need a barcode_submissions table)
      // 3. decide if we need to do this now or can do it later with a migration to keep backwards compatibility.
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
