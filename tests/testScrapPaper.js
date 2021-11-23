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

const pageLimit = 1000;
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
  barcode = barcode.toLowerCase();
  const sha16 = barcode.substring(barcode.length - 4, barcode.length);
  return {
    fullBarcode: barcode,
    sha16,
    base36: barcode.replace(sha16, ''),
  };
};

describe('Scrap paper view', function() {
  this.timeout(60000);
  const baseUrl = 'http://localhost:' + config.serverPort + '/pl';
  const scrapPaperUrl = baseUrl + '/scrap_paper';

  before('set up testing server', helperServer.before());
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', function() {

    let $scrapPaper;
    let pdf;
    let barcodeRows;

    describe('GET', function() {
      this.timeout(60000);

      before('fetch page', async () => {
        const res = await fetch(scrapPaperUrl);
        assert.equal(res.status, 200);
        $scrapPaper = cheerio.load(await res.text());
      });

      it('should display PDF generation form', () => {
        const numPages = $scrapPaper('#num_pages');
        const pageLabel = $scrapPaper('#page_label');
        assert.lengthOf(numPages, 1);
        assert.lengthOf(pageLabel, 1);
      });
    });

    describe('POST', () => {
      this.timeout(60000);
      const testLabel = 'TEST LABEL';
      let pdf;

      it('should be able to download a pdf', async () => {
        const payload = getScrapPaperPayload($scrapPaper, pageLimit, testLabel);
        const res = await fetch(scrapPaperUrl, {
          method: 'POST',
          headers: { 'Content-type': 'application/x-www-form-urlencoded' },
          body: querystring.encode(payload),
        });
        assert.equal(res.status, 200);
        const pdfBlob = await res.blob();
        assert.isDefined(pdfBlob);

        const buffer = Buffer.from(await pdfBlob.arrayBuffer());
        assert.isDefined(buffer);

        pdf = await pdfParse(buffer);
        assert.isDefined(pdf);


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

      });
      it('pdf should have requested number of pages', () => {
        assert.equal(pdf.numpages, pageLimit);
      });
      it('pdf should have a label for each page', () => {
        const numLabels = pdf.text.match(new RegExp(testLabel, 'g')).length;
        assert.equal(numLabels, pageLimit);
      });
      it('number of barcodes in pdf should match number of barcodes in database', async () => {
        barcodeRows = (await sqldb.queryAsync(sql.get_barcodes, {})).rows;
        assert.lengthOf(barcodeRows, pdf.numpages);
      });
      it('should checksum sha16 successfully against base36 barcode components', () => {
        barcodeRows.forEach((row) => {
          const { base36, sha16 } = getBarcodeSegments(row.barcode);
          const recomputedSha16 = jsCrc.crc16(base36);
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

  // const scanPaperUrl = baseUrl + '/scan_paper';

  describe('GET', () => {});

  describe('POST', () => {
    it('should display an error when size of PDF is above an upper bound limit of 25MB', () => {

    });
  });
});
