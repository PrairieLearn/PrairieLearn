const jsCrc = require('js-crc');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const bitgener = require('bitgener');
const pdfkit = require('pdfkit');
const sharp = require('sharp');

const convertBarcodeToSVG = async (barcodes) => {
  return Promise.all(
    barcodes.map((barcode) =>
      bitgener({
        data: barcode,
        type: 'code128',
        output: 'buffer',
        encoding: 'utf8',
        barWidth: 2, // 2 to make barcode wider and more readable with frame reader
        original1DSize: true,
        addQuietZone: true,
        color: '#000',
        bgColor: '#FFF',
        hri: {
          show: true,
          fontSize: 14,
          fontFamily: 'Courier New',
          marginTop: 10,
        },
      })
    )
  );
};

/**
 * Barcodes should be error-detecting <n char base 36-encoded integer><4 char crc16 hash>
 * @param {Number} numBarcodes
 * @returns {Promise<string[]>} barcodes in array
 */
const generateBarcodes = async (numBarcodes) => {
  const barcodes = [];
  const client = await sqldb.beginTransactionAsync();

  try {
    const queryCount = await sqldb.queryWithClientAsync(client, sql.get_barcodes_count, {});

    // Want to create new barcodes based on sequential count in database
    let barcodesCount = Number(queryCount[1].rows[0].count);
    for (let i = 0; i < numBarcodes; i++) {
      barcodesCount += 1;
      const barcode = _createBarcode(barcodesCount);
      barcodes.push(barcode);
    }

    const insert_barcodes = sql.insert_barcodes.replace(
      '$barcodes',
      barcodes.map((barcode) => "('" + barcode + "')").join(',')
    );
    const insertedBarcodes = await sqldb.queryWithClientAsync(client, insert_barcodes, {});
    if (insertedBarcodes.rows.length !== Number(numBarcodes)) {
      throw new Error('Wrong number of barcodes created. Aborting');
    }
  } catch (err) {
    // rolls back if error
    await sqldb.endTransactionAsync(client, err);
    throw err;
  }
  await sqldb.endTransactionAsync(client, null);
  return barcodes;
};

/**
 * Creaters a barcode from a number. Number can only be used once.
 * @param {Number} seed An integer to create the barcode from
 * @return {string} <n char hexatridecimal produced by base36 encoding><4 char crc16 hash>
 */
const _createBarcode = (seed) => {
  const base36 = BigInt(seed).toString(36);
  const crc16 = jsCrc.crc16(base36);
  return `${base36}${crc16}`.toUpperCase(); // concat as string in chance integer combo
};

const getBarcodeSegments = (barcode) => {
  barcode = barcode.toLowerCase();
  const sha16 = barcode.substring(barcode.length - 4, barcode.length);
  return {
    fullBarcode: barcode,
    sha16,
    base36: barcode.replace(sha16, ''),
  };
};

const isValid = (barcode) => {
  const { base36, sha16 } = getBarcodeSegments(barcode);
  const recomputedSha16 = jsCrc.crc16(base36);
  return recomputedSha16 === sha16;
};

const convertImage = async (image) => {
  return sharp(image).png({ quality: 100 }).toBuffer({ resolveWithObject: true });
};

const svgsToPdfCollection = async (title, svgs) => {
  let doc = null;

  for (let i = 0; i < svgs.length; i++) {
    if (i === 0) {
      doc = new pdfkit({ size: 'A3' });
    } else {
      doc.addPage({ size: 'A3' });
    }

    doc.fontSize(32).text(title, { align: 'center' });

    const { data, info } = await convertImage(svgs[i].svg);

    //                        center image             give bottom margin with 40 padding
    doc.image(data, (doc.page.width - info.width) / 2, doc.page.height - info.height - 40);
  }
  return doc;
};

const createBarcodedPdf = async (numPages, pageLabel) => {
  const barcodes = await generateBarcodes(numPages);
  const barcodeSVGs = await convertBarcodeToSVG(barcodes);
  return svgsToPdfCollection(pageLabel, barcodeSVGs);
};

module.exports = { createBarcodedPdf, getBarcodeSegments, isValid };
