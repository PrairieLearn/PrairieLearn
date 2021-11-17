const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
// const logger = require('../../lib/logger');
// const config = require('../../lib/config.js');
const error = require('../../prairielib/lib/error');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const bitgener = require('bitgener');
const pdfkit = require('pdfkit');
const sharp = require('sharp');
const jsCrc = require('js-crc');

const generateBarcodes = async (numBarcodes) => {
  const barcodes = [];

  // Barcodes should be error-detecting <x char hexatridecimal produced by base36 encoding><4 char crc16 hash>
  // Sequential counter to produce x char base36 string should be base36 encode input

  if (!numBarcodes || numBarcodes > 1000) {
    throw new Error('Cannot produce more than 1000 or less than 1 barcoded sheets');
  }

  const client = await sqldb.beginTransactionAsync();
  try {
    const queryCount = await sqldb.queryWithClientAsync(client, sql.get_barcodes_count, {});

    // Want to create new barcodes based on sequential count in database
    let barcodesCount = Number(queryCount[1].rows[0].count);
    for (let i = 0; i < numBarcodes; i++) {
      barcodesCount += 1;
      const base36 = BigInt(barcodesCount).toString(36);
      const crc16 = jsCrc.crc16(base36);
      const barcode = `${base36}${crc16}`; // concat as string in chance integer combo
      barcodes.push(barcode);
    }

    const insert_barcodes = sql.insert_barcodes.replace(
      '$barcodes',
      barcodes.map((barcode) => "('" + barcode + "')").join(',')
    );
    const insertedBarcodes = await sqldb.queryWithClientAsync(client, insert_barcodes, {});
    if (insertedBarcodes.rows.length != numBarcodes) {
      throw Error('Wrong number of barcodes created. Aborting');
    }
  } catch (err) {
    // rolls back if error
    await sqldb.endTransactionAsync(client, err);
    throw err;
  }
  await sqldb.endTransactionAsync(client, null);
  return barcodes;
};

const createBarcodeSVGs = async (barcodes) => {
  const svgs = [];
  for (let i = 0; i < barcodes.length; i++) {
    const result = await bitgener({
      data: barcodes[i].toUpperCase(),
      type: 'code128',
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

    svgs.push(result.svg);
  }
  return svgs;
};
const convertImage = async (image) => {
  return sharp(image)
    .png({ quality: 100 }) // TO DO: lookup defaults
    .toBuffer({ resolveWithObject: true });
};
const svgsToPdf = async (title, svgs) => {
  let doc = null;

  for (let i = 0; i < svgs.length; i++) {
    if (i === 0) {
      doc = new pdfkit({ size: 'A3' });
    } else {
      doc.addPage({ size: 'A3' });
    }

    doc.fontSize(32);
    doc.text(title, { align: 'center' });

    const { data, info } = await convertImage(svgs[i]);

    //                        center image             give bottom margin with 30 padding
    doc.image(data, (doc.page.width - info.width) / 2, doc.page.height - info.height - 30);
  }
  return doc;
};

router.get('/', (req, res) => {
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function (req, res, next) {
  if (req.body.__action == 'make_scrap_paper') {
    const numPages = req.body.num_pages;
    const pageLabel = req.body.page_label;

    if (!numPages || numPages < 0 || numPages > 500) {
      throw Error('Must be more than 1 page but not more than 500 pages');
    }
    if (typeof pageLabel !== 'string' || pageLabel.length > 45) {
      throw Error('Page label must be valid string less than 45 characters');
    }

    generateBarcodes(numPages)
      .then((barcodes) => {
        return createBarcodeSVGs(barcodes);
      })
      .then((barcodeSVGs) => {
        return svgsToPdf(pageLabel, barcodeSVGs);
      })
      .then((pdf) => {
        const chunks = [];
        return new Promise((resolve, reject) => {
          pdf.on('data', (chunk) => {
            chunks.push(chunk);
          });
          pdf.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
          pdf.on('error', (error) => {
            reject(error);
          });
          pdf.end();
        });
      })
      .then((pdfBuffer) => {
        res.locals['pdf'] = pdfBuffer.toString('base64');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      })
      .catch((err) => {
        if (ERR(err, next)) return;
      });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
