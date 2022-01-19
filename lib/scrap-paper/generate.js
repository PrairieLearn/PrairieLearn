// @ts-check
const jsCrc = require('js-crc');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const bitgener = require('bitgener');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

/**
 * Generate SVGs for the given barcodes.
 *
 * @param {string[]} barcodes
 * @returns {Promise<string[]>}
 */
const convertBarcodeToSVG = async (barcodes) => {
  return Promise.all(
    barcodes.map((barcode) =>
      bitgener({
        data: barcode,
        type: 'code128',
        output: 'buffer',
        encoding: 'utf8',
        // This makes the barcode wider and thus more readable.
        barWidth: 2,
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
 * Generates a list of barcodes.
 *
 * @param {number} numBarcodes
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
    if (insertedBarcodes.rows.length !== numBarcodes) {
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
 * Creates a barcode for a given integer. A barcode consists of the
 * base-36-encoded integer with a 4-character crc16 checksum.
 *
 * A given number should only ever be used once - see
 * `generateBarcodes()` for the code that enforces this.
 *
 * @param {number} num An integer to create the barcode from.
 * @return {string} The generated barcode.
 */
const _createBarcode = (num) => {
  const base36 = BigInt(num).toString(36);
  const crc16 = jsCrc.crc16(base36);
  return `${base36}${crc16}`.toUpperCase();
};

const getBarcodeSegments = (barcode) => {
  barcode = barcode.toLowerCase();
  const base36 = barcode.slice(0, -4);
  const checksum = barcode.slice(-4);
  return { base36, checksum };
};

/**
 * Checks if the provided barcode is valid. A barcode is considered valid if
 * it is the correct length and has the correct checksum.
 *
 * @param {string} barcode
 * @returns {boolean}
 */
const isBarcodeValid = (barcode) => {
  if (barcode.length < 5) return false;

  const { base36, checksum } = getBarcodeSegments(barcode);
  const recomputedChecksum = jsCrc.crc16(base36);
  return recomputedChecksum === checksum;
};

/**
 * Converts the given buffer to a PNG image.
 *
 * @param {Buffer} image
 * @returns {Promise<{ data: Buffer, info: import('sharp').OutputInfo }>}
 */
const convertImage = async (image) => {
  return sharp(image).png({ quality: 100 }).toBuffer({ resolveWithObject: true });
};

/**
 * Generates a PDF file from the provided barcode SVGs.
 *
 * @param {string} title The title for each page.
 * @param {*} svgs The array of barcode SVGs to create pages for.
 * @returns {Promise<import('pdfkit')>}
 */
const svgsToPdfCollection = async (title, svgs) => {
  let doc = null;

  for (let i = 0; i < svgs.length; i++) {
    if (i === 0) {
      doc = new PDFDocument({ size: 'A3' });
    } else {
      doc.addPage({ size: 'A3' });
    }

    doc.fontSize(32).text(title, { align: 'center' });

    const { data, info } = await convertImage(svgs[i].svg);

    doc.image(
      data,
      // Center the barcode image
      (doc.page.width - info.width) / 2,
      // Apply a bottom margin
      doc.page.height - info.height - 40
    );
  }

  return doc;
};

/**
 * Generates a PDF file with the provided number of pages. Each page has the
 * provided title and a unique barcode.
 *
 * @param {number} numPages
 * @param {string} pageLabel
 * @returns {Promise<import('pdfkit')>}
 */
const createBarcodedPdf = async (numPages, pageLabel) => {
  const barcodes = await generateBarcodes(numPages);
  const barcodeSVGs = await convertBarcodeToSVG(barcodes);
  return svgsToPdfCollection(pageLabel, barcodeSVGs);
};

module.exports = {
  createBarcodedPdf,
  getBarcodeSegments,
  isBarcodeValid,
};
