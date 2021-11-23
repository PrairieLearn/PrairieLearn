const express = require('express');
const router = express.Router();

// const logger = require('../../lib/logger');
const config = require('../../lib/config.js');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// const {fromPath} = require('pdf2pic');
const ERR = require('async-stacktrace');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const pdfParse = require('pdf-parse');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

const processingDir = config.imageProcessingDir;
const queue = [];
const processing = false;

const decodeJpegs = async (jpegs) => {
  for(let i = 0; i < jpegs.length; i++) {
    const barcode = await decodeJpeg(jpegs[i]);
    if (barcode) {
      jpegs[i]['barcode'] = barcode.codeResult.code;
    } else {
      jpegs[i]['barcode'] = null;
    }
  }
  return jpegs;
};

/**
 * Detects and extracts a barcode on a jpeg file
 * @param {string} jpeg jpeg file object from arr produced by convertPdf()
 * @returns {string} a code-128 formatted barcode or undefined if not found
 */
const decodeJpeg = async (jpeg) => {
  if (!jpeg || typeof jpeg.pageNum != 'number' || !jpeg.jpegFilepath || !jpeg.workingDir) {
    throw Error('Invalid jpeg file or missing metadata');
  }
  const segmentFilepaths = await segmentJpeg(jpeg.pageNum, jpeg.jpegFilepath, jpeg.workingDir);
  for (let i = 0; i < segmentFilepaths.length; i++) {
    // break to avoid additional scanning if found
    const barcode = await decodeJpegSegment(segmentFilepaths[i]);
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
const decodeJpegSegment = async (filepath) => {
  return new Promise((resolve, reject) => {
    try {
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
          locator: {
            halfSample: true
          },
          locate: true
        },
        (result) => {
          console.log('decode result', result);
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
const segmentJpeg = async (pageNum, jpegFilepath, workingDir) => {
  const segmentsDir = path.join(workingDir, String(pageNum));
  const segmentsFilepath = path.join(segmentsDir, 'segment-%d.jpg');

  await fs.mkdir(segmentsDir, {recursive: true});

  const filenames = await new Promise((resolve, reject) => {
    imagemagick.convert(
      [jpegFilepath, '-crop', 'x500', '+repage', segmentsFilepath],
      (err, stdout) => {
        if (err) {
          reject(err);
        }
        debug('segmentJpeg() imagemagick stdout usually empty', stdout);
        resolve(fs.readdir(segmentsDir));
      }
    );
  });

  const filepaths = filenames.map((filename) => {
    return path.join(segmentsDir, filename);
  });

  debug('segmentJpeg() segmented jpeg into vertical slices', filepaths)
  return filepaths;
};

const pdfPageToJpeg = async (pageNum, pdfFilePath, workingDir) => {
  return new Promise((resolve, reject) => {
    const convertedFilename = `${pageNum}.jpg`;
    const convertedFilepath = path.join(workingDir, convertedFilename);

    imagemagick.convert(
      // first arg: ie. name.pdf[0] , first page starts at 0
      [`${pdfFilePath}[${pageNum}]`, '-flatten', '-quality', '100', '-resize', '150%', convertedFilepath],
      (err, stdout) => {
        if (err) {
          console.log(stdout);
          reject(err);
        }
        resolve(convertedFilename);
      }
    );
  });
};

/**
 * Converts a pdf to a array of jpeg objects. Each array entry refers to a page of the pdf
 * with supporting metadata for further barcode decoding operations. Requires a PDF decoder to get
 * number of pages, as identifying metadata of large PDF crashes imagemagick
 * @param {number} numPages length of pdf object
 * @param {buffer} data buffer of file upload
 * @param {string} originalName original name of pdf file upload
 * @returns [object] jpeg type arr
 */
const convertPdf = async (numPages, data, originalName) => {
  const converted = [];
  const workingDir = path.join(processingDir, uuidv4());
  const pdfPath = path.join(workingDir, originalName);

  await fs.mkdir(workingDir, {recursive: true});
  await fs.writeFile(pdfPath, data)

  for (let i = 0; i < numPages; i++) {
    const start = new Date();
    const jpegFilename = await pdfPageToJpeg(i, pdfPath, workingDir);
    const jpegFilepath = path.join(workingDir, jpegFilename);
    const end = new Date();
    const secondsElapsed = (end - start) / 1000;
    converted.push({pageNum: i, secondsElapsed, jpegFilename, jpegFilepath, workingDir, originalName});
  }

  console.log('convertPdf() pdf time elasped', converted.reduce((prev, current) => {return {secondsElapsed: current.secondsElapsed + prev.secondsElapsed}}))
  debug('convertPdf() pdf time elasped', converted.reduce((prev, current) => {return {secondsElapsed: current.secondsElapsed + prev.secondsElapsed}}));
  return converted;
};

router.get('/', (req, res, next) => {

  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);


  // const javascriptBarcodeReader = require('javascript-barcode-reader');
  // const jpeg = require('jpeg-js');
  // const jpegData = fs.readFileSync();
  // const clampedArrayImage = jpeg.decode(jpegData);

  // javascriptBarcodeReader({
  //   /* Image file Path || {data: Uint8ClampedArray, width, height} || HTML5 Canvas ImageData */
  //   image: './kittens-small.jpg',
  //   barcode: 'code-128',
  //   // barcodeType: 'industrial',
  //   options: {
  //     useAdaptiveThreshold: true, // for images with sahded portions
  //     // singlePass: true
  //   },
  // })
  //   .then(code => {
  //     console.log(code);
  //   })
  //   .catch(err => {
  //     console.log(err);
  //   });

  // const convert = fromPath('./test1.pdf', {
  //     format: 'png',
  //     background: 'white',
  //     saveFilename: 'test',
  //     savePath: '.',
  //   });
  // convert.setGMClass(true);
  // convert(1).then((resolve) => {
  //     const baseOptions = {
  //         format: 'jpeg',
  //         saveFilename: 'test',
  //         savePath: '.',
  //         background: 'white',
  //       };
  //     const convert = fromPath('./test.1.png', baseOptions);
  //     convert.setGMClass(true);
  //     return convert(1);
  // })
  // .then((resolve) => {
  //     console.log(resolve);

  //     res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  // });
});

router.post('/', function (req, res, next) {
  if (req.body.__action == 'scan_scrap_paper') {
    console.log(req.file);
    if (!req.file && !req.file.buffer) {
      ERR(Error('Missing artifact file data'), next); return;
    }

    pdfParse(req.file.buffer)
      .then((pdf) => {
        return convertPdf(pdf.numpages, req.file.buffer, req.file.originalname);
      })
      .then((jpegs) => {
        return decodeJpegs(jpegs);
      })
      .then((decodedJpegs) => {
        console.log('decodedJpegs', decodedJpegs);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
      // TO DO: 

      // reference submission in barcode row

      // detach process from request and display stdout in view

      // upload file to s3 and then reintegrate/improve question view to render pdf

      //implement makeshift queue, as https://github.com/serratus/quaggaJS/issues/135 issues when two decoding jobs running simaltaneously
    
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  };
});

module.exports = router;
