const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../lib/file-store');
const fs = require('fs').promises;

const quagga = require('quagga').default;
const imagemagick = require('node-imagemagick');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); // legacy means node support

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const processingDir = '/tmp/image_processing';
const segmentOptions = [
  // NOTE for Developer: Add/remove segmentation possibilities once you have real PDF uploads to analyze
  // We need to collect data. Overall this shotgun approach works, but it is slow.
  // Best algorithms go first to speed up process.
  ['-trim', '-crop', 'x400', '+repage'],
  ['-sharpen', '0x7', '-crop', 'x400', '+repage'],
  ['-crop', 'x400', '+repage'],
  ['-resize', '400%', '-adaptive-sharpen', '0x3', '-crop', 'x400', '+repage'],
];
class Queue {
  static queue = [];
  static pendingPromise = false;

  static notifyPositions(queued) {
    queued.forEach((item, i) => item.logger.info(`Queued in position ${i}\n.`));
  }

  static enqueue(promise, logger) {
    return new Promise((resolve, reject) => {
      logger.info(`PDF Barcode Processing Queued in Position ${this.queue.length}\n.`);
      this.queue.push({
        promise,
        logger,
        resolve,
        reject,
      });
      this.dequeue();
    });
  }

  static dequeue() {
    if (this.workingOnPromise) {
      return false;
    }
    const item = this.queue.shift();
    this.notifyPositions(this.queue);
    if (!item) {
      return false;
    }
    try {
      this.workingOnPromise = true;
      item
        .promise()
        .then((value) => {
          this.workingOnPromise = false;
          item.resolve(value);
          this.dequeue();
        })
        .catch((err) => {
          this.workingOnPromise = false;
          item.reject(err);
          this.dequeue();
        });
    } catch (err) {
      this.workingOnPromise = false;
      item.reject(err);
      this.dequeue();
    }
    return true;
  }
}

/**
 * Load metadata about pdf
 * https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.js
 * @param {Buffer} pdfBuffer
 * @returns {object} pdf.js wrapper
 */
const readPdf = async (pdfBuffer) => {
  return pdfjsLib.getDocument(pdfBuffer).promise;
};

/**
 * Helper method to upload a pdf page to S3 via file-store API
 * @param {Array<object>} decodedPdfs array pdf file meta data object list
 * @param {Array<object>} fileMetadata assessment_instance_id, instance_question_id, submission id meta data for file-store api
 * @param {Array<object>} userId authn user id to be stored in file-api alongside file metadata
 * @return {Promise<Object[]>} metadata
 */
const _uploadPages = async (decodedPdfs, fileMetadata, userId) => {
  const uploaded = [];
  for (let i = 0; i < decodedPdfs.length; i++) {
    for (let j = 0; j < fileMetadata.rows.length; j++) {
      if (
        fileMetadata.rows[j].barcode === decodedPdfs[i].barcode &&
        uploaded.map(upload => upload.barcode).indexOf(decodedPdfs[i].barcode) === -1
      ) {
        // Promise.all memory limitations?
        // TODO: We only want to upload a file once and never again probably. So if an instructor submits a scan again, we don't want to upload it.
        // We can discuss this, but things have setup to query the last entry uploaded for a submission until we know what we want to do here.

        // TODO: can optimize this to ensure we do not upload more than 1 page per barcode
        const fileId = await fileStore.upload(
          `${decodedPdfs[i].barcode}-barcode-submission.pdf`,
          await fs.readFile(decodedPdfs[i].pdfFilepath),
          'pdf_barcode_scan',
          fileMetadata.rows[j].assessment_instance_id,
          fileMetadata.rows[j].instance_question_id,
          userId,
          userId,
          'S3'
        );
        uploaded.push({ fileId, barcode: decodedPdfs[i].barcode });
      }
    }
  }
  return uploaded;
};

const _updateBarcodesTable = async (uploadedFiles) => {
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
};

