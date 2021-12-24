const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const { decodeBarcodes, readPdf } = require('../lib/scrapPaperReader');
const { getBarcodeSegments } = require('../lib/scrapPaperMaker');
const config = require('../lib/config');
const util = require('util');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const FormData = require('form-data');

const { saveOrGrade } = require('./helperClient');
const helperServer = require('./helperServer');

const jsCrc = require('js-crc');

const testLabel = 'ANY TEST LABEL';
const testNumPages = 5; // has to be reasonably small for pdf to be converted/decoded quickly in test

/**
 * Set the active user within Prairie Learn's test environment.
 * @param {object} user
 */
const setUser = (user) => {
  config.authUid = user.authUid;
  config.authName = user.authName;
  config.authUin = user.authUin;
};

/**
 * Gets an instance question URL for the current user
 * @param {string} baseUrl
 * @param {string} hm1AutomaticTestSuiteUrl
 * @returns {string}
 */
const getBarcodeSubmissionUrl = async (baseUrl, hm1AutomaticTestSuiteUrl) => {
  const res = await fetch(hm1AutomaticTestSuiteUrl);
  assert.equal(res.ok, true);

  const hm1Body = await res.text();
  assert.include(hm1Body, 'HW1.12. Barcode submission');

  const $hm1Body = cheerio.load(hm1Body);
  return (
    baseUrl.replace('/pl', '') + $hm1Body('a:contains("HW1.12. Barcode submission")').attr('href')
  );
};

const getScanPaperPayload = ($page, pdfBuffer) => {
  const formData = new FormData();
  formData.append('file', pdfBuffer, 'ANY FILENAME.pdf');
  formData.append('__csrf_token', $page('form > input[name="__csrf_token"]').val());
  formData.append('__action', $page('form > input[name="__action"]').val());
  return formData;
};

