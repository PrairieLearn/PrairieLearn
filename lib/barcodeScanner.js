const config = require('./config');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const pdfParse = require('pdf-parse');

const processingDir = config.imageProcessingDir;

// TO DO: Remove fs contents where image contents succeeded

const _decodeJpegs = async (jpegs) => {
  for(let i = 0; i < jpegs.length; i++) {
    const barcode = await _decodeJpeg(jpegs[i]);
    if (barcode && barcode.codeResult) {
      jpegs[i]['barcode'] = barcode.codeResult.code;
    } else {
      jpegs[i]['barcode'] = null;
    }
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
  if (!jpeg || typeof jpeg.pageNum != 'number' || !jpeg.jpegFilepath || !jpeg.workingDir) {
    throw Error('Invalid jpeg file or missing metadata');
  }
  const segmentFilepaths = await _segmentJpeg(jpeg.pageNum, jpeg.jpegFilepath, jpeg.workingDir);
  for (let i = 0; i < segmentFilepaths.length; i++) {
    // break to avoid additional scanning if found
    const barcode = await _decodeJpegSegment(segmentFilepaths[i]);
    if (barcode) {
      return barcode;
    }
  }
};

/**
 * Quagga fails to locate barcodes on the borders of full-sized pages because:
 * (1.) barcode appears almost too small for x-small patchSize option to read unless super high resolution
 * (2.) the locator fails to locate barcodes on edges/borders of a large image. It generally looks in the center.
 * Hence, we segment a full jpeg and input segments so barcode appears in center of segment and barcode appears bigger
 * relative to patch size.
 * @param {string} filepath vertical slice of a jpeg full page
 * @returns {string} a barcode string or undefined
 */
const _decodeJpegSegment = async (filepath) => {
  return new Promise((resolve, reject) => {
    try {
    // as barcode changes size relative to page, we should adjust patchSize. May want to guarantee barcode size and page size.
      quagga.decodeSingle(
        {
          src: filepath,
          patchSize: 'medium',
          numOfWorkers: 0,
          inputStream: {
            size: 1920  // restrict input-size resolution to be 1920 in width (long-side)
          },
          decoder: {
            readers: ['code_128_reader'],
          },
          locate: true
        },
        (result) => {
          resolve(result);
        }
      );
    } catch(err) {
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
const _segmentJpeg = async (pageNum, jpegFilepath, workingDir) => {
  const segmentsDir = path.join(workingDir, String(pageNum));
  const segmentsFilepath = path.join(segmentsDir, 'segment-%d.jpg');

  await fs.mkdir(segmentsDir, {recursive: true});

  const filenames = await new Promise((resolve, reject) => {
    imagemagick.convert(
      [jpegFilepath, '-trim', '-crop', 'x500', '+repage', segmentsFilepath],
      (err, stdout) => {
        if (err) {
          reject(err);
        }
        debug('_segmentJpeg() imagemagick stdout usually empty', stdout);
        resolve(fs.readdir(segmentsDir));
      }
    );
  });

  const filepaths = filenames.map((filename) => {
    return path.join(segmentsDir, filename);
  });

  debug('_segmentJpeg() segmented jpeg into vertical slices', filepaths)
  return filepaths;
};

const _slicePageAs = async (pageNum, pdfFilePath, workingDir, extension) => {

  return new Promise((resolve, reject) => {
    const filename = `${pageNum}.${extension}`;
    const filepath = path.join(workingDir, filename);

    imagemagick.convert(
      // first arg: ie. name.pdf[0] , first page starts at 0
      [`${pdfFilePath}[${pageNum}]`, '-flatten', '-quality', '100', '-adaptive-sharpen', '0x3', filepath],
      (err) => { // stdout 2nd arg, but always empty
        if (err) {
          reject(err);
        }
        resolve({filename, filepath});
      }
    );
  });
}

const _slicePageAsJpeg = async (pageNum, pdfFilePath, workingDir) => {
  const {filename, filepath} = await _slicePageAs(pageNum, pdfFilePath, workingDir, 'jpeg');
  return {jpegFilename: filename, jpegFilepath: filepath};
};

const _slicePageAsPdf = async (pageNum, pdfFilePath, workingDir) => {
  const {filename, filepath} = await _slicePageAs(pageNum, pdfFilePath, workingDir, 'pdf');
  return {pdfFilename: filename, pdfFilepath: filepath};

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
    throw Error('Valid number of pages required to convert')
  }
  if (!data || !originalName) {
    throw Error('Buffer of PDF and original filename required')
  }
  const converted = [];
  const workingDir = path.join(processingDir, uuidv4());
  const pdfCollectionPath = path.join(workingDir, originalName);

  await fs.mkdir(workingDir, {recursive: true});
  await fs.writeFile(pdfCollectionPath, data)

  for (let i = 0; i < numPages; i++) {
    const start = new Date();
    const {pdfFilename, pdfFilepath} = await _slicePageAsPdf(i, pdfCollectionPath, workingDir);
    const {jpegFilename, jpegFilepath} = await _slicePageAsJpeg(i, pdfCollectionPath, workingDir);
    const end = new Date();
    converted.push({
      pageNum: i,
      secondsElapsed: (end - start) / 1000,
      jpegFilename,
      jpegFilepath,
      pdfFilename,
      pdfFilepath,
      workingDir,
      originalName
    });
  };

  console.log(`_convertPdf() ${workingDir} pdf time elasped`, converted.reduce((prev, current) => {return {secondsElapsed: current.secondsElapsed + prev.secondsElapsed}}));
  debug(`_convertPdf() ${workingDir} pdf time elasped`, converted.reduce((prev, current) => {return {secondsElapsed: current.secondsElapsed + prev.secondsElapsed}}));
  return converted;
};

/**
 * Returns JPEG representation with of each PDF page with metadata:
 * filepaths of files, barcode information if found
 * @param {*} pdfBuffer 
 * @param {*} originalFilename 
 * @returns 
 */
const decodeBarcodes = async (pdfBuffer, originalFilename) => {
  const pdf = await pdfParse(pdfBuffer);
  const jpegs = await _convertPdf(pdf.numpages, pdfBuffer, originalFilename);
  return _decodeJpegs(jpegs);
}

module.exports = {decodeBarcodes};
