const express = require('express');
const router = express.Router();

const { processScrapPaperPdf } = require('../../lib/barcodeScanner');
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
 * @param {Array<object>} submissions contains assessment_instance_id, instance_question_id, submission id meta data
 * @return {Array<object>} debug metadata
 */
const _uploadPages = async (decodedPdfs, fileMetadata, userId) => {
  const uploaded = [];
  const uploadedBarcodes = [];
  for (let i = 0; i < decodedPdfs.length; i++) {
    for (let j = 0; j < fileMetadata.rows.length; j++) {
      if (
        fileMetadata.rows[j].barcode === decodedPdfs[i].barcode &&
        uploadedBarcodes.indexOf(decodedPdfs[i].barcode) === -1
      ) {
        // Promise.all memory limitations?
        // TO DO: We only want to upload a file once and never again probably. So if an instructor submits a scan again, we don't want to upload it.
        // We can discuss this, but things have setup to query the last entry uploaded for a submission until we know what we want to do here.

        // TO DO: can optimize this to ensure we do not upload more than 1 page per barcode
        const fileId = await fileStore.upload(
          `${decodedPdfs[i].barcode}-barcode-submission.pdf`,
          await fs.readFile(decodedPdfs[i].pdfFilepath),
          'pdf_artifact_upload',
          fileMetadata.rows[j].assessment_instance_id,
          fileMetadata.rows[j].instance_question_id,
          userId,
          userId,
          'S3'
        );
        uploaded.push({ fileId, barcode: decodedPdfs[i].barcode });
        uploadedBarcodes.push(decodedPdfs[i].barcode);
      }
    }
  }
  return uploaded;
};

const _updateBarcodesTable = async (uploadedFiles) => {
  // TO DO: This should probably be turned into a stored procedure
  if (uploadedFiles && uploadedFiles.length > 0) {
    let updateValues = '';

    for (let i = 0; i < uploadedFiles.length; i++) {
      updateValues += `(${uploadedFiles[i].fileId}, '${uploadedFiles[i].barcode}'),`;
      if (i === uploadedFiles.length - 1) {
        updateValues = updateValues.substring(0, updateValues.length - 1);
      }
    }

    const query = sql.update_barcodes.replace('$updateValues', updateValues);
    const updated = (await sqldb.queryAsync(query, {}))[3];
    return updated;
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
};

router.get('/', (req, res) => {
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'scan_scrap_paper') {
    if (!req.file) {
      ERR(Error('Missing barcoded pdf collection file data'), next);
      return;
    }
    if (!res.locals || !res.locals.authn_user || !res.locals.authn_user.user_id) {
      ERR(Error('Authn_user required on file-store API'), next);
      return;
    }

    processScrapPaperPdf(req.file.buffer, req.file.originalname, res.locals.authn_user.user_id)
      .then(() => {
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
    // TO DO:

    // detach process from request and display stdout in view

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
  }
});

module.exports = router;
