const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { processScrapPaperPdf } = require('../../lib/scrapPaperReader');
const serverJobs = require('../../lib/server-jobs');

const error = require('../../prairielib/lib/error');
const ERR = require('async-stacktrace');

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

    const options = {
      course_id: res.locals.course ? res.locals.course.id : null,
      type: 'decoding_pdf_barcoded_collection',
      description: 'Load data from local disk',
    };
    let jobSequenceId = null;

    serverJobs
      .createJobSequenceAsync(options)
      .then((jsId) => {
        jobSequenceId = jsId;

        const jobOptions = {
          course_id: res.locals.course ? res.locals.course.id : null,
          type: 'decode_pdf_collection',
          description:
            'Decodes each barcode on each page in the pdf collection used as scrap paper by students.',
          job_sequence_id: jobSequenceId,
          last_in_sequence: false,
        };

        return serverJobs.createJobAsync(jobOptions);
      })
      .then((job) => {
        debug('successfully created job', { jobSequenceId });

        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
        return processScrapPaperPdf(
          req.file.buffer,
          req.file.originalname,
          res.locals.authn_user.user_id,
          job
        );
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
