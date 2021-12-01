const jsCrc = require('js-crc');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

/** Barcodes should be error-detecting <n char hexatridecimal produced by base36 encoding><4 char crc16 hash>
 * Sequential counter to produce n char base36 string should be base36 encode input. 
 * @param {Number} numBarcodes 
 * @returns {Array<string>} barcodes in array
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
      const barcode = createBarcode(barcodesCount);
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

/**
 * Creaters a barcode from a number. Number can only be used once.
 * @param {Number} seed An integer to create the barcode from
 * @return {string} <n char hexatridecimal produced by base36 encoding><4 char crc16 hash>
 */
const createBarcode = (seed) => {
  const base36 = BigInt(seed).toString(36);
  const crc16 = jsCrc.crc16(base36);
  return`${base36}${crc16}`.toUpperCase(); // concat as string in chance integer combo
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
}

module.exports = {createBarcode, generateBarcodes, getBarcodeSegments, isValid};
