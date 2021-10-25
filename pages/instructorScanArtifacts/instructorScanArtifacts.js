const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');
const quagga = require('quagga').default;
const fs = require('fs');
const {fromPath} = require('pdf2pic');

// const sqldb = require('../../prairielib/lib/sql-db');
// const sqlLoader = require('../../prairielib/lib/sql-loader');
// const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    const file = './test.pdf';

    const out = './';
        
    const baseOptions = {
      width: 2550,
      height: 3300,
      density: 330,
      savePath: out,
    };
    
    const convert = fromPath(file, baseOptions);
    convert.setGMClass(true);
    convert(1);

    return convert(1);

    // quagga.decodeSingle({
    //     src: './test.jpeg',
    //     numOfWorkers: 0, // 0 in node
    //     inputStream: {
    //         size: 640, // pixel width
    //         area: { // defines rectangle of the detection/localization area
    //             top: '0%',    // top offset
    //             right: '0%',  // right offset
    //             left: '0%',   // left offset
    //             bottom: '0%',  // bottom offset
    //           },
    //     },
    //     locate: true,
    // }, (data) => {
    //     console.log(data);

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
