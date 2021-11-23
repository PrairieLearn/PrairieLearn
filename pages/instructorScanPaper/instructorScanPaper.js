const express = require('express');
const router = express.Router();

const barcodeScanner = require('../../lib/barcodeScanner');
// const {fromPath} = require('pdf2pic');
const ERR = require('async-stacktrace');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);
const pdfParse = require('pdf-parse');


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
        return barcodeScanner.convertPdf(pdf.numpages, req.file.buffer, req.file.originalname);
      })
      .then((jpegs) => {
        return barcodeScanner.decodeJpegs(jpegs);
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