const _processScrapPaperPdf = async (pdfBuffer, originalName, userId, logger) => {
  const workingDir = path.join(processingDir, uuidv4());

  try {
    const allResults = await decodeBarcodes(pdfBuffer, workingDir, originalName, logger);
    const readBarcodedPages = allResults.filter((decodedPdfPage) => decodedPdfPage.barcode);

    logger.info(`JSON decoder uploaded pages: ${allResults.length}`);
    logger.info(`JSON decoder successfully read barcodes on pages: ${readBarcodedPages.length}`);
    logger.info(`JSON decoder all results data dump: ${JSON.stringify(allResults, null, 2)}`);

    // get iq details, ai details to store in file API
    const barcodes = readBarcodedPages.map((page) => page.barcode);
    const query = sql.get_barcode_metadata.replace(
      '$match',
      `s.submitted_answer->>'_pdf_barcode_scan' = '${barcodes.join(
        "' OR s.submitted_answer->>'_pdf_barcode_scan' = '"
      )}'`
    );
    const fileMetadata = await sqldb.queryAsync(query, {});

    const uploadedFiles = await _uploadPages(readBarcodedPages, fileMetadata, userId);
    await _updateBarcodesTable(uploadedFiles);

    logger.info(`Removing working directory: ${workingDir}`);
    await removeFilesAndDir(workingDir, logger);
  } catch (err) {
    logger.info(`Operation aborted due to error: ${err.message}`);
    logger.info(`Removing working directory: ${workingDir}`);

    await removeFilesAndDir(workingDir, logger);

    logger.fail(
      // If we want the front-end to see this debugging information
      `
      ${err.message}
      ${err.stack}
      `
    );
  }
  logger.succeed();
};

/**
 * A Pdf Scan is a collection of scanned barcoded single pieces of paper with
 * student written work. It is expected that one barcode exists on each page in the PDF.
 * If a barcode is readable by the decoder, the page will be uploaded to S3 and stored with
 * metadata information in `files` and `barcodes` table to later allow viewing of doc by student.
 * If a student submits a barcode after file upload, it can still be displayed on front-end.
 * @param {Buffer} pdfBuffer buffered application/pdf scanned document
 * @param {string} originalName uploaded filename
 * @param {string} userId authn user id to be stored in file api
 * @param {object} logger
 * @returns updates barcode table rows
 */
const processScrapPaperPdf = async (pdfBuffer, originalName, userId, logger) => {
  const job = async () => _processScrapPaperPdf(pdfBuffer, originalName, userId, logger);
  Queue.enqueue(job, logger);
};

const _decodeJpegs = async (jpegs, logger) => {
  for (let i = 0; i < jpegs.length; i++) {
    const start = new Date();
    logger.info(`_decodeJpegs() - start decoding of ${jpegs[i].jpegFilename} / page ${i}`);
    jpegs[i]['barcode'] = await _decodeJpeg(jpegs[i], logger);
    const secondsElapsed = (new Date() - start) / 1000;
    logger.info(
      `_decodeJpegs() - took ${secondsElapsed} to decode ${jpegs[i].jpegFilename} / page ${i}`
    );
  }
  return jpegs;
};

/**
 * Detects and extracts a barcode on a jpeg file
 * We probably want to start working on some image analysis that helps read
 * barcodes based on uploaded scans. Many likely will not read. This will require
 * some optimization here.
 * @param {string} jpeg jpeg file object from arr produced by _convertPdf()
 * @returns {Promise<string>} a code-128 formatted barcode or undefined if not found
 */
