const express = require('express');
const router = express.Router();

// const logger = require('../../lib/logger');
// const config = require('../../lib/config.js');
// const {fromPath} = require('pdf2pic');
// const ERR = require('async-stacktrace');

const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const fs = require('fs');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  let file = req.body.file;
  file = './test.pdf';

  imagemagick.identify(file, (err, output) => {
    if (err) {
      console.log(err);
    }
    console.log(output);
  });
  imagemagick.convert(
    ['test.pdf[0]', '-flatten', '-quality', '100', '-resize', '150%', 'kittens-small.jpg'],
    (err, output) => {
      if (err) {
        console.log(err);
      }
      console.log('the output', output);

      quagga.decodeSingle(
        {
          src: fs.readFileSync('./kittens-small.jpg'),
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
          console.log('result', result);
        }
      );
    }
  );

  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  next();

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
  console.log(req.body);
  // upper bound pdf size limit = 25mb

  // each page size conversion to 300kb

  // barcode reader fails (send back page image)

  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  next();
});

module.exports = router;
