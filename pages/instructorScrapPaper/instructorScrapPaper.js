const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const { createBarcodedPdf } = require('../../lib/scrapPaperMaker');
const error = require('../../prairielib/lib/error');

const pageLimit = 1000;
const charLimit = 45;

router.get('/', (req, res) => {
  res.locals['pageLimit'] = pageLimit;
  res.locals['charLimit'] = charLimit;
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action === 'print_scrap_paper') {
    const numPages = req.body.num_pages;
    const pageLabel = req.body.page_label;

    if (!numPages || numPages < 1 || numPages > pageLimit) {
      ERR(Error(`Must be more than 1 page but not more than ${pageLimit} pages`), next);
      return;
    }
    if (typeof pageLabel !== 'string' || pageLabel.length > charLimit) {
      ERR(Error(`Page label must be valid string less than ${charLimit} characters`), next);
      return;
    }

    createBarcodedPdf(numPages, pageLabel)
      .then((pdf) => {
        res.header(
          'Content-Disposition',
          `attachment; filename=Barcoded scrap paper - ${new Date().toISOString()}.pdf`
        );
        pdf.pipe(res);
        pdf.end();
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
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