const _decodeJpeg = async (jpeg, logger) => {
  // priortize most effective patchSizes first
  const patchSizes = ['medium', 'small', 'x-small', 'large', 'x-large'];

  if (!jpeg || typeof jpeg.pageNum != 'number' || !jpeg.jpegFilepath || !jpeg.workingDir) {
    throw Error('Invalid jpeg file or missing metadata');
  }
  logger.info('_decodeJpeg() starting new jpeg', jpeg.jpegFilepath);

  let barcode = null;

  for (let i = 0; i < segmentOptions.length; i++) {
    const segmentFilepaths = await _segmentJpeg(
      jpeg.pageNum,
      jpeg.jpegFilepath,
      jpeg.workingDir,
      logger,
      i
    );
    for (let i = 0; i < patchSizes.length; i++) {
      for (let k = 0; k < segmentFilepaths.length; k++) {
        // break to avoid additional decoding and image segmentation if found
        barcode = await _decodeJpegSegment(segmentFilepaths[k], patchSizes[i]);
        if (barcode) {
          logger.info(
            `_decodeJpeg() found barcode, ${barcode}, with segmentation option ${k} and framesize '${patchSizes[i]}'`
          );
          return barcode;
        }
      }
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
          if (result?.codeResult?.code) {
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
 * @param {number} pageNum the page number folder that the segmented files should be placed in
 * @param {string} jpegFilepath filepath referencing jpeg full page image
 * @param {string} workingDir working directory where image processing occurs
 * @param {object} logger job logger
 * @param {number} patchSizeNum patch size arr index option
 * @returns {string} contains filepaths referencing jpeg segments
 */
const _segmentJpeg = async (pageNum, jpegFilepath, workingDir, logger, patchSizeNum) => {
  const segmentsDir = path.join(workingDir, String(pageNum));
  const segmentsFilepath = path.join(segmentsDir, `segment-${patchSizeNum}.jpeg`);
  const args = [jpegFilepath].concat(segmentOptions[patchSizeNum], [segmentsFilepath]);
  logger.info(`Segmenting ${jpegFilepath} using imagemagick command: 
    'convert ${args.join(' ')} `);
  await fs.mkdir(segmentsDir, { recursive: true });

  const filenames = await new Promise((resolve, reject) => {
    imagemagick.convert(args, (err) => {
      if (err) {
        reject(err);
      }
      resolve(fs.readdir(segmentsDir));
    });
  });
  const filepaths = filenames.map((filename) => {
    return path.join(segmentsDir, filename);
  });
  return filepaths;
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
          return;
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
 * @param {object} logger
 * @returns {Array<object>} jpeg type arr
 */
const _convertPdf = async (numPages, workingDir, data, originalName, logger) => {
  logger.info(`_convertPdf() - start - Converting each page to PDF and JPEG slice`);
  if (typeof numPages != 'number' || numPages <= 0) {
    throw Error('Valid number of pages required to convert');
  }
  if (!data || !originalName) {
    throw Error('Buffer of PDF and original filename required');
  }
  const converted = [];
  const pdfCollectionPath = path.join(workingDir, originalName);

  await fs.mkdir(workingDir, { recursive: true });
  await fs.writeFile(pdfCollectionPath, data);

  for (let i = 0; i < numPages; i++) {
    const start = new Date();
    const { pdfFilename, pdfFilepath } = await _slicePageAsPdf(i, pdfCollectionPath, workingDir);
    logger.info(`Created ${pdfFilename} for page ${i}`);
    const { jpegFilename, jpegFilepath } = await _slicePageAsJpeg(i, pdfCollectionPath, workingDir);
    logger.info(`Created ${jpegFilename} for page ${i}`);
    const secondsElapsed = (new Date() - start) / 1000;
    logger.info(`Took ${secondsElapsed} seconds`);
    converted.push({
      pageNum: i,
      secondsElapsed: secondsElapsed,
      jpegFilename,
      jpegFilepath,
      pdfFilename,
      pdfFilepath,
      workingDir,
      originalName,
    });
  }

  logger.info(
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
 * @param {object} logger
 * @returns {Array<object>} Decoded jpeg data
 */
const decodeBarcodes = async (pdfBuffer, workingDir, originalFilename, logger) => {
  const start = new Date();
  logger.info(`decodeBarcodes() - start - ${start.toISOString()}`);

  const pdf = await readPdf(pdfBuffer, originalFilename);
  logger.info(`pdf read: starting decoding sequence for ${pdf.numPages} pages`);
  const jpegs = await _convertPdf(pdf.numPages, workingDir, pdfBuffer, originalFilename, logger);
  const decodedJpegs = await _decodeJpegs(jpegs, logger);
  const end = new Date();
  logger.info(`decodeBarcodes() - end - took ${(end - start) / 1000} seconds`);
  return decodedJpegs;
};

/**
 * Remove files and folders up to 2 levels deep (ie. ./x/y/*)
 * @param {string} workingDir directory with files to destroy
 */
const removeFilesAndDir = async (workingDir, logger) => {
  const files = await fs.readdir(workingDir);
  for (let i = 0; i < files.length; i++) {
    const filepath = path.join(workingDir, files[i]);
    if ((await fs.stat(filepath)).isFile()) {
      logger.info(`Removing file: ${filepath}`);
      await fs.unlink(filepath);
    } else {
      const subdirFiles = await fs.readdir(filepath);
      if (subdirFiles.length > 0) {
        await removeFilesAndDir(filepath, logger);
      } else {
        logger.info(`Removing dir: ${filepath}`);
        await fs.rmdir(workingDir), { recursive: true };
      }
    }
  }
  await fs.rmdir(workingDir), { recursive: true };
};
module.exports = { processScrapPaperPdf, decodeBarcodes, readPdf };
