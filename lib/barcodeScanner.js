const config = require('./config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../lib/file-store');
const fs = require('fs').promises;

const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js"); // legacy means

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const processingDir = config.imageProcessingDir;

/**
 * Load metadata about pdf
 * https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.js
 * @param {Buffer} pdfBuffer 
 * @returns {object}
 */
const loadPdf = async (pdfBuffer) => {
  const pdfPath = path.join(config.imageProcessingDir, 'test.pdf');
  await fs.mkdir(config.imageProcessingDir, { recursive: true });
  await fs.writeFile(pdfPath, pdfBuffer);
  const doc = await pdfjsLib.getDocument(pdfPath).promise;
  await fs.unlink(pdfPath)
  return doc;
}

// TO DO: Remove fs contents where image contents succeeded
// TO DO: Decide on when to remove fs contents where image contents succeed

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

/**
 * A Pdf Scan is a collection of scanned barcoded single pieces of paper with
 * student written work. It is expected that one barcode exists on each page in the PDF.
 * If a barcode is readable by the decoder, the page will be uploaded to S3 and stored with
 * metadata information in `files` and `barcodes` table to later allow viewing of doc by student.
 * If a student submits a barcode after file upload, it can still be displayed on front-end.
 * @param {Buffer} pdfBuffer buffered application/pdf scanned document
 * @param {string} originalName uploaded filename
 * @returns updates barcode table rows
 */
const processScrapPaperPdf = async (pdfBuffer, originalName, userId) => {
  // 1. Get decoded pdf page meta data ie. barcode, filepath, etc.
  let decodedPdfPages = await decodeBarcodes(pdfBuffer, originalName);

  // 2. filter only the barcode pages that we could read
  decodedPdfPages = decodedPdfPages.filter((decodedPdfPage) => decodedPdfPage.barcode);
  const barcodes = decodedPdfPages.map((page) => page.barcode);

  // 3. get submission meta data to upload assessment, iq details to filestore API
  const query = sql.get_barcode_metadata.replace(
    '$match',
    `s.submitted_answer->>'_pl_artifact_barcode' = '${barcodes.join(
      "' OR s.submitted_answer->>'_pl_artifact_barcode' = '"
    )}'`
  );
  const fileMetadata = await sqldb.queryAsync(query, {});

  const uploadedFiles = await _uploadPages(decodedPdfPages, fileMetadata, userId);
  return _updateBarcodesTable(uploadedFiles);
};

const _decodeJpegs = async (jpegs) => {
  for (let i = 0; i < jpegs.length; i++) {
    jpegs[i]['barcode'] = await _decodeJpeg(jpegs[i]);
  }
  return jpegs;
};

/**
 * Detects and extracts a barcode on a jpeg file
 * We probably want to start working on some image analysis that helps read
 * barcodes based on uploaded scans. Many likely will not read. This will require
 * some optimization here.
 * @param {string} jpeg jpeg file object from arr produced by _convertPdf()
 * @returns {string} a code-128 formatted barcode or undefined if not found
 */
const _decodeJpeg = async (jpeg) => {
  const patchSizes = ['x-small', 'small', 'medium', 'large', 'x-large'];

  if (!jpeg || typeof jpeg.pageNum != 'number' || !jpeg.jpegFilepath || !jpeg.workingDir) {
    throw Error('Invalid jpeg file or missing metadata');
  }
  const segmentFilepaths = await _segmentJpeg(jpeg.pageNum, jpeg.jpegFilepath, jpeg.workingDir);
  console.log('_decodeJpeg() starting new jpeg', jpeg.jpegFilepath);
  debug('_decodeJpeg() starting new jpeg', jpeg.jpegFilepath);

  let barcode = null;

  for (let i = 0; i < segmentFilepaths.length; i++) {
    for (let j = 0; j < patchSizes.length; j++) {
      // break to avoid additional scanning if found
      barcode = await _decodeJpegSegment(segmentFilepaths[i], patchSizes[j]);
      if (barcode) {
        console.log('_decodeJpeg() found barcode', barcode);
        debug('_decodeJpeg() found barcode', barcode);
        break;
      }
    }
    if (barcode) {
      break;
    }
  }
  return barcode;
};

/**
 * Quagga fails to locate barcodes on the borders of full-sized pages because:
 * (1.) barcode appears almost too small for x-small patchSize option to read unless super high resolution
 * (2.) the locator fails to locate barcodes on edges/borders of a large image. It generally looks in the center.
 * Hence, we segment a full jpeg and input segments so barcode appears in center of segment and barcode appears bigger
 * relative to patch size.
 * @param {string} filepath vertical slice of a jpeg full page
 * @returns {string} a barcode string or null
 */
