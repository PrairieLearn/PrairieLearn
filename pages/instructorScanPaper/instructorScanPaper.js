const express = require('express');
const router = express.Router();

// const logger = require('../../lib/logger');
const config = require('../../lib/config.js');
// const {fromPath} = require('pdf2pic');
const ERR = require('async-stacktrace');

const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

const convertPage = async (pageNum, filename) => {
  return new Promise((resolve, reject) => {
    // api should start page count at 0
    imagemagick.convert(
      [`${filename}.pdf[${pageNum}]`, '-flatten', '-quality', '100', '-resize', '150%', `${filename}${pageNum + 1}.jpg`],
      (err, output) => {
        if (err) {
          console.log(err);
          reject(err);
        }
        console.log('the output', output);
        resolve(output);
      }
    );
  });
};

const convertPages = async (numPages, data) => {
  const converted = [];
  await fs.writeFile(`./randomfile.pdf`, data)
  for (let i = 0; i < numPages; i++) {
    const pageNum = i;
    const pageJpeg = await convertPage(pageNum, `randomfile`);
    converted.push(pageJpeg);
  }
  return converted;
};

router.get('/', (req, res, next) => {

  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

  // quagga.decodeSingle(
  //   {
  //     src: fs.readFileSync('./kittens-small.jpg'),
  //     numOfWorkers: 0,
  //     inputStream: {
  //       mime: 'image/jpeg',
  //       size: 800,
  //       area: {
  //         top: '70%',
  //         right: '25%',
  //         left: '25%',
  //         bottom: '20%',
  //       },
  //     },
  //     locate: true,
  //   },
  //   (result) => {
  //     console.log('result', result);
  //   }
  // );


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
  console.log(req.file);
  if (!req.file && !req.file.buffer) {
    ERR(Error('Missing artifact file data'), next); return;
  }
  pdfParse(req.file.buffer)
    .then((pdf) => {
      return convertPages(pdf.numpages, req.file.buffer);
    });
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  // upper bound pdf size limit = 25mb ././ must be configured in server.js and main config file -- upped to 25mb

  // each page size conversion to 300kb

  // barcode reader fails (send back page image)
});

module.exports = router;
