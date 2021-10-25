const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const bitgener = require('bitgener');
const pdfkit = require('pdfkit');
const sharp = require('sharp');

const createBarcodes = async () => {
    const svgBarcodes = [];
    let barcode = 123123123123;
    for (let i = 0; i < 10; i++) {
        const result = await bitgener({
            data: String(barcode),
            type: 'ean13',
            output: 'buffer',
            encoding: 'utf8',
            original1DSize: true,
            addQuietZone: true,
            color: '#000',
            bgColor: '#FFF',
            hri: {
            show: true,
            fontFamily: 'Futura',
            marginTop: 5,
            },
        });

        svgBarcodes.push(result.svg);
        barcode+=1;
    }
    return svgBarcodes;
};
const convertImage = async (image) => {
    return sharp(image)
        .png()
        .toBuffer({resolveWithObject: true});
};
const toPdf = async (svgBarcodes) => {
    const doc = new pdfkit({size: 'A3'});

    for (let i = 0; i < svgBarcodes.length; i++) {
        const {data, info} = await convertImage(svgBarcodes[i]);

        //                        center image             give bottom margin with 30 padding
        doc.image(data, (doc.page.width - info.width) / 2, doc.page.height - info.height - 30);

        if (i < svgBarcodes.length) {
            doc.addPage({size: 'A3'});
        }
    }
    return doc;
};

router.get('/', (req, res, next) => {
    createBarcodes()
        .then(svgBarcodes => {
            return toPdf(svgBarcodes);
        })
        .then(doc => {
            doc.pipe(res);
            doc.end();
        })
        .catch(err => {
            if (ERR(err, next)) return;
        });
});

router.post('/', function(req, res, next) {
    // stub for post to start barcode creation
});

module.exports = router;