const _decodeJpegSegment = async (filepath, patchSize) => {
  return new Promise((resolve, reject) => {
    try {
      // as barcode changes size relative to page, we should adjust patchSize. May want to guarantee barcode size and page size.
      quagga.decodeSingle(
        {
          src: filepath,
          halfSample: true,
          locate: true,
          patchSize: patchSize,
          numOfWorkers: 0,
          inputStream: {
            size: 1920, // restrict input-size resolution to be 1920 in width (long-side)
          },
          decoder: {
            readers: ['code_128_reader'],
          },
        },
        (result) => {
          if (result && result.codeResult && result.codeResult.code) {
            resolve(result.codeResult.code);
          } else {
            resolve(null);
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Splits jpeg image into vertical slices to work with Quagga barcode reader.
 * @param {number} pageNum the page number that the segmented files should be placed in
 * @param {string} jpegFilepath filepath referencing jpeg full page image
 * @param {string} workingDir working directory where image processing occurs
 * @returns {string} contains filepaths referencing jpeg segments
 */
const _segmentJpeg = async (pageNum, jpegFilepath, workingDir, algNum = 0) => {
  const segmentsDir = path.join(workingDir, String(pageNum));
  const segmentsFilepath = path.join(segmentsDir, `segment-${algNum}.jpeg`);
  const algorithms = [
    // NOTE for Developer: Add segmentation possibilities once you have real PDF uploads to analyze
    // Overall this shotgun approach works, but it is slow.
    [jpegFilepath, '-sharpen', '0x7', '-crop', 'x400', '+repage', segmentsFilepath],
    [
      jpegFilepath,
      '-resize',
      '200%',
      '-adaptive-sharpen',
      '0x3',
      '-crop',
      'x400',
      '+repage',
      segmentsFilepath,
    ],
    [jpegFilepath, '-trim', '-crop', 'x400', '+repage', segmentsFilepath],
    [jpegFilepath, '-crop', 'x400', '+repage', segmentsFilepath],
  ];
  await fs.mkdir(segmentsDir, { recursive: true });

  const filenames = await new Promise((resolve, reject) => {
    imagemagick.convert(algorithms[algNum], (err) => {
      if (err) {
        reject(err);
      }
      resolve(fs.readdir(segmentsDir));
    });
  });

  if (algNum === algorithms.length - 1) {
    const filepaths = filenames.map((filename) => {
      return path.join(segmentsDir, filename);
    });
    return filepaths;
  }

  debug('_segmentJpeg() segmented jpeg into vertical slices', algorithms[algNum]);
  return _segmentJpeg(pageNum, jpegFilepath, workingDir, algNum + 1);
};

const _slicePageAs = async (pageNum, pdfFilePath, workingDir, extension) => {
  return new Promise((resolve, reject) => {
    const filename = `${pageNum}.${extension}`;
    const filepath = path.join(workingDir, filename);

    imagemagick.convert(
      // first arg: ie. name.pdf[0] , first page starts at 0
      [
        `${pdfFilePath}[${pageNum}]`,
        '-flatten',
        '-quality',
        '100',
        '-adaptive-sharpen',
        '0x3',
        filepath,
      ],
      (err) => {
        // stdout 2nd arg, but always empty
        if (err) {
          reject(err);
        }
        resolve({ filename, filepath });
      }
    );
  });
};

const _slicePageAsJpeg = async (pageNum, pdfFilePath, workingDir) => {
  const { filename, filepath } = await _slicePageAs(pageNum, pdfFilePath, workingDir, 'jpeg');
  return { jpegFilename: filename, jpegFilepath: filepath };
};

const _slicePageAsPdf = async (pageNum, pdfFilePath, workingDir) => {
  const { filename, filepath } = await _slicePageAs(pageNum, pdfFilePath, workingDir, 'pdf');
  return { pdfFilename: filename, pdfFilepath: filepath };
};

/**
 * Converts a pdf to a array of jpeg objects. Each array entry refers to a page of the pdf
 * with supporting metadata for further barcode decoding operations. Requires a PDF decoder to get
 * number of pages, as identifying metadata of large PDF crashes imagemagick
 * @param {number} numPages length of pdf object
 * @param {buffer} data buffer of file upload
 * @param {string} originalName original name of pdf file upload
 * @returns {Array<object>} jpeg type arr
 */
const _convertPdf = async (numPages, data, originalName) => {
  if (typeof numPages != 'number' || numPages <= 0) {
    throw Error('Valid number of pages required to convert');
  }
  if (!data || !originalName) {
    throw Error('Buffer of PDF and original filename required');
  }
  const converted = [];
  const workingDir = path.join(processingDir, uuidv4());
  const pdfCollectionPath = path.join(workingDir, originalName);

  await fs.mkdir(workingDir, { recursive: true });
  await fs.writeFile(pdfCollectionPath, data);

  for (let i = 0; i < numPages; i++) {
    const start = new Date();
    const { pdfFilename, pdfFilepath } = await _slicePageAsPdf(i, pdfCollectionPath, workingDir);
    const { jpegFilename, jpegFilepath } = await _slicePageAsJpeg(i, pdfCollectionPath, workingDir);
    const end = new Date();
    converted.push({
      pageNum: i,
      secondsElapsed: (end - start) / 1000,
      jpegFilename,
      jpegFilepath,
      pdfFilename,
      pdfFilepath,
      workingDir,
      originalName,
    });
  }

  debug(
    `_convertPdf() ${workingDir} pdf time elasped`,
    converted.reduce((prev, current) => {
      return { secondsElapsed: current.secondsElapsed + prev.secondsElapsed };
    })
  );
  return converted;
};

/**
 * Returns JPEG representation with of each PDF page with metadata:
 * filepaths of files, barcode information if found
 * @param {Buffer} pdfBuffer buffer of uploaded pdf file
 * @param {string} originalFilename uploaded pdf filename
 * @returns {Array<object>} Decoded jpeg data
 */
const decodeBarcodes = async (pdfBuffer, originalFilename) => {
  const pdf = await loadPdf(pdfBuffer);
  const jpegs = await _convertPdf(pdf.numPages, pdfBuffer, originalFilename);
  return _decodeJpegs(jpegs);
};

module.exports = { processScrapPaperPdf, decodeBarcodes, loadPdf };
