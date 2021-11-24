// const ERR = require('async-stacktrace');
// const _ = require('lodash');
const assert = require('chai').assert;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const {decodeBarcodes} = require('../lib/barcodeScanner');
const config = require('../lib/config');
const util = require('util');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const querystring = require('querystring');
const FormData = require('form-data');

const {saveOrGrade} = require('./helperClient');
const helperServer = require('./helperServer');
// const helperQuestion = require('./helperQuestion');
// const helperAttachFiles = require('./helperAttachFiles');

// const imagemagick = require('imagemagick');
const jsCrc = require('js-crc');
const pdfParse = require('pdf-parse');

/**
 * Set the active user within Prairie Learn's test environment.
 * @param {object} user
 */
const setUser = (user) => {
  config.authUid = user.authUid;
  config.authName = user.authName;
  config.authUin = user.authUin;
};

const getScrapPaperPayload = ($page, numPages, pageLabel) => {
  return {
    num_pages: numPages,
    page_label: pageLabel,
    __csrf_token: $page('form > input[name="__csrf_token"]').val(),
    __action: $page('form > input[name="__action"]').val(),
  };
};

const getScanPaperPayload = ($page, pdfBuffer) => {
  const formData = new FormData();
  formData.append('file', pdfBuffer, 'ANY FILENAME.pdf');
  formData.append('__csrf_token', $page('form > input[name="__csrf_token"]').val());
  formData.append('__action', $page('form > input[name="__action"]').val());
  return formData;
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

describe('Barcode generation, student submission, and scanning process', function() {
  this.timeout(60000);
  const baseUrl = 'http://localhost:' + config.serverPort + '/pl';
  const scrapPaperUrl = baseUrl + '/scrap_paper';
  const scanPaperUrl = baseUrl + '/scan_artifacts';

  // created in `Generate scrap paper` but also used in `Barcode submission ..` and `Scan scrap paper` test blocks in end-to-end test
  const validBarcodes = [];
  let pdfBuffer;

  before('set up testing server', async  () =>{
    await util.promisify(helperServer.before().bind(this))();
  });
  after('shut down testing server', helperServer.after);

  describe('Generate scrap paper', function() {

    let $scrapPaper;
    let barcodeRows;

    describe('GET', function() {

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
      const testLabel = 'TEST LABEL';
      const testNumPages = 15; // has to be reasonably small for pdf to be converted/decoded quickly in test

      let pdf;
      let decodedJpegs;

      it('user should be able to download a pdf', async () => {
        const payload = getScrapPaperPayload($scrapPaper, testNumPages, testLabel);
        const res = await fetch(scrapPaperUrl, {
          method: 'POST',
          headers: { 'Content-type': 'application/x-www-form-urlencoded' },
          body: querystring.encode(payload),
        });
        assert.equal(res.status, 200);
        const pdfBlob = await res.blob();
        assert.isDefined(pdfBlob);

        pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
        assert.isDefined(pdfBuffer);

        pdf = await pdfParse(pdfBuffer);
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
        assert.equal(pdf.numpages, testNumPages);
      });
      it('pdf should have a label for each page', () => {
        // best we can do with this library. may want to use library that supports reading text per page
        const numLabels = pdf.text.match(new RegExp(testLabel, 'g')).length;
        assert.equal(numLabels, testNumPages);
      });
      it('number of barcodes in pdf should match number of barcodes in database', async () => {
        barcodeRows = (await sqldb.queryAsync(sql.get_barcodes, {})).rows;
        assert.lengthOf(barcodeRows, pdf.numpages);
      });
      it('database barcodes should checksum sha16 successfully against base36 barcode components', () => {
        barcodeRows.forEach((row) => {
          const { base36, sha16 } = getBarcodeSegments(row.barcode);
          const recomputedSha16 = jsCrc.crc16(base36);
          assert.equal(recomputedSha16, sha16);
        });
      });
      it('barcodes should ALL be scannable by barcode reader', async () => {
        decodedJpegs = await decodeBarcodes(pdfBuffer, 'Any original filename.pdf');
        assert.isDefined(decodedJpegs);
        decodedJpegs.forEach((jpeg) => {
          assert.isNotNull(jpeg.barcode);
        });
      });
      it('pdf barcodes should checksum sha16 successfully against base36 barcode component', () => {
        decodedJpegs.forEach((jpeg) => {
          const {base36, sha16} = getBarcodeSegments(jpeg.barcode);
          const recomputedSha16 = jsCrc.crc16(base36);
          assert.equal(recomputedSha16, sha16);
          validBarcodes.push(jpeg.barcode);
        });
      });
      it('should produce barcodes formatted with spacing ie. (xxxx xxxx xxxx)', () => {
        // nice to have ? TO DO?
      });
    });
  });

  describe('Barcode submission on `pl-artifact-scan` element (student submission)', () => {
    const studentCourseInstanceUrl = baseUrl + '/course_instance/1';
    let hm1AutomaticTestSuiteUrl;
    let defaultUser;

    const getBarcodeSubmissionUrl = async () => {
      const res = await fetch(hm1AutomaticTestSuiteUrl);
      assert.equal(res.ok, true);

      const hm1Body = await res.text();
      assert.include(hm1Body, 'HW1.12. Barcode submission');

      const $hm1Body = cheerio.load(hm1Body);
      return baseUrl.replace('/pl', '') + $hm1Body('a:contains("HW1.12. Barcode submission")').attr('href');
    };

    const mockStudents = [
      {authUid: 'student1', authName: 'Student User 1', authUin: '00000001'},
      {authUid: 'student2', authName: 'Student User 2', authUin: '00000002'},
    ];

    before('create students', async () => {
      defaultUser = {authUid: config.authUid, authName: config.authName, authUin: config.authUin}; // test suite default
      for (const student of mockStudents) {
          setUser(student);
          await fetch(baseUrl);
      }
    });
    before('get homework 1 url', async () => {
      setUser(mockStudents[0]);
      const courseInstanceBody = await (await fetch(studentCourseInstanceUrl)).text();
      const $courseInstancePage = cheerio.load(courseInstanceBody);
      hm1AutomaticTestSuiteUrl = baseUrl.replace('/pl', '') + $courseInstancePage('a:contains("Homework for automatic test suite")').attr('href');
    });
    after('restore default user', () => {
      setUser(defaultUser);
    });

    it('students should NOT be able to submit invalid barcodes', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl();
        // front-end validation doesn't work here, but we try backend validation from pl-artifact-scan.py
        const save = await saveOrGrade(hm1BarcodeSubmissionUrl, {_pl_artifact_barcode: 9999999}, 'save');
        assert.include(await save.text(), 'Submitted answer\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-danger">invalid, not gradable</span>');

        const grade = await saveOrGrade(hm1BarcodeSubmissionUrl, {_pl_artifact_barcode: 9999999}, 'grade');
        assert.include(await grade.text(), 'Submitted answer\n          \n          2\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-danger">invalid, not gradable</span>');
      }
    });
    it('students should be able to "save" or "save & grade" valid barcodes', async () => {
      for (const student of mockStudents) {
        setUser(student);
        const hm1BarcodeSubmissionUrl = await getBarcodeSubmissionUrl();
        const save = await saveOrGrade(hm1BarcodeSubmissionUrl, {_pl_artifact_barcode: validBarcodes[0]}, 'save');
        assert.include(await save.text(), 'Submitted answer\n          \n          3\n          \n        </span>\n        <span>\n    \n        \n            <span class="badge badge-info">saved, not graded</span>');
        const grade = await saveOrGrade(hm1BarcodeSubmissionUrl, {_pl_artifact_barcode: validBarcodes[1]}, 'grade');

        // This will have to fail until I can figure out what the proper behaviour for an element that does not cound as a grade is. How do we handle
        // cases where an element is validated as correct on the back-end but does not have a score.
        assert.include(await grade.text(), 'Submitted answer\n          \n          4\n          \n        </span>\n        <span>\n    \n        <span class="badge badge-danger">correct: 0%');
      }
    });
    it('student/instructor roles should NOT see PDF version of written work before instructor uploads PDF barcoded proof of work', async () => {

    });
  });

  describe('Scan scrap paper', () => {
    let $scanPaper;

    describe('GET', function() {
      before('fetch page', async () => {
        const res = await fetch(scanPaperUrl);
        assert.equal(res.status, 200);
        $scanPaper = cheerio.load(await res.text());
      });

      it('view should display PDF generation form', () => {
      const pdfFileSubmission = $scanPaper('#pdf-artifact');
        assert.lengthOf(pdfFileSubmission, 1);
      });
    });

    describe('POST', function() {
      it('should be able to post pdf form', async () => {
        const res = await fetch(scanPaperUrl, {
          method: 'POST',
          body: getScanPaperPayload($scanPaper, pdfBuffer)
        });
        assert.isTrue(res.ok);
      });
      it('barcodes should be found in submission rows', () => {

      });
      it('pdf page should be uploaded to S3 for each barcoded sheet', () => {

      });
    });
  });


  describe('Barcode submission on `pl-artifact-scan` element (student/instructor views pdf)', () => {
    it('student/instructor roles should be able to view PDF after instructor uploads it to barcode pdf scanner', async () => {

    });
  });

});
