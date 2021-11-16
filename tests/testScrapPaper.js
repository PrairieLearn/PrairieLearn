// const ERR = require('async-stacktrace');
// const _ = require('lodash');
const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const config = require('../lib/config');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const helperServer = require('./helperServer');
// const helperQuestion = require('./helperQuestion');
// const helperAttachFiles = require('./helperAttachFiles');

const querystring = require('querystring');
// const imagemagick = require('imagemagick');
const jsCrc = require('js-crc');
const pdfParse = require('pdf-parse');
// const fsPromises = require('fs').promises;

const maxPageLimit = 500;
const base64Prefix = 'data:application/pdf;base64,';

const getScrapPaperPayload = ($page, numPages, pageLabel) => {
  return {
    num_pages: numPages,
    page_label: pageLabel,
    __csrf_token: $page('form > input[name="__csrf_token"]').val(),
    __action: $page('form > input[name="__action"]').val(),
  };
};
const getBarcodeSegments = (barcode) => {
  const sha16 = barcode.substring(barcode.length - 4, barcode.length);
  return {
    fullBarcode: barcode,
    sha16,
    base64: barcode.replace(sha16, ''),
  };
};

describe('Scrap paper view', function () {
  this.timeout(60000);

  const baseUrl = 'http://localhost:' + config.serverPort + '/pl';
  const scrapPaperUrl = baseUrl + '/scrap_paper';

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', () => {
    let $scrapPaper;
    let pdf;
    let barcodeRows;

    describe('GET', () => {
      before('fetch page', async () => {
        const res = await fetch(scrapPaperUrl);
        assert.equal(res.status, 200);
        $scrapPaper = cheerio.load(await res.text());
      });

      it('should not display a PDF document', () => {
        const pdfContainer = $scrapPaper('.pdf-container');
        assert.lengthOf(pdfContainer, 0);
      });

      it('should display PDF generation form', () => {
        const numPages = $scrapPaper('#num_pages');
        const pageLabel = $scrapPaper('#page_label');
        assert.lengthOf(numPages, 1);
        assert.lengthOf(pageLabel, 1);
      });
    });

    describe('POST', () => {
      before('POST "make_scrap_paper" payload', async () => {
        const payload = getScrapPaperPayload($scrapPaper, maxPageLimit, 'TEST LABEL');
        const res = await fetch(scrapPaperUrl, {
          method: 'POST',
          headers: { 'Content-type': 'application/x-www-form-urlencoded' },
          body: querystring.encode(payload),
        });
        assert.equal(res.status, 200);
        $scrapPaper = cheerio.load(await res.text());
      });
      // will need to use iamgemagick
      it('should produce number of pages specified', async () => {
        const data = $scrapPaper('iframe')[0].attribs.src.replace(base64Prefix, '');

        // IMAGE MAGICK IDENTIFY() METHOD DOES NOT WORK WITH 500 PAGE PDF.
        // const filepath = './output.pdf';
        // const fileOut = await fsPromises.writeFile(filepath, data, 'base64');
        //
        //   1) Scrap paper
        //   Generate scrap paper
        //     POST
        //       should produce number of pages specified:
        // Error: Command failed:
        //  at ChildProcess.<anonymous> (node_modules/imagemagick/imagemagick.js:88:15)
        //  at ChildProcess.emit (domain.js:475:12)
        //  at maybeClose (internal/child_process.js:1058:16)
        //  at Socket.<anonymous> (internal/child_process.js:443:11)
        //  at Socket.emit (domain.js:475:12)
        //  at Pipe.<anonymous> (net.js:686:12)
        //  at Pipe.callbackTrampoline (internal/async_hooks.js:130:17)

        // const output = await new Promise((resolve, reject) => {
        //   imagemagick.identify(filepath, (err, output) => {
        //     if (err) {
        //       reject(err);
        //     }
        //     resolve(output);
        //   });
        // });

        const buffer = Buffer.from(data, 'base64');
        pdf = await pdfParse(buffer);
        assert.equal(pdf.numpages, maxPageLimit);
      });
      it('should produce number of barcodes that equal specified number of pages', async () => {
        barcodeRows = (await sqldb.queryAsync(sql.get_barcodes, {})).rows;
        assert.lengthOf(barcodeRows, pdf.numpages);
      });
      it('should display barcodes in UPPERCASE on PDF document and in database', () => {
        // TO DO once pdf reader working with barcode scanner
      });
      it('should checksum sha16 successfully against base64 barcode components', () => {
        barcodeRows.forEach((row) => {
          const { base64, sha16 } = getBarcodeSegments(row.barcode);
          const recomputedSha16 = jsCrc.crc16(base64);
          assert.equal(recomputedSha16, sha16);
        });
      });
      it('should produce barcodes starting on number of rows found barcodes table', () => {
        // TO DO once other things are done and more time
      });
      it('should produce barcodes formatted with spacing ie. (xxxx xxxx xxxx)', () => {
        // nice to have ? TO DO?
      });
    });
  });
});

describe('Pl-artifact-scan element', () => {
  it('should be able to submit a valid barcode', () => {});
});

describe('Scan paper view', function () {
  this.timeout(60000);

  // const scanPaperUrl = baseUrl + '/scan_paper';

  describe('GET', () => {});

  describe('POST', () => {
    it('should display an error when size of PDF is above an upper bound limit of 25MB', () => {});
    x;
  });
});
