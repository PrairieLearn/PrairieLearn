const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const { processScrapPaperPdf } = require('../../lib/scrapPaperReader');
const serverJobs = require('../../lib/server-jobs');

const error = require('../../prairielib/lib/error');

router.get('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_instance_permission_edit) return next();
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', async (req, res, next) => {
  if (!res.locals.authz_data.has_course_instance_permission_edit) return next();
  if (req.body.__action === 'scan_scrap_paper') {
    if (!req.file) {
      return next(error.make(400, 'Missing PDF file'));
    }
    if (!res.locals || !res.locals.authn_user || !res.locals.authn_user.user_id) {
      return next(error.make(400, 'File-store requires "authn_user" to save data'));
    }

    const options = {
      course_id: res.locals.course ? res.locals.course.id : null,
      type: 'decoding_pdf_barcoded_collection',
      description: 'Load data from local disk',
    };
    const jobSequenceId = await serverJobs.createJobSequenceAsync(options);

    const jobOptions = {
      course_id: res.locals.course ? res.locals.course.id : null,
      type: 'decode_pdf_collection',
      description:
        'Decodes each barcode on each page in the pdf collection used as scrap paper by students.',
      job_sequence_id: jobSequenceId,
      last_in_sequence: false,
    };

    const job = await serverJobs.createJobAsync(jobOptions);
    res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    return processScrapPaperPdf(
      req.file.buffer,
      req.file.originalname,
      res.locals.authn_user.user_id,
      job
    );
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
