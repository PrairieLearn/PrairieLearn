const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');
const quagga = require('quagga').default;
const imagemagick = require('imagemagick');
const fs = require('fs');
const {fromPath} = require('pdf2pic');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    imagemagick.identify('./test.pdf', (err, output) => {
        if (err) { console.log(err); }
        console.log(output);
    });
    imagemagick.convert(['test.pdf[0]', '-flatten', '-quality', '100', '-resize', '150%', 'kittens-small.jpg'], (err, output) => {
        if (err) { console.log(err); }
        console.log('the output', output);


        const javascriptBarcodeReader = require('javascript-barcode-reader');
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



        quagga.decodeSingle({
            src: './kittens-small.jpg',
            numOfWorkers: 0, // 0 in node
            locate: true,
            decoder: {
                readers: ["code_128_reader", "ean_reader"] // List of active readers
            },
            locator: {
                patchSize: "x-large", // x-small, small, medium, large, x-large
            },
        }, (data) => {
            console.log(data);
        });
    });
    console.log('FINALLY DONE');

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

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {


    // upper bound pdf size limit = 25mb

    // each page size conversion to 300kb

    // barcode reader fails (send back page image)
});

module.exports = router;
