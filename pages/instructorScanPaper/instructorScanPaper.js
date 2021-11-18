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

const processingDir = './image_processing';

const decodeJpegs = async (jpegFiles) => {
  for(let i = 0; i < jpegFiles.length; i++) {
    const barcode = await decodeJpeg(jpegFiles[i]);
    if (barcode) {
      jpegFiles[i]['decoded'] = true;
      jpegFiles[i]['barcode'] = barcode;
      processed.push(jpegFiles[i]);
    } else {
      jpegFiles[i]['decoded'] = false;
      jpegFiles[i]['barcode'] = null;
    }
  }
  return jpegFiles;
};

const decodeJpeg = async (jpegFile) => {
  return new Promise((resolve, reject) => {
    if (!jpegFile || !jpegFile.workingDir || !jpegFile.convertedFilename) {
      throw Error('Missing jpeg file input for barcode decoding');
    }
    try {
      quagga.decodeSingle(
        {
          src: path.join(jpegFile.workingDir, jpegFile.convertedFilename),
          numOfWorkers: 0,
          inputStream: {
            mime: 'image/jpeg',
            size: 800,
            area: {
              top: '70%',
              right: '25%',
              left: '25%',
              bottom: '20%',
            },
          },
          locate: true,
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

const convertPdfPage = async (pageNum, pdfFilePath, workingDir) => {
  return new Promise((resolve, reject) => {
    const convertedFilename = `${pageNum}.jpg`;
    const convertedFilepath = path.join(workingDir, convertedFilename);
    imagemagick.convert(
      [pdfFilePath, '-flatten', '-quality', '100', '-resize', '150%', convertedFilepath],
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

const convertPdf = async (numPages, data, originalName) => {
  const converted = [];
  const workingDir = path.join(processingDir, uuidv4());
  const pdfPath = path.join(workingDir, originalName);

  await fs.mkdir(workingDir, {recursive: true});
  await fs.writeFile(pdfPath, data)

  for (let i = 0; i < numPages; i++) {
    const start = new Date();
    const pageNum = i + 1;
    const convertedFilename = await convertPdfPage(pageNum, pdfPath, workingDir);
    const end = new Date();
    const secondsElapsed = (end - start) / 1000;
    converted.push({pageNum, secondsElapsed, convertedFilename, workingDir, originalName});
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
      .then((jpegPages) => {
        return decodeJpegs(jpegPages);
      })
      .then((decodedJpegs) => {
        console.log('decoded jpegs', decodeJpegs);
      });
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    // upper bound pdf size limit = 25mb ././ must be configured in server.js and main config file -- upped to 25mb
    
    // barcode reader fails (send back page image so they can see which one failed)
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
