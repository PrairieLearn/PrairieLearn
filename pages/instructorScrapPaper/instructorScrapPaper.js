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

const pageLimit = 1000;
const charLimit = 45;

const generateBarcodes = async (numBarcodes) => {
  const barcodes = [];

  // Barcodes should be error-detecting <n char hexatridecimal produced by base36 encoding><4 char crc16 hash>
  // Sequential counter to produce n char base36 string should be base36 encode input

  const client = await sqldb.beginTransactionAsync();
  try {
    const queryCount = await sqldb.queryWithClientAsync(client, sql.get_barcodes_count, {});

    // Want to create new barcodes based on sequential count in database
    let barcodesCount = Number(queryCount[1].rows[0].count);
    for (let i = 0; i < numBarcodes; i++) {
      barcodesCount += 1;
      const base36 = BigInt(barcodesCount).toString(36);
      const crc16 = jsCrc.crc16(base36);
      const barcode = `${base36}${crc16}`.toUpperCase(); // concat as string in chance integer combo
      barcodes.push(barcode);
    }

    const insert_barcodes = sql.insert_barcodes.replace(
      '$barcodes',
      barcodes.map((barcode) => "('" + barcode + "')").join(',')
    );
    const insertedBarcodes = await sqldb.queryWithClientAsync(client, insert_barcodes, {});
    if (insertedBarcodes.rows.length !== Number(numBarcodes)) {
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
      data: barcodes[i],
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
  if (req.body.__action === 'print_scrap_paper') {
    const numPages = req.body.num_pages;
    const pageLabel = req.body.page_label;

    if (!numPages || numPages < 1 || numPages > pageLimit) {
      ERR(Error(`Must be more than 1 page but not more than ${pageLimit} pages`), next); return;
    }
    if (typeof pageLabel !== 'string' || pageLabel.length > charLimit) {
      ERR(Error(`Page label must be valid string less than ${charLimit} characters`), next); return;
    }

    generateBarcodes(numPages)
      .then((barcodes) => {
        return createBarcodeSVGs(barcodes);
      })
      .then((barcodeSVGs) => {
        return svgsToPdf(pageLabel, barcodeSVGs);
      })
      .then((pdf) => {
        res.header('Content-Disposition', `attachment; filename=Barcoded scrap paper - ${new Date().toISOString()}.pdf`);
        pdf.pipe(res);
        pdf.end();
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