describe('Barcode generation, student submission, and scanning process', function () {
  this.timeout(30000);
  const baseUrl = 'http://localhost:' + config.serverPort + '/pl';
  const scrapPaperUrl = baseUrl + '/course_instance/1/instructor/scrap_paper';
  const scanPaperUrl = baseUrl + '/course_instance/1/instructor/scan_paper';
  const mockStudents = [
    { authUid: 'student1', authName: 'Student User 1', authUin: '00000001' },
    { authUid: 'student2', authName: 'Student User 2', authUin: '00000002' },
  ];

  // created in `Generate scrap paper` but also used in `Barcode submission ..` and `Scan scrap paper` test blocks in end-to-end test
  const validBarcodes = [];
  let pdfBuffer;
  let hm1AutomaticTestSuiteUrl;
  let defaultUser;

  before('set up testing server', async () => {
    await util.promisify(helperServer.before().bind(this))();
  });
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', function () {
    let $scrapPaper;
    let barcodeRows;

    describe('GET', function () {
      before('fetch page', async () => {
        const res = await fetch(scrapPaperUrl);
        assert.equal(res.status, 200);
        $scrapPaper = cheerio.load(await res.text());
      });

      it('view should display PDF generation form', () => {
        const numPages = $scrapPaper('#num_pages');
        const pageLabel = $scrapPaper('#page_label');
        assert.lengthOf(numPages, 1);
        assert.lengthOf(pageLabel, 1);
      });
    });

    describe('POST', () => {
      let pdf;
      let decodedJpegs;

      it('user should be able to download a pdf', async () => {
        const payload = {
          num_pages: testNumPages,
          page_label: testLabel,
          __csrf_token: $scrapPaper('form > input[name="__csrf_token"]').val(),
          __action: $scrapPaper('form > input[name="__action"]').val(),
        };
        const res = await fetch(scrapPaperUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(payload).toString(),
        });
        assert.equal(res.status, 200);
        const pdfBlob = await res.blob();
        assert.isDefined(pdfBlob);

        pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
        assert.isDefined(pdfBuffer);

        pdf = await readPdf(pdfBuffer, 'ANY FILENAME.pdf');
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
        assert.equal(pdf.numPages, testNumPages);
      });
      it('pdf should have a label for each page', async () => {
        // best we can do with this library. may want to use library that supports reading text per page
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const content = await page.getTextContent();
          const text = content.items.map((i) => i.str).join(' ');
          assert.include(text, testLabel);
        }
        assert.equal(pdf.numPages, testNumPages);
      });
      it('number of barcodes in pdf should match number of barcodes in database', async () => {
        barcodeRows = (await sqldb.queryAsync(sql.get_barcodes, {})).rows;
        assert.lengthOf(barcodeRows, pdf.numPages);
      });
      it('database barcodes should checksum successfully against base36 barcode components', () => {
        barcodeRows.forEach((row) => {
          const { base36, checksum } = getBarcodeSegments(row.barcode);
          const recomputed_checksum = jsCrc.crc16(base36);
          assert.equal(recomputed_checksum, checksum);
        });
      });
      it('barcodes should ALL be scannable by barcode reader', async () => {
        decodedJpegs = await decodeBarcodes(
          pdfBuffer,
          `${config.imageProcessingDir}/test`,
          'Any original filename.pdf',
          console
        );
        assert.isDefined(decodedJpegs);
        decodedJpegs.forEach((jpeg) => {
          assert.isNotNull(jpeg.barcode);
        });
      });
      it('pdf barcodes should checksum successfully against base36 barcode component', () => {
        decodedJpegs.forEach((jpeg) => {
          const { base36, checksum } = getBarcodeSegments(jpeg.barcode);
          const recomputedChecksum = jsCrc.crc16(base36);
          assert.equal(recomputedChecksum, checksum);
          validBarcodes.push(jpeg.barcode);
        });
      });
    });
  });

  describe('Barcode submission on `pl-barcode-scan` element (before pdf scan upload)', () => {
    const studentCourseInstanceUrl = baseUrl + '/course_instance/1';

    before('create students', async () => {
      defaultUser = { authUid: config.authUid, authName: config.authName, authUin: config.authUin }; // test suite default
      for (const student of mockStudents) {
        setUser(student);
        await fetch(baseUrl);
      }
    });
    before('get homework 1 url', async () => {
      setUser(mockStudents[0]);
      const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
      const $courseInstancePage = cheerio.load(courseInstanceBody);
      hm1AutomaticTestSuiteUrl =
        baseUrl.replace('/pl', '') +
        $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
    });
    after('restore default user', () => {
      setUser(defaultUser);
    });

    it('students should NOT be able to submit invalid barcodes', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl(
          baseUrl,
          hm1AutomaticTestSuiteUrl
        );
        // front-end validation doesn't work here, but we try backend validation from pl-barcode-scan.py
        const save = await saveOrGrade(
          hm1BarcodeSubmissionUrl,
          { _pdf_barcode_scan: 9999999 },
          'save'
        );
        assert.include(await save.text(), 'invalid, not gradable');

        const grade = await saveOrGrade(
          hm1BarcodeSubmissionUrl,
          { _pdf_barcode_scan: 9999999 },
          'grade'
        );
        assert.include(
          await grade.text(),
          'Submitted answer\n          \n          2\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-danger">invalid, not gradable</span>'
        );
      }
    });
    it('students should be able to "save" or "save & grade" valid barcodes', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl(
          baseUrl,
          hm1AutomaticTestSuiteUrl
        );
        const save = await saveOrGrade(
          hm1BarcodeSubmissionUrl,
          { _pdf_barcode_scan: validBarcodes[0] },
          'save'
        );
        assert.include(
          await save.text(),
          'Submitted answer\n          \n          3\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>'
        );
        // const grade = await saveOrGrade(hm1BarcodeSubmissionUrl, {_pdf_barcode_scan: validBarcodes[1]}, 'grade');

        await saveOrGrade(
          hm1BarcodeSubmissionUrl,
          { _pdf_barcode_scan: validBarcodes[1] },
          'grade'
        );

        // This will have to fail until I can figure out what the proper behaviour for an element that does not count as a grade is. How do we handle
        // cases where an element is validated as correct on the back-end but does not have a score.
        // assert.include(await grade.text(), 'Submitted answer\n          \n          4\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-danger">correct: 0%');
      }
    });
    it('students should NOT see PDF version of written work before instructor uploads PDF barcoded proof of work', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl(
          baseUrl,
          hm1AutomaticTestSuiteUrl
        );
        const hm1BarcodeSubmissionPage = await (await fetch(hm1BarcodeSubmissionUrl)).text();
        assert.notInclude(
          hm1BarcodeSubmissionPage,
          'class="submission-body-pdf-barcode-scan-container"'
        );
        // const $hm1BarodeSubmissionPage = cheerio.load(hm1BarcodeSubmissionPage);
      }
    });
  });

  describe('Scan scrap paper', () => {
    let $scanPaper;

    describe('GET', function () {
      before('fetch page', async () => {
        const res = await fetch(scanPaperUrl);
        assert.equal(res.status, 200);
        $scanPaper = cheerio.load(await res.text());
      });

      it('view should display PDF generation form', () => {
        const pdfFileSubmission = $scanPaper('#pdf-collection');
        assert.lengthOf(pdfFileSubmission, 1);
      });
    });

    describe('POST', function () {
      it('should be able to post pdf form', async () => {
        const res = await fetch(scanPaperUrl, {
          method: 'POST',
          body: getScanPaperPayload($scanPaper, pdfBuffer),
        });
        console.log(res);
        assert.isTrue(res.ok);
      });
      it('should be able to post pdf form and have it queued without Quagga crashing', async () => {
        const res = await fetch(scanPaperUrl, {
          method: 'POST',
          body: getScanPaperPayload($scanPaper, pdfBuffer),
        });
        assert.isTrue(res.ok);
        // HACK for following tests to pass as we decoupled the request so we don't know when operation finishes
        // TO DO: integrate socket io reader to wait for operation to finish before proceeding
        await new Promise((resolve) => setTimeout(resolve, 28000));
      });
      it('file ids should exist for valid barcodes submitted in earlier `pl-barcode-scan` submissions', async () => {
        const barcodes = (await sqldb.queryAsync(sql.get_barcodes, {})).rows;
        barcodes.forEach((barcode) => {
          assert.isDefined(barcode.file_id);
        });
        assert.lengthOf(barcodes, testNumPages);
      });
    });
  });

  describe('Barcode submission on `pl-barcode-scan` element (after pdf scan upload)', () => {
    const base64HtmlPrefix = 'data:application/pdf;base64,';
    it('student barcode submissions should result in pdf on view after pdf scan', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl(
          baseUrl,
          hm1AutomaticTestSuiteUrl
        );
        const grade = await saveOrGrade(
          hm1BarcodeSubmissionUrl,
          { _pdf_barcode_scan: validBarcodes[0] },
          'grade'
        );
        const $questionView = cheerio.load(await grade.text());
        const base64Pdf = $questionView('.submission-body-pdf-barcode-scan')[0].attribs.src.replace(
          base64HtmlPrefix,
          ''
        );

        const submissionPdf = await readPdf(Buffer.from(base64Pdf, 'base64'), 'ANY FILENAME.pdf');
        assert.equal(submissionPdf.numPages, 1);
      }
    });
    it('instructor barcode submissions should result in pdf on view after pdf scan', async () => {
      setUser(defaultUser);
      const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl(
        baseUrl,
        hm1AutomaticTestSuiteUrl
      );
      const grade = await saveOrGrade(
        hm1BarcodeSubmissionUrl,
        { _pdf_barcode_scan: validBarcodes[0] },
        'grade'
      );
      const $questionView = cheerio.load(await grade.text());
      const base64Pdf = $questionView('.submission-body-pdf-barcode-scan')[0].attribs.src.replace(
        base64HtmlPrefix,
        ''
      );
      const submissionPdf = await readPdf(Buffer.from(base64Pdf, 'base64'), 'ANY FILENAME.pdf');
      assert.equal(submissionPdf.numPages, 1);
    });
  });
});
